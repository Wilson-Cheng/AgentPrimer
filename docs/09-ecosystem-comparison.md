# Module 09 — Ecosystem Comparison: AgentPrimer, OpenClaw, and Hermes Agent

← [Database](./08-database.md) | [Back to README →](./README.md)

---

> **About this module.** AgentPrimer is the in-repo project; everything in the "AgentPrimer" column is verified against the current source. The "OpenClaw" and "Hermes Agent" columns describe other open-source personal-agent projects as positioning context — those external claims are **not verified by this codebase** and are illustrative only. Treat the comparison as a design discussion of how AgentPrimer's choices compare to broader patterns in the personal-agent space, not as a fact-checked statement about any specific external project.

---

## Learning Objectives

After reading this module you will be able to:
- Position AgentPrimer alongside the two most prominent open-source personal AI agent projects
- Explain why OpenClaw, Hermes Agent, and AgentPrimer share conventions (SKILL.md, MCP, markdown memory) but differ in delivery model
- Compare all three projects across architecture, interface, skills, memory, sandboxing, and platform support
- Identify what AgentPrimer is missing relative to the other two, and understand how to close each gap

---

## The Three Projects at a Glance

All three are open-source, self-hostable AI agent applications targeting developers and power users. They share several conventions — `SKILL.md` files, MCP support, markdown-based memory — but differ fundamentally in their delivery model and design goals.

