import { NextRequest } from 'next/server';
import fs from 'fs';
import { Readable } from 'stream';
import { ReadableStream as WebReadableStream } from 'stream/web';
import { resolveDataPath } from '@/lib/path-security';
import { ACTIVE_PREVIEW_CONTENT_SECURITY_POLICY, isActivePreviewContentType } from '@/lib/preview-security';

export const runtime = 'nodejs';

const MIME: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  htm:  'text/html; charset=utf-8',
  css:  'text/css; charset=utf-8',
  js:   'text/javascript; charset=utf-8',
  mjs:  'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  md:   'text/markdown; charset=utf-8',
  svg:  'image/svg+xml',
  png:  'image/png',
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  gif:  'image/gif',
  webp: 'image/webp',
  ico:  'image/x-icon',
  pdf:  'application/pdf',
  txt:  'text/plain; charset=utf-8',
  wasm: 'application/wasm',
};

function contentTypeFor(filePath: string): string {
  const ext = filePath.toLowerCase().split('.').pop() ?? '';
  return MIME[ext] ?? 'application/octet-stream';
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: pathParts } = await params;
  const rel = pathParts?.join('/') ?? '';
  const abs = resolveDataPath(rel);
  if (!abs || !fs.existsSync(abs)) return new Response('Forbidden', { status: 403 });

  let stat: fs.Stats;
  try {
    stat = fs.statSync(abs);
  } catch {
    return new Response('Not Found', { status: 404 });
  }

  if (!stat.isFile()) return new Response('Not a file', { status: 400 });

  const nodeStream = fs.createReadStream(abs);
  const webStream = Readable.toWeb(nodeStream) as WebReadableStream<Uint8Array>;
  const contentType = contentTypeFor(abs);
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Content-Length': String(stat.size),
    'Content-Disposition': 'inline',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'X-Frame-Options': 'SAMEORIGIN',
    'X-Content-Type-Options': 'nosniff',
  };

  if (isActivePreviewContentType(contentType)) {
    headers['Content-Security-Policy'] = ACTIVE_PREVIEW_CONTENT_SECURITY_POLICY;
  }

  return new Response(webStream as unknown as ReadableStream<Uint8Array>, {
    status: 200,
    headers,
  });
}
