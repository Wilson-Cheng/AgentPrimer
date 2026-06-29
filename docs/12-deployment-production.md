# Module 12 — Deployment & Production

← [RAG](./11-rag.md) | [Back to README →](./README.md)

---

## Learning Objectives

After reading this module you will be able to:
- Deploy AgentPrimer on a small VPS with Docker Compose
- Put nginx in front of the app for HTTPS, compression, and reverse proxying
- Configure environment variables and persistent storage safely
- Back up the SQLite database without corrupting WAL-mode files
- Add basic rate limiting and uptime monitoring
- Explain what Langfuse is, how AgentPrimer integrates it, and how to use trace data to debug, optimize, and monitor your agent
- Understand what is production hardening vs. what is core agent architecture

---

## Production Shape

A minimal production deployment looks like this:

```mermaid
flowchart LR
    User[Browser] --> Nginx[nginx / TLS / rate limit]
    Nginx --> App[AgentPrimer Next.js container]
    App --> Data[(Persistent data volume)]
    App --> Embed[In-process embedding model]
    Backup[SQLite backup cron] --> Data
    Monitor[Uptime Kuma] --> Nginx
```

AgentPrimer keeps persistent state in one directory:

```text
/app/data/
├── db/agent.db
├── db/agent.db-wal
├── db/agent.db-shm
├── .users
├── .env
├── agents/<agent>/agent.md
├── agents/<agent>/memory.md
├── system.md
├── uploads/
├── agent-files/
├── skills/
├── function-tools/
└── mcp-servers/
```

That single directory is the most important deployment concept. If `/app/data` is not mounted as a volume, container rebuilds will delete users, sessions, memory, skills, function tools, and RAG index data.

---

## Recommended VPS Baseline

For a teaching/demo instance:

| Resource | Minimum | Comfortable |
|----------|---------|-------------|
| CPU | 1 vCPU | 2+ vCPU |
| RAM | 1 GB | 2–4 GB |
| Disk | 10 GB | 30+ GB |
| OS | Debian/Ubuntu | Debian 12 / Ubuntu 24.04 |

If local embeddings are enabled, use at least 2 GB RAM. The model cache is roughly 90 MB, but the in-process ONNX runtime needs extra memory while embedding.

---

## Docker Compose Deployment

Create a deployment folder on the server:

```bash
mkdir -p /opt/agentprimer/data /opt/agentprimer/backups
cd /opt/agentprimer
```

Create `docker-compose.yml`. AgentPrimer does not publish a prebuilt image; either build locally (see "Building Your Own Image" below) or push your own image to a registry (the `ghcr.io/your-org/agentprimer:latest` reference below is a placeholder you must replace).

```yaml
services:
  agentprimer:
    image: ghcr.io/your-org/agentprimer:latest
    container_name: agentprimer
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: 15432
      AGENT_PRIMER_SECRET: "replace-with-a-random-64-character-secret"
    volumes:
      - ./data:/app/data
    ports:
      - "127.0.0.1:15432:15432"
    healthcheck:
      test: ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:15432/api/auth/setup').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]
      interval: 30s
      timeout: 5s
      retries: 3
```

Start it:

```bash
docker compose up -d
```

Open the app through the reverse proxy. On a fresh install, unauthenticated traffic goes to `/login`, which redirects to `/register` until the first admin account exists. After registration, the app redirects to `/setup` for configuring the LLM endpoint, API key, and default model. Additional settings (embedding provider, Langfuse observability, sub-agent monitor, etc.) are available in the Settings page.

---

## Building Your Own Image

If you deploy directly from the repo:

```bash
git clone https://github.com/wilson-cheng/AgentPrimer.git
cd AgentPrimer
docker build -t agentprimer:local .
```

Then use this compose service:

```yaml
services:
  agentprimer:
    image: agentprimer:local
    restart: unless-stopped
    environment:
      NODE_ENV: production
      AGENT_PRIMER_SECRET: "replace-with-a-random-64-character-secret"
    volumes:
      - ./data:/app/data
    ports:
      - "127.0.0.1:15432:15432"
```

---

## nginx Reverse Proxy

Install nginx and Certbot:

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

Create `/etc/nginx/sites-available/agentprimer`:

