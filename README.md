# chatJRCSRG

chatJRCSRG is a web-based chat client for local or self-hosted LLM APIs. It provides a responsive conversation UI, session persistence with SQLite, and configurable request settings for day-to-day model usage.

## Highlights

- Clean chat interface with multi-turn context support
- Session persistence in SQLite with automatic fallback to browser storage
- Session organization tools: pinning, trash, restore, and search
- Configurable API key, base URL, and default system prompt
- Chat export to text format
- Keyboard-friendly UX and mobile-responsive layout

## Architecture

- Frontend: [index.html](index.html), [style.css](style.css), [app.js](app.js)
- Backend: [server.js](server.js) (Express)
- Persisted state: [data/chat_sessions.db](data/chat_sessions.db)
- Package metadata and scripts: [package.json](package.json)

## Requirements

- Node.js 22 or newer (required for the built-in SQLite module used by [server.js](server.js))
- npm (bundled with Node.js)
- A reachable LLM API endpoint (default configured in app settings)

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Start the app:

```bash
npm start
```

3. Open:

```text
http://localhost:8080
```

## One-Click Launch on Windows

This repository includes launcher scripts:

- [run-app.bat](run-app.bat): Double-click to start on Windows
- [run-app.sh](run-app.sh): Bash launcher used by the batch file

Behavior:

- Validates that Node.js and npm are available
- Installs dependencies if [node_modules](node_modules) is missing
- Starts the Express server via npm start

## Configuration

Open settings in the app and configure:

- API key
- LLM server base URL
- Default system prompt

Default base URL in the UI points to a local-network server and can be changed at any time.

## API Contract

chatJRCSRG sends requests to:

- Method: POST
- Path: /v1/chat/ask

Example request payload:

```json
{
  "message": "Explain retrieval-augmented generation",
  "history": [
    { "role": "user", "content": "What is RAG?" },
    { "role": "assistant", "content": "RAG combines..." }
  ],
  "system_prompt": "You are a concise technical assistant"
}
```

Expected response shape:

```json
{
  "answer": "RAG is...",
  "model": "model-name"
}
```

## Data and Persistence

- Primary storage: SQLite database at [data/chat_sessions.db](data/chat_sessions.db)
- Automatic fallback: browser localStorage when backend state API is unavailable
- To reset all persisted sessions, stop the app and remove [data/chat_sessions.db](data/chat_sessions.db)

## Troubleshooting

- "node is not recognized" or launcher exits early:
  Install Node.js, then reopen terminal and run again.
- Cannot connect to model server:
  Verify base URL, API key, and that your LLM endpoint is reachable.
- Sessions not persisting:
  Confirm the server is running and the [data](data) directory is writable.

## Security Notes

- API keys are stored client-side by the web app.
- For production environments, prefer HTTPS and server-side credential handling.

## License

Internal or private use unless a separate license is added.
