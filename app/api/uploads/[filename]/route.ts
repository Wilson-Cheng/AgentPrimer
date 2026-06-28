import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { DATA_DIR } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

export const runtime = 'nodejs';

const ACTIVE_CONTENT_EXTENSIONS = new Set(['.html', '.htm', '.svg', '.xml']);

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { filename } = await params;
  const safeName = path.basename(filename); // prevent path traversal
  const filePath = path.join(DATA_DIR, 'uploads', safeName);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(safeName).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
    '.flac': 'audio/flac', '.aac': 'audio/aac', '.opus': 'audio/opus',
    '.pdf': 'application/pdf', '.json': 'application/json',
    '.txt': 'text/plain', '.md': 'text/markdown', '.csv': 'text/csv',
    '.html': 'text/html', '.xml': 'text/xml',
  };
  const isActiveContent = ACTIVE_CONTENT_EXTENSIONS.has(ext);
  const contentType = isActiveContent ? 'application/octet-stream' : mimeMap[ext] ?? 'application/octet-stream';
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Cache-Control': 'private, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  };

  if (isActiveContent) {
    headers['Content-Disposition'] = `attachment; filename="${safeName}"`;
  }

  return new NextResponse(buffer, {
    headers,
  });
}
