const STORAGE_KEYS = {
    settings: 'llmChatSettings',
    sessions: 'llmChatSessions',
    activeSessionId: 'llmChatActiveSessionId',
    legacyHistory: 'llmChatHistory',
    trustedDomains: 'llmChatTrustedDomains'
};

const IS_FILE_PROTOCOL = window.location.protocol === 'file:';
const API_STATE_URL = '/api/state';
const SAVE_DEBOUNCE_MS = 180;

if (IS_FILE_PROTOCOL) {
    window.location.replace('http://localhost:8080/');
}

let persistTimerId = null;
let persistInFlight = false;
let persistPending = false;
let fallbackStorageMode = false;
let pendingExternalUrl = null;
let pendingExternalDomain = null;

// State Management
const appState = {
    sessions: [],
    activeSessionId: null,
    isLoading: false,
    activeRequestId: null,
    thinkingBubbleEl: null,
    sessionSearchQuery: '',
    showTrash: false,
    trustedDomains: [],
    settings: {
        apiKey: '',
        baseUrl: 'http://10.0.0.84:8000',
        systemPrompt: ''
    }
};

// DOM Elements
const chatMessagesEl = document.getElementById('chatMessages');
const messageInputEl = document.getElementById('messageInput');
const sendBtnEl = document.getElementById('sendBtn');
const exportBtnEl = document.getElementById('exportBtn');
const statusMessageEl = document.getElementById('statusMessage');
const settingsPanelEl = document.getElementById('settingsPanel');
const settingsBtnEl = document.getElementById('settingsBtn');
const closeSettingsBtnEl = document.getElementById('closeSettingsBtn');
const saveSettingsBtnEl = document.getElementById('saveSettingsBtn');
const clearHistoryBtnEl = document.getElementById('clearHistoryBtn');
const apiKeyInputEl = document.getElementById('apiKeyInput');
const baseUrlInputEl = document.getElementById('baseUrlInput');
const systemPromptInputEl = document.getElementById('systemPromptInput');
const toggleApiKeyBtnEl = document.getElementById('toggleApiKeyBtn');
const newSessionBtnEl = document.getElementById('newSessionBtn');
const sessionListEl = document.getElementById('sessionList');
const activeSessionTitleEl = document.getElementById('activeSessionTitle');
const sessionSearchInputEl = document.getElementById('sessionSearchInput');
const toggleTrashBtnEl = document.getElementById('toggleTrashBtn');
const emptyTrashBtnEl = document.getElementById('emptyTrashBtn');
const sessionPromptBtnEl = document.getElementById('sessionPromptBtn');
const linkWarningModalEl = document.getElementById('linkWarningModal');
const linkWarningUrlEl = document.getElementById('linkWarningUrl');
const linkWarningDomainEl = document.getElementById('linkWarningDomain');
const confirmLinkWarningBtnEl = document.getElementById('confirmLinkWarningBtn');
const cancelLinkWarningBtnEl = document.getElementById('cancelLinkWarningBtn');
const closeLinkWarningBtnEl = document.getElementById('closeLinkWarningBtn');
const trustDomainCheckboxEl = document.getElementById('trustDomainCheckbox');

const BUTTON_ICON_BY_LABEL = {
    Show: 'fa-regular fa-eye',
    Hide: 'fa-regular fa-eye-slash',
    Restore: 'fa-solid fa-rotate-left',
    'Delete Now': 'fa-solid fa-trash-can',
    Pin: 'fa-solid fa-thumbtack',
    Unpin: 'fa-solid fa-thumbtack',
    Rename: 'fa-solid fa-pen',
    Delete: 'fa-regular fa-trash-can',
    'Show Trash': 'fa-regular fa-trash-can',
    'Hide Trash': 'fa-solid fa-box-archive',
    'Session Prompt': 'fa-solid fa-wand-magic-sparkles',
    'Session Prompt: On': 'fa-solid fa-wand-magic-sparkles',
    Copy: 'fa-regular fa-copy',
    Copied: 'fa-solid fa-check'
};

function setButtonLabelWithIcon(button, label, iconClass) {
    const resolvedIcon = iconClass || BUTTON_ICON_BY_LABEL[label] || 'fa-solid fa-circle';
    button.innerHTML = `<i class="${resolvedIcon}" aria-hidden="true"></i><span>${escapeHtml(label)}</span>`;
}

function initializeStaticButtonIcons() {
    setButtonLabelWithIcon(toggleApiKeyBtnEl, 'Show');
    setButtonLabelWithIcon(toggleTrashBtnEl, 'Show Trash');
    setButtonLabelWithIcon(sessionPromptBtnEl, 'Session Prompt');
}

// Initialize
async function initializeApp() {
    loadSettings();
    loadTrustedDomains();
    initializeStaticButtonIcons();
    await loadSessions();
    setupEventListeners();
    renderSessionList();
    displayActiveSession();
}

