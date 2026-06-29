/**
 * lib/auth.ts
 * ---------------------------------------------------------------------------
 * Authentication using data/.users file.
 *
 * File format (one user per line):
 *   username:bcrypt-hash
 *
 * Legacy MD5 hashes are still accepted and automatically upgraded to bcrypt
 * after a successful login. This keeps existing installs working while making
 * new and active accounts safer.
 *
 * Sessions are JWT tokens stored in an httpOnly cookie (no DB required).
 * The JWT is signed with AGENT_PRIMER_SECRET. Development/test can use a
 * fallback secret, but production must configure a real random value.
 *
 * When data/.users does not exist or is empty, the app shows a first-time
 * registration UI. That first registration creates the single admin account.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

export const USERS_FILE = path.join(/* turbopackIgnore: true */ process.cwd(), 'data', '.users');

const COOKIE_NAME = 'agentprimer_session';
const JWT_EXPIRY  = '7d';
const BCRYPT_ROUNDS = 12;
const DEV_JWT_SECRET = 'agentprimer-development-secret-do-not-use-in-production';

// Emit the insecure-secret warning at most once per process so we don't spam
// the logs on every request, while still making the risk impossible to miss.
let warnedAboutDevSecret = false;

function getJwtSecret(): Uint8Array {
  const secret = process.env.AGENT_PRIMER_SECRET;

  if (secret) {
    return new TextEncoder().encode(secret);
  }

  // No secret configured. In production this is fatal — refuse to sign or
  // verify tokens with a publicly known key.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('AGENT_PRIMER_SECRET must be set in production.');
  }

  // Tests deliberately exercise the fallback; stay quiet there. Everywhere
  // else (development, staging, any non-production deploy) warn loudly because
  // a known dev secret means anyone can forge a valid session token.
  if (process.env.NODE_ENV !== 'test' && !warnedAboutDevSecret) {
    warnedAboutDevSecret = true;
    console.warn(
      '\n' +
      '====================================================================\n' +
      ' ⚠  SECURITY WARNING: AGENT_PRIMER_SECRET is not set.\n' +
      '    Falling back to a PUBLIC, well-known development secret.\n' +
      '    Session tokens can be trivially forged by anyone.\n' +
      '    Set AGENT_PRIMER_SECRET to a long random value before exposing\n' +
      '    this instance to a network. Example:\n' +
      '      export AGENT_PRIMER_SECRET="$(openssl rand -hex 32)"\n' +
      '====================================================================\n',
    );
  }

  return new TextEncoder().encode(DEV_JWT_SECRET);
}

function md5(text: string): string {
  return crypto.createHash('md5').update(text).digest('hex');
}

function isLegacyMd5Hash(hash: string): boolean {
  return /^[a-f0-9]{32}$/i.test(hash);
}

/**
 * Constant-time comparison of two hex-encoded hashes of equal length.
 * Falls back to a plain inequality only when lengths differ (which already
 * leaks nothing useful beyond "wrong length"). This avoids the early-exit
 * timing side channel of `===` on the legacy MD5 path.
 */
function safeHexEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

function rewriteUsersFile(users: Map<string, string>): void {
  const dir = path.dirname(USERS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const content =
    Array.from(users.entries())
      .map(([username, hash]) => `${username}:${hash}`)
      .join('\n') + '\n';
  // Atomic write: render the new file to a sibling temp path, then rename
  // it on top of the real `.users` file. `fs.renameSync` is atomic on POSIX
  // filesystems, so concurrent `validateCredentials` calls (each upgrading
  // a legacy MD5 row to bcrypt at the same time) can no longer produce a
  // truncated/interleaved file that locks the admin out.
  const tmp = `${USERS_FILE}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, content, { encoding: 'utf-8', mode: 0o600 });
  try {
    fs.renameSync(tmp, USERS_FILE);
  } catch (err) {
    // Rename can fail across filesystems / on EPERM / ENOSPC. Clean up the
    // temp file so it doesn't accumulate in `data/` and confuse the
    // operator. Failure to unlink is best-effort.
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* best-effort cleanup */
    }
    throw err;
  }
}

export function needsSetup(): boolean {
  return readUsersFile().size === 0;
}

export function readUsersFile(): Map<string, string> {
  if (!fs.existsSync(USERS_FILE)) return new Map();

  const content = fs.readFileSync(USERS_FILE, 'utf-8');
  const users = new Map<string, string>();

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const username = trimmed.slice(0, colonIdx).trim();
    const hash     = trimmed.slice(colonIdx + 1).trim();
    if (username && hash) users.set(username, hash);
  }

  return users;
}

export async function registerFirstUser(username: string, password: string): Promise<void> {
  if (!needsSetup()) {
    throw new Error('Users file already exists.');
  }
  rewriteUsersFile(new Map([[username, await hashPassword(password)]]));
}

export async function validateCredentials(username: string, password: string): Promise<boolean> {
  const users = readUsersFile();
  const storedHash = users.get(username);
  if (!storedHash) return false;

  if (isLegacyMd5Hash(storedHash)) {
    const valid = safeHexEqual(storedHash, md5(password));
    if (valid) {
      users.set(username, await hashPassword(password));
      rewriteUsersFile(users);
    }
    return valid;
  }

  return bcrypt.compare(password, storedHash);
}

export async function issueSession(username: string): Promise<void> {
  const token = await new SignJWT({ sub: username })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(getJwtSecret());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });
}

export async function getSessionUser(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, getJwtSecret());
    return (payload.sub as string) ?? null;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

// ---------------------------------------------------------------------------
// Login rate limiting
// ---------------------------------------------------------------------------
// A small in-memory sliding-window limiter to slow down credential-stuffing
// and brute-force attempts. This is deliberately simple: AgentPrimer runs as a
// single-process Node server, so a module-level Map is sufficient and avoids a
// dependency. It is NOT shared across replicas — if you scale horizontally,
// front the app with a real rate limiter (nginx, a WAF, etc.).

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_ATTEMPTS = 10;          // failed attempts per key per window

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const loginAttempts = new Map<string, RateLimitEntry>();

export interface RateLimitResult {
  /** Whether this attempt is allowed to proceed. */
  allowed: boolean;
  /** Attempts remaining in the current window (0 when blocked). */
  remaining: number;
  /** Seconds until the window resets (for a Retry-After header). */
  retryAfterSeconds: number;
}

/**
 * Check whether a login attempt from `key` (e.g. a client IP) is allowed.
 * Counts the attempt. Successful logins should call `resetLoginRateLimit(key)`
 * so a legitimate user is never penalised for earlier typos.
 */
export function checkLoginRateLimit(key: string, now: number = Date.now()): RateLimitResult {
  const entry = loginAttempts.get(key);

  if (!entry || now >= entry.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_MAX_ATTEMPTS - 1, retryAfterSeconds: 0 };
  }

  if (entry.count >= RATE_LIMIT_MAX_ATTEMPTS) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }

  entry.count += 1;
  return {
    allowed: true,
    remaining: RATE_LIMIT_MAX_ATTEMPTS - entry.count,
    retryAfterSeconds: 0,
  };
}

/** Clear the failure counter for a key after a successful authentication. */
export function resetLoginRateLimit(key: string): void {
  loginAttempts.delete(key);
}

/** Test helper: wipe all rate-limit state. */
export function _resetAllLoginRateLimits(): void {
  loginAttempts.clear();
}
