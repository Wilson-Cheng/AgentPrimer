# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Start dev server (port 15432, all interfaces). Also starts the Python embedding sidecar (requires `pip install -r requirements.txt` for full RAG support — otherwise the sidecar starts in degraded mode).
- `npm run build` — Build for production
- `npm start` — Production start
- `npm test` — Run all tests with Vitest (tests in `tests/**/*.test.ts`)
- `npm run lint` — Run ESLint
- `npm run embed` — Start the Python embedding sidecar standalone
- `npm run postinstall` — Rebuild better-sqlite3 native bindings
- `pip install -r requirements.txt` — Install Python dependencies for the local embedding sidecar. The sidecar runs in degraded mode without it; only the RAG semantic search is affected.

## Architecture Overview

AgentPrimer is a **full-stack AI agent platform** built on Next.js 16 (App Router) with a hand-written ReAct agent loop. It uses the `openai` npm package directly (not `@ai-sdk/openai`) to preserve vendor-specific fields like `reasoning_content`. The Vercel AI SDK is used only for the browser data stream protocol (`createDataStreamResponse` + `useChat`).

### Key Design Decisions

- **Auth middleware** must be named `proxy.ts` (not `middleware.ts`) — Next.js 16 silently ignores `middleware.ts`
- **Agent loop** is hand-written in [lib/agent.ts](lib/agent.ts): the for loop that checks `finish_reason`, accumulates streaming tool call fragments, and re-calls the LLM with tool results
- **API key** stored in SQLite settings table, not env vars — supports runtime provider switching
- **Skills (SKILL.md)** are instruction modules injected into the system prompt — not callable functions. Use **function tools** (`function.json` + `index.js`) for callable code; they run in `child_process.spawn()` with a 256 MB memory cap and 35s timeout
- **All persistent state** lives under `data/` directory — single Docker volume mount point

### Core File Layout

```
app/api/chat/route.ts     — POST /api/chat streaming entry point
lib/agent.ts              — ★ Core agent loop (ReAct, streaming, tool dispatch, structured output)
lib/db.ts                 — SQLite layer (better-sqlite3, WAL mode, auto-migration)
lib/memory.ts             — agents/<agent>/memory.md / agents/<agent>/agent.md / system.md helpers
lib/auth.ts               — JWT auth (jose), bcrypt password hashing
lib/builtin-tools-registry.ts — 21 built-in tool metadata catalogue
lib/skills-loader.ts      — SKILL.md skill loader (injects instructions into system prompt)
lib/function-tools-loader.ts  — Function tool loader (callable code in subprocesses)
lib/function-tool-worker.js   — Subprocess entry point for function tool execution
lib/mcp-client.ts         — MCP protocol client (stdio + SSE)
lib/rag.ts                — RAG pipeline (chunking, embeddings, FTS5 fallback)
lib/approval-store.ts     — Human-in-the-loop approval gate
lib/installer.ts          — Git clone + npm install for SKILL.md skills / MCP servers
lib/agent-files.ts        — Files sent by agent via send_file tool
lib/langfuse.ts           — Optional Langfuse observability
lib/bootstrap.ts          — Server startup bootstrap (seed data)
proxy.ts                  — JWT auth middleware (Next.js 16 proxy convention)
instrumentation.ts        — Server startup hook (calls bootstrap)
```

### Pages / Routes

```
app/(main)/chat/page.tsx       — Main chat UI
app/(main)/agents/page.tsx     — Agent & memory file editor
app/(main)/settings/page.tsx   — Provider/model/user preferences
app/(main)/skills/page.tsx     — Skills, function tools, MCP, built-in tools
app/(main)/approvals/page.tsx  — Manage permanent approvals
app/(main)/statistics/page.tsx — Token usage charts
app/(main)/knowledge/page.tsx  — RAG UI (RAG)
app/(main)/tools/page.tsx      — Tool Playground
app/(main)/editor/page.tsx     — Agent Files Monaco editor
app/login/page.tsx             — Auth login
app/register/page.tsx          — First-time admin registration
app/setup/page.tsx             — Initial LLM setup wizard
```

### Database (SQLite, better-sqlite3, WAL mode)

Tables: `settings`, `sessions`, `messages`, `skills`, `function_tools`, `mcp_servers`, `permanent_approvals`, `agent_tasks`, `agent_notifications`, `knowledge_sources`, `knowledge_chunks`, `knowledge_fts` (FTS5), `token_usage_log`, `lesson_progress`

Database file: `data/db/agent.db`. All migrations are additive (`CREATE TABLE IF NOT EXISTS` + guarded `ALTER TABLE`).

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| LLM API | `openai` npm package (direct, not Vercel adapter) |
| Stream wire | Vercel AI SDK (`ai@4.3.19`) — wire protocol only |
| Database | `better-sqlite3` (synchronous, WAL mode) |
| Auth | JWT via `jose` (httpOnly cookies) |
| Validation | Zod + zod-to-json-schema |
| MCP | `@modelcontextprotocol/sdk` |
| Styling | Tailwind CSS v4 |
| Charts | Recharts |

### Agent Configuration

Agents are defined in data/agents/<agent>/agent.md in Markdown format:

```markdown
# agent-name
**System Prompt:** Instructions for the agent.
**Tools:** all (or comma-separated list)
**Model:** default (optional — `default` or omission both mean "use the model configured under Settings → Default Model")
**Output Schema:** schema label followed by a fenced JSON Schema block (optional, enables finalize/structured-output path)
```

Five agents ship by default: `main`, `researcher`, `coder`, `extractor`, and `extractor-with-tools`.

### Memory Files

- data/agents/<agent>/memory.md — Long-term agent memory (injected into system prompt)
- [data/system.md](data/system.md) — Global system prompt (prepended to all agents)

### Important Gotchas

1. **Next.js 16 proxy filename**: Auth middleware must be `proxy.ts`, not `middleware.ts`
2. **API key in DB**: Not in `.env` — read from SQLite `settings` table
3. **Streaming headers**: Add `X-Accel-Buffering: no` and `Cache-Control: no-cache, no-transform` to SSE responses when behind nginx
4. **`serverExternalPackages`** in [next.config.ts](next.config.ts): `better-sqlite3`, `@modelcontextprotocol/sdk`, `simple-git` must be external (not bundled)
5. **`zod-to-json-schema` adds `$schema`**: Must delete `$schema` from the output before sending to OpenAI (see `zodToOpenAISchema` in [lib/agent.ts](lib/agent.ts))
