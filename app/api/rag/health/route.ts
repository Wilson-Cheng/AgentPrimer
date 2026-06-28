import { NextResponse } from 'next/server';
import { checkEmbedHealth } from '@/lib/rag';
import { getSessionUser } from '@/lib/auth';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const health = await checkEmbedHealth();
  return NextResponse.json(health);
}