// Settings Management
function loadSettings() {
    const saved = localStorage.getItem(STORAGE_KEYS.settings);
    if (saved) {
        appState.settings = { ...appState.settings, ...JSON.parse(saved) };
    }
    updateSettingsUI();
}

function saveSettings() {
    appState.settings.apiKey = apiKeyInputEl.value.trim();
    appState.settings.baseUrl = baseUrlInputEl.value.trim();
    appState.settings.systemPrompt = systemPromptInputEl.value.trim();

    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(appState.settings));
    showStatus('Settings saved successfully!', 'success');
}

function updateSettingsUI() {
    apiKeyInputEl.value = appState.settings.apiKey;
    baseUrlInputEl.value = appState.settings.baseUrl;
    systemPromptInputEl.value = appState.settings.systemPrompt;
}

function toggleApiKeyVisibility() {
    if (apiKeyInputEl.type === 'password') {
        apiKeyInputEl.type = 'text';
        setButtonLabelWithIcon(toggleApiKeyBtnEl, 'Hide');
    } else {
        apiKeyInputEl.type = 'password';
        setButtonLabelWithIcon(toggleApiKeyBtnEl, 'Show');
    }
}

function loadTrustedDomains() {
    const raw = localStorage.getItem(STORAGE_KEYS.trustedDomains);
    if (!raw) {
        appState.trustedDomains = [];
        return;
    }

    try {
        const parsed = JSON.parse(raw);
        appState.trustedDomains = Array.isArray(parsed)
            ? parsed.filter((value) => typeof value === 'string' && value.trim())
            : [];
    } catch (error) {
        appState.trustedDomains = [];
    }
}

function saveTrustedDomains() {
    localStorage.setItem(STORAGE_KEYS.trustedDomains, JSON.stringify(appState.trustedDomains));
}

// Session Management
async function loadSessions() {
    let savedSessionsRaw = null;
    let savedActiveId = null;

    try {
        const response = await fetch(API_STATE_URL, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`State API returned ${response.status}`);
        }

        const payload = await response.json();
        const safeSessions = Array.isArray(payload.sessions) ? payload.sessions : [];
        savedSessionsRaw = JSON.stringify(safeSessions);
        savedActiveId = typeof payload.activeSessionId === 'string' ? payload.activeSessionId : null;
        fallbackStorageMode = false;
    } catch (error) {
        // Fallback to local storage if SQLite server is unavailable.
        savedSessionsRaw = localStorage.getItem(STORAGE_KEYS.sessions);
        savedActiveId = localStorage.getItem(STORAGE_KEYS.activeSessionId);
        fallbackStorageMode = true;
    }

    if (savedSessionsRaw) {
        const parsedSessions = JSON.parse(savedSessionsRaw);
        appState.sessions = parsedSessions.map((session, index) => normalizeSession(session, index));
    } else {
        const legacyRaw = localStorage.getItem(STORAGE_KEYS.legacyHistory);
        if (legacyRaw) {
            const legacyMessages = JSON.parse(legacyRaw).filter(isValidMessage);
            if (legacyMessages.length > 0) {
                const migratedSession = createNewSessionObject(legacyMessages);
                migratedSession.title = buildSessionTitleFromMessages(legacyMessages);
                appState.sessions = [migratedSession];
            }
        }
    }

    if (appState.sessions.length === 0) {
        appState.sessions.push(createNewSessionObject());
    }

    const hasSavedActive = appState.sessions.some((session) => session.id === savedActiveId && !session.deletedAt);
    const firstNonDeleted = appState.sessions.find((session) => !session.deletedAt);
    appState.activeSessionId = hasSavedActive
        ? savedActiveId
        : (firstNonDeleted ? firstNonDeleted.id : appState.sessions[0].id);

    saveSessions();

    if (fallbackStorageMode) {
        showStatus('SQLite storage is unavailable. Using browser fallback storage.', 'error');
    }
}

function normalizeSession(session, index) {
    const normalizedMessages = Array.isArray(session.messages)
        ? session.messages.filter(isValidMessage)
        : [];

    return {
        id: typeof session.id === 'string' && session.id ? session.id : `session-${Date.now()}-${index}`,
        title: typeof session.title === 'string' && session.title.trim()
            ? session.title.trim()
            : buildSessionTitleFromMessages(normalizedMessages),
        pinned: Boolean(session.pinned),
        deletedAt: typeof session.deletedAt === 'string' ? session.deletedAt : null,
        systemPrompt: typeof session.systemPrompt === 'string' ? session.systemPrompt : '',
        messages: normalizedMessages,
        createdAt: typeof session.createdAt === 'string' ? session.createdAt : new Date().toISOString(),
        updatedAt: typeof session.updatedAt === 'string' ? session.updatedAt : new Date().toISOString()
    };
}

