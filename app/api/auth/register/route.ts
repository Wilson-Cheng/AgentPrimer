import { registerFirstUser, needsSetup, issueSession } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

/** POST /api/auth/register – first-time user registration */
export async function POST(request: NextRequest) {
  if (!needsSetup()) {
    return NextResponse.json({ error: 'Setup already complete.' }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const { username, password } = body as { username?: string; password?: string };

  if (!username || !password) {
    return NextResponse.json({ error: 'Username and password are required.' }, { status: 400 });
  }

  // Only allow safe characters in the username
  if (!/^[a-zA-Z0-9_\-]{1,64}$/.test(username)) {
    return NextResponse.json(
      {
        error:
          'Username may only contain letters, numbers, underscores, and hyphens (max 64 chars).',
      },
      { status: 400 },
    );
  }

  if (password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 });
  }

  try {
    await registerFirstUser(username, password);
  } catch {
    return NextResponse.json(
      { error: 'Registration failed – setup may already be complete.' },
      { status: 409 },
    );
  }

  await issueSession(username);
  return NextResponse.json({ ok: true, username });
}
