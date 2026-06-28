import { NextResponse } from 'next/server';
import { deleteSource } from '@/lib/rag';
import { getSessionUser } from '@/lib/auth';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const numId  = parseInt(id, 10);
  if (isNaN(numId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  deleteSource(numId);
  return NextResponse.json({ ok: true });
}