function isValidMessage(message) {
    if (!message || typeof message !== 'object') {
        return false;
    }

    const validRole = message.role === 'user' || message.role === 'assistant' || message.role === 'system';
    return validRole && typeof message.content === 'string' && message.content.length > 0;
}

function saveSessions() {
    if (fallbackStorageMode) {
        localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(appState.sessions));
        localStorage.setItem(STORAGE_KEYS.activeSessionId, appState.activeSessionId);
        return;
    }

    persistPending = true;

    if (persistTimerId !== null) {
        clearTimeout(persistTimerId);
    }

    persistTimerId = window.setTimeout(() => {
        persistTimerId = null;
        flushStatePersistence();
    }, SAVE_DEBOUNCE_MS);
}

async function flushStatePersistence() {
    if (!persistPending || fallbackStorageMode) {
        return;
    }

    if (persistInFlight) {
        return;
    }

    persistInFlight = true;
    persistPending = false;

    try {
        const response = await fetch(API_STATE_URL, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sessions: appState.sessions,
                activeSessionId: appState.activeSessionId
            })
        });

        if (!response.ok) {
            throw new Error(`State API returned ${response.status}`);
        }
    } catch (error) {
        // Automatically degrade to local mode if backend persistence fails.
        fallbackStorageMode = true;
        localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(appState.sessions));
        localStorage.setItem(STORAGE_KEYS.activeSessionId, appState.activeSessionId);
        showStatus('SQLite sync failed. Switched to browser fallback storage.', 'error');
    } finally {
        persistInFlight = false;

        if (persistPending && !fallbackStorageMode) {
            flushStatePersistence();
        }
    }
}

function createNewSessionObject(initialMessages = []) {
    const now = new Date().toISOString();
    return {
        id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: buildSessionTitleFromMessages(initialMessages),
        pinned: false,
        deletedAt: null,
        systemPrompt: '',
        messages: initialMessages,
        createdAt: now,
        updatedAt: now
    };
}

function buildSessionTitleFromMessages(messages) {
    const firstUserMessage = messages.find((msg) => msg.role === 'user');
    if (!firstUserMessage) {
        return 'New Chat';
    }

    const normalized = firstUserMessage.content.replace(/\s+/g, ' ').trim();
    if (!normalized) {
        return 'New Chat';
    }

    return normalized.length > 40 ? `${normalized.slice(0, 40)}...` : normalized;
}

function getActiveSession() {
    return appState.sessions.find((session) => session.id === appState.activeSessionId) || null;
}

function renderSessionList() {
    sessionListEl.innerHTML = '';

    const searchQuery = appState.sessionSearchQuery.trim().toLowerCase();
    const orderedSessions = [...appState.sessions]
        .filter((session) => appState.showTrash ? Boolean(session.deletedAt) : !session.deletedAt)
        .filter((session) => {
            if (!searchQuery) {
                return true;
            }

            return session.title.toLowerCase().includes(searchQuery);
        })
        .sort((a, b) => {
            if (!appState.showTrash && a.pinned !== b.pinned) {
                return a.pinned ? -1 : 1;
            }

            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });

    if (orderedSessions.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'session-meta';
        emptyState.textContent = appState.showTrash
            ? 'Trash is empty.'
            : 'No conversations match your search.';
        sessionListEl.appendChild(emptyState);
        updateTrashButtons();
        return;
    }

    orderedSessions.forEach((session) => {
        const item = document.createElement('div');
        item.className = `session-item ${session.id === appState.activeSessionId ? 'active' : ''} ${session.deletedAt ? 'deleted' : ''}`;
        item.dataset.sessionId = session.id;

        const mainButton = document.createElement('button');
        mainButton.type = 'button';
        mainButton.className = 'session-main';
        mainButton.addEventListener('click', () => switchSession(session.id));

        const title = document.createElement('span');
        title.className = 'session-title';
        title.textContent = `${session.pinned ? 'Pinned - ' : ''}${session.title || 'New Chat'}`;

        const meta = document.createElement('span');
        meta.className = 'session-meta';
        meta.textContent = `${session.messages.length} msgs • ${formatSessionDate(session.updatedAt)}`;

        mainButton.appendChild(title);
        mainButton.appendChild(meta);

        const actions = document.createElement('div');
        actions.className = 'session-actions';

        if (appState.showTrash) {
            actions.appendChild(createSessionActionButton('Restore', 'Restore chat', () => restoreSession(session.id)));
            actions.appendChild(createSessionActionButton('Delete Now', 'Permanently delete chat', () => permanentlyDeleteSession(session.id)));
        } else {
            actions.appendChild(createSessionActionButton(session.pinned ? 'Unpin' : 'Pin', session.pinned ? 'Unpin chat' : 'Pin chat', () => togglePinSession(session.id)));
            actions.appendChild(createSessionActionButton('Rename', 'Rename chat', () => renameSession(session.id)));
            actions.appendChild(createSessionActionButton('Delete', 'Move chat to trash', () => deleteSession(session.id)));
        }

        item.appendChild(mainButton);
        item.appendChild(actions);

        sessionListEl.appendChild(item);
    });

    updateTrashButtons();
}

