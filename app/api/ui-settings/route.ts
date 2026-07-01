/**
 * app/api/ui-settings/route.ts
 * ---------------------------------------------------------------------------
 * Reads and writes UI preferences to data/.ui-settings.json.
 * These are lightweight client-side preferences (sidebar group collapse state,
 * new-chat layout order/visibility) that don't belong in the main DB.
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

const FILE_PATH = path.join(/* turbopackIgnore: true */ process.cwd(), 'data', '.ui-settings.json');

function readSettings(): Record<string, unknown> {
  try {
    if (fs.existsSync(FILE_PATH)) {
      return JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
    }
  } catch {
    /* ignore parse errors */
  }
  return {};
}

function writeSettings(data: Record<string, unknown>): void {
  fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// GET /api/ui-settings – returns all UI settings
export async function GET() {
  return NextResponse.json(readSettings());
}

// PATCH /api/ui-settings – merges provided keys into existing settings
export async function PATCH(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const current = readSettings();
  const merged = { ...current, ...body };
  writeSettings(merged);
  return NextResponse.json(merged);
}
