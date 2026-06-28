/**
 * app/api/editor/download/route.ts
 * ---------------------------------------------------------------------------
 * GET /api/editor/download?path=<relative>
 *
 * Streams a single file as an attachment, or a folder as a gzipped tarball.
 *
 * Path-safety mirrors the rest of /api/editor/* — the requested path is
 * resolved against DATA_ROOT and rejected if it escapes (path traversal).
 *
 * Why a hand-rolled tar writer instead of `npm install tar`?
 *   • The format is simple (POSIX ustar, 512-byte aligned blocks).
 *   • Avoids adding a dependency for a single endpoint.
 *   • Streams directly into gzip so very large folders don't buffer in memory.
 *
 * The browser-side trigger is a plain anchor click; the Content-Disposition
 * header tells the browser to show its native "Save As…" dialog when the
 * user has the relevant setting enabled, or save to the default download
 * location otherwise.
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { Readable } from 'stream';
import { ReadableStream as WebReadableStream } from 'stream/web';
import { resolveDataPath } from '@/lib/path-security';

export const runtime = 'nodejs';

/**
 * Build one POSIX `ustar` header block (512 bytes) for a file or directory.
 *
 * The fields we care about:
 *   name   100 bytes  – the path inside the archive
 *   mode   8 bytes    – octal, NUL-terminated
 *   uid    8 bytes    – octal
 *   gid    8 bytes    – octal
 *   size   12 bytes   – octal byte count (0 for directories)
 *   mtime  12 bytes   – octal Unix time
 *   chksum 8 bytes    – computed below, see RFC 9
 *   type   1 byte     – '0' = regular file, '5' = directory
 *   magic  6 bytes    – literal "ustar\0"
 *   ver    2 bytes    – literal "00"
 *
 * Everything else (linkname, uname, gname, devmajor/minor, prefix) is left
 * NUL-padded — the result is a valid ustar header that GNU tar, BSD tar,
 * and 7-Zip all accept.
 */
function makeTarHeader(name: string, size: number, mode: number, mtime: number, isDir: boolean): Buffer {
  const header = Buffer.alloc(512);

  // Truncate the name field at 100 chars (we don't bother with the `prefix`
  // extension because data/ paths are short). Append '/' for directories
  // per POSIX convention.
  let archiveName = name;
  if (isDir && !archiveName.endsWith('/')) archiveName += '/';
  if (archiveName.length > 100) archiveName = archiveName.slice(0, 100);
  header.write(archiveName, 0, 100, 'utf8');

  // Numeric fields are NUL-terminated octal ASCII, right-padded to width-1.
  const writeOctal = (value: number, offset: number, width: number) => {
    const str = value.toString(8).padStart(width - 1, '0');
    header.write(str + '\0', offset, width, 'ascii');
  };

  writeOctal(mode & 0o7777, 100, 8);
  writeOctal(0, 108, 8);                // uid
  writeOctal(0, 116, 8);                // gid
  writeOctal(isDir ? 0 : size, 124, 12);
  writeOctal(Math.floor(mtime), 136, 12);

  // Checksum field is filled with spaces while we sum, then back-written.
  header.fill(0x20, 148, 156);

  header.write(isDir ? '5' : '0', 156, 1, 'ascii');
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');

  let chksum = 0;
  for (let i = 0; i < 512; i++) chksum += header[i];
  writeOctal(chksum, 148, 8);

  return header;
}

/**
 * Recursively walk a directory, emitting [tarHeader, fileContents?] pairs
 * via a generator so we can pipe through gzip without buffering the whole
 * tree in memory. The final two empty 512-byte blocks (the POSIX tar end
 * marker) are yielded by `tarballGenerator()` below.
 *
 * `archivePrefix` is the path *inside* the tarball — when the user
 * downloads `data/projects/foo` we use `foo` as the root so the tarball
 * extracts cleanly into the user's chosen download location.
 */
function* walkForTar(absPath: string, archivePrefix: string): Generator<Buffer> {
  const stat = fs.statSync(absPath);

  if (stat.isDirectory()) {
    yield makeTarHeader(archivePrefix, 0, stat.mode, stat.mtimeMs / 1000, true);
    for (const entry of fs.readdirSync(absPath, { withFileTypes: true })) {
      yield* walkForTar(
        path.join(absPath, entry.name),
        path.posix.join(archivePrefix, entry.name),
      );
    }
    return;
  }

  // Regular file — emit header, then 512-byte-aligned contents.
  yield makeTarHeader(archivePrefix, stat.size, stat.mode, stat.mtimeMs / 1000, false);
  const data = fs.readFileSync(absPath);
  yield data;
  const padding = (512 - (data.length % 512)) % 512;
  if (padding > 0) yield Buffer.alloc(padding);
}

/** Wraps walkForTar() with the two-block POSIX end-of-archive marker. */
function* tarballGenerator(absPath: string, archivePrefix: string): Generator<Buffer> {
  yield* walkForTar(absPath, archivePrefix);
  yield Buffer.alloc(1024); // 2 × 512 NUL blocks
}

export async function GET(request: NextRequest) {
  const rel = request.nextUrl.searchParams.get('path') ?? '';
  const abs = resolveDataPath(rel);
  if (!abs || !fs.existsSync(abs)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  let stat: fs.Stats;
  try {
    stat = fs.statSync(abs);
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  // ── Single file: stream as a plain attachment ──────────────────────────
  if (stat.isFile()) {
    const filename = path.basename(abs);
    const nodeStream = fs.createReadStream(abs);
    const webStream = Readable.toWeb(nodeStream) as WebReadableStream<Uint8Array>;
    return new Response(webStream as unknown as ReadableStream<Uint8Array>, {
      status: 200,
      headers: {
        'Content-Type':        'application/octet-stream',
        'Content-Length':      String(stat.size),
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
        // Discourage proxies/CDNs from caching a personal download URL.
        'Cache-Control':       'no-store',
      },
    });
  }

  // ── Directory: build a gzipped tarball on the fly ──────────────────────
  if (stat.isDirectory()) {
    const folderName = path.basename(abs) || 'data';
    const tarballName = `${folderName}.tar.gz`;

    // Build a Node Readable that yields the tar bytes (including the
    // 1024-byte end-of-archive trailer), pipe through gzip, then bridge
    // to a Web ReadableStream for the Response constructor.
    const tarStream = Readable.from(tarballGenerator(abs, folderName));
    const gzipped   = tarStream.pipe(zlib.createGzip({ level: 6 }));
    const webStream = Readable.toWeb(gzipped) as WebReadableStream<Uint8Array>;

    return new Response(webStream as unknown as ReadableStream<Uint8Array>, {
      status: 200,
      headers: {
        'Content-Type':        'application/gzip',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(tarballName)}"`,
        'Cache-Control':       'no-store',
      },
    });
  }

  return NextResponse.json({ error: 'unsupported entry type' }, { status: 400 });
}
