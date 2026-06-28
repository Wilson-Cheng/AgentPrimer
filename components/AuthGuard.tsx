'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

// Pages that are accessible without a registered user account
const PUBLIC_PATHS = ['/login', '/register'];

/**
 * AuthGuard – rendered inside the root layout on every page.
 * Checks /api/auth/setup once per navigation; if no user accounts exist
 * (e.g. after wiping the data directory) it redirects to /register
 * regardless of which page the user is on.
 *
 * Renders nothing – purely a side-effect component.
 */
export default function AuthGuard() {
  const router   = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) return;
    fetch('/api/auth/setup')
      .then(r => r.json())
      .then(({ needsSetup }: { needsSetup: boolean }) => {
        if (needsSetup) router.replace('/register');
      })
      .catch(() => {});
  }, [pathname, router]);

  return null;
}
