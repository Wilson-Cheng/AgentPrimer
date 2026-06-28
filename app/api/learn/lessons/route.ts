import { NextResponse } from 'next/server';
import { LESSONS } from '@/lib/learn-curriculum';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({ lessons: LESSONS });
}
