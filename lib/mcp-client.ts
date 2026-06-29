/**
 * lib/mcp-client.ts
 * ---------------------------------------------------------------------------
 * MCP (Model Context Protocol) client manager.
 *
 * Supports two transport types:
 *   stdio – launches a local MCP server as a child process (most common)
 *   sse   – connects to a remote MCP server via HTTP/SSE
 *
 * MCP servers expose "tools" that the AI agent can call, just like skill tools.
 * This module:
 *   1. Launches/connects to enabled MCP servers on demand
 *   2. Lists their tools and converts them to AI SDK tool format
 *   3. Executes tool calls by forwarding them to the MCP server
 *   4. Manages server lifecycle (start, stop, reconnect)
 *
 * References:
 *   https://modelcontextprotocol.io/docs
 *   https://github.com/modelcontextprotocol/typescript-sdk
 */

import path from 'path';
import fs from 'fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { tool } from 'ai';
import { listMcpServers, type McpServer } from './db';
import { jsonSchemaToZod } from './schema-utils';

// ---------------------------------------------------------------------------
// In-memory registry of active MCP client connections
// Key: MCP server id, Value: connected Client instance
// ---------------------------------------------------------------------------
const activeClients = new Map<string, Client>();

// ---------------------------------------------------------------------------
// Connect to an MCP server (or return existing connection)
// ---------------------------------------------------------------------------
const MCP_CONNECT_TIMEOUT_MS = 15_000; // ms – give up on connecting to an MCP server after this
const MCP_TOOL_TIMEOUT_MS   = 30_000; // ms – kill a hanging MCP tool call after this

/**
 * Build the environment passed to a stdio MCP server subprocess.
 *
 * We treat third-party MCP servers as **untrusted** code (they are cloned
 * from arbitrary GitHub repos by the operator) and therefore use an
 * allow-list of innocuous shell variables rather than forwarding all of
 * `process.env`. A blanket forward would leak provider API keys
 * (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `LANGFUSE_*`, `GITHUB_TOKEN`,
 * database URLs, …) to every MCP server the operator installs.
 *
 * Three layers compose the final subprocess env, in order of precedence
 * (later wins):
 *
 *   1. `DEFAULT_ALLOW` — innocuous shell basics the subprocess almost
 *      certainly needs (PATH, HOME, locale, Node basics).
 *   2. `MCP_FORWARD_ENV` — operator-supplied global allow-list extras
 *      (comma- or whitespace-separated names). For per-deployment fleet
 *      forwarding when many servers share the same credential.
 *   3. The **per-server** `env_json` column on `mcp_servers` — the
 *      preferred way to give a single MCP server its own API key without
 *      exposing that key to every other server. Edited in the Skills/MCP
 *      page; persisted in SQLite.
 *
 * AgentPrimer's own JWT secret (`AGENT_PRIMER_SECRET` /
 * `AGENTPRIMER_SECRET`) and `CODE_SERVER_PASSWORD` are always denied,
 * regardless of which layer tries to set them.
 */
const INTERNAL_DENY = new Set([
  'AGENT_PRIMER_SECRET',
  'AGENTPRIMER_SECRET',
  'CODE_SERVER_PASSWORD',
]);

const DEFAULT_ALLOW = new Set([
  // Shell / process basics
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'PWD',
  'TMPDIR',
  'TEMP',
  'TMP',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TZ',
  'TERM',
  // Node basics
  'NODE_ENV',
  'NODE_PATH',
  'NODE_OPTIONS',
  // Common platform locators that several MCP servers rely on
  'NPM_CONFIG_PREFIX',
  'NPM_CONFIG_CACHE',
  'PYTHONPATH',
  'PYTHONIOENCODING',
  // VS Code / devcontainer signal that some servers use to choose a UI mode
  'TERM_PROGRAM',
  'COLORTERM',
]);

function parseAllowExtras(): Set<string> {
  const raw = process.env.MCP_FORWARD_ENV ?? '';
  if (!raw) return new Set();
  return new Set(
    raw
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

function parseServerEnv(envJson: string, serverName: string): Record<string, string> {
  if (!envJson) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(envJson);
  } catch (err) {
    console.warn(
      `[MCP] malformed env_json for server "${serverName}":`,
      err instanceof Error ? err.message : err,
    );
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    console.warn(`[MCP] env_json for server "${serverName}" is not an object — ignoring`);
    return {};
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (INTERNAL_DENY.has(k)) continue;
    if (typeof v !== 'string' || !v) continue;
    out[k] = v;
  }
  return out;
}

function childProcessEnv(server?: McpServer): Record<string, string> {
  const extras = parseAllowExtras();
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value !== 'string') continue;
    if (INTERNAL_DENY.has(key)) continue;
    if (!DEFAULT_ALLOW.has(key) && !extras.has(key)) continue;
    env[key] = value;
  }
  // PATH is always required for the child to find its own interpreter; we
  // fall back to an empty string rather than `undefined` because some MCP
  // servers crash when PATH is absent.
  env.PATH = process.env.PATH ?? '';

  // Per-server env wins over the global allow-list. This is the normal way
  // to give one MCP server its own credential — e.g. `GITHUB_TOKEN` on the
  // github MCP server only — without exposing that credential to every
  // other server in the fleet.
  if (server?.env_json) {
    Object.assign(env, parseServerEnv(server.env_json, server.name));
  }
  return env;
}

