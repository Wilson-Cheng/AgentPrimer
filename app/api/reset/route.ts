/**
 * app/api/reset/route.ts
 * ---------------------------------------------------------------------------
 * Destructive reset endpoint backing the Settings → Danger Zone UI.
 *
 * Accepts a list of target categories to reset and either:
 *   • Restores each category individually (deletes user content in that
 *     category + re-copies from defaults/ + re-seeds the DB row), OR
 *   • Performs a `full` wipe of the entire data/ directory (effectively a
 *     factory reset, including user accounts) and re-runs bootstrap().
 *
 * SAFETY:
 *   • POST only (no GET — read-only callers should never hit this).
 *   • Authenticated. Requires a valid session cookie. The very first user
 *     created the cookie via /register, so they're the only one allowed
 *     to wipe their own deployment.
 *   • For `full`: closes the SQLite connection cleanly first (otherwise
 *     deleting agent.db leaves orphan WAL writes on Linux/Mac and EBUSY
 *     on Windows).
 *   • For any reset that touches data/mcp-servers/: disconnects active
 *     MCP subprocesses first (same pattern used by /api/data-files when
 *     overwriting .env).
 *
 * RETURNS:
 *   { ok: true, didWipeAccounts: boolean, restored: string[] }
 *   The client uses `didWipeAccounts` to redirect to /register after a
 *   full reset.
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getSessionUser, clearSession } from '@/lib/auth';
import { getDb, closeDb, DATA_DIR } from '@/lib/db';
import { AGENTS_DIR, safeAgentDirName } from '@/lib/memory';
import { disconnectAll } from '@/lib/mcp-client';
import {
  bootstrap,
  seedSkillsPublic,
  seedFunctionToolsPublic,
  seedMcpServersPublic,
  copyDefaultsPublic,
  DEFAULTS_DIR,
  SKILLS_DIR,
  FUNCTION_TOOLS_DIR,
  MCP_SERVERS_DIR,
} from '@/lib/bootstrap';

export const runtime = 'nodejs';

// Whitelist of reset targets. Anything else is rejected so a malformed
// client can't accidentally trigger a partial reset of something we
// didn't design for.
type ResetTarget =
  'system' | 'agents' | 'agent' | 'mcp-servers' | 'skills' | 'function-tools' | 'full';

const VALID_TARGETS = new Set<ResetTarget>([
  'system',
  'agents',
  'agent',
  'mcp-servers',
  'skills',
  'function-tools',
  'full',
]);

const FILE_TARGETS: Record<string, string> = {
  system: 'system.md',
};

/**
 * Restore a single top-level Markdown file from defaults/.
 * If the default doesn't exist (shouldn't happen for the four prompt
 * files), the data file is just deleted.
 */
function restoreMarkdownFile(filename: string): void {
  const dataPath = path.join(DATA_DIR, filename);
  const defaultPath = path.join(DEFAULTS_DIR, filename);
  if (fs.existsSync(dataPath)) fs.rmSync(dataPath);
  if (fs.existsSync(defaultPath)) fs.copyFileSync(defaultPath, dataPath);
}

function restoreAllAgents(): void {
  if (fs.existsSync(AGENTS_DIR)) {
    fs.rmSync(AGENTS_DIR, { recursive: true, force: true });
  }
  const defaultsPath = path.join(DEFAULTS_DIR, 'agents');
  if (fs.existsSync(defaultsPath)) copyDefaultsPublic(defaultsPath, AGENTS_DIR, false, true);
}

function restoreSingleAgent(agentName: string): void {
  const safe = safeAgentDirName(agentName);
  const dataPath = path.join(AGENTS_DIR, safe);
  const defaultsPath = path.join(DEFAULTS_DIR, 'agents', safe);
  if (!fs.existsSync(defaultsPath)) throw new Error(`No bundled default exists for agent: ${safe}`);
  if (fs.existsSync(dataPath)) fs.rmSync(dataPath, { recursive: true, force: true });
  copyDefaultsPublic(defaultsPath, dataPath, false, true);
}

/**
 * Wipe a category directory + DB table, then re-copy defaults + re-seed.
 *
 * The user's intent ("Reset skills") is: factory-default that category.
 * That means user-installed entries in the category are GONE — we don't
 * try to preserve them. The confirm dialog warned about this.
 */
function restoreCategory(args: {
  table: 'skills' | 'function_tools' | 'mcp_servers';
  targetDir: string;
  defaultsSubdir: string;
  reseed: () => void;
}): void {
  const { table, targetDir, defaultsSubdir, reseed } = args;
  // 1. Truncate the DB table (rows for both built-in and user-installed
  //    entries in this category go away).
  getDb().exec(`DELETE FROM ${table}`);
  // 2. Wipe the on-disk directory entirely.
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  // 3. Re-copy the defaults/ subdirectory back into place (force-overwrite
  //    so bundled defaults always win — but since we just deleted, this is
  //    effectively a clean copy).
  const defaultsPath = path.join(DEFAULTS_DIR, defaultsSubdir);
  if (fs.existsSync(defaultsPath)) {
    copyDefaultsPublic(defaultsPath, targetDir, false, true);
  }
  // 4. Re-seed the DB from the on-disk content (now only the defaults).
  reseed();
}