```nginx
limit_req_zone $binary_remote_addr zone=agentprimer_login:10m rate=10r/m;
limit_req_zone $binary_remote_addr zone=agentprimer_api:10m rate=120r/m;

server {
    listen 80;
    server_name agent.example.com;

    client_max_body_size 50m;

    location /api/auth/login {
        limit_req zone=agentprimer_login burst=5 nodelay;
        proxy_pass http://127.0.0.1:15432;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/ {
        limit_req zone=agentprimer_api burst=60 nodelay;
        proxy_pass http://127.0.0.1:15432;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 300s;
    }

    location / {
        proxy_pass http://127.0.0.1:15432;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

Enable it:

```bash
sudo ln -s /etc/nginx/sites-available/agentprimer /etc/nginx/sites-enabled/agentprimer
sudo nginx -t
sudo systemctl reload nginx
```

Add HTTPS:

```bash
sudo certbot --nginx -d agent.example.com
```

Why `proxy_buffering off` matters: chat responses are Server-Sent Events. If nginx buffers the response, the browser receives tokens in delayed chunks instead of live streaming.

---

## Environment Variables

There are three layers of configuration:

1. Docker environment variables in `docker-compose.yml`
2. Runtime overrides in `data/.env` (loaded by `lib/bootstrap.ts` at startup; intended for infrastructure variables like `AGENT_PRIMER_SECRET`, `LANGFUSE_*`, `EMBED_*`)
3. App settings in SQLite via the Settings page

> **MCP credentials are separate.** Per-MCP-server credentials (e.g. `EXA_API_KEY` for the exa MCP server, `GITHUB_TOKEN` for a github MCP server) do NOT belong in `data/.env`. The MCP subprocess allow-list does not forward host env by default. Use Skills/MCP → server → Edit → Environment variables instead; values are stored on `mcp_servers.env_json` and only reach that one server's subprocess.

Important variables:

| Variable | Required | Purpose |
|----------|----------|---------|
| `AGENT_PRIMER_SECRET` | Yes | JWT signing secret. Use a long random string. |
| `NODE_ENV` | Yes | Set to `production` in production. |
| `EMBED_MODEL` | Optional | ONNX embedding model name. Defaults to `Xenova/all-MiniLM-L6-v2`. |
| `EMBED_CACHE_DIR` | Optional | Where the embedding model is cached. Defaults to `data/models`. |
| `PORT` | Optional | Next.js server port. Defaults to `15432` in Docker (set in docker-compose.yml). |
| `LANGFUSE_PUBLIC_KEY` | Optional | Langfuse public key if not stored in Settings. |
| `LANGFUSE_SECRET_KEY` | Optional | Langfuse secret key if not stored in Settings. |
| `LANGFUSE_BASE_URL` | Optional | Langfuse cloud or self-hosted URL. |
| `MCP_FORWARD_ENV` | Optional | Comma- or whitespace-separated list of additional environment variable names to forward to **every** stdio MCP server subprocess. By default AgentPrimer ships an **allow-list** (`PATH`, `HOME`, `USER`, `LANG`, `NODE_ENV`, `NODE_OPTIONS`, `NPM_CONFIG_*`, `PYTHONPATH`, a handful of other shell basics — see `lib/mcp-client.ts` for the full list) and does NOT inherit the rest of `process.env`. Use this variable for credentials shared across many MCP servers; prefer the **per-server env field** (Skills/MCP → Edit → Environment variables) for credentials that belong to one server only. `AGENT_PRIMER_SECRET`, `AGENTPRIMER_SECRET`, and `CODE_SERVER_PASSWORD` are always denied even if listed. |

Generate a secret:

```bash
openssl rand -hex 32
```

Do not commit `.env`, `data/.env`, `.users`, or database files.

---

## SQLite Backups in WAL Mode

AgentPrimer uses SQLite WAL mode. Do **not** back up only `agent.db` with `cp` while the app is running — recent writes may still be in `agent.db-wal`.

Use SQLite's online backup command:

```bash
mkdir -p /opt/agentprimer/backups
sqlite3 /opt/agentprimer/data/db/agent.db ".backup '/opt/agentprimer/backups/agent-$(date +%F-%H%M%S).db'"
```

Create `/usr/local/bin/backup-agentprimer.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
BACKUP_DIR=/opt/agentprimer/backups
DB=/opt/agentprimer/data/db/agent.db
mkdir -p "$BACKUP_DIR"
sqlite3 "$DB" ".backup '$BACKUP_DIR/agent-$(date +%F-%H%M%S).db'"
find "$BACKUP_DIR" -name 'agent-*.db' -mtime +14 -delete
```

Make it executable:

```bash
sudo chmod +x /usr/local/bin/backup-agentprimer.sh
```

Add cron:

```bash
sudo crontab -e
```

```cron
0 3 * * * /usr/local/bin/backup-agentprimer.sh >> /var/log/agentprimer-backup.log 2>&1
```

Also back up uploaded files, generated agent files, function tools, skills, and MCP servers:

```bash
tar -czf /opt/agentprimer/backups/data-files-$(date +%F-%H%M%S).tar.gz \
  -C /opt/agentprimer/data uploads agent-files skills function-tools mcp-servers agents/<agent>/agent.md agents/<agent>/memory.md system.md .users .env
