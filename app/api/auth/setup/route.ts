import { needsSetup } from '@/lib/auth';
import { NextResponse } from 'next/server';

/** GET /api/auth/setup – returns whether first-time registration is needed */
export async function GET() {
  return NextResponse.json({ needsSetup: needsSetup() });
}
