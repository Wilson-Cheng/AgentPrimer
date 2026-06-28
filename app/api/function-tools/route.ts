/**
 * app/api/function-tools/route.ts
 * ---------------------------------------------------------------------------
 * Function Tools management API.
 *
 * Function tools follow the OpenAI function-calling spec. Each tool is a
 * directory containing function.json (schema) + index.js (implementation).
 *
 * GET    /api/function-tools  → list all registered + discovered function tools
 * POST   /api/function-tools  → register a function tool (install or discover)
 * DELETE /api/function-tools  → unregister a function tool
 * PATCH  /api/function-tools  → toggle enabled/disabled
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { listFunctionTools, upsertFunctionTool, deleteFunctionTool, setFunctionToolEnabled } from '@/lib/db';
import { isInsideRoot } from '@/lib/path-security';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';

const FUNCTION_TOOLS_ROOT = path.resolve(/* turbopackIgnore: true */ process.cwd(), 'data', 'function-tools');

// GET /api/function-tools – list all registered + discovered function tools
export async function GET() {
  const registered = listFunctionTools().map(ft => {
    let manifest: Record<string, unknown> = {};
    try { manifest = JSON.parse(ft.manifest_json); } catch { /* ignore parse errors */ }
    return {
      id: ft.id,
      name: ft.name,
      github_url: ft.github_url,
      local_path: ft.local_path,
      enabled: ft.enabled,
      registered: true,
      description: (manifest.description as string) ?? '',
      parameters: manifest.parameters ?? {},
      type: 'function_tool',
      source: ft.github_url.startsWith('builtin:') ? 'built-in' : 'installed',
    };
  });

  // Discover unregistered function tools in data/function-tools/<name>/function.json
  const registeredPaths = new Set(listFunctionTools().map(ft => ft.local_path));
  const toolsDir = path.join(/* turbopackIgnore: true */ process.cwd(), 'data', 'function-tools');
  const discovered: Array<Record<string, unknown>> = [];

  if (fs.existsSync(toolsDir)) {
    for (const entry of fs.readdirSync(toolsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(toolsDir, entry.name);
      if (registeredPaths.has(dir)) continue;
      const manifestPath = path.join(dir, 'function.json');
      if (!fs.existsSync(manifestPath)) continue;
      try {
        const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        if (!raw.name) continue;
        discovered.push({
          id: null,
          name: raw.name,
          description: raw.description ?? '',
          parameters: raw.parameters ?? {},
          github_url: `local://${raw.name}`,
          local_path: dir,
          enabled: 0,
          type: 'function_tool',
          source: 'discovered',
        });
      } catch {
        // skip malformed manifests
      }
    }
  }

  const all = [...registered, ...discovered];
  all.sort((a, b) => (a.name as string).localeCompare(b.name as string));
  return NextResponse.json({ functionTools: all });
}

// POST /api/function-tools – register a function tool from a local directory
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { localPath, name } = body as { localPath?: string; name?: string };

  if (!localPath || !name) {
    return NextResponse.json({ error: 'localPath and name are required' }, { status: 400 });
  }

  const dir = path.resolve(localPath);
  if (!isInsideRoot(FUNCTION_TOOLS_ROOT, dir)) {
    return NextResponse.json({ error: 'Local function tools must be inside data/function-tools' }, { status: 403 });
  }

  const manifestPath = path.join(dir, 'function.json');
  const indexPath = path.join(dir, 'index.js');
  if (!fs.existsSync(manifestPath) || !fs.existsSync(indexPath)) {
    return NextResponse.json({ error: 'Directory must contain function.json and index.js' }, { status: 422 });
  }

  let manifest: Record<string, unknown>;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')); }
  catch { return NextResponse.json({ error: 'Invalid function.json' }, { status: 422 }); }

  if (!manifest.name) {
    return NextResponse.json({ error: 'function.json must have a name field' }, { status: 422 });
  }

  upsertFunctionTool({
    id: randomUUID(),
    name: manifest.name as string,
    github_url: `local://${manifest.name}`,
    local_path: dir,
    enabled: 1,
    manifest_json: JSON.stringify(manifest),
  });

  return NextResponse.json({ ok: true, name: manifest.name }, { status: 201 });
}

// DELETE /api/function-tools?id=<id> – unregister a function tool
export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  deleteFunctionTool(id);
  return NextResponse.json({ ok: true });
}

// PATCH /api/function-tools – toggle enabled/disabled
export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { id, enabled } = body as { id?: string; enabled?: boolean };
  if (!id || enabled === undefined) {
    return NextResponse.json({ error: 'id and enabled required' }, { status: 400 });
  }
  setFunctionToolEnabled(id, enabled);
  return NextResponse.json({ ok: true });
}
