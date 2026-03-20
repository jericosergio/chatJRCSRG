# LLM Chat Web App

A modern, feature-rich web interface for interacting with a local LLM chat API server.

## Features

✨ **Core Features**
- Clean, responsive chat interface
- Real-time chat messaging
- Multi-turn conversation support with automatic history management
- Custom system prompt support
- Rate limit information display

💾 **SQLite Session Storage**
- Automatic chat history persistence in SQLite (`data/chat_sessions.db`)
- Settings auto-save (API key, server URL, system prompt)
- Export chat transcripts to text files

⚙️ **Settings Panel**
- Configurable API key (password field for security)
- Custom server URL
- Default system prompt for all conversations
- Clear chat history option

📱 **User Experience**
- Keyboard support (Shift+Enter for new line, Enter to send)
- Auto-scrolling to latest messages
- Loading indicators and status messages
- Responsive design (desktop and mobile friendly)
- Syntax-aware message display

## Setup

### Prerequisites
- A local LLM chat API server running at `http://10.0.0.84:8000` (or your custom URL)
- A valid API key for your server
- Any modern web browser (Chrome, Firefox, Safari, Edge)

### Installation

1. **Install dependencies**
  ```
  npm install
  ```

2. **Start the app server**
  ```
  npm start
  ```

3. **Open in browser**
  - Visit `http://localhost:8080`

The Node server serves the UI and stores chat sessions in SQLite.

3. **Configure Settings**
   - Click the ⚙️ settings button in the top right
   - Enter your **API Key** (required)
   - Verify the **Server URL** (default: `http://10.0.0.84:8000`)
   - Optionally set a **Default System Prompt**
   - Click "Save Settings"

## Usage

### Basic Chat
1. Type your message in the input field at the bottom
2. Press **Enter** to send (or click the Send button)
3. Wait for the assistant's response

### Multi-turn Conversations
- The app automatically maintains conversation history
- Each message includes the full conversation context
- History is automatically sent to the server with each request
- Maximum 40 turns in history (API limit)

### Custom System Prompts
- Set a default system prompt in settings (applies to all messages)
- Or add custom prompts per conversation by formatting your message:
  ```
  [System: You are a Python expert]
  Help me write a function...
  ```

### Export Chat
- Click the **Export Chat** button to download conversation as `.txt` file
- Includes timestamp and all messages
- Useful for documentation or backup

### Keyboard Shortcuts
- **Enter** - Send message
- **Shift + Enter** - New line in message
- **Esc** (in settings) - Close settings panel

## API Details

### Endpoint
- **POST** `/v1/chat/ask`
- **Base URL**: `http://10.0.0.84:8000`

### Request Format
```json
{
  "message": "Your question here",
  "history": [
    {"role": "user", "content": "Previous message"},
    {"role": "assistant", "content": "Previous response"}
  ],
  "system_prompt": "Optional system prompt"
}
```

### Response Format
```json
{
  "answer": "Response from the model",
  "model": "gemma3:4b"
}
```

### Rate Limits
- 30 requests per minute per IP address
- The app will show an error if you exceed this limit

## Data Storage

### SQLite (Primary)
- **Conversation sessions** are stored in `data/chat_sessions.db`
- Includes all tabs, pinned state, trash, titles, and message history
- Improves browser responsiveness versus large `localStorage` payloads

### Browser Local Storage (Fallback)
- Automatically used only if SQLite state API is unavailable
- Keeps app usable during backend outages

### Clear Data
- Soft-delete chats to Trash from the sidebar
- Use **Empty Trash** for permanent delete
- To fully reset data, stop server and delete `data/chat_sessions.db`

## Troubleshooting

### "Invalid API Key" Error
- Check your API key in settings
- Ensure it matches your server's configuration
- Click "Show" to verify you didn't mistype it

### "Cannot connect to server"
- Verify the server URL is correct (e.g., `http://10.0.0.84:8000`)
- Check that your LLM server is running
- Ensure there's no firewall blocking the connection
- Try accessing the URL directly in your browser to test

### Rate Limit Exceeded
- Wait a minute before sending more messages
- The app will show the rate limit error

### Conversation Not Saving
- Confirm Node server is running on `http://localhost:8080`
- Check the `data` folder is writable
- If server is down, app will use local fallback and show a status warning

## Browser Compatibility

- ✅ Chrome/Chromium (recommended)
- ✅ Firefox
- ✅ Safari
- ✅ Edge
- ✅ Mobile browsers

## Security Note

- API keys are stored in browser local storage (same security as cookies)
- For sensitive deployments, consider:
  - Using HTTPS instead of HTTP
  - Storing API keys server-side instead of client-side
  - Implementing proper authentication

## License

Free to use and modify.
