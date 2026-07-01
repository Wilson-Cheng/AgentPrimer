import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { resolveDataPath } from '@/lib/path-security';

export const runtime = 'nodejs';

/** GET /api/editor/file?path=<relative>  – read file content */
export async function GET(request: NextRequest) {
  const rel = request.nextUrl.searchParams.get('path') ?? '';
  const abs = resolveDataPath(rel);
  if (!abs || !fs.existsSync(abs))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  try {
    const content = fs.readFileSync(abs, 'utf8');
    return NextResponse.json({ content, path: rel });
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
}

/** POST /api/editor/file  – write (create or overwrite) file */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { path: rel, content } = body as { path?: string; content?: string };
  if (!rel) return NextResponse.json({ error: 'path required' }, { status: 400 });

  const abs = resolveDataPath(rel);
  if (!abs) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content ?? '', 'utf8');
  return NextResponse.json({ ok: true, path: rel });
}

/** PATCH /api/editor/file  – rename file/directory */
export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { from, to } = body as { from?: string; to?: string };
  if (!from || !to) return NextResponse.json({ error: 'from and to required' }, { status: 400 });

  const absFrom = resolveDataPath(from);
  const absTo = resolveDataPath(to);
  if (!absFrom || !fs.existsSync(absFrom) || !absTo)
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  fs.renameSync(absFrom, absTo);
  return NextResponse.json({ ok: true });
}

/** DELETE /api/editor/file?path=<relative>  – delete file */
export async function DELETE(request: NextRequest) {
  const rel = request.nextUrl.searchParams.get('path') ?? '';
  const abs = resolveDataPath(rel);
  if (!abs || !fs.existsSync(abs))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  try {
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      fs.rmSync(abs, { recursive: true, force: true });
    } else {
      fs.unlinkSync(abs);
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
}
