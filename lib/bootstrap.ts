/**
 * lib/bootstrap.ts
 * ---------------------------------------------------------------------------
 * One-time server startup initialisation.
 *
 * Called from instrumentation.ts (Next.js register hook) so it runs exactly
 * once per server process, before any request is handled.
 *
 * ── Initialisation steps ─────────────────────────────────────────────────
 *
 *   1. Copy defaults/ → data/ (skipping files that already exist)
 *      The defaults/ tree is the authoritative source for built-in content.
 *      On the very first run, data/ is empty and everything is copied.
 *      On subsequent runs, only new files are added; existing user edits
 *      are preserved. Built-in skills and function-tools are always force-
 *      overwritten to stay in sync with the defaults/ directory.
 *
 *   2. Seed SKILL.md skills (data/skills/<name>/SKILL.md)
 *      Each skill directory with a valid SKILL.md is registered in the DB.
 *      Skills are NOT callable functions — their content is injected into
 *      the agent system prompt as instruction modules.
 *
 *   3. Seed function tools (data/function-tools/<name>/function.json)
 *      Each function-tool directory with a valid function.json is registered.
 *      Function tools ARE callable — the model emits a tool_call and the
 *      server executes index.js in a subprocess.
 *
 *   4. Seed MCP servers (data/mcp-servers/<name>/mcp.json)
 *      MCP servers are registered from their mcp.json metadata file.
 *
 *   5. Apply data/.env overrides to process.env
 *
 * ── Three kinds of agent capabilities ────────────────────────────────────
 *
 *   Skills         → context injection  (SKILL.md instructions in system prompt)
 *   Function Tools → function calling   (OpenAI tools API, subprocess execution)
 *   MCP Tools      → MCP protocol       (remote/local MCP server execution)
 *
 * All three are composable: an agent can use all three simultaneously.
 *
 * Idempotent: safe to call on every server restart.
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { DATA_DIR, upsertSkill, upsertMcpServer, upsertFunctionTool, getDb } from './db';

const DEFAULTS_DIR = path.join(/* turbopackIgnore: true */ process.cwd(), 'defaults');
const SKILLS_DIR = path.join(DATA_DIR, 'skills');
const FUNCTION_TOOLS_DIR = path.join(DATA_DIR, 'function-tools');
const MCP_SERVERS_DIR = path.join(DATA_DIR, 'mcp-servers');

// ---------------------------------------------------------------------------
// Step 1: copy defaults/ → data/, skipping existing files
// .env is excluded here and created via createEnvTemplate() instead.
//
// Built-in skills and function-tools are ALWAYS force-overwritten so that
// the SKILL.md and function.json content stays in sync with defaults/.
// User-installed skills from GitHub are never overwritten.
// ---------------------------------------------------------------------------

// Built-in skill names (must match the directory names in defaults/skills/)
const FORCE_OVERWRITE_SKILLS = new Set([
  'hello-world',
  'json-formatter',
  'code-reviewer',
  'skill-creator',
]);

// Built-in function tool names (must match directory names in defaults/function-tools/)
const FORCE_OVERWRITE_FUNCTION_TOOLS = new Set(['calculator', 'unit-converter', 'random-data']);

function copyDefaults(src: string, dest: string, root = true, forceOverwrite = false): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    // Skip .env at the top level — handled by createEnvTemplate()
    if (root && entry.name === '.env') continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      // Force-overwrite built-in skills and function-tools so they stay
      // in sync with defaults/ across server restarts and upgrades.
      const isForced = root
        ? false
        : forceOverwrite ||
          FORCE_OVERWRITE_SKILLS.has(entry.name) ||
          FORCE_OVERWRITE_FUNCTION_TOOLS.has(entry.name);
      copyDefaults(srcPath, destPath, false, isForced);
    } else if (forceOverwrite || !fs.existsSync(destPath)) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ---------------------------------------------------------------------------
// Step 1b: create data/.env with a template if it does not yet exist
// ---------------------------------------------------------------------------
const ENV_TEMPLATE = `# data/.env — environment variable overrides (advanced)
#
# Variables defined here are loaded at server startup and take priority
# over Docker env vars and any other source. Use this file for
# infrastructure variables you want to persist across container restarts
# (AGENT_PRIMER_SECRET, LANGFUSE_*, EMBED_MODEL, EMBED_CACHE_DIR, …).
#
# Syntax:  KEY=value
# Quotes are optional. Lines starting with # are ignored.
#
# ─────────────────────────────────────────────────────────────────────────
# NOTE about MCP server credentials
# ─────────────────────────────────────────────────────────────────────────
# By default AgentPrimer does NOT forward variables in this file to MCP
# server subprocesses (only a small shell allow-list — PATH, HOME, etc.).
# To give a single MCP server its own credential (e.g. EXA_API_KEY for the
# exa MCP server, GITHUB_TOKEN for a github MCP server), use:
#
#   Skills & MCP → <server> → Edit → Environment variables
#
# That field stores the credential on the server's row in SQLite and only
# ever reaches that one server's subprocess.
#
# For fleet-wide forwarding from this file you can also set MCP_FORWARD_ENV
# to a comma-separated allow-list (e.g. MCP_FORWARD_ENV="OPENAI_API_KEY"),
# but the per-server field above is the recommended path.
#
`;

