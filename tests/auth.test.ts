import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let tempDir: string;

async function loadAuth() {
  vi.resetModules();
  return import('../lib/auth');
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentprimer-auth-'));
  vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
  process.env.AGENT_PRIMER_SECRET = 'test-secret';
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.AGENT_PRIMER_SECRET;
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('auth file helpers', () => {
  it('requires setup when no users file exists', async () => {
    const { needsSetup, readUsersFile } = await loadAuth();

    expect(needsSetup()).toBe(true);
    expect(readUsersFile().size).toBe(0);
  });

  it('requires AGENT_PRIMER_SECRET in production when signing tokens', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env = { ...process.env, NODE_ENV: 'production' };
    delete process.env.AGENT_PRIMER_SECRET;

    try {
      const { issueSession } = await loadAuth();

      await expect(issueSession('admin')).rejects.toThrow(
        'AGENT_PRIMER_SECRET must be set in production.',
      );
    } finally {
      process.env = { ...process.env, NODE_ENV: previousNodeEnv };
    }
  });

  it('registers the first user and validates credentials', async () => {
    const { needsSetup, registerFirstUser, validateCredentials, readUsersFile } = await loadAuth();

    await registerFirstUser('admin', 'admin-password');

    expect(needsSetup()).toBe(false);
    expect(readUsersFile().get('admin')).toMatch(/^\$2[aby]\$/);
    await expect(validateCredentials('admin', 'admin-password')).resolves.toBe(true);
    await expect(validateCredentials('admin', 'wrong-password')).resolves.toBe(false);
    await expect(validateCredentials('missing', 'admin-password')).resolves.toBe(false);
  });

  it('does not allow registering a second first user', async () => {
    const { registerFirstUser } = await loadAuth();

    await registerFirstUser('admin', 'password');

    await expect(registerFirstUser('other', 'password')).rejects.toThrow(
      'Users file already exists.',
    );
  });

  it('accepts legacy MD5 hashes and upgrades them to bcrypt after successful login', async () => {
    const { readUsersFile, validateCredentials } = await loadAuth();
    const usersPath = path.join(tempDir, 'data', '.users');
    fs.mkdirSync(path.dirname(usersPath), { recursive: true });
    fs.writeFileSync(usersPath, 'admin:5f4dcc3b5aa765d61d8327deb882cf99\n', 'utf-8');

    await expect(validateCredentials('admin', 'password')).resolves.toBe(true);
    expect(readUsersFile().get('admin')).toMatch(/^\$2[aby]\$/);
  });

  it('rejects a wrong password against a legacy MD5 hash', async () => {
    const { readUsersFile, validateCredentials } = await loadAuth();
    const usersPath = path.join(tempDir, 'data', '.users');
    fs.mkdirSync(path.dirname(usersPath), { recursive: true });
    fs.writeFileSync(usersPath, 'admin:5f4dcc3b5aa765d61d8327deb882cf99\n', 'utf-8');

    await expect(validateCredentials('admin', 'not-the-password')).resolves.toBe(false);
    // The stored hash must remain the un-upgraded legacy hash on failure.
    expect(readUsersFile().get('admin')).toBe('5f4dcc3b5aa765d61d8327deb882cf99');
  });
});

describe('login rate limiting', () => {
  it('allows attempts up to the limit then blocks with a retry-after', async () => {
    const { checkLoginRateLimit, _resetAllLoginRateLimits } = await loadAuth();
    _resetAllLoginRateLimits();

    let last;
    for (let i = 0; i < 10; i++) {
      last = checkLoginRateLimit('1.2.3.4');
      expect(last.allowed).toBe(true);
    }
    expect(last!.remaining).toBe(0);

    const blocked = checkLoginRateLimit('1.2.3.4');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('tracks different keys independently', async () => {
    const { checkLoginRateLimit, _resetAllLoginRateLimits } = await loadAuth();
    _resetAllLoginRateLimits();

    for (let i = 0; i < 10; i++) checkLoginRateLimit('attacker');
    expect(checkLoginRateLimit('attacker').allowed).toBe(false);
    expect(checkLoginRateLimit('honest-user').allowed).toBe(true);
  });

  it('resets the counter after a successful login', async () => {
    const { checkLoginRateLimit, resetLoginRateLimit, _resetAllLoginRateLimits } = await loadAuth();
    _resetAllLoginRateLimits();

    for (let i = 0; i < 9; i++) checkLoginRateLimit('5.6.7.8');
    resetLoginRateLimit('5.6.7.8');

    // Window starts fresh: a full allotment is available again.
    const next = checkLoginRateLimit('5.6.7.8');
    expect(next.allowed).toBe(true);
    expect(next.remaining).toBe(9);
  });

  it('reopens the window once it expires', async () => {
    const { checkLoginRateLimit, _resetAllLoginRateLimits } = await loadAuth();
    _resetAllLoginRateLimits();

    const t0 = 1_000_000;
    for (let i = 0; i < 10; i++) checkLoginRateLimit('clock', t0);
    expect(checkLoginRateLimit('clock', t0).allowed).toBe(false);

    // 15 minutes + 1ms later the window has rolled over.
    const later = t0 + 15 * 60 * 1000 + 1;
    expect(checkLoginRateLimit('clock', later).allowed).toBe(true);
  });
});