| | AgentPrimer | OpenClaw | Hermes Agent |
|---|---|---|---|
| **Repo** | *(this project)* | [openclaw/openclaw](https://github.com/openclaw/openclaw) | [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) |
| **GitHub presence** | New project | Large established project | Large established project |
| **Contributors** | — | 2,211 | 1,209 |
| **Language** | TypeScript / Next.js | TypeScript / Node.js | Python + TypeScript web |
| **Primary interface** | Browser web UI | CLI daemon + 20+ messaging channels | Terminal TUI + messaging gateway |
| **Design goal** | Self-hosted web training platform | Personal assistant, omnichannel | Self-improving personal agent |
| **Skills** | Developer-written npm packages | SKILL.md; ClawHub registry (5,400+) | Agent-written Python; self-improving |
| **Memory** | Markdown files injected into prompt | `MEMORY.md` + `USER.md` in prompt | Markdown + FTS5 session search + Honcho |
| **Sandboxing** | ⚠️ Approval gate + per-tool path sandboxing; **no container/VM sandbox** for `run_shell` or function tools. Function tools execute in a Node.js subprocess with a 35 s parent / 30 s inner timeout and `--max-old-space-size=256` memory cap, but the subprocess has full host filesystem access. Recommended deployment is inside Docker (see `Dockerfile` / `docker-compose.yml`). | ✅ Docker / SSH / OpenShell | ✅ Docker, SSH, Singularity, Modal, Daytona |
| **Voice** | ❌ | ✅ Wake words + Talk Mode (macOS/iOS/Android) | ✅ Voice memo transcription + TTS |
| **Messaging channels** | ❌ (web only) | ✅ 20+ (WhatsApp, Telegram, Slack, iMessage…) | ✅ Telegram, Discord, Slack, WhatsApp, Signal, Email |
| **Mobile apps** | ❌ | ✅ iOS node + Android node | ❌ |
| **Desktop app** | ❌ | ✅ macOS menu bar (OpenClaw.app) | ❌ |
| **Live Canvas** | ❌ | ✅ A2UI visual workspace | ❌ |
| **Cron scheduler** | ❌ | ✅ Channel-aware, natural language | ✅ Platform delivery |
| **Multi-user auth** | ⚠️ First-run registration is an "admin"; additional users can be added (stored in `data/.users` as `username:bcrypt-hash`). JWT cookie auth via `proxy.ts`. | ❌ Single-user | ❌ Single-user |
| **Web chat UI** | ✅ Full authenticated app | Partial (WebChat is one channel) | Partial (web dashboard only) |
| **File preview panel** | ✅ HTML/image/PDF/audio inline | ❌ (file attachments to channels) | ❌ |
| **Token cost tracking** | ✅ Per-message statistics page | ❌ | ❌ |
| **MCP support** | ✅ | ✅ | ✅ |
| **Sub-agents** | ✅ Sync + async task files | ✅ Route channels to different agents | ✅ Parallel workstreams via RPC |
| **Skills registry** | ❌ | ✅ clawhub.ai | ✅ agentskills.io |
| **Training data pipeline** | ❌ | ❌ | ✅ Trajectory compression → fine-tune |
| **Setup** | `npm install && npm run dev` | `npm install -g openclaw && openclaw onboard` | `curl …/install.sh \| bash` |

---

## Architecture: Three Different Runtime Models

The three projects are built around fundamentally different ideas about where the agent lives and who it serves.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  AgentPrimer: Web Server Model                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  Browser ───────→ Next.js HTTP ──→ Agent loop ──→ SSE stream ──→ UI        │
│                                                                             │
│  • Request/response lifecycle (one HTTP call per turn)                      │
│  • Single-admin JWT authentication                                          │
│  • SQLite stores all session history and messages                           │
│  • Agent runs on the same host as the web server                            │
│  • Skills are npm packages loaded at startup                                │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  OpenClaw: Gateway Daemon Model                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  WhatsApp ──┐                                                               │
│  Telegram ──┤                                                               │
│  Slack ─────┼──→ OpenClaw Gateway ──→ Agent loop ──→ reply to origin       │
│  iMessage ──┤                                                               │
│  WebChat ───┘                                                               │
│                                                                             │
│  • Persistent daemon (runs as systemd / launchd user service)               │
│  • All channels share one agent + one memory (~/.openclaw/workspace/)       │
│  • Docker containers for group/channel sessions (non-main)                  │
│  • SOUL.md gives the agent a stable persona and name                        │
│  • Skills installed from ClawHub (clawhub.ai)                               │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  Hermes Agent: CLI + Learning Loop Model                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  Terminal TUI ──┐                                                           │
│  Telegram ──────┤──→ Hermes runtime ──→ Agent loop ──→ skills ──→ reply    │
│  Discord ───────┘                                                           │
│                                                                             │
│  • Terminal-first; messaging gateway is optional                            │
│  • Python runtime; 7 execution backends (local, Docker, SSH, serverless)   │
│  • Skills CREATED by the agent itself from complex task experience          │
│  • Skills improve autonomously during use (Darwinian evolver)               │
│  • Trajectory export for training next-generation models                    │
│  • hermes claw migrate — built-in migration from OpenClaw                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Structural Properties Side-by-Side

| | AgentPrimer | OpenClaw | Hermes Agent |
|---|---|---|---|
| **Lifecycle** | Per-HTTP-request | Persistent daemon (24/7) | Interactive session or gateway |
| **Users** | Single admin (JWT auth) | Single (personal) | Single (personal) |
| **State storage** | SQLite (`data/db/agent.db`) plus filesystem state under `data/` (agents, skills, function tools, MCP servers, uploads, agent-files, RAG model cache, `.users`) | `~/.openclaw/workspace/` | `~/.hermes/` |
| **Code execution** | Host, approval required | Host by default; Docker for group sessions | Configurable (Docker, SSH, Modal, Daytona…) |
| **Language runtime** | Node.js (TypeScript) | Node.js (TypeScript) | Python 3.11 |
| **Install** | `npm run dev` | `npm install -g openclaw` | `curl … \| bash` |

---

## Section 1: AgentPrimer vs OpenClaw

### What Is OpenClaw?

[OpenClaw](https://github.com/openclaw/openclaw) is a **personal AI assistant** built in TypeScript/Node.js that runs as a background daemon on your own devices. Its tagline is "Your own personal AI assistant. Any OS. Any Platform. The lobster way. 🦞"

It connects to the messaging apps you already use and provides a persistent, always-on assistant. The agent lives in `~/.openclaw/workspace/` and receives messages from WhatsApp, Telegram, iMessage, Slack, Discord, Google Chat, IRC, Matrix, and 12+ more channels simultaneously.

**Key facts:**
- Large GitHub community and plugin ecosystem
- TypeScript 92%, Swift (iOS app), Kotlin (Android app)
- 175+ releases; weekly cadence
- Workspace files: `SOUL.md` (persona), `AGENTS.md`, `TOOLS.md`, `skills/<name>/SKILL.md`
- Skills: [ClawHub](https://clawhub.ai/) — 5,400+ community skills (GitHub, email, calendar, Spotify, etc.)

### The Core Design Philosophy Difference

```
  OpenClaw: Personal assistant               AgentPrimer: Developer tool
  ──────────────────────────────────         ──────────────────────────────────
  Runs 24/7 as a background daemon           Runs as a web server when you need it
  You talk to it from your phone             You access it from a browser
  Single user — you                          Single admin via browser login
  Meets you where you are (20+ channels)     One interface (web UI)
  SOUL.md gives the agent a name/persona     agents/<agent>/agent.md (system prompt) + memory.md (cross-session memory) give context
  Skills from ClawHub (5,400+)               Skills as npm packages (handful built-in)
  Docker sandboxing for group sessions       Approval gate for dangerous tools
```

### Feature Deep-Dive

#### Skills System

Both projects use `SKILL.md` files — but the authoring model is different:

**AgentPrimer skills** follow the [agentskills.io](https://agentskills.io/) open standard. Skills are `SKILL.md` instruction files in `data/skills/<name>/SKILL.md`. No code required — the skill describes what it does and how to follow it, and the agent reads those instructions and acts on them. Community members have contributed skills for report generation, code review, JSON formatting, and more.

In addition to SKILL.md skills, AgentPrimer also has **function tools** — callable code packages (`function.json` + `index.js`) that run in isolated subprocesses. Function tools are the equivalent of what other platforms call "tools" or "plugins": deterministic code execution for computation, API calls, and data processing.

**OpenClaw skills** are SKILL.md files in `~/.openclaw/workspace/skills/`. They can be installed from ClawHub with `openclaw skills install <name>`. Community members have contributed 5,400+ skills for GitHub, email, Notion, Spotify, screen capture, and more.

#### Messaging and Delivery

OpenClaw's most distinctive capability is that the agent meets you where you already communicate. You can:
- Send a message on Telegram from your phone → get a reply on Telegram
- Ask something on Slack → get an answer in the same Slack thread
- Use iMessage on your Mac to talk to your local assistant

AgentPrimer requires opening a browser. There is no way to reach it from a messaging app without custom integration.

#### Sandboxing

OpenClaw runs agent commands on the host by default for the `main` session (you, trusted). For group/channel sessions (potentially untrusted senders), it runs commands inside Docker containers:

```yaml
# openclaw.json
agents:
  defaults:
    sandbox:
      mode: "non-main"   # all non-main sessions run in Docker
```

AgentPrimer has no sandboxing. All commands require explicit user approval via the browser-based approval gate, but they always run on the host.

#### Persona / SOUL.md

OpenClaw agents have a stable character defined in `SOUL.md`. This file describes the agent's name, personality, communication style, and values. AgentPrimer agents have no fixed persona — memory files provide context but the agent has no stable identity across sessions.

### What AgentPrimer Does Better Than OpenClaw

| Advantage | Details |
|-----------|---------|
| **Web auth** | Browser-based JWT login with first-run admin registration. OpenClaw is personal by design. |
| **Rich browser UI** | Session list, approval buttons, Preview Panel, statistics, settings. OpenClaw's WebChat is minimal. |
| **File preview inline** | `send_file` + Preview Panel renders HTML, images, PDFs, audio, video directly in chat. OpenClaw sends file attachments to messaging channels. |
| **Token cost tracking** | Records `token_usage_json` per message; statistics page shows cost over time. OpenClaw has no cost dashboard. |
| **Shared URL access** | A deployed instance is reachable from any browser after admin login. OpenClaw requires installing a Node.js package on the user's machine. |

### What OpenClaw Does Better Than AgentPrimer

| Advantage | Details |
|-----------|---------|
| **Omnichannel** | 20+ messaging channels — Telegram, WhatsApp, iMessage, Slack, Discord, Signal, and more. |
| **Voice** | Wake words (`hey openclaw`), push-to-talk overlay, TTS playback. macOS/iOS/Android. |
| **Mobile** | iOS node and Android node — camera, microphone, screen capture, voice from your phone. |
| **SOUL.md persona** | Stable agent name and character. Agent remembers who it is across sessions. |
| **Skills ecosystem** | 5,400+ community skills on ClawHub vs a handful of built-in AgentPrimer tools. |
| **Docker sandboxing** | Group sessions run in containers. Dangerous commands are safe inside the sandbox. |
| **Cron scheduler** | Natural-language automations: "every morning check my email and send a digest to Telegram". |
| **Live Canvas** | A2UI renders an interactive visual workspace on macOS. |
| **Community scale** | Large established community and plugin ecosystem. |

---

## Section 2: AgentPrimer vs Hermes Agent

### What Is Hermes Agent?

[Hermes Agent](https://github.com/NousResearch/hermes-agent) is a **Python-based CLI agent** built by [Nous Research](https://nousresearch.com/) — the same team that created the Hermes 3 model family. Its tagline is "The agent that grows with you."

Hermes Agent's defining feature is a **closed learning loop**: after completing a complex task, the agent writes a skill from the experience. That skill improves automatically during future use via a "Darwinian evolver". Over time the agent becomes more capable at the tasks you actually give it.

**Key facts:**
- Large GitHub community and active contributor base
- Python 88%, TypeScript 8% (web dashboard)
- Install: `curl -fsSL .../install.sh | bash` (macOS, Linux, WSL2, Termux, Windows)
- v0.14.0 released 2026-05-16; weekly releases
- `hermes claw migrate` — imports settings, memories, skills, and API keys from OpenClaw
- [Nous Portal](https://portal.nousresearch.com/): one subscription for 300+ models + Tool Gateway (web search, image gen, TTS, cloud browser)
- Skills standard: [agentskills.io](https://agentskills.io/) (compatible with OpenClaw skills)

### The Self-Improving Skills Loop

This is the most significant technical differentiator between all three projects:

```
AgentPrimer:
  Developer writes npm skill → publishes package → admin installs → agent uses

OpenClaw:
  Community writes skill → publishes to ClawHub → user installs with one command → agent uses

Hermes Agent:
  Agent completes complex task → agent writes skill → skill improves during use → skill published to agentskills.io
```

Hermes Agent skills are Python scripts in `~/.hermes/skills/`. After a complex session, the agent may automatically create a new skill capturing the approach it used. On future similar tasks, the agent finds and improves the skill. This is "procedural memory" — the agent learns *how to do things*, not just *facts about you*.

### Memory Architecture

All three projects use markdown-based memory injection, but with different depth:

| | AgentPrimer | OpenClaw | Hermes Agent |
|---|---|---|---|
| **Memory file** | `data/agents/<agent>/memory.md` | `~/.openclaw/workspace/MEMORY.md` + `USER.md` | `~/.hermes/agents/<agent>/memory.md` + user profile |
| **How injected** | Loaded at session start; injected into system prompt | Injected into every conversation | Injected into every conversation |
| **Search** | ❌ No search — entire file injected | ❌ No search — entire file injected | ✅ FTS5 full-text search across all past sessions |
| **User modeling** | ❌ | ❌ | ✅ Honcho dialectic user modeling |
| **Cross-session recall** | ❌ | ❌ | ✅ LLM-summarized session search |

Hermes Agent's FTS5 session search means you can ask "what did we decide about the database schema last month?" and the agent will search its past session logs and synthesize an answer. AgentPrimer and OpenClaw have no equivalent — memory is limited to whatever fits in the prompt.

### Execution Backends

Hermes Agent supports 7 different execution environments for running shell commands:

| Backend | Description | When to use |
|---------|-------------|-------------|
| `local` | Direct host execution | Development, trusted environments |
| `docker` | Docker container | Team use, untrusted workloads |
| `ssh` | Remote server via SSH | Agent runs locally, executes remotely |
| `singularity` | HPC container (Singularity) | Research clusters |
| `modal` | Serverless (Modal.com) | Hibernates when idle; cost-effective |
| `daytona` | Persistent cloud dev environment | Long-running projects |
| `vercel_sandbox` | Vercel Sandbox | Ephemeral, browser-accessible |

AgentPrimer has none of these — `run_shell` always runs on the host. OpenClaw has Docker and SSH.

### Feature Deep-Dive

#### Multi-Channel Messaging

Like OpenClaw, Hermes Agent supports a messaging gateway:
- Telegram, Discord, Slack, WhatsApp, Signal, Email
- Voice memo transcription (Telegram voice messages → text → agent)
- TTS playback (agent responses → audio → messaging channel)
- Cross-platform conversation continuity (start on Telegram, continue on Slack)

#### Cron / Scheduled Automations

```bash
# Hermes Agent: natural-language cron setup
hermes cron add "every day at 9am: check my email and summarize to Telegram"
hermes cron add "every Sunday: generate weekly project report and post to Discord"
```

AgentPrimer has no scheduler. Cron would require an external job runner calling the API.

#### Training Data Pipeline

Hermes Agent can export agent trajectories (tool call sequences) as training datasets. This enables fine-tuning a custom model on your own agent's behavior — a path from "using AI" to "training AI":

```
Agent works → trajectory logged → trajectory compressed → dataset exported → fine-tune model
```

Neither AgentPrimer nor OpenClaw has this pipeline.

### What AgentPrimer Does Better Than Hermes Agent

| Advantage | Details |
|-----------|---------|
| **Web auth** | Browser-based JWT login with first-run admin registration. Hermes is terminal-first and personal by design. |
| **Browser-first** | Open a deployed URL from any browser after admin login. Hermes requires installing Python + running the CLI or gateway. |
| **File preview inline** | `send_file` + Preview Panel renders HTML/images/PDF/audio directly in chat. |
| **Token cost tracking** | Per-message statistics page. Hermes's `/usage` shows current context only. |
| **TypeScript ecosystem** | AgentPrimer skills can import any npm package. Hermes Agent skills are Python only. |

### What Hermes Agent Does Better Than AgentPrimer

| Advantage | Details |
|-----------|---------|
| **Self-improving skills** | Skills created and refined autonomously. AgentPrimer requires a developer to write each skill. |
| **Deep memory** | FTS5 session search + Honcho user modeling. AgentPrimer memory is a single flat file. |
| **Omnichannel delivery** | Telegram, Discord, Slack, WhatsApp, Signal, Email. AgentPrimer is browser-only. |
| **7 execution backends** | Local, Docker, SSH, Singularity, Modal, Daytona, Vercel Sandbox. AgentPrimer has only "host". |
| **Cron scheduler** | Natural-language scheduled automations with platform delivery. |
| **Training pipeline** | Export trajectories as fine-tuning datasets. |
| **Voice / audio** | Voice memo transcription and TTS via gateway. |

---

## Section 3: Feature Gap Analysis and Roadmap

### Gap Matrix

The table below synthesises gaps surfaced by both comparisons.

| Gap | AgentPrimer Missing | Difficulty | Priority | Inspired by |
|-----|-----------------|------------|----------|-------------|
| **Skills registry** | Public community skills hub | Medium | High | OpenClaw ClawHub, Hermes agentskills.io |
| **Docker sandboxing** | Isolated execution environment | High | High | OpenClaw + Hermes Agent both do this |
| **Messaging channels** | Telegram/Discord/WhatsApp delivery | Medium | Medium | OpenClaw + Hermes Agent both do this |
| **FTS5 memory search** | Full-text search across past sessions | Medium | Medium | Hermes Agent |
| **Cron scheduler** | Scheduled natural-language tasks | Low–Medium | Medium | OpenClaw + Hermes Agent |
| **Guardrails** | Input/output validation | Low–Medium | Medium | Best practice |
| **Browser agent** | Playwright web browsing | High | Medium | Available as MCP server today |
| **SOUL.md persona** | Persistent agent persona/name | Low | Low | OpenClaw |
| **Self-improving skills** | Agent-written skill creation | High | Low | Hermes Agent |
| **Training pipeline** | Trajectory export → fine-tune | Medium | Low | Hermes Agent |

### Closing Each Gap

#### Skills Registry (Difficulty: Medium) — Highest Impact

OpenClaw's ClawHub (5,400+ skills) and Hermes Agent's agentskills.io are major network effect advantages. To match this:

1. Build a community skills registry where users can discover and install SKILL.md skills with one click
2. Allow function tool packages to be shared via npm or GitHub with automatic `function.json` schema discovery
3. Add an `/api/skills/install?package=<npm-name>` endpoint that fetches and parses the skill. (`lib/installer.ts` already implements the related git-clone install path for skills/MCP/function-tool packages from GitHub URLs; an npm-based installer would be a parallel implementation.)

#### Docker Sandboxing (Difficulty: High) — Safety Critical

Both OpenClaw and Hermes Agent run untrusted sessions in Docker. For AgentPrimer:

1. For each session, spin up a Docker container with the workspace mounted as a volume (`dockerode` npm package)
2. Route `run_shell` tool calls through `docker exec <container_id> bash -c "<command>"`
3. File edits happen inside the container; the Preview Panel reads from the mounted volume
4. Stop the container when the session ends or times out (60-second idle default)

Main challenge: container lifecycle management, port-forwarding for Preview Panel, and giving the Next.js server access to the Docker daemon (either mount `/var/run/docker.sock` or use Docker-in-Docker).

**Reference:** [dockerode](https://github.com/apocas/dockerode), [OpenClaw sandboxing docs](https://docs.openclaw.ai/gateway/sandboxing)

#### Messaging Channel Delivery (Difficulty: Medium)

The simplest path for Telegram:

1. Create a Telegram Bot (BotFather), get a token
2. Add `/api/webhooks/telegram` route: receive update → find/create session → run agent loop → call Telegram `sendMessage` API
3. Use typing indicators (`sendChatAction`) during agent thinking for a native feel
4. Repeat for Discord (slash commands) and Slack (Events API)

Alternatively: install a Telegram or Discord MCP server so the agent can send messages to channels as a tool call from within a web session.

#### FTS5 Memory Search (Difficulty: Medium)

SQLite already supports FTS5. Add a virtual table over the `messages` table:

```sql
CREATE VIRTUAL TABLE messages_fts USING fts5(content, content='messages', content_rowid='id');
```

Then expose a `search_memory(query)` built-in tool that queries `messages_fts` and returns relevant message excerpts. Hermes Agent does exactly this to answer "what did we decide about X last month?".

#### Cron Scheduler (Difficulty: Low–Medium)

Add a `cron` table to the database (expression, session_id, message, last_run). Use `node-cron` or a similar package to evaluate expressions and inject messages into sessions on schedule. Deliver results to the user's next browser session or via a notification system.

#### Browser Agent (Difficulty: Low via MCP)

The simplest path is zero code: install the [Playwright MCP server](https://github.com/microsoft/playwright-mcp) as an MCP server in AgentPrimer settings. This immediately gives the agent `browser_navigate`, `browser_click`, `browser_fill`, `browser_snapshot` tools — no custom development required. Both OpenClaw and Hermes Agent use Playwright browsing via MCP.

---

## Further Reading

- OpenClaw: [github.com/openclaw/openclaw](https://github.com/openclaw/openclaw)
- OpenClaw docs: [docs.openclaw.ai](https://docs.openclaw.ai/)
- OpenClaw skills hub (ClawHub): [clawhub.ai](https://clawhub.ai/)
- Hermes Agent: [github.com/NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)
- Hermes Agent docs: [hermes-agent.nousresearch.com/docs](https://hermes-agent.nousresearch.com/docs/)
- Hermes Agent skills standard: [agentskills.io](https://agentskills.io/)
- Hermes 3 model (Nous Research): [arxiv:2408.11857](https://arxiv.org/abs/2408.11857)
- Langfuse (open-source agent tracing): [langfuse.com](https://langfuse.com/)
- Playwright MCP server: [github.com/microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp)
- dockerode (Docker from Node.js): [github.com/apocas/dockerode](https://github.com/apocas/dockerode)

See: [Back to README →](./README.md)
