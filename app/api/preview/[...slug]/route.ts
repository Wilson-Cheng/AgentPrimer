/**
 * app/api/preview/[...slug]/route.ts
 * ---------------------------------------------------------------------------
 * GET /api/preview/<relative-path>
 *
 * Serves preview files from data/preview/ only. This route is intentionally
 * unauthenticated so that sandboxed iframes (opaque origin, no cookies) can
 * load subresources. The security boundary is the directory scope: every file
 * served lives under data/preview/, which is a throwaway mirror published by
 * the authenticated open_preview tool. Source code, the SQLite database,
 * memory files, and everything else under data/ are structurally unreachable.
 *
 * Path safety uses resolveInsideRoot which normalizes ../ sequences AND
 * resolves symlinks via realpath — a symlink inside data/preview/ pointing
 * outside is rejected.
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { resolvePreviewPath, PROJECTS_ROOT, PREVIEW_ROOT } from '@/lib/path-security';
import {
  activePreviewContentSecurityPolicy,
  injectPreviewStorageShim,
  isActivePreviewContentType,
} from '@/lib/preview-security';

const MIME: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  ts: 'text/typescript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  ico: 'image/x-icon',
  pdf: 'application/pdf',
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  xml: 'text/xml; charset=utf-8',
  wasm: 'application/wasm',
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
};

function getMime(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return MIME[ext] ?? 'application/octet-stream';
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  if (!slug?.length) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const rel = slug.join('/');
  let abs = resolvePreviewPath(rel);
  if (!abs || !fs.existsSync(abs)) {
    // On-demand staging: if the file isn't in data/preview/ yet but the
    // source project exists in data/projects/, copy it on the fly so
    // legacy preview history (old DB rows with data/projects/ paths)
    // keeps working without a manual re-open.
    const projectName = rel.split('/')[0];
    if (projectName && !projectName.includes('..')) {
      const srcDir = path.join(PROJECTS_ROOT, projectName);
      try {
        if (fs.existsSync(srcDir) && fs.statSync(srcDir).isDirectory()) {
          const destDir = path.join(PREVIEW_ROOT, projectName);
          fs.rmSync(destDir, { recursive: true, force: true });
          fs.cpSync(srcDir, destDir, { recursive: true });
          abs = resolvePreviewPath(rel);
        }
      } catch {
        // staging failed — fall through to 404
      }
    }
  }
  if (!abs || !fs.existsSync(abs)) {
    return new NextResponse('Not Found', { status: 404 });
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(abs);
  } catch {
    return new NextResponse('Not Found', { status: 404 });
  }
  if (!stat.isFile()) {
    return new NextResponse('Not a file', { status: 400 });
  }

  const contentType = getMime(abs);
  const rawContent = contentType.startsWith('text/html') ? fs.readFileSync(abs, 'utf8') : null;
  const body =
    rawContent === null ? fs.readFileSync(abs) : injectPreviewStorageShim(contentType, rawContent);
  const contentLength = typeof body === 'string' ? Buffer.byteLength(body) : stat.size;
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Content-Length': String(contentLength),
    'Cache-Control': 'no-store',
    'X-Frame-Options': 'SAMEORIGIN',
    'X-Content-Type-Options': 'nosniff',
  };

  if (isActivePreviewContentType(contentType)) {
    headers['Content-Security-Policy'] = activePreviewContentSecurityPolicy(req.nextUrl.origin);
  }

  return new NextResponse(body, { headers });
}
