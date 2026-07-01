/**
 * proxy.ts
 * ---------------------------------------------------------------------------
 * Next.js Edge Proxy – runs before matched requests.
 *
 * Responsibilities:
 *   1. Check for a valid session JWT cookie on protected page routes
 *   2. Redirect unauthenticated users to /login
 *   3. Return JSON 401 responses for unauthenticated API requests
 *   4. Allow public routes: /login, /register, initial auth APIs
 *
 * Note: The middleware uses the `jose` library (Edge-compatible JWT) directly
 * rather than importing from lib/auth.ts, because Edge runtime cannot use
 * Node.js modules like `fs`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

// Routes that are accessible without authentication.
// We treat each entry as either an exact match or a strict directory prefix
// (entry + '/'), never a bare `startsWith`. Without that constraint a future
// route accidentally named `/login-admin-panel` or `/registerable` would
// silently bypass authentication.
const PUBLIC_PATHS = ['/login', '/register', '/logo.svg'];
const PUBLIC_API_PATHS = ['/api/auth/login', '/api/auth/register', '/api/auth/setup'];

const DEV_JWT_SECRET = 'agentprimer-development-secret-do-not-use-in-production';

// JWT secret (must match lib/auth.ts)
function getSecret(): Uint8Array {
  const secret = process.env.AGENT_PRIMER_SECRET;

  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('AGENT_PRIMER_SECRET must be set in production.');
  }

  return new TextEncoder().encode(secret ?? DEV_JWT_SECRET);
}

function isExactOrChildPath(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + '/');
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths (exact match OR child of the public prefix)
  if (PUBLIC_PATHS.some((p) => isExactOrChildPath(pathname, p))) {
    return NextResponse.next();
  }

  if (PUBLIC_API_PATHS.some((p) => pathname === p)) {
    return NextResponse.next();
  }

  // Allow unauthenticated GET access to the dedicated preview route only.
  // /api/preview/** is scoped to data/preview/ (a throwaway mirror published
  // by the authenticated open_preview tool) — source files, the database,
  // and everything else under data/ are unreachable from this route.
  // All other /api/workspace/** requests require a valid JWT.
  if (request.method === 'GET' && pathname.startsWith('/api/preview/')) {
    return NextResponse.next();
  }

  // Allow Next.js internals. We use the same exact-or-child match as
  // `isExactOrChildPath` (rather than a bare `startsWith`) so a future
  // route accidentally named `/_next-something` or `/favicon-evil` cannot
  // bypass authentication.
  if (
    pathname === '/_next' ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico' ||
    pathname === '/favicon'
  ) {
    return NextResponse.next();
  }

  // Check session cookie
  const token = request.cookies.get('agentprimer_session')?.value;

  if (!token) {
    return redirectOrUnauthorized(request);
  }

  try {
    await jwtVerify(token, getSecret());
    return NextResponse.next();
  } catch {
    // Cookie is present but invalid/expired — clear it so the browser doesn't
    // keep sending it on every request (which would cause a redirect loop).
    const response = redirectOrUnauthorized(request);
    response.cookies.delete('agentprimer_session');
    return response;
  }
}

function redirectOrUnauthorized(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('from', request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