function updateTrashButtons() {
    const hasTrashItems = appState.sessions.some((session) => Boolean(session.deletedAt));
    const trashLabel = appState.showTrash ? 'Hide Trash' : 'Show Trash';
    setButtonLabelWithIcon(toggleTrashBtnEl, trashLabel);
    emptyTrashBtnEl.disabled = !hasTrashItems;
}

function createSessionActionButton(label, title, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'session-action-btn';
    setButtonLabelWithIcon(button, label);
    button.title = title;
    button.addEventListener('click', (event) => {
        event.stopPropagation();
        onClick();
    });
    return button;
}

function formatSessionDate(isoDate) {
    const date = new Date(isoDate);
    return new Intl.DateTimeFormat('en-PH', {
        timeZone: 'Asia/Manila',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
}

function switchSession(sessionId) {
    if (sessionId === appState.activeSessionId) {
        return;
    }

    const target = appState.sessions.find((session) => session.id === sessionId);
    if (!target || target.deletedAt) {
        return;
    }

    appState.activeSessionId = sessionId;
    saveSessions();
    renderSessionList();
    displayActiveSession();
    showStatus('Switched conversation.', 'success');
}

function createNewSession() {
    const newSession = createNewSessionObject();
    appState.sessions.push(newSession);
    appState.activeSessionId = newSession.id;

    saveSessions();
    renderSessionList();
    displayActiveSession();
    showStatus('Started a new conversation.', 'success');
    messageInputEl.focus();
}

function setSessionPrompt() {
    const activeSession = getActiveSession();
    if (!activeSession || activeSession.deletedAt) {
        return;
    }

    const current = activeSession.systemPrompt || '';
    const promptValue = prompt('Session system prompt (leave blank to use default global prompt):', current);

    if (promptValue === null) {
        return;
    }

    activeSession.systemPrompt = promptValue.trim();
    activeSession.updatedAt = new Date().toISOString();
    saveSessions();
    renderSessionList();
    updateSessionPromptButton(activeSession);
    showStatus(activeSession.systemPrompt ? 'Session prompt updated.' : 'Session prompt cleared. Using default prompt.', 'success');
}

function toggleTrashView() {
    appState.showTrash = !appState.showTrash;
    renderSessionList();
}

function emptyTrash() {
    const trashed = appState.sessions.filter((session) => session.deletedAt);
    if (trashed.length === 0) {
        showStatus('Trash is already empty.', 'success');
        return;
    }

    const approved = confirm(`Permanently delete ${trashed.length} conversation(s)? This cannot be undone.`);
    if (!approved) {
        return;
    }

    appState.sessions = appState.sessions.filter((session) => !session.deletedAt);
    if (appState.sessions.length === 0) {
        appState.sessions.push(createNewSessionObject());
    }

    if (!getActiveSession() || getActiveSession().deletedAt) {
        appState.activeSessionId = appState.sessions[0].id;
    }

    saveSessions();
    renderSessionList();
    displayActiveSession();
    showStatus('Trash emptied.', 'success');
}

function renameSession(sessionId) {
    const session = appState.sessions.find((entry) => entry.id === sessionId);
    if (!session) {
        return;
    }

    const nextTitle = prompt('Rename conversation:', session.title || 'New Chat');
    if (nextTitle === null) {
        return;
    }

    const trimmed = nextTitle.trim();
    session.title = trimmed || 'New Chat';
    session.updatedAt = new Date().toISOString();

    saveSessions();
    renderSessionList();
    displayActiveSessionTitle();
    showStatus('Conversation renamed.', 'success');
}

function togglePinSession(sessionId) {
    const session = appState.sessions.find((entry) => entry.id === sessionId);
    if (!session) {
        return;
    }

    session.pinned = !session.pinned;
    session.updatedAt = new Date().toISOString();

    saveSessions();
    renderSessionList();
    showStatus(session.pinned ? 'Conversation pinned.' : 'Conversation unpinned.', 'success');
}

function deleteSession(sessionId) {
    const session = appState.sessions.find((entry) => entry.id === sessionId);
    if (!session) {
        return;
    }

    const approved = confirm(`Move conversation "${session.title || 'New Chat'}" to trash?`);
    if (!approved) {
        return;
    }

    session.deletedAt = new Date().toISOString();
    session.pinned = false;
    session.updatedAt = new Date().toISOString();

    const activeSession = getActiveSession();
    if (!activeSession || activeSession.deletedAt) {
        const firstNonDeleted = appState.sessions.find((entry) => !entry.deletedAt);
        appState.activeSessionId = firstNonDeleted ? firstNonDeleted.id : null;
    }

    if (!appState.activeSessionId) {
        const replacement = createNewSessionObject();
        appState.sessions.push(replacement);
        appState.activeSessionId = replacement.id;
    }

    saveSessions();
    renderSessionList();
    displayActiveSession();
    showStatus('Conversation moved to trash.', 'success');
}

function restoreSession(sessionId) {
    const session = appState.sessions.find((entry) => entry.id === sessionId);
    if (!session || !session.deletedAt) {
        return;
    }

    session.deletedAt = null;
    session.updatedAt = new Date().toISOString();
    appState.activeSessionId = session.id;
    appState.showTrash = false;

    saveSessions();
    renderSessionList();
    displayActiveSession();
    showStatus('Conversation restored.', 'success');
}

function permanentlyDeleteSession(sessionId) {
    const session = appState.sessions.find((entry) => entry.id === sessionId);
    if (!session || !session.deletedAt) {
        return;
    }

    const approved = confirm(`Permanently delete "${session.title || 'New Chat'}"? This cannot be undone.`);
    if (!approved) {
        return;
    }

    appState.sessions = appState.sessions.filter((entry) => entry.id !== sessionId);

    if (appState.sessions.length === 0) {
        appState.sessions.push(createNewSessionObject());
    }

    if (!getActiveSession() || getActiveSession().deletedAt) {
        const firstNonDeleted = appState.sessions.find((entry) => !entry.deletedAt);
        appState.activeSessionId = firstNonDeleted ? firstNonDeleted.id : appState.sessions[0].id;
    }

    saveSessions();
    renderSessionList();
    displayActiveSession();
    showStatus('Conversation permanently deleted.', 'success');
}

function displayActiveSession() {
    let activeSession = getActiveSession();
    if (!activeSession || activeSession.deletedAt) {
        const fallback = appState.sessions.find((session) => !session.deletedAt);
        if (!fallback) {
            chatMessagesEl.innerHTML = '';
            activeSessionTitleEl.textContent = 'No Active Conversation';
            updateSessionPromptButton(null);
            return;
        }

        appState.activeSessionId = fallback.id;
        activeSession = fallback;
        saveSessions();
    }

    activeSessionTitleEl.textContent = activeSession.title || 'New Chat';
    updateSessionPromptButton(activeSession);
    chatMessagesEl.innerHTML = '';

    activeSession.messages.forEach((msg) => {
        addMessageToUI(msg.content, msg.role);
    });

    scrollToBottom();
}

function clearChatHistory() {
    const activeSession = getActiveSession();
    if (!activeSession || activeSession.deletedAt) {
        return;
    }

    if (confirm('Clear messages from this conversation? This cannot be undone.')) {
        activeSession.messages = [];
        activeSession.title = 'New Chat';
        activeSession.updatedAt = new Date().toISOString();

        saveSessions();
        renderSessionList();
        displayActiveSession();
        showStatus('Current conversation cleared.', 'success');
        closeSettings();
    }
}

function appendMessageToActiveSession(role, content) {
    const activeSession = getActiveSession();
    if (!activeSession) {
        return;
    }

    activeSession.messages.push({ role, content });
    activeSession.updatedAt = new Date().toISOString();

    if (role === 'user') {
        activeSession.title = buildSessionTitleFromMessages(activeSession.messages);
    }
}

// Event Listeners
function setupEventListeners() {
    sendBtnEl.addEventListener('click', sendMessage);
    messageInputEl.addEventListener('keypress', handleKeyPress);
    exportBtnEl.addEventListener('click', exportChat);
    newSessionBtnEl.addEventListener('click', createNewSession);
    settingsBtnEl.addEventListener('click', openSettings);
    closeSettingsBtnEl.addEventListener('click', closeSettings);
    saveSettingsBtnEl.addEventListener('click', () => {
        saveSettings();
        closeSettings();
    });
    clearHistoryBtnEl.addEventListener('click', clearChatHistory);
    toggleApiKeyBtnEl.addEventListener('click', toggleApiKeyVisibility);
    sessionPromptBtnEl.addEventListener('click', setSessionPrompt);
    toggleTrashBtnEl.addEventListener('click', toggleTrashView);
    emptyTrashBtnEl.addEventListener('click', emptyTrash);
    sessionSearchInputEl.addEventListener('input', (event) => {
        appState.sessionSearchQuery = event.target.value || '';
        renderSessionList();
    });
    chatMessagesEl.addEventListener('click', handleChatLinkClick);
    confirmLinkWarningBtnEl.addEventListener('click', confirmExternalLinkOpen);
    cancelLinkWarningBtnEl.addEventListener('click', closeLinkWarningModal);
    closeLinkWarningBtnEl.addEventListener('click', closeLinkWarningModal);

    settingsPanelEl.addEventListener('click', (e) => {
        if (e.target === settingsPanelEl) {
            closeSettings();
        }
    });

    linkWarningModalEl.addEventListener('click', (event) => {
        if (event.target === linkWarningModalEl) {
            closeLinkWarningModal();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !linkWarningModalEl.classList.contains('hidden')) {
            closeLinkWarningModal();
        }
    });
}

function handleChatLinkClick(event) {
    const anchor = event.target.closest('.message.assistant a, .message.system a');
    if (!anchor) {
        return;
    }

    const href = anchor.getAttribute('href');
    if (!href) {
        return;
    }

    event.preventDefault();

    const resolvedUrl = resolveExternalUrl(href);
    const domain = getDomainLabel(resolvedUrl);

    if (domain && isTrustedDomain(domain)) {
        window.open(resolvedUrl, '_blank', 'noopener,noreferrer');
        return;
    }

    openLinkWarningModal(resolvedUrl, domain);
}

function openLinkWarningModal(url, domain) {
    pendingExternalUrl = url;
    pendingExternalDomain = domain;
    linkWarningUrlEl.textContent = url;
    linkWarningDomainEl.textContent = domain || 'Unknown domain';
    trustDomainCheckboxEl.checked = false;
    linkWarningModalEl.classList.remove('hidden');
    linkWarningModalEl.setAttribute('aria-hidden', 'false');
    confirmLinkWarningBtnEl.focus();
}

function closeLinkWarningModal() {
    pendingExternalUrl = null;
    pendingExternalDomain = null;
    trustDomainCheckboxEl.checked = false;
    linkWarningModalEl.classList.add('hidden');
    linkWarningModalEl.setAttribute('aria-hidden', 'true');
}

function confirmExternalLinkOpen() {
    if (!pendingExternalUrl) {
        closeLinkWarningModal();
        return;
    }

    if (trustDomainCheckboxEl.checked && pendingExternalDomain && !isTrustedDomain(pendingExternalDomain)) {
        appState.trustedDomains.push(pendingExternalDomain);
        appState.trustedDomains = [...new Set(appState.trustedDomains)].sort();
        saveTrustedDomains();
    }

    window.open(pendingExternalUrl, '_blank', 'noopener,noreferrer');
    closeLinkWarningModal();
}

function resolveExternalUrl(url) {
    try {
        return new URL(url, window.location.href).toString();
    } catch (error) {
        return url;
    }
}

function getDomainLabel(url) {
    try {
        return new URL(url, window.location.href).hostname;
    } catch (error) {
        return '';
    }
}

function isTrustedDomain(domain) {
    return appState.trustedDomains.includes(domain);
}

function handleKeyPress(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

// Settings Panel
function openSettings() {
    settingsPanelEl.classList.remove('hidden');
    apiKeyInputEl.focus();
}

function closeSettings() {
    settingsPanelEl.classList.add('hidden');
}

// Send Message
async function sendMessage() {
    if (appState.isLoading) {
        return;
    }

    const message = messageInputEl.value.trim();
    if (!message) {
        showStatus('Please enter a message.', 'error');
        return;
    }

    if (!appState.settings.apiKey) {
        showStatus('Please set your API key in settings.', 'error');
        return;
    }

    if (!appState.settings.baseUrl) {
        showStatus('Please set the server URL in settings.', 'error');
        return;
    }

    if (!getActiveSession()) {
        createNewSession();
    }

    messageInputEl.value = '';
    messageInputEl.style.height = 'auto';

    const activeSession = getActiveSession();
    if (!activeSession || activeSession.deletedAt) {
        showStatus('Cannot send message to a deleted conversation.', 'error');
        return;
    }
    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    appState.activeRequestId = requestId;

    appendMessageToActiveSession('user', message);
    addMessageToUI(message, 'user');
    saveSessions();
    renderSessionList();
    displayActiveSessionTitle();

    setLoading(true);
    showStatus('Sending request...', 'loading');
    showThinkingBubble();

    try {
        const history = buildHistoryForRequest(activeSession.messages.slice(0, -1));
        const response = await sendChatRequest(message, history);

        if (appState.activeRequestId !== requestId) {
            return;
        }

        removeThinkingBubble();
        const assistantMessage = response.answer;
        appendMessageToActiveSession('assistant', assistantMessage);
        addMessageToUI(assistantMessage, 'assistant');

        saveSessions();
        renderSessionList();
        displayActiveSessionTitle();
        showStatus('');
    } catch (error) {
        if (appState.activeRequestId !== requestId) {
            return;
        }

        removeThinkingBubble();
        showStatus('Response failed. Please try again.', 'error');
        addMessageToUI('Response failed. The assistant could not complete this request. Please retry in a moment.', 'assistant-error');
        console.error('Chat error:', error);
    } finally {
        if (appState.activeRequestId !== requestId) {
            return;
        }

        appState.activeRequestId = null;
        removeThinkingBubble();
        setLoading(false);
        scrollToBottom();
    }
}

function buildHistoryForRequest(messages) {
    return messages
        .filter((msg) => {
            const validRole = msg && (msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system');
            return validRole && typeof msg.content === 'string';
        })
        .map((msg) => ({
            role: msg.role,
            content: msg.content
        }));
}

function displayActiveSessionTitle() {
    const activeSession = getActiveSession();
    if (activeSession && !activeSession.deletedAt) {
        activeSessionTitleEl.textContent = activeSession.title || 'New Chat';
        updateSessionPromptButton(activeSession);
    }
}

async function sendChatRequest(message, history) {
    const baseUrl = appState.settings.baseUrl.replace(/\/$/, '');
    const url = `${baseUrl}/v1/chat/ask`;

    const requestBody = {
        message
    };

    requestBody.history = Array.isArray(history) ? history : [];

    const activeSession = getActiveSession();
    const effectivePrompt = activeSession && activeSession.systemPrompt
        ? activeSession.systemPrompt
        : appState.settings.systemPrompt;

    if (effectivePrompt) {
        requestBody.system_prompt = effectivePrompt;
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': appState.settings.apiKey
        },
        body: JSON.stringify(requestBody)
    });

    if (response.status === 401) {
        throw new Error('Invalid API key. Please check your settings.');
    }

    if (!response.ok) {
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.answer) {
        throw new Error('Invalid response from server: missing answer field');
    }

    return data;
}

// UI Updates
function addMessageToUI(content, role) {
    const messageEl = document.createElement('div');
    messageEl.className = `message ${role}`;

    const contentEl = document.createElement('div');
    contentEl.className = 'message-content';

    if (role === 'assistant' || role === 'system') {
        contentEl.innerHTML = renderMarkdown(content);
    } else {
        contentEl.innerHTML = renderPlainText(content);
    }

    if (role === 'assistant' || role === 'assistant-error') {
        const bubbleEl = document.createElement('div');
        bubbleEl.className = 'message-bubble';

        const copyBtnEl = document.createElement('button');
        copyBtnEl.type = 'button';
        copyBtnEl.className = 'copy-response-btn';
        setButtonLabelWithIcon(copyBtnEl, 'Copy');
        copyBtnEl.setAttribute('aria-label', 'Copy assistant response');

        copyBtnEl.addEventListener('click', async () => {
            const copied = await copyTextToClipboard(content);
            if (!copied) {
                showStatus('Copy failed. Please try again.', 'error');
                return;
            }

            setButtonLabelWithIcon(copyBtnEl, 'Copied');
            window.setTimeout(() => {
                setButtonLabelWithIcon(copyBtnEl, 'Copy');
            }, 1300);
        });

        bubbleEl.appendChild(contentEl);
        bubbleEl.appendChild(copyBtnEl);
        messageEl.appendChild(bubbleEl);
    } else {
        messageEl.appendChild(contentEl);
    }

    chatMessagesEl.appendChild(messageEl);
}

function showThinkingBubble() {
    removeThinkingBubble();

    const messageEl = document.createElement('div');
    messageEl.className = 'message assistant thinking';

    const contentEl = document.createElement('div');
    contentEl.className = 'message-content thinking-content';
    contentEl.innerHTML = [
        '<span class="thinking-spinner" aria-hidden="true"></span>',
        '<span class="thinking-text">hmmm... thinking</span>',
        '<span class="thinking-dots" aria-hidden="true"><span></span><span></span><span></span></span>'
    ].join('');

    messageEl.appendChild(contentEl);
    chatMessagesEl.appendChild(messageEl);
    appState.thinkingBubbleEl = messageEl;
    scrollToBottom();
}

function removeThinkingBubble() {
    if (appState.thinkingBubbleEl && appState.thinkingBubbleEl.parentNode) {
        appState.thinkingBubbleEl.parentNode.removeChild(appState.thinkingBubbleEl);
    }

    appState.thinkingBubbleEl = null;
}

function renderPlainText(text) {
    return escapeHtml(text).replace(/\n/g, '<br>');
}

function renderMarkdown(markdownText) {
    const rawHtml = marked.parse(markdownText, {
        breaks: true,
        gfm: true
    });

    const sanitizedHtml = DOMPurify.sanitize(rawHtml, {
        USE_PROFILES: { html: true }
    });

    const template = document.createElement('template');
    template.innerHTML = sanitizedHtml;

    const tables = template.content.querySelectorAll('table');
    tables.forEach((table) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'table-wrap';
        table.parentNode.insertBefore(wrapper, table);
        wrapper.appendChild(table);
    });

    return template.innerHTML;
}

function escapeHtml(text) {
    const htmlMap = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };

    return text.replace(/[&<>"']/g, (char) => htmlMap[char]);
}

async function copyTextToClipboard(text) {
    const safeText = typeof text === 'string' ? text : String(text || '');

    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(safeText);
            return true;
        }
    } catch (error) {
        // Fallback path below handles clipboard copy for older contexts.
    }

    const tempTextArea = document.createElement('textarea');
    tempTextArea.value = safeText;
    tempTextArea.setAttribute('readonly', '');
    tempTextArea.style.position = 'absolute';
    tempTextArea.style.left = '-9999px';
    document.body.appendChild(tempTextArea);

    tempTextArea.select();
    tempTextArea.setSelectionRange(0, tempTextArea.value.length);

    let copied = false;
    try {
        copied = document.execCommand('copy');
    } catch (error) {
        copied = false;
    }

    document.body.removeChild(tempTextArea);
    return copied;
}

