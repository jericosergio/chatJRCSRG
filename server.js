const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const { DatabaseSync } = require('node:sqlite');

const app = express();
const PORT = process.env.PORT || 8080;
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'chat_sessions.db');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');

// Migrate from old single-row schema to per-device schema if needed
try {
    db.exec('SELECT device_id FROM app_state LIMIT 1');
} catch (_) {
    db.exec('DROP TABLE IF EXISTS app_state');
}

db.exec(`
CREATE TABLE IF NOT EXISTS app_state (
    device_id TEXT PRIMARY KEY,
    sessions_json TEXT NOT NULL,
    active_session_id TEXT,
    updated_at TEXT NOT NULL
);
`);

const getStateStmt = db.prepare('SELECT sessions_json, active_session_id FROM app_state WHERE device_id = @deviceId');
const upsertStateStmt = db.prepare(`
INSERT INTO app_state (device_id, sessions_json, active_session_id, updated_at)
VALUES (@deviceId, @sessionsJson, @activeSessionId, @updatedAt)
ON CONFLICT(device_id) DO UPDATE SET
    sessions_json = excluded.sessions_json,
    active_session_id = excluded.active_session_id,
    updated_at = excluded.updated_at
`);

const COOKIE_NAME = 'dvcid';
const CONSENT_COOKIE_NAME = 'consent';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseCookies(req) {
    const list = {};
    const header = req.headers.cookie;
    if (!header) return list;
    header.split(';').forEach(part => {
        const [rawName, ...rest] = part.split('=');
        const name = rawName.trim();
        if (name) list[name] = decodeURIComponent(rest.join('=').trim());
    });
    return list;
}

function getOrCreateDeviceId(req, res) {
    const cookies = parseCookies(req);
    let deviceId = cookies[COOKIE_NAME];
    if (!deviceId || !UUID_RE.test(deviceId)) {
        deviceId = crypto.randomUUID();
        res.setHeader('Set-Cookie',
            `${COOKIE_NAME}=${deviceId}; HttpOnly; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE}; Path=/`);
    }
    return deviceId;
}

function getConsent(req) {
    const cookies = parseCookies(req);
    return cookies[CONSENT_COOKIE_NAME] === '1';
}

app.use(express.json({ limit: '2mb' }));
app.use(express.static(__dirname));

// Consent: check whether this device has accepted the cookie notice
app.get('/api/consent', (req, res) => {
    res.json({ consented: getConsent(req) });
});

// Consent: record acceptance — sets both dvcid and consent HttpOnly cookies atomically
app.post('/api/consent', (req, res) => {
    const cookies = parseCookies(req);
    let deviceId = cookies[COOKIE_NAME];
    if (!deviceId || !UUID_RE.test(deviceId)) {
        deviceId = crypto.randomUUID();
    }
    res.setHeader('Set-Cookie', [
        `${COOKIE_NAME}=${deviceId}; HttpOnly; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE}; Path=/`,
        `${CONSENT_COOKIE_NAME}=1; HttpOnly; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE}; Path=/`
    ]);
    res.json({ ok: true });
});

app.get('/api/state', (req, res) => {
    try {
        if (!getConsent(req)) {
            return res.status(403).json({ error: 'Consent required.' });
        }
        const deviceId = getOrCreateDeviceId(req, res);
        const row = getStateStmt.get({ deviceId });
        if (!row) {
            return res.json({
                sessions: [],
                activeSessionId: null
            });
        }

        return res.json({
            sessions: JSON.parse(row.sessions_json || '[]'),
            activeSessionId: row.active_session_id || null
        });
    } catch (error) {
        return res.status(500).json({
            error: 'Failed to load persisted state.'
        });
    }
});

app.put('/api/state', (req, res) => {
    try {
        if (!getConsent(req)) {
            return res.status(403).json({ error: 'Consent required.' });
        }
        const deviceId = getOrCreateDeviceId(req, res);
        const body = req.body || {};
        const sessions = Array.isArray(body.sessions) ? body.sessions : null;
        const activeSessionId = typeof body.activeSessionId === 'string' || body.activeSessionId === null
            ? body.activeSessionId
            : null;

        if (!sessions) {
            return res.status(400).json({
                error: 'Invalid payload. "sessions" must be an array.'
            });
        }

        upsertStateStmt.run({
            deviceId,
            sessionsJson: JSON.stringify(sessions),
            activeSessionId,
            updatedAt: new Date().toISOString()
        });

        return res.json({ ok: true });
    } catch (error) {
        return res.status(500).json({
            error: 'Failed to persist state.'
        });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`SQLite database: ${DB_PATH}`);
});
