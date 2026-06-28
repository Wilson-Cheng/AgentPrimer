# Module 05 — Answer Key: Memory & Agents

## Exercise 1: Edit agents/<agent>/agent.md directly

Open `data/agents/<agent>/agent.md` and add:

```markdown
# reviewer
**System Prompt:** You are a code reviewer. Review code for bugs, security issues, and style problems.
**Tools:** read_file, list_directory, search_files
**Model:** default
```

The agent is registered automatically when the file is saved (no restart needed). Switch to it via the agent dropdown in the chat header. Ask: *"Review lib/agent.ts for potential bugs"*

**Expected:** The agent uses `read_file` to read `lib/agent.ts`, then produces a code review covering bugs, security, and style. It only uses the tools listed (`read_file`, `list_directory`, `search_files`) — it cannot use `edit_file`, `write_file`, or `run_shell` because `**Tools:**` restricts it.

**Verification:** Check that `getAgentConfig('reviewer')` returns only the 3 allowed tools. The filtering happens in `createStreamingAgent` where `config.tools` (which is `['read_file', 'list_directory', 'search_files']`) is passed to `loadFunctionTools`, `loadMcpTools`, and `createBuiltinTools`; SKILL.md discovery is filtered separately.

---

## Exercise 2: Trigger memory update

Send: *"Please remember that I prefer all code comments in Spanish."*

**Expected:**

1. Agent calls `append_memory({ content: "User prefers all code comments in Spanish." })`
2. The tool appends to `data/agents/<agent>/memory.md` which now contains:
   ```markdown
   ## User Preferences
   - User prefers all code comments in Spanish.
   ```
3. Open a new conversation (click "New Chat" in sidebar)
4. Send: *"What do you know about my preferences?"*
5. The agent reads `data/agents/<agent>/memory.md` (injected into the system prompt) and recalls the preference

**How it works:** `readMemory()` reads `data/agents/<agent>/memory.md` fresh on every call. The content is injected into the system prompt via `buildSystemPrompt()`. Every turn, the agent sees the full memory content as system instructions before the conversation history.

---

## Exercise 3: Trace model resolution

Add to `createStreamingAgent` after line 1601:

```typescript
console.log('Resolved model:', resolvedModel);
```

Test three scenarios:

| Scenario | Action | Logged Model |
|----------|--------|--------------|
| **(a)** UI selector set | Select `gpt-4o` in chat header | `gpt-4o` |
| **(b)** UI selector cleared | Click "Default" in selector | Falls to `config.model` → if not set, to `default_model` setting |
| **(c)** agents/<agent>/agent.md set | Add `**Model:** claude-sonnet-4` to agent | `claude-sonnet-4` |

**Resolution order (agent.ts):**
```typescript
const resolvedModel = modelId ?? config.model ?? getSetting('default_model') ?? '';
if (!resolvedModel) {
  // Emit a friendly streamed message linking to /settings and stop.
  // No hardcoded fallback — the project is model-agnostic.
}
```

1. `modelId` — UI selector (highest priority)
2. `config.model` — from data/agents/<agent>/agent.md (the literal `default` is treated as "not set")
3. `getSetting('default_model')` — from the Settings page
4. If still unset → the chat displays `⚠️ No default model is configured. Open the [Settings page](/settings) and pick a model under **Default Model**, then try again.` and the turn ends without an LLM call.

---

## Exercise 4: Launch an async sub-agent

Send: *"Run a background research task: find all TypeScript files in the project that use `fetch`. Report back when done."*

**Expected flow:**

1. Main agent calls `run_subagent_async({ agent_name: "researcher", task: "find all TypeScript files that use fetch", project_folder: "." })`
2. Returns immediately: `{ task_id: "uuid", task_file: "./tasks/uuid.md", status: "started" }`
3. A background process starts: `runSubagentWithTaskFile` runs the `researcher` agent non-interactively
4. Task file at `./tasks/uuid.md` gets log entries:
   ```
   [2026-05-31T12:00:00Z] STARTED
   [2026-05-31T12:00:05Z] PROGRESS: Searching for .ts files...
   [2026-05-31T12:00:08Z] FINISHED: Found 3 files: agent.ts, db.ts, chat.ts
   ```
5. When done, a notification is queued for the parent session
6. On the next user message, the main agent reads the notification and reads the task file
7. Main agent reports results to the user

**Verify in DB:**
```sql
SELECT * FROM agent_tasks;
SELECT * FROM agent_notifications;
```