function createEnvTemplate(): void {
  const envPath = path.join(DATA_DIR, '.env');
  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, ENV_TEMPLATE, 'utf-8');
  }
}

// ---------------------------------------------------------------------------
// Step 2: register SKILL.md skills found in data/skills/
//
// A skill is a directory containing a SKILL.md file. Skills are instruction
// modules injected into the agent system prompt — they are NOT callable
// functions. The manifest_json column stores the raw SKILL.md content for
// display in the UI and for caching purposes.
// ---------------------------------------------------------------------------
function seedSkills(): void {
  if (!fs.existsSync(SKILLS_DIR)) return;
  for (const name of fs.readdirSync(SKILLS_DIR)) {
    const dir = path.join(SKILLS_DIR, name);
    const skillMdPath = path.join(dir, 'SKILL.md');
    if (!fs.statSync(dir).isDirectory() || !fs.existsSync(skillMdPath)) continue;

    const githubUrl = `builtin://${name}`;
    let skillMdContent: string;
    let skillName = name;

    try {
      skillMdContent = fs.readFileSync(skillMdPath, 'utf-8');
      // Extract the name from the SKILL.md frontmatter (simple regex)
      const nameMatch = skillMdContent.match(/^name:\s*["']?(.+?)["']?\s*$/m);
      skillName = nameMatch?.[1]?.trim() ?? name;
    } catch {
      console.warn(`bootstrap: skipping skill "${name}" — could not read SKILL.md`);
      continue;
    }

    const existing = getDb()
      .prepare('SELECT id, enabled FROM skills WHERE github_url = ?')
      .get(githubUrl) as { id: string; enabled: number } | undefined;
    upsertSkill({
      id: existing?.id ?? randomUUID(),
      name: skillName,
      github_url: githubUrl,
      local_path: dir,
      enabled: existing?.enabled ?? 1,
      // Store the raw SKILL.md content for display (skills-loader re-reads from disk)
      manifest_json: skillMdContent,
    });
  }
}

// ---------------------------------------------------------------------------
// Step 3: register function tools found in data/function-tools/
//
// A function tool is a directory containing function.json (the OpenAI function
// schema) and index.js (the implementation). Function tools ARE callable —
// the model emits a tool_call and the server executes index.js in a subprocess.
// ---------------------------------------------------------------------------
function seedFunctionTools(): void {
  if (!fs.existsSync(FUNCTION_TOOLS_DIR)) return;
  for (const name of fs.readdirSync(FUNCTION_TOOLS_DIR)) {
    const dir = path.join(FUNCTION_TOOLS_DIR, name);
    const manifestPath = path.join(dir, 'function.json');
    if (!fs.statSync(dir).isDirectory() || !fs.existsSync(manifestPath)) continue;

    const githubUrl = `builtin://${name}`;
    let manifestRaw: string;
    let manifest: { name?: string };
    try {
      manifestRaw = fs.readFileSync(manifestPath, 'utf-8');
      manifest = JSON.parse(manifestRaw) as { name?: string };
    } catch {
      console.warn(`bootstrap: skipping function tool "${name}" — invalid function.json`);
      continue;
    }

    const toolName = manifest.name ?? name;
    const existing = getDb()
      .prepare('SELECT id, enabled FROM function_tools WHERE github_url = ?')
      .get(githubUrl) as { id: string; enabled: number } | undefined;
    upsertFunctionTool({
      id: existing?.id ?? randomUUID(),
      name: toolName,
      github_url: githubUrl,
      local_path: dir,
      enabled: existing?.enabled ?? 1,
      manifest_json: manifestRaw,
    });
  }
}

// ---------------------------------------------------------------------------
// Step 4: register MCP servers found in data/mcp-servers/
// ---------------------------------------------------------------------------
function seedMcpServers(): void {
  if (!fs.existsSync(MCP_SERVERS_DIR)) return;
  for (const name of fs.readdirSync(MCP_SERVERS_DIR)) {
    const dir = path.join(MCP_SERVERS_DIR, name);
    const metaPath = path.join(dir, 'mcp.json');
    if (!fs.statSync(dir).isDirectory() || !fs.existsSync(metaPath)) continue;

    const githubUrl = `builtin://${name}`;
    let meta: {
      name?: string;
      transport?: 'stdio' | 'sse';
      command?: string;
      args?: string[];
      url?: string;
      enabled?: boolean;
    };
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as typeof meta;
    } catch {
      console.warn(`bootstrap: skipping MCP server "${name}" — invalid mcp.json`);
      continue;
    }

    // Make the entry-point arg absolute to the server directory so it doesn't depend on cwd
    const absArgs = (meta.args ?? []).map((a, i) =>
      i === 0 && !a.startsWith('/') && !a.startsWith('-') ? path.resolve(dir, a) : a,
    );

    const existing = getDb()
      .prepare(
        'SELECT id, name, transport, command, args_json, url, enabled, env_json FROM mcp_servers WHERE github_url = ?',
      )
      .get(githubUrl) as
      | {
          id: string;
          name: string;
          transport: 'stdio' | 'sse';
          command: string;
          args_json: string;
          url: string;
          enabled: number;
          env_json: string;
        }
      | undefined;
    upsertMcpServer({
      id: existing?.id ?? randomUUID(),
      name: existing?.name ?? meta.name ?? name,
      github_url: githubUrl,
      local_path: dir,
      transport: existing?.transport ?? meta.transport ?? 'stdio',
      command: existing?.command ?? meta.command ?? 'node',
      args_json: existing?.args_json ?? JSON.stringify(absArgs),
      url: existing?.url ?? meta.url ?? '',
      enabled: existing?.enabled ?? (meta.enabled === false ? 0 : 1),
      env_json: existing?.env_json ?? '{}',
    });
  }
}

// ---------------------------------------------------------------------------
// Step 5: load data/.env and apply to process.env (highest priority)
// Exported so the data-files API can re-apply env vars after a live save.
// ---------------------------------------------------------------------------
export function loadDataEnv(): void {
  const envPath = path.join(DATA_DIR, '.env');
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf-8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip optional surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------
export function bootstrap(): void {
  // Step 1: copy built-in content from defaults/ to data/ (first run or forced)
  copyDefaults(DEFAULTS_DIR, DATA_DIR);

  // Step 1b: ensure project and preview directories exist
  fs.mkdirSync(path.join(DATA_DIR, 'projects'), { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, 'preview'), { recursive: true });

  // Step 1c: remove stale preview copies whose source project no longer exists
  const previewDir = path.join(DATA_DIR, 'preview');
  if (fs.existsSync(previewDir)) {
    for (const entry of fs.readdirSync(previewDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const sourceDir = path.join(DATA_DIR, 'projects', entry.name);
        if (!fs.existsSync(sourceDir)) {
          fs.rmSync(path.join(previewDir, entry.name), { recursive: true, force: true });
        }
      }
    }
  }

  // Step 2: create data/.env template if it doesn't exist yet
  createEnvTemplate();

  // Step 3: apply data/.env overrides to process.env (highest priority)
  loadDataEnv();

  // Step 4: register SKILL.md skills found in data/skills/
  //   Skills are context injection modules — their SKILL.md instructions are
  //   injected into the agent system prompt, not executed as functions.
  seedSkills();

  // Step 5: register function tools found in data/function-tools/
  //   Function tools are callable OpenAI function definitions — the model emits
  //   a tool_call and the server executes index.js in a subprocess.
  seedFunctionTools();

  // Step 6: register MCP servers found in data/mcp-servers/
  //   MCP tools are callable via the Model Context Protocol — the server
  //   connects to a local or remote MCP process and proxies tool calls.
  seedMcpServers();
}

// ── Reset helpers (used by POST /api/reset) ─────────────────────────────
// These are exported so the reset endpoint can selectively restore default
// files + re-seed the DB after clearing user data for a given category.

export function seedSkillsPublic() {
  seedSkills();
}
export function seedFunctionToolsPublic() {
  seedFunctionTools();
}
export function seedMcpServersPublic() {
  seedMcpServers();
}
export function createEnvTemplatePublic() {
  createEnvTemplate();
}
export function copyDefaultsPublic(
  src: string,
  dest: string,
  root = true,
  forceOverwrite = false,
): void {
  copyDefaults(src, dest, root, forceOverwrite);
}
export {
  DEFAULTS_DIR,
  SKILLS_DIR,
  FUNCTION_TOOLS_DIR,
  MCP_SERVERS_DIR,
  FORCE_OVERWRITE_SKILLS,
  FORCE_OVERWRITE_FUNCTION_TOOLS,
};
