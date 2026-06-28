/**
 * lib/approval-store.ts
 * ---------------------------------------------------------------------------
 * Server-side approval store for sensitive agent operations.
 *
 * Two tiers:
 *   • Session-level  – in-memory Map, cleared when the server restarts.
 *   • Permanent      – persisted in the SQLite `permanent_approvals` table.
 *
 * Operation keys:
 *   • 'delete'       – any delete_path call
 *   • 'read_dotfile' – read_file on a file whose basename starts with '.'
 *
 * Scope semantics:
 *   • 'once'      – approve this specific path this one time, then consume.
 *   • 'session'   – approve the operation type for the whole session.
 *   • 'permanent' – persisted; approved forever until manually revoked.
 */

import { getDb } from './db';

export type ApprovalOperation = 'delete' | 'read_dotfile' | 'run_shell';
export type ApprovalScope = 'once' | 'session' | 'permanent';

// sessionId → Map<operationKey, scope>
// operationKey is 'delete' (session-wide) or 'delete:/abs/path' (once)
const sessionStore = new Map<string, Map<string, ApprovalScope>>();

/** Returns true if the operation is currently approved for this session. */
export function isApproved(
  sessionId: string,
  operation: ApprovalOperation,
  filePath?: string,
): boolean {
  if (isPermanentlyApproved(operation)) return true;
  const session = sessionStore.get(sessionId);
  if (!session) return false;
  // Session-wide approval
  if (session.has(operation)) return true;
  // Once approval for the specific path
  if (filePath && session.has(`${operation}:${filePath}`)) return true;
  return false;
}

/**
 * If the approval for this path was 'once', consume it so it can't be reused.
 * Call this AFTER the operation successfully completes.
 */
export function consumeOnce(
  sessionId: string,
  operation: ApprovalOperation,
  filePath: string,
): void {
  const session = sessionStore.get(sessionId);
  if (!session) return;
  const key = `${operation}:${filePath}`;
  if (session.get(key) === 'once') session.delete(key);
}

/** Record an approval. */
export function grantApproval(
  sessionId: string,
  operation: ApprovalOperation,
  scope: ApprovalScope,
  filePath?: string,
): void {
  if (scope === 'permanent') {
    getDb()
      .prepare('INSERT OR IGNORE INTO permanent_approvals (operation) VALUES (?)')
      .run(operation);
    return;
  }
  if (!sessionStore.has(sessionId)) sessionStore.set(sessionId, new Map());
  const session = sessionStore.get(sessionId)!;
  if (scope === 'once' && filePath) {
    session.set(`${operation}:${filePath}`, 'once');
  } else {
    // 'session' – covers all paths for this operation type
    session.set(operation, 'session');
  }
}

/** Revoke a permanent approval (for settings UI / future use). */
export function revokePermanentApproval(operation: ApprovalOperation): void {
  getDb()
    .prepare('DELETE FROM permanent_approvals WHERE operation = ?')
    .run(operation);
}

/** List all permanent approvals. */
export function listPermanentApprovals(): ApprovalOperation[] {
  const rows = getDb()
    .prepare('SELECT operation FROM permanent_approvals')
    .all() as { operation: string }[];
  return rows.map(r => r.operation as ApprovalOperation);
}

function isPermanentlyApproved(operation: string): boolean {
  const row = getDb()
    .prepare('SELECT 1 FROM permanent_approvals WHERE operation = ?')
    .get(operation);
  return !!row;
}
