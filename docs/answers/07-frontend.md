# Module 07 — Answer Key: Frontend Architecture

## Exercise 1: Trace a keystroke to DOM

Add to `components/ChatInput.tsx` in `handleSend` (or `onSend` callback):

```typescript
console.log('[ChatInput] handleSend called with:', text);
```

Send a message. The full trace:

1. **ChatInput.tsx** — User types in `<textarea>` → `handleSend` fires → `console.log` fires
2. **ChatInterface.tsx:516** — `handleSend` calls `append({ role: 'user', content: text }, { body: { ... } })`
3. **useChat** internally POSTs to `/api/chat` with the full message history
4. **Server** streams response tokens via SSE
5. **useChat** receives each chunk, updates `messages` state
6. **React** re-renders `ChatInterface` with new message
7. **MessageBubble** renders the new message

**Re-render count (React DevTools):**
- 1 render for the user message appearing
- ~5-10 renders during streaming (each chunk triggers a setState)
- 1 final render when streaming completes

The `useChat` hook batches updates via its internal state machine, so intermediate renders only happen when `useChat` decides to yield (typically every few chunks or after a pause).

---

## Exercise 2: Add a "Reset" button to the sidebar

This was implemented as the "New Chat" button in the sidebar (`components/Sidebar.tsx` line 341-353). It calls `onNewSession()` which triggers `setMessages([])` and creates a new session UUID.

To add a different "Reset conversation" button (keeping the session but clearing messages):

```tsx
// In Sidebar.tsx, add a button after "New Chat":
<button
  onClick={async () => {
    if (currentSessionId) {
      await fetch(`/api/messages?sessionId=${currentSessionId}`, { method: 'DELETE' });
      window.dispatchEvent(new Event('sessions-changed'));
      window.dispatchEvent(new CustomEvent('reset-conversation'));
    }
  }}
  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-gray-600 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 text-sm font-medium"
>
  <Trash2 size={15} />
  <span>Clear Messages</span>
</button>
```

This requires a `DELETE /api/messages` endpoint on the server.

---

## Exercise 3: Test the Preview Panel

Send: *"Write a simple bouncing ball animation in HTML"*

**Expected sequence:**

1. Agent creates an HTML file: `write_file({ file_path: "./data/projects/.../bounce.html", content: "<html>..." })`
2. Agent calls `open_preview({ path: "./data/projects/.../bounce.html" })`
3. The `open_preview` tool result has `{ type: "open_preview", path: "...", title: "..." }`
4. ChatInterface detects this in its messages effect (line 301-361) and calls `setPreviewFile` + `setPreviewOpen(true)`
5. The Preview Panel opens on the right side of the screen
6. A sandboxed iframe loads the HTML file
7. The ball animation plays in the iframe

**In DevTools:** The Preview Panel renders as a `<div>` sibling of the chat `<main>` element, using `flex` layout from the parent `MainLayout`.

---

## Exercise 4: Inspect file delivery

Send: *"Please send me a simple SVG image of a circle"*

**Expected:**

1. Agent creates an SVG file: `write_file({ file_path: "./data/agent-files/circle.svg", content: "<svg>...</svg>" })`
2. Agent calls `send_file({ path: "./data/agent-files/circle.svg", description: "A simple circle" })`
3. `saveAgentFile` in `lib/agent-files.ts` copies the file to `data/agent-files/` and returns `{ type: "agent_file", filename: "circle.svg", mime_type: "image/svg+xml", url: "/api/agent-files/circle.svg", ... }`
4. In **Network tab**, find `GET /api/agent-files/circle.svg`
5. The response headers show `Content-Type: image/svg+xml`
6. In the UI, the file appears as a card with the SVG rendered inline (for images) and a download button
7. Click **Download** — the file saves to your local machine

The `AgentFileCard` component (MessageBubble.tsx line 677-779) handles the rendering:
- Images → `<img>` tag
- Videos → `<video>` tag  
- Audio → `<audio>` player
- Text/JSON → collapsible preview
- Other → icon + download button
