import { readMemory, writeMemory } from '@/lib/memory';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const agent = request.nextUrl.searchParams.get('agent') || undefined;
  const content = readMemory(agent);
  return NextResponse.json({ content });
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  if (typeof body.content !== 'string') return NextResponse.json({ error: 'content required' }, { status: 400 });
  const agent = typeof body.agent === 'string' && body.agent.trim() ? body.agent : undefined;
  writeMemory(body.content, agent);
  return NextResponse.json({ ok: true });
}