async function connectMcpServer(server: McpServer): Promise<Client> {
  // Return existing connection if already established
  const existing = activeClients.get(server.id);
  if (existing) return existing;

  const client = new Client(
    { name: 'agentprimer', version: '1.0.0' },
    { capabilities: {} }
  );

  let transport: StdioClientTransport | SSEClientTransport;

  if (server.transport === 'stdio') {
    const args = JSON.parse(server.args_json || '[]') as string[];
    // Resolve the entry-point arg so it's an absolute path. This handles two
    // styles of relative path that may be stored in the DB:
    //   "index.js"                           → resolve against local_path
    //   "data/mcp-servers/datetime/index.js" → resolve against app root
    let resolvedArgs = args;
    if (server.local_path && args.length > 0 && !args[0].startsWith('/') && !args[0].startsWith('-')) {
      const asLocal = path.resolve(server.local_path, args[0]);
      const asRoot  = path.resolve(/* turbopackIgnore: true */ process.cwd(), args[0]);
      resolvedArgs = [fs.existsSync(asLocal) ? asLocal : asRoot, ...args.slice(1)];
    }
    transport = new StdioClientTransport({
      command: server.command,
      args: resolvedArgs,
      cwd: server.local_path || undefined,
      env: childProcessEnv(server),
    });
  } else {
    const url = new URL(server.url);
    transport = new SSEClientTransport(url);
  }

  // Enforce a timeout on the initial connection handshake
  const connectPromise = client.connect(transport);
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Timed out connecting to MCP server "${server.name}" after ${MCP_CONNECT_TIMEOUT_MS}ms`)), MCP_CONNECT_TIMEOUT_MS),
  );
  try {
    await Promise.race([connectPromise, timeoutPromise]);
  } catch (err) {
    try { transport.close(); } catch { /* ignore */ }
    throw err;
  }

  // If the underlying process crashes after a successful connect, clean up
  // so subsequent agent requests don't try to reuse a dead connection.
  if (server.transport === 'stdio' && transport instanceof StdioClientTransport) {
    const onClose = () => { removeClient(server.id); };
    try {
      // The MCP SDK emits a 'close' event when the transport's process exits
      (transport as unknown as { onclose?: () => void }).onclose = onClose;
    } catch { /* best-effort */ }
  }

  activeClients.set(server.id, client);
  return client;
}

function removeClient(serverId: string): void {
  const client = activeClients.get(serverId);
  if (client) {
    try { client.close(); } catch { /* ignore */ }
    activeClients.delete(serverId);
  }
}

// ---------------------------------------------------------------------------
// Disconnect all active MCP clients (called on shutdown / hot-reload)
// ---------------------------------------------------------------------------
export async function disconnectAll(): Promise<void> {
  for (const [id, client] of activeClients) {
    try {
      await client.close();
    } catch { /* ignore */ }
    activeClients.delete(id);
  }
}

// ---------------------------------------------------------------------------
// Load tools from all enabled MCP servers
// Returns an AI SDK tool map ready to pass to streamText / generateText
// ---------------------------------------------------------------------------
export async function loadMcpTools(filterNames: string[] | 'all' = 'all'): Promise<Record<string, unknown>> {
  const servers = listMcpServers().filter(s => s.enabled === 1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: Record<string, any> = {};

  for (const server of servers) {
    try {
      const client = await connectMcpServer(server);

      // List all tools the MCP server exposes
      const { tools: mcpTools } = await client.listTools();

      for (const mcpTool of mcpTools) {
        // Apply filter (for agent-specific tool permissions)
        if (filterNames !== 'all' && !filterNames.includes(mcpTool.name) && !filterNames.includes(server.name)) {
          continue;
        }

        // Prefix with server name to avoid collisions: "myserver__mytool"
        const toolKey = `${server.name}__${mcpTool.name}`;

        // Capture loop variables for the closure
        const capturedClient = client;
        const capturedToolName = mcpTool.name;
        const inputSchema = (mcpTool.inputSchema ?? {}) as Record<string, unknown>;

        tools[toolKey] = tool({
          description: `[${server.name} MCP] ${mcpTool.description ?? mcpTool.name}`,
          parameters: jsonSchemaToZod(inputSchema),
          execute: async (args: object) => {
            const callPromise = capturedClient.callTool({
              name: capturedToolName,
              arguments: args as Record<string, unknown>,
            });
            const timeoutPromise = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error(`MCP tool "${capturedToolName}" on server "${server.name}" timed out after ${MCP_TOOL_TIMEOUT_MS}ms`)), MCP_TOOL_TIMEOUT_MS),
            );
            const result = await Promise.race([callPromise, timeoutPromise]);
            const textContent = (result.content as Array<{ type: string; text?: string }>)
              .filter(c => c.type === 'text')
              .map(c => c.text)
              .join('\n');
            return textContent || result.content;
          },
        });
      }
    } catch (err) {
      // If a server fails to connect, log and continue – don't crash the agent
      console.error(`[MCP] Failed to connect to server "${server.name}":`, err);
    }
  }

  return tools;
}
