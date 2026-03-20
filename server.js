const path = require('path');
const fs = require('fs');
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

db.exec(`
CREATE TABLE IF NOT EXISTS app_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    sessions_json TEXT NOT NULL,
    active_session_id TEXT,
    updated_at TEXT NOT NULL
);
`);

const getStateStmt = db.prepare('SELECT sessions_json, active_session_id FROM app_state WHERE id = 1');
const upsertStateStmt = db.prepare(`
INSERT INTO app_state (id, sessions_json, active_session_id, updated_at)
VALUES (1, @sessionsJson, @activeSessionId, @updatedAt)
ON CONFLICT(id) DO UPDATE SET
    sessions_json = excluded.sessions_json,
    active_session_id = excluded.active_session_id,
    updated_at = excluded.updated_at
`);

app.use(express.json({ limit: '2mb' }));
app.use(express.static(__dirname));

app.get('/api/state', (req, res) => {
    try {
        const row = getStateStmt.get();
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
