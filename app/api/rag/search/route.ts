import { NextResponse } from 'next/server';
import { retrieveChunks } from '@/lib/rag';
import { getSessionUser } from '@/lib/auth';

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { query?: string; top_k?: number } | null;
  if (!body?.query || typeof body.query !== 'string' || !body.query.trim()) {
    return NextResponse.json({ error: 'query is required' }, { status: 400 });
  }

  const topK = Math.min(Math.max(1, Number(body.top_k) || 5), 20);
  const chunks = await retrieveChunks(body.query.trim(), topK);
  return NextResponse.json({ chunks });
}
