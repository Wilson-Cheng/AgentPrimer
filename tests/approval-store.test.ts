import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let tempDir: string;

async function loadApprovalStore() {
  vi.resetModules();
  return import('../lib/approval-store');
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentprimer-approval-'));
  vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('approval store', () => {
  it('grants and consumes once approvals by path', async () => {
    const { consumeOnce, grantApproval, isApproved } = await loadApprovalStore();

    grantApproval('session-1', 'delete', 'once', '/tmp/file.txt');

    expect(isApproved('session-1', 'delete', '/tmp/file.txt')).toBe(true);
    expect(isApproved('session-1', 'delete', '/tmp/other.txt')).toBe(false);

    consumeOnce('session-1', 'delete', '/tmp/file.txt');

    expect(isApproved('session-1', 'delete', '/tmp/file.txt')).toBe(false);
  });

  it('grants session-wide approvals for an operation', async () => {
    const { grantApproval, isApproved } = await loadApprovalStore();

    grantApproval('session-1', 'read_dotfile', 'session');

    expect(isApproved('session-1', 'read_dotfile', '/tmp/.env')).toBe(true);
    expect(isApproved('other-session', 'read_dotfile', '/tmp/.env')).toBe(false);
  });

  it('persists permanent approvals and revokes them', async () => {
    const { grantApproval, isApproved, listPermanentApprovals, revokePermanentApproval } = await loadApprovalStore();

    grantApproval('session-1', 'run_shell', 'permanent');

    expect(isApproved('any-session', 'run_shell')).toBe(true);
    expect(listPermanentApprovals()).toEqual(['run_shell']);

    revokePermanentApproval('run_shell');

    expect(isApproved('any-session', 'run_shell')).toBe(false);
    expect(listPermanentApprovals()).toEqual([]);
  });
});
