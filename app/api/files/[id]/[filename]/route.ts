/**
 * app/api/files/[id]/[filename]/route.ts
 * ---------------------------------------------------------------------------
 * Serves files that the agent wrote via the send_file tool.
 *
 * Files live at  data/agent-files/<id>/<filename>
 *
 * The route is auth-gated so only logged-in users can download agent output.
 * Files are immutable once written so we set a long cache lifetime.
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { AGENT_FILES_DIR, detectMimeType } from '@/lib/agent-files';
import { getSessionUser } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; filename: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, filename } = await params;

  // Security: prevent path traversal in both segments
  const safeId = id.replace(/[^a-zA-Z0-9\-]/g, '');
  const safeFilename = path.basename(decodeURIComponent(filename));

  if (!safeId || !safeFilename) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  const filePath = path.join(AGENT_FILES_DIR, safeId, safeFilename);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const buffer = fs.readFileSync(filePath);
  const mimeType = detectMimeType(safeFilename);
  const disposition = /^(text\/html|image\/svg\+xml|text\/xml|application\/xml)/i.test(mimeType)
    ? 'attachment'
    : 'inline';

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': mimeType,
      'Content-Disposition': `${disposition}; filename="${safeFilename}"`,
      'Content-Length': String(buffer.length),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