export async function POST(request: NextRequest) {
  // ── 1. Auth ──────────────────────────────────────────────────────────
  // Reset is destructive — anyone with a valid session cookie can wipe
  // the deployment. That's intentional: in single-tenant mode this is
  // "the user owning the app", and a fresh server with no users is
  // protected by needsSetup() upstream (no cookie issued yet, so this
  // would 401 anyway).
  const username = await getSessionUser();
  if (!username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── 2. Validate body ────────────────────────────────────────────────
  let body: { targets?: string[]; agentName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const targets = Array.isArray(body.targets) ? body.targets : [];
  if (targets.length === 0) {
    return NextResponse.json({ error: 'At least one target required' }, { status: 400 });
  }
  for (const t of targets) {
    if (!VALID_TARGETS.has(t as ResetTarget)) {
      return NextResponse.json({ error: `Unknown target: ${t}` }, { status: 400 });
    }
  }
  const wantsFull = targets.includes('full');

  // ── 3. Pre-reset hygiene ────────────────────────────────────────────
  // Always disconnect MCP clients if MCP servers are being touched (or on
  // a full wipe). Active subprocesses holding open file descriptors will
  // error out otherwise — and a stale connection pointing at a deleted
  // binary would crash the next request.
  if (wantsFull || targets.includes('mcp-servers')) {
    try {
      await disconnectAll();
    } catch (err) {
      console.warn('[reset] disconnectAll failed (continuing):', err);
    }
  }

  // ── 4. Perform reset ────────────────────────────────────────────────
  const restored: string[] = [];
  let didWipeAccounts = false;

  try {
    if (wantsFull) {
      // FULL FACTORY RESET.
      //
      // Order matters here for crash resilience:
      //   1. Close the SQLite connection cleanly so deleting agent.db
      //      doesn't leave orphaned writes (Linux/Mac) or throw EBUSY
      //      (Windows).
      //   2. Nuke `data/` (except `data/models/`, the embedding model
      //      cache — several hundred MB; re-downloading takes 30-60s on
      //      first chat and would feel like a bug to the user).
      //   3. Clear the JWT cookie. We do this BEFORE bootstrap so that
      //      even if bootstrap() throws, the user is at least logged out
      //      and the next request will land at /register naturally via
      //      AuthGuard's needsSetup() check.
      //   4. Re-run bootstrap to recreate the data dir + reseed the DB.
      //      If this fails we still return a success response — the
      //      destructive work is done, the client should redirect to
      //      /register, and the next request will trigger a fresh
      //      bootstrap on its own (idempotent).
      closeDb();
      if (fs.existsSync(DATA_DIR)) {
        for (const entry of fs.readdirSync(DATA_DIR, { withFileTypes: true })) {
          if (entry.name === 'models') continue; // preserve embedding cache
          const p = path.join(DATA_DIR, entry.name);
          fs.rmSync(p, { recursive: true, force: true });
        }
      }
      await clearSession();
      didWipeAccounts = true;
      restored.push('full');
      try {
        bootstrap();
      } catch (bootstrapErr) {
        // Best-effort: log but don't fail the response. The user is
        // already logged out and the data is wiped — they will land at
        // /register, and the next user-driven request will retrigger
        // bootstrap() naturally (it's idempotent).
        console.error('[reset] bootstrap after full wipe failed (non-fatal):', bootstrapErr);
      }
    } else {
      // PARTIAL RESET — process each target individually.
      for (const target of targets as ResetTarget[]) {
        if (target === 'full') continue; // already handled above
        if (target === 'agents') {
          restoreAllAgents();
          restored.push(target);
          continue;
        }
        if (target === 'agent') {
          restoreSingleAgent(body.agentName ?? 'main');
          restored.push(`agent:${safeAgentDirName(body.agentName ?? 'main')}`);
          continue;
        }
        if (FILE_TARGETS[target]) {
          restoreMarkdownFile(FILE_TARGETS[target]);
          restored.push(target);
          continue;
        }
        switch (target) {
          case 'mcp-servers':
            restoreCategory({
              table: 'mcp_servers',
              targetDir: MCP_SERVERS_DIR,
              defaultsSubdir: 'mcp-servers',
              reseed: seedMcpServersPublic,
            });
            restored.push(target);
            break;
          case 'skills':
            restoreCategory({
              table: 'skills',
              targetDir: SKILLS_DIR,
              defaultsSubdir: 'skills',
              reseed: seedSkillsPublic,
            });
            restored.push(target);
            break;
          case 'function-tools':
            restoreCategory({
              table: 'function_tools',
              targetDir: FUNCTION_TOOLS_DIR,
              defaultsSubdir: 'function-tools',
              reseed: seedFunctionToolsPublic,
            });
            restored.push(target);
            break;
        }
      }
    }
  } catch (err) {
    console.error('[reset] failure:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, didWipeAccounts, restored });
}