function setLoading(isLoading) {
    appState.isLoading = isLoading;
    sendBtnEl.disabled = isLoading;
    messageInputEl.disabled = isLoading;
    exportBtnEl.disabled = isLoading;
    newSessionBtnEl.disabled = isLoading;
}

function updateSessionPromptButton(session) {
    if (!session || session.deletedAt) {
        setButtonLabelWithIcon(sessionPromptBtnEl, 'Session Prompt');
        return;
    }

    const promptLabel = session.systemPrompt ? 'Session Prompt: On' : 'Session Prompt';
    setButtonLabelWithIcon(sessionPromptBtnEl, promptLabel);
}

function showStatus(message, type = '') {
    if (!message) {
        statusMessageEl.textContent = '';
        statusMessageEl.className = 'status-message';
        return;
    }

    if (type === 'loading') {
        statusMessageEl.innerHTML = `<span class="loading-spinner"></span> ${message}`;
    } else {
        statusMessageEl.textContent = message;
    }

    statusMessageEl.className = `status-message ${type}`;
}

function scrollToBottom() {
    setTimeout(() => {
        chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    }, 0);
}

// Export Chat
function exportChat() {
    const activeSession = getActiveSession();
    if (!activeSession || activeSession.messages.length === 0) {
        showStatus('No messages to export in this conversation.', 'error');
        return;
    }

    const timestamp = new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' });
    let content = 'chatJRCSRG Export\n';
    content += `Conversation: ${activeSession.title}\n`;
    content += `Generated: ${timestamp} (Asia/Manila)\n`;
    content += `Server: ${appState.settings.baseUrl}\n`;
    content += '========================================\n\n';

    activeSession.messages.forEach((msg, idx) => {
        const role = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
        content += `[${idx + 1}] ${role}:\n`;
        content += `${msg.content}\n\n`;
    });

    const blob = new Blob([content], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `llm_chat_${activeSession.id}.txt`;
    link.click();
    window.URL.revokeObjectURL(url);

    showStatus('Conversation exported successfully!', 'success');
}

// Auto-adjust textarea height
messageInputEl.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = `${Math.min(this.scrollHeight, 150)}px`;
});

