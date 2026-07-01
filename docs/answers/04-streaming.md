# Module 04 — Answer Key: Streaming Protocol

## Exercise 1: Read the raw stream

Open DevTools → Network → `/api/chat` → Response.

Send: *"What is 2 + 2?"*

**Expected raw response (single step, no tools):**
```
f:{"messageId":"step-1743456789-0"}
0:"2"
0:" +"
0:" 2"
0:" ="
0:" 4"
e:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0},"isContinued":false}
2:[{"type":"token_usage","input":46,"cached":0,"output":28}]
d:{"finishReason":"stop","usage":{"promptTokens":46,"completionTokens":28}}
```

The `f:` starts the step, `0:` parts are token-by-token text, `e:` ends the step, `2:` is custom data (token counts), `d:` signals stream complete.

Now send: *"List files in /app/lib"* — look for the tool call sequence:

```
b:{"toolCallId":"call_1","toolName":"list_directory"}
c:{"toolCallId":"call_1","argsTextDelta":"{\"dir"}
c:{"toolCallId":"call_1","argsTextDelta":"_path\":\""}
c:{"toolCallId":"call_1","argsTextDelta":"/app/lib"}
c:{"toolCallId":"call_1","argsTextDelta":"\"}"}
9:{"toolCallId":"call_1","toolName":"list_directory","args":{"dir_path":"/app/lib"}}
a:{"toolCallId":"call_1","result":{"path":"/app/lib","entries":[...]}}
```

---

## Exercise 2: Count events per turn

Save this as `scripts/count-stream-events.mjs`:

```javascript
// Run: node scripts/count-stream-events.mjs
const response = await fetch('http://localhost:15432/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sessionId: 'test-' + Date.now(),
    messages: [{ role: 'user', content: 'List files in /app/lib' }],
  }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();
const counts = {};

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const text = decoder.decode(value, { stream: true });
  for (const line of text.split('\n').filter(Boolean)) {
    const prefix = line[0];
    counts[prefix] = (counts[prefix] || 0) + 1;
  }
}

console.log('Event counts:', counts);
```

**Expected output for a tool-using turn:**
```
Event counts: { f: 2, b: 1, c: 5, '9': 1, a: 1, e: 2, '2': 1, '0': 42, d: 1 }
```

Key observations:
- 2 steps (`f:`, `e:` appear twice), `0:` tokens are the text output, `c:` fragments show the JSON was split into 5 chunks
- One tool call (`b:`, `9:`, `a:` appear once each)

---

## Exercise 3: Inject an error

In `lib/agent/loop.ts`, add before the first LLM call:

```typescript
throw new Error('simulated crash');
```

Send any message. **Expected:**

1. The `createDataStreamResponse` error handler catches it
2. `3:{"error":"simulated crash"}` is sent to the browser
3. `useChat` triggers `onError` callback
4. UI shows the error banner: `Error: simulated crash`

Remove the throw after testing.

---

## Exercise 4: Visualize reasoning

Switch to a thinking model (DeepSeek R1) in Settings → Default Model. Send: *"What is the sum of the first 50 prime numbers?"*

**Expected:**

1. The `g:` events arrive before `0:` events — these are reasoning tokens
2. The UI shows a "Thinking…" panel with an animated pulse
3. After reasoning finishes, the `0:` text tokens arrive (the answer)
4. Expanding the "Reasoning" panel shows the full chain-of-thought text

The wire format:
```
f:{...}
g:"I need to find the first 50 prime numbers..."
g:" Let me list them: 2, 3, 5, 7, 11..."
g:" ...sum = ..."
e:{finishReason:"stop"}
0:"The sum of the first 50 prime numbers is 5117."
d:{...}
```