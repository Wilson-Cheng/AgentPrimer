import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { DATA_ROOT, resolveDataPath } from '@/lib/path-security';

export const runtime = 'nodejs';

/** GET /api/editor/files?path=<relative>  – list directory.
 *  Empty / missing `path` means "list the data root". `resolveDataPath('')`
 *  returns null (the path-security helper rejects empty strings as a defence
 *  against path-traversal sentinels), so we normalize the root case to `'.'`
 *  before resolving.
 */
export async function GET(request: NextRequest) {
  const rel = request.nextUrl.searchParams.get('path') ?? '';
  const abs = resolveDataPath(rel || '.');
  if (!abs || !fs.existsSync(abs)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  try {
    const stat = fs.statSync(abs);
    if (!stat.isDirectory()) return NextResponse.json({ error: 'not a directory' }, { status: 400 });

    const entries = fs.readdirSync(abs, { withFileTypes: true }).flatMap(e => {
      const fullPath = path.join(abs, e.name);
      const resolved = resolveDataPath(path.relative(DATA_ROOT, fullPath));
      if (!resolved) return [];
      return [{
        name: e.name,
        isDir: e.isDirectory(),
        path: path.relative(DATA_ROOT, resolved),
      }];
    });

    entries.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({ entries, path: path.relative(DATA_ROOT, abs) });
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
}

/** POST /api/editor/files  – create directory */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { path: rel } = body as { path?: string };
  if (!rel) return NextResponse.json({ error: 'path required' }, { status: 400 });

  const abs = resolveDataPath(rel);
  if (!abs) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  fs.mkdirSync(abs, { recursive: true });
  return NextResponse.json({ ok: true });
}
