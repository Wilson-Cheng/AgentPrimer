# Module 02 — Answer Key: The Agent Loop

## Exercise 1: Trace a tool call manually

Set a breakpoint inside the tool execution block in `lib/agent.ts`, where `toolDef.execute(args)` runs.

Send: *"List all files in /app/lib"*

**Expected trace:**

1. `POST /api/chat` calls `createStreamingAgent`
2. Agent config loaded from `data/agents/<agent>/agent.md` → system prompt assembled
3. Step 0 starts → LLM call with tools available
4. LLM streams tokens, `finish_reason: "tool_calls"` → `list_directory` chosen
5. Breakpoint hits at line 592: `toolDef.execute(args)` with `args = { dir_path: "/app/lib" }`
6. `list_directory` reads the directory and returns entries
7. Result appended to messages, step 1 starts
8. LLM produces text answer with file list → `finish_reason: "stop"`
9. `onFinish` saves response to DB

**Code path:**
`route.ts:POST` → `createStreamingAgent` → internal agent loop → `openai.chat.completions.create` → stream loop → `toolDef.execute(args)` → append tool result → next LLM call → finish.

---

## Exercise 2: Add a console.log step counter

Add after line 410 (inside the for loop):

```typescript
console.log(`Step ${step}: finish_reason = ${finishReason}, tool_calls = ${completedTCs.length}`);
```

Send: *"Read file foo.txt, then read file bar.txt, then tell me which is larger"*

**Expected output (3 steps):**
```
Step 0: finish_reason = tool_calls, tool_calls = 1
Step 1: finish_reason = tool_calls, tool_calls = 1
Step 2: finish_reason = stop, tool_calls = 0
```

Without the console.log, the UI shows all tool calls collapsed into one assistant message — you cannot tell it took 3 LLM round-trips.

---

## Exercise 3: Observe streaming fragments

Open DevTools → Network → find `/api/chat` → Response tab.

Send: *"List all files in /app/lib"*

Look for these wire events in order:

| Prefix | Meaning | Example |
|--------|---------|---------|
| `f:` | Start step | `f:{"messageId":"step-1743456789-0"}` |
| `g:` | Reasoning token | `g:"I need to call list_directory…"` |
| `b:` | Tool call streaming start | `b:{"toolCallId":"call_abc","toolName":"list_directory"}` |
| `c:` | Tool call argument delta (multiple fragments) | `c:{"toolCallId":"call_abc","argsTextDelta":"{\"dir"}` |
| `c:` | Next fragment | `c:{"toolCallId":"call_abc","argsTextDelta":"_path\":"}` |
| `c:` | Final fragment | `c:{"toolCallId":"call_abc","argsTextDelta":"\"/app/lib\"}"}` |
| `9:` | Complete tool call | `9:{"toolCallId":"call_abc","toolName":"list_directory","args":{"dir_path":"/app/lib"}}` |
| `a:` | Tool result | `a:{"toolCallId":"call_abc","result":{"path":"/app/lib","entries":[...]}}` |
| `e:` | Finish step | `e:{"finishReason":"tool-calls"}` |
| `0:` | Text token | `0:"The files in /app/lib are: …"` |
| `d:` | Finish message | `d:{"finishReason":"stop"}` |

Tool call arguments arrive as multiple `c:` fragments because the LLM streams JSON character by character. The agent accumulates them in `tcAccum` (keyed by index) and only emits the complete `9:` when the stream ends.

---

## Exercise 4: Trigger maxSteps

Set the configured maximum agent steps to `2` in Settings or in the `createStreamingAgent` call path.

Send: *"Read three different files: lib/agent.ts, lib/db.ts, and lib/memory.ts"*

**Expected behavior:**

1. Step 0: LLM calls `read_file(lib/agent.ts)` → result returned
2. Step 1: LLM calls `read_file(lib/db.ts)` → result returned
3. `maxSteps` reached (2 steps), loop exits
4. Agent produces partial answer with only 2 files read
5. The third file (`lib/memory.ts`) is never read
6. Message contains: "I read agent.ts and db.ts. (I was interrupted before reading memory.ts)"

The agent stops mid-task because the loop hit `maxSteps` before `finish_reason: "stop"`. The model is unaware of the cutoff — it simply stops getting tool results and must produce its best answer with what it has.
