/**
 * app/api/workspace/route.ts
 * ---------------------------------------------------------------------------
 * PUT /api/workspace?path=<absDataPath> – write content to a preview file.
 *
 * GET is handled by the catch-all at /api/workspace/[...slug]/route.ts.
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getSessionUser } from '@/lib/auth';
import { resolveAgentPath } from '@/lib/path-security';

export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { path: filePath, content } = (await req.json()) as { path: string; content: string };
  if (!filePath || typeof content !== 'string') {
    return NextResponse.json({ error: 'path and content are required' }, { status: 400 });
  }

  const resolved = resolveAgentPath(filePath);
  if (!resolved) {
    return NextResponse.json({ error: 'Path not allowed' }, { status: 403 });
  }

  try {
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, content, 'utf8');
    return NextResponse.json({ ok: true, path: resolved });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
