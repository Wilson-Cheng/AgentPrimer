/**
 * app/api/upload/route.ts
 * ---------------------------------------------------------------------------
 * File upload handler.
 * Accepts multipart/form-data with a "file" field.
 * Saves the file to /data/uploads/ and returns a URL to access it.
 *
 * Files in /data are on the persistent volume so uploads survive restarts.
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { DATA_DIR } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

export const runtime = 'nodejs';

const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB (images, audio, video)

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await request.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });

  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File exceeds 100 MB limit' }, { status: 413 });
  }

  // Sanitize filename
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const timestamp = Date.now();
  const filename = `${timestamp}_${safeName}`;
  const filePath = path.join(UPLOADS_DIR, filename);

  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(filePath, buffer);

  return NextResponse.json({
    ok: true,
    name: file.name,
    url: `/api/uploads/${filename}`,
    mime: file.type,
    size: file.size,
  });
}