```

---

## Monitoring with Uptime Kuma

Run Uptime Kuma:

```yaml
services:
  uptime-kuma:
    image: louislam/uptime-kuma:1
    restart: unless-stopped
    ports:
      - "127.0.0.1:3001:3001"
    volumes:
      - ./uptime-kuma:/app/data
```

Create monitors:

| Monitor | URL | Expected |
|---------|-----|----------|
| App reachable | `https://agent.example.com/login` | 200 or redirect OK |
| Setup API | `https://agent.example.com/api/auth/setup` | Process reachability and first-run setup state; not an authenticated health check |
| Reverse proxy | `https://agent.example.com` | reachable |

Add alerts to email, Telegram, Discord, or Slack depending on your operations setup.

---

## Observability with Langfuse

AgentPrimer integrates [Langfuse](https://langfuse.com/) — an open-source AI engineering platform — to give you full visibility into every agent turn. This section explains what Langfuse is, why observability matters for agents, how AgentPrimer's integration works, and how to use the data it produces to improve your system.

### What Is Langfuse?

Langfuse is an **open-source observability and evaluation platform** purpose-built for LLM applications. It provides three core capabilities:

1. **Tracing** — Record every LLM call, tool invocation, and intermediate step in a request. Each request becomes a *trace* containing nested *spans* and *generations* that show exactly what happened, in what order, and how long each step took.

2. **Prompt Management** — Version, test, and deploy prompts without changing code. Compare latency and cost across prompt versions.

3. **Evaluation** — Score traces with LLM-as-a-judge, code evaluators, or human annotation. Run experiments on datasets to systematically measure quality.

Langfuse is available as a managed cloud service at `cloud.langfuse.com` or as a self-hosted Docker deployment. It is open-source under the MIT license, so you can inspect and modify it.

### Why Observability Matters for Agents

Traditional software is deterministic: given the same input, you get the same output. Agents are not. An LLM may choose different tools, produce different arguments, or follow different reasoning paths on identical inputs. This non-determinism creates three problems that observability solves:

| Problem | What happens without observability | What Langfuse provides |
|---------|-----------------------------------|------------------------|
| **Debugging** | "The agent returned a wrong answer" — but you don't know which step failed | Per-step traces: input, output, tool calls, token counts, and latency for every LLM call |
| **Cost tracking** | You see the API bill at the end of the month but can't attribute spend to specific conversations or tools | Token counts and cost per trace, session, model, or user |
| **Quality regression** | A prompt change or model upgrade silently degrades output quality and you only notice days later | Evaluation scores on production traces; compare before/after metrics |

AgentPrimer has a built-in local trace viewer (the Trace Drawer in the chat UI), but it is session-scoped and ephemeral. Langfuse adds persistent, searchable, multi-session observability with team collaboration features.

### How AgentPrimer Integrates Langfuse

The integration lives in `lib/langfuse.ts` and is called from `lib/agent/loop.ts`. It follows a deliberate design pattern: **every Langfuse call is guarded by null checks, so the agent loop works identically whether Langfuse is enabled or not.**

#### The Four Functions

```
┌──────────────────────────────────────────────────────────────────────────┐
│  lib/langfuse.ts — four exported functions                              │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. createAgentTrace()  →  creates a Langfuse TRACE for the chat turn   │
│     • Called once per /api/chat request                                  │
│     • Records sessionId, modelId, and a preview of the user's prompt    │
│     • Returns null if Langfuse is disabled or keys are missing          │
│                                                                          │
│  2. startGeneration()   →  creates a GENERATION span inside the trace   │
│     • Called once per agent step (ReAct loop iteration)                  │
│     • Records the full request (model, messages, tools) as input        │
│     • Returns null if the trace is null (graceful no-op)                │
│                                                                          │
│  3. endGeneration()     →  closes a generation span with results        │
│     • Records the LLM's output text, finish reason, tool call names     │
│     • Records token usage (prompt, completion, total)                   │
│     • No-op if the generation is null                                   │
│                                                                          │
│  4. finalizeTrace()     →  closes the trace and flushes to Langfuse     │
│     • Records the full agent output and all step trace data as metadata  │
│     • Calls flushAsync() to ensure data is sent before the response     │
│     • No-op if the trace is null                                        │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

#### Where They Are Called in the Agent Loop

In `lib/agent/loop.ts` (`runAgentLoop`), the call sequence looks like this:

```
runAgentLoop()  (entry point: lib/agent/streaming-agent.ts → createStreamingAgent)
  │
  ├─ createAgentTrace({ sessionId, agentName, modelId, promptPreview })
  │    → langfuseTrace (or null)
  │
  ├─ for each step in ReAct loop:
  │    ├─ startGeneration({ trace, name: "agent-step-N", model, input })
  │    │    → langfuseGeneration (or null)
  │    │
  │    ├─ ... LLM call + tool execution ...
  │    │
  │    └─ endGeneration({ generation, output, usage, metadata })
  │         → records output, tokens, finish reason
  │
  └─ finalizeTrace({ trace, output, traceData })
       → updates trace with final output + flushes to Langfuse
```

This mirrors the Langfuse data model: one **Trace** per chat turn, containing one **Generation** per agent step. Each generation captures:

- **Input**: the full request payload (model, messages, tools schema)
- **Output**: the LLM's response text and finish reason
- **Usage**: prompt tokens, completion tokens, total tokens
- **Metadata**: step index, tool count, tool call names, finish reason

#### Configuration Sources

Langfuse settings come from two places, with the Settings UI taking priority:

| Setting | Settings UI key | Environment variable fallback | Default |
|---------|----------------|-------------------------------|---------|
| Enabled | `langfuse_enabled` | — | `false` |
| Public Key | `langfuse_public_key` | `LANGFUSE_PUBLIC_KEY` | `""` |
| Secret Key | `langfuse_secret_key` | `LANGFUSE_SECRET_KEY` | `""` |
| Base URL | `langfuse_base_url` | `LANGFUSE_BASE_URL` | `https://cloud.langfuse.com` |

The `getConfig()` function in `lib/langfuse.ts` reads settings from the database first, then falls back to environment variables. This lets you configure Langfuse through the browser UI without restarting the server.

#### Client Lifecycle

The Langfuse client is lazily initialized and cached:

```typescript
let client: Langfuse | null = null;
let clientKey = '';

function getClient(): Langfuse | null {
  if (!isLangfuseEnabled()) return null;
  const config = getConfig();
  if (!config.publicKey || !config.secretKey) return null;
  const key = `${config.publicKey}:${config.secretKey}:${config.baseUrl}`;
  if (!client || clientKey !== key) {
    client = new Langfuse({
      publicKey: config.publicKey,
      secretKey: config.secretKey,
      baseUrl: config.baseUrl,
    });
    clientKey = key;
  }
  return client;
}
```

Key design decisions:

- **Singleton with cache invalidation** — The client is created once and reused across requests. If settings change (different keys or base URL), the cache key changes and a new client is created.
- **No crash on failure** — Every function wraps its logic in try/catch and returns null on error. A misconfigured Langfuse key never takes down the agent loop.
- **Explicit flush** — `finalizeTrace()` calls `flushAsync()` to guarantee traces are sent to Langfuse before the HTTP response completes. Without this, short-lived requests might lose trace data.

### Setting Up Langfuse with AgentPrimer

#### Option A: Langfuse Cloud (fastest)

1. Sign up at [cloud.langfuse.com](https://cloud.langfuse.com)
2. Create a new project
3. Go to Project Settings → API Keys
4. Copy the **Public Key** (`pk-lf-...`) and **Secret Key** (`sk-lf-...`)
5. In AgentPrimer, go to **Settings → Langfuse Observability**
6. Toggle **Send traces to Langfuse** to on
7. Paste the Public Key and Secret Key
8. Leave the Base URL as `https://cloud.langfuse.com`
9. Click **Save Settings**
10. Send a chat message to test
11. Return to Langfuse — your trace should appear within seconds

#### Option B: Self-Hosted Langfuse (for private deployments)

1. Deploy Langfuse using Docker Compose:
   ```yaml
   services:
     langfuse:
       image: langfuse/langfuse:2
       restart: unless-stopped
       ports:
         - "127.0.0.1:3000:3000"
       environment:
         DATABASE_URL: "postgresql://postgres:password@postgres:5432/langfuse"
         NEXTAUTH_SECRET: "generate-with-openssl-rand-hex-32"
         SALT: "generate-with-openssl-rand-hex-32"
         NEXTAUTH_URL: "http://localhost:3000"
       depends_on:
         - postgres
     postgres:
       image: postgres:15
       restart: unless-stopped
       environment:
         POSTGRES_USER: postgres
         POSTGRES_PASSWORD: password
         POSTGRES_DB: langfuse
       volumes:
         - ./langfuse-pgdata:/var/lib/postgresql/data
   ```
2. Open `http://localhost:3000`, create a project, and get API keys
3. In AgentPrimer Settings → Langfuse Observability:
   - Toggle **Send traces to Langfuse** to on
   - Enter keys
   - Set **Base URL** to `http://localhost:3000` (or your server's URL)
4. Save and test

#### Option C: Environment Variables Only

If you prefer not to store keys in the Settings UI, set environment variables in `data/.env` or `docker-compose.yml`:

```bash
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_BASE_URL=https://cloud.langfuse.com
```

Then in the Settings UI, just toggle the enable switch on. The keys will be read from the environment.

### What You See in Langfuse

After enabling Langfuse and sending a few chat messages, open the Langfuse dashboard. Here is what each feature gives you:

#### Traces Page

Every chat turn creates one trace named `agentprimer-chat-turn`. The traces list shows:

| Column | What it shows |
|--------|---------------|
| **Name** | `agentprimer-chat-turn` (all traces from AgentPrimer) |
| **Input** | Preview of the user's message |
| **Output** | The agent's full response |
| **Latency** | End-to-end time from first token to `finalizeTrace` |
| **Tokens** | Total prompt + completion tokens across all steps |
| **Tags** | `agentprimer`, `agent-loop` |
| **Session ID** | The AgentPrimer session ID — group traces by conversation |

Click a trace to see the **step-by-step breakdown**:

```
Trace: agentprimer-chat-turn
  ├── Generation: agent-step-1  (model called, no tools)
  │     Input:  { model, messages, tools }
  │     Output: { text, finishReason: "stop" }
  │     Usage:  prompt=1200, completion=85, total=1285
  │
  ├── Generation: agent-step-2  (model called a tool)
  │     Input:  { model, messages, tools }
  │     Output: { text, finishReason: "tool_calls", toolCalls: ["web_search"] }
  │     Usage:  prompt=1350, completion=42, total=1392
  │
  └── Generation: agent-step-3  (model used tool result, final answer)
        Input:  { model, messages, tools }
        Output: { text, finishReason: "stop" }
        Usage:  prompt=2100, completion=310, total=2410
```

#### Sessions View

Because AgentPrimer passes `sessionId` to `createAgentTrace()`, Langfuse automatically groups traces into sessions. This lets you:

- Follow a full multi-turn conversation from start to finish
- See how context grows across turns (prompt token counts increase)
- Identify which turn triggered the most tool calls or highest latency

#### Dashboard Metrics

Langfuse computes aggregate metrics from your traces:

- **Cost**: Estimated spend based on token counts and model pricing
- **Latency**: P50, P90, P99 response times
- **Token usage**: Trends over time, broken down by model
- **Error rate**: Traces with failed generations or tool errors

These metrics are critical for production monitoring — they tell you whether a model change, prompt update, or traffic spike is degrading agent performance.

### Using Langfuse Data to Improve Your Agent

Observability is only valuable if you act on it. Here are the most impactful workflows:

#### 1. Reduce Cost by Identifying Expensive Steps

**Problem**: Your API bill is higher than expected.

**Diagnosis**: Open Langfuse → sort traces by total tokens → inspect the most expensive ones. Common causes:

- **Overly long system prompts** — The `input` field on each generation shows the full message array. If your `data/agents/<agent>/memory.md` or `system.md` is bloated, every step pays the cost of re-reading it.
- **Unnecessary multi-step loops** — If the agent consistently takes 3+ steps for simple questions, your tool descriptions or system prompt may be confusing the model into unnecessary tool calls.
- **Wrong model for the task** — If `agent-step-1` uses a expensive model for a trivial classification, consider routing to a smaller model.

**Action**: Edit `data/system.md` or `data/agents/<agent>/agent.md` to shorten prompts. Remove rarely-used tools from the agent's tool list. Use the model selector to pick a cheaper model for routine tasks.

#### 2. Debug Incorrect Tool Usage

**Problem**: The agent calls the wrong tool or passes invalid arguments.

**Diagnosis**: Find the trace where the error occurred → open the generation that triggered the tool call → inspect the `input` messages (what context did the model see?) and the `output` (what tool did it call, with what arguments?). Compare the model's reasoning against what you expected.

**Common issues**:
- Tool descriptions are ambiguous — two tools have overlapping descriptions
- The model didn't see enough context to distinguish between options
- The arguments are partially correct but missing a required field

**Action**: Improve tool descriptions in `lib/builtin-tools-registry.ts` or your skill's `SKILL.md`. Add examples to the system prompt showing correct tool usage patterns.

#### 3. Detect Quality Regressions

**Problem**: You changed the system prompt or upgraded the model, and agent quality dropped — but you're not sure when or why.

**Diagnosis**: Use Langfuse's **evaluation** feature:

1. Create a **Dataset** of representative inputs (user messages that test key agent capabilities)
2. Run an **Experiment**: send each input through the agent with the old prompt, then the new prompt
3. Score outputs with an LLM-as-a-judge evaluator or manual annotation
4. Compare scores side-by-side

This is the same methodology used in traditional A/B testing, but applied to non-deterministic LLM outputs.

**Action**: If the new prompt scores worse, revert or iterate. If the new model is cheaper but scores similarly, you've validated a cost optimization.

#### 4. Optimize Latency

**Problem**: The agent feels slow. Users are waiting too long for responses.

**Diagnosis**: Langfuse's **timeline view** shows where time is spent within a trace:

```
[████████ LLM call ████████][▒▒ tool exec ▒▒][████ LLM call ████]
 0ms                    2800ms          3100ms            4400ms
```

Common patterns:

- **Slow LLM calls** — The model itself is slow. Consider a smaller/faster model or a provider with lower latency.
- **Slow tool execution** — One tool (e.g., `web_search` or `run_shell`) dominates. Add timeouts or optimize the tool's implementation.
- **Too many steps** — The agent loops 4–5 times when 2 would suffice. Improve the system prompt to reduce unnecessary tool calls.

**Action**: Set latency targets (e.g., P90 < 5s) and monitor the Langfuse dashboard. When latency exceeds targets, use the timeline view to identify the bottleneck.

#### 5. Monitor Production Health

**Problem**: You've deployed AgentPrimer and need to know it's working reliably.

**Diagnosis**: Use Langfuse's dashboard and alerting:

- **Error rate** — Track the percentage of traces with failed generations
- **Token usage trends** — Sudden spikes may indicate a prompt loop or an attacker
- **Cost per session** — Ensure no single user or conversation is consuming disproportionate resources

**Action**: Set up alerts (Langfuse cloud supports webhook notifications). When anomalies appear, trace the problem back to specific sessions or users via the session ID and metadata.

### Privacy and Data Considerations

Langfuse sends trace data — including user messages, agent responses, and tool inputs/outputs — to an external service. Consider these implications:

| Concern | Mitigation |
|---------|-----------|
| **Prompt data leaves your infrastructure** | Self-host Langfuse instead of using cloud |
| **API keys in trace data** | Built-in trace snapshots redact large write/append payloads, but custom tools can still return secrets; avoid sending secrets through tool inputs/results and review Langfuse payloads before enabling it in production |
| **User PII in messages** | Langfuse supports [data retention policies](https://langfuse.com/docs/data-retention) to auto-delete traces after a configurable period |
| **Compliance (GDPR, HIPAA)** | Langfuse offers a HIPAA-compliant cloud instance at `hipaa.cloud.langfuse.com`; self-hosting gives full data control |

Recommended practices:

- **Enable Langfuse when**: comparing model behavior, investigating regressions, teaching observability, or monitoring production health
- **Disable Langfuse when**: running in private deployments where prompts must not leave your infrastructure, or during development of tools that process sensitive data
- **Use environments**: Langfuse supports environment tags (e.g., `development`, `production`) so you can separate traces from different deployment stages

### Source Code Reading Guide

To deeply understand the integration, read these files in order:

| File | What to focus on |
|------|-----------------|
| `lib/langfuse.ts` | The entire file (~120 lines). Study how each function is guarded by null checks and how `getClient()` caches the singleton. |
| `lib/agent/loop.ts:176` | Where `createAgentTrace()` is called — see what metadata is captured at the trace level |
| `lib/agent/loop.ts:197` | Where `startGeneration()` is called inside the per-step loop — see the per-step input and metadata |
| `lib/agent/loop.ts:507` | `endGeneration()` on a "stop" finish (no tool calls) |
| `lib/agent/loop.ts:624` | `endGeneration()` on a "requires_approval" finish |
| `lib/agent/loop.ts:673` | `endGeneration()` on a "tool_calls" finish |
| `lib/agent/loop.ts:760` | `finalizeTrace()` — see how the full output and step traces are attached |
| `app/(main)/settings/page.tsx:637–700` | The Settings UI — see how the toggle, key inputs, and base URL are wired to the save logic |
| `app/api/settings/route.ts:13–14` | Where the secret key is masked for API responses (security pattern) |

### Further Reading

- Langfuse documentation: [langfuse.com/docs](https://langfuse.com/docs)
- Langfuse observability overview: [langfuse.com/docs/observability/overview](https://langfuse.com/docs/observability/overview)
- Langfuse evaluation guide: [langfuse.com/docs/evaluation/overview](https://langfuse.com/docs/evaluation/overview)
- Langfuse self-hosting guide: [langfuse.com/docs/self-hosting](https://langfuse.com/docs/self-hosting)
- Langfuse JS/TS SDK: [langfuse.com/docs/sdk/typescript](https://langfuse.com/docs/sdk/typescript)
- Langfuse GitHub (open source): [github.com/langfuse/langfuse](https://github.com/langfuse/langfuse)

---

## Security Checklist

Before exposing the app publicly:

- [ ] Set `AGENT_PRIMER_SECRET`
- [ ] Register the first admin account with a strong password
- [ ] Put the app behind HTTPS
- [ ] Rate-limit login and API endpoints in nginx
- [ ] Keep `run_shell` disabled unless you understand the risk
- [ ] Mount `/app/data` as persistent storage
- [ ] Configure SQLite backups
- [ ] Restrict SSH access to the server
- [ ] Keep Docker images and OS packages updated
- [ ] Avoid installing untrusted skills/MCP servers

---

## Upgrade Procedure

A safe upgrade flow:

```bash
cd /opt/agentprimer
/usr/local/bin/backup-agentprimer.sh
docker compose pull
docker compose up -d
docker compose logs -f --tail=100 agentprimer
```

If you build locally:

```bash
git pull
npm install
npm test
npm run build
docker build -t agentprimer:local .
docker compose up -d
```

Because migrations are idempotent, the app applies schema updates on startup. Still, always back up before upgrading.

---

## Troubleshooting

### Chat streams only after the full answer is done

Check nginx config. `proxy_buffering off` must be set for `/api/` and `/`.

### Login works locally but not through HTTPS

Check that nginx forwards headers:

```nginx
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header Host $host;
```

Also confirm `NODE_ENV=production` and the site is served over HTTPS so secure cookies work.

### SQLite busy errors

AgentPrimer sets WAL mode and `busy_timeout`, but high concurrent writes can still contend. Check whether backups are using `.backup` rather than copying DB files directly.

### Local embeddings unavailable

The embedding model loads on first RAG use and downloads into `data/models/`.
If it can't load (e.g. no network on first run), check container logs:

```bash
docker compose logs -f agentprimer
```

If the embedding model cannot load on the platform, the RAG system falls back to SQLite FTS5 keyword search.

---

## What This Teaches

Deployment is not part of the agent loop, but it teaches the production boundary around agents:

- Agents need persistent state
- Streaming needs proxy configuration
- SQLite needs WAL-aware backups
- Tool execution needs operational caution
- Observability is essential for debugging non-deterministic model behavior

That boundary is what turns an educational agent into something learners can safely show to other people.
