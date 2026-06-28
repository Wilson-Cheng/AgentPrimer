import { validateCredentials, issueSession, checkLoginRateLimit, resetLoginRateLimit } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

function clientKey(request: NextRequest): string {
  // Prefer the proxy-provided client IP; fall back to a constant so the
  // limiter still applies (per-process) when no header is present.
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

export async function POST(request: NextRequest) {
  const key = clientKey(request);

  const limit = checkLoginRateLimit(key);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many login attempts. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  const body = await request.json().catch(() => ({}));
  const { username, password } = body as { username?: string; password?: string };

  if (!username || !password) {
    return NextResponse.json({ error: 'Username and password are required.' }, { status: 400 });
  }

  if (!(await validateCredentials(username, password))) {
    return NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 });
  }

  // Successful login — clear the failure counter for this client.
  resetLoginRateLimit(key);

  await issueSession(username);
  return NextResponse.json({ ok: true, username });
}
