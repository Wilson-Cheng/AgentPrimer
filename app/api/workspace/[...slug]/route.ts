/**
 * app/api/workspace/[...slug]/route.ts
 * ---------------------------------------------------------------------------
 * GET /api/workspace/<absolute-data-path-segments>
 *
 * Serves preview files from DATA_ROOT using path segments so that relative URLs
 * inside generated HTML files (./game.js, ../style.css) resolve correctly.
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getSessionUser } from '@/lib/auth';
import { ACTIVE_PREVIEW_CONTENT_SECURITY_POLICY, isActivePreviewContentType } from '@/lib/preview-security';
import { DATA_ROOT, isInsideRoot } from '@/lib/path-security';

const PREVIEW_ROOT = path.resolve(DATA_ROOT);
// Simple extension→MIME map for common types the preview panel serves
const MIME: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  htm:  'text/html; charset=utf-8',
  css:  'text/css; charset=utf-8',
  js:   'text/javascript; charset=utf-8',
  mjs:  'text/javascript; charset=utf-8',
  ts:   'text/typescript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  svg:  'image/svg+xml',
  png:  'image/png',
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  gif:  'image/gif',
  webp: 'image/webp',
  ico:  'image/x-icon',
  pdf:  'application/pdf',
  txt:  'text/plain; charset=utf-8',
  md:   'text/plain; charset=utf-8',
  csv:  'text/csv; charset=utf-8',
  xml:  'text/xml; charset=utf-8',
  wasm: 'application/wasm',
  mp4:  'video/mp4',
  webm: 'video/webm',
  ogg:  'audio/ogg',
  mp3:  'audio/mpeg',
  wav:  'audio/wav',
  woff: 'font/woff',
  woff2:'font/woff2',
  ttf:  'font/ttf',
};

function getMime(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return MIME[ext] ?? 'application/octet-stream';
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  // Require a valid session
  const user = await getSessionUser();
  if (!user) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const { slug } = await params;
  if (!slug?.length) {
    return new NextResponse('Not Found', { status: 404 });
  }

  // Reconstruct the absolute path from URL segments
  const filePath = path.normalize('/' + slug.join('/'));

  if (!isInsideRoot(PREVIEW_ROOT, filePath)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  if (!fs.existsSync(filePath)) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const realPath = fs.realpathSync(filePath);
  if (!isInsideRoot(PREVIEW_ROOT, realPath)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const stats = fs.statSync(realPath);
  if (!stats.isFile()) {
    return new NextResponse('Not a file', { status: 400 });
  }

  const content = fs.readFileSync(realPath);
  const contentType = getMime(realPath);
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Content-Length': String(stats.size),
    // Allow iframe embedding from same origin; no caching so edits show immediately
    'Cache-Control': 'no-store',
    'X-Frame-Options': 'SAMEORIGIN',
    'X-Content-Type-Options': 'nosniff',
  };

  if (isActivePreviewContentType(contentType)) {
    headers['Content-Security-Policy'] = ACTIVE_PREVIEW_CONTENT_SECURITY_POLICY;
  }

  return new NextResponse(content, {
    headers,
  });
}
