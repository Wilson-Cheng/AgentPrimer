# Module 03 — Answer Key: Tools, Skills & MCP Servers

## Exercise 1: Trace a tool call to a function tool subprocess

Set a breakpoint in `lib/function-tools-loader.ts` where the function tool worker process is spawned.

Send: *"What is 17 * 23?"* (after enabling the calculator function tool)

**Expected trace:**

1. `loadFunctionTools()` reads enabled function tools from the `function_tools` DB table
2. For each function declared in the tool's `function.json`, creates an AI SDK `tool()` whose `execute` launches the subprocess runner
3. When the agent calls `calculator`, the subprocess runner fires:
4. `spawn('node', ['--max-old-space-size=256', 'lib/function-tool-worker.js'])` starts a new Node process
5. JSON written to worker stdin: `{"toolPath":"...index.js","toolName":"calculator","args":{"expression":"17*23"}}`
6. Worker `require()`s `index.js`, calls `exports.calculator({ expression: "17*23" })`
7. Worker writes result to stdout: `{"result":{"expression":"17*23","result":391,"formatted":"391","summary":"17*23 = 391"}}`
8. Main process parses output, resolves the `execute()` promise
9. Result `391` returned to the agent loop → appended to messages → next LLM call produces the text answer

**Note:** The subprocess has a 256 MB memory limit and 35s hard kill timeout. If the function tool hangs or crashes, only the worker dies — the Next.js server keeps running.

---

## Exercise 2: Write a date-time function tool

Create `data/function-tools/datetime/function.json`:

```json
{
  "name": "get_current_time",
  "description": "Get the current date and time in ISO 8601 format with timezone. Use when the user asks for the current time, date, or timezone-converted timestamp.",
  "parameters": {
    "type": "object",
    "properties": {
      "timezone": {
        "type": "string",
        "description": "IANA timezone name (e.g. 'Asia/Bangkok', 'America/New_York'). Defaults to UTC."
      }
    },
    "required": []
  }
}
```

Create `data/function-tools/datetime/index.js`:

```javascript
'use strict';

module.exports = {
  async get_current_time({ timezone } = {}) {
    const tz = timezone || 'UTC';
    try {
      const now = new Date();
      const options = {
        timeZone: tz,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
      };
      const formatted = new Intl.DateTimeFormat('en-CA', options).format(now);
      return {
        iso: now.toISOString(),
        formatted,
        timezone: tz,
        unix_ms: now.getTime(),
      };
    } catch {
      throw new Error(`Unknown timezone: ${tz}`);
    }
  },
};
```

Register: open **Skills & MCP → Function Tools**, click **Discover** to pick up the new directory, then **Enable**. Ask: *"What time is it in Bangkok?"*

**Expected:** Agent calls `get_current_time({ timezone: "Asia/Bangkok" })` and presents the result. The call appears as an amber `LiveToolCard` bubble in the chat — same visual treatment as built-in tools.

> Want to build an *instructional* skill instead? Drop a `SKILL.md` file into `data/skills/<name>/SKILL.md`. The agent reads the instructions and follows them with its own reasoning — no code execution. See `defaults/skills/hello-world/SKILL.md` for the minimum viable template.

---

## Exercise 3: Disable a built-in tool

In Settings → Built-in Tools, toggle **Write Files** off. Then ask the agent to create a file.

**Expected agent response:** The agent either:
- Says it cannot write files (it checked if the tool exists in its tool set)
- Calls `write_file` but gets an error response because the function isn't defined
- Tries an alternative approach (e.g., uses `edit_file` or `append_file` instead)

Disabling a tool removes it from the `filtered` map in `createBuiltinTools()` (agent.ts line 1216-1219):
```typescript
if (isBuiltinToolEnabled(name)) filtered[name] = def;
```

The model may still *suggest* writing a file, but when it tries to call the tool, the tool definition doesn't exist, so it gets `` `Tool not found: write_file` ``.

---

## Exercise 4: Enable run_shell

In Settings → Built-in Tools, toggle **Run Shell Commands** on. Then ask: *"Run echo hello"*

**Expected sequence:**

1. Agent calls `run_shell({ command: "echo hello" })`
2. The approval gate triggers because `run_shell` is a dangerous tool
3. UI shows red "Requires approval" card with options
4. Click **Approve once**
5. `echo hello` executes via `execAsync`, returns `{ stdout: "hello\n", stderr: "", exitCode: 0 }`
6. Agent reads the result and tells the user: `"The command returned: hello"`

**Try again** without re-approving — the approval prompt appears again (once scope).

---

## Exercise 5: Inspect MCP traffic

Assuming `data/mcp-servers/datetime/index.js` is the pre-installed demo MCP server. Add to its `CallToolRequestSchema` handler:

```javascript
console.error('MCP request:', JSON.stringify(req));
```

The server logs go to the agent's subprocess stderr, which is piped to the main process stderr (configured in the MCP client transport). These appear in the Next.js dev server terminal.

**Expected output in server logs:**
```
MCP request: {"method":"tools/call","params":{"name":"get_current_time","arguments":{"timezone":"UTC"}}}
```

This confirms the MCP protocol handshake: the agent sends a `tools/call` JSON-RPC request, the server processes it, and returns a `tools/call` response with the content.
