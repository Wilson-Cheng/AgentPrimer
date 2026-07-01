/**
 * app/api/editor/preview/route.ts
 * ---------------------------------------------------------------------------
 * GET /api/editor/preview?path=<relative>
 *
 * Inline-serves a file from the agent data directory with the correct
 * Content-Type for browser preview. Differs from /api/editor/download in
 * exactly one header: `Content-Disposition: inline` instead of `attachment`,
 * so the browser renders the file inside an <iframe> / <img> instead of
 * dropping it into the downloads folder.
 *
 * Why a separate endpoint?
 *   • /api/editor/file returns JSON ({ content, path }) — useless for binary
 *     previews like images or PDFs and not directly usable as an <iframe src>.
 *   • /api/workspace/<absolute-path> exists but expects an absolute filesystem
 *     path; the editor works with paths relative to data/. Translating in the
 *     client would leak the deployment root (varies between /app on Docker
 *     and /workspaces/AgentPrimer in dev). Keeping a relative-path endpoint
 *     beside the other /api/editor/* helpers is the principled choice.
 *
 * Path-safety mirrors the rest of /api/editor/* — the resolved path must
 * stay inside DATA_ROOT.
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { Readable } from 'stream';
import { ReadableStream as WebReadableStream } from 'stream/web';
import { resolveDataPath } from '@/lib/path-security';
import {
  activePreviewContentSecurityPolicy,
  injectPreviewStorageShim,
  isActivePreviewContentType,
} from '@/lib/preview-security';

export const runtime = 'nodejs';

// Same small extension→MIME map the workspace route uses, scoped to the
// file types the editor preview pane actually renders.
const MIME: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

function contentTypeFor(filePath: string): string {
  const ext = filePath.toLowerCase().split('.').pop() ?? '';
  return MIME[ext] ?? 'application/octet-stream';
}

export async function GET(request: NextRequest) {
  const rel = request.nextUrl.searchParams.get('path') ?? '';
  const abs = resolveDataPath(rel);
  if (!abs || !fs.existsSync(abs))
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  let stat: fs.Stats;
  try {
    stat = fs.statSync(abs);
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  if (!stat.isFile()) {
    return NextResponse.json({ error: 'not a file' }, { status: 400 });
  }

  const contentType = contentTypeFor(abs);
  const rawContent = contentType.startsWith('text/html') ? fs.readFileSync(abs, 'utf8') : null;
  const body = rawContent === null ? null : injectPreviewStorageShim(contentType, rawContent);
  const contentLength = body === null ? stat.size : Buffer.byteLength(body);
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Content-Length': String(contentLength),
    'Content-Disposition': 'inline',
    // Disable any intermediate caching — after a save we want the new
    // bytes immediately, even if the URL is identical. The frontend
    // additionally appends a `?v=<refreshKey>` query param to defeat
    // browser back/forward caches.
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'X-Content-Type-Options': 'nosniff',
  };

  if (isActivePreviewContentType(contentType)) {
    headers['Content-Security-Policy'] = activePreviewContentSecurityPolicy(request.nextUrl.origin);
  }

  if (body !== null) {
    return new Response(body, {
      status: 200,
      headers,
    });
  }

  const nodeStream = fs.createReadStream(abs);
  const webStream = Readable.toWeb(nodeStream) as WebReadableStream<Uint8Array>;
  return new Response(webStream as unknown as ReadableStream<Uint8Array>, {
    status: 200,
    headers,
  });
}