// Initialize on load
window.addEventListener('beforeunload', () => {
    if (!fallbackStorageMode && persistPending && !persistInFlight) {
        fetch(API_STATE_URL, {
            method: 'PUT',
            keepalive: true,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sessions: appState.sessions,
                activeSessionId: appState.activeSessionId
            })
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

// Matrix Rain Background
(function initMatrixRain() {
    const canvas = document.getElementById('matrixCanvas');
    if (!canvas) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        canvas.style.display = 'none';
        return;
    }

    const ctx = canvas.getContext('2d');
    const CHARS = 'JRCSG0123456789ABCDEFabcdef#!?><[]{}@%*+-~^';
    const FS = 14;
    let cols, drops;

    function resize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const newCols = Math.floor(w / FS);
        canvas.width = w;
        canvas.height = h;
        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, w, h);
        if (!drops || newCols !== cols) {
            cols = newCols;
            drops = Array.from({ length: cols }, () =>
                Math.floor(Math.random() * -(h / FS))
            );
        }
    }

    function tick() {
        ctx.fillStyle = 'rgba(5, 5, 5, 0.065)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.font = `${FS}px "Fira Code", "Courier New", monospace`;
        ctx.shadowColor = '#a12124';
        ctx.shadowBlur = 6;
        ctx.fillStyle = '#ff7070';
        for (let i = 0; i < cols; i++) {
            const ch = CHARS[Math.floor(Math.random() * CHARS.length)];
            ctx.fillText(ch, i * FS, drops[i] * FS);
            if (drops[i] * FS > canvas.height && Math.random() > 0.975) {
                drops[i] = 0;
            }
            drops[i]++;
        }
        ctx.shadowBlur = 0;
    }

    resize();
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(resize, 150);
    });

    let lastTick = 0;
    function frame(now) {
        requestAnimationFrame(frame);
        if (now - lastTick < 50) return;
        lastTick = now;
        tick();
    }
    requestAnimationFrame(frame);
}());
