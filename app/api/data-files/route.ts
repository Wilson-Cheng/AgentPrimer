/**
 * app/api/data-files/route.ts
 * ---------------------------------------------------------------------------
 * List, read, and write editable files in /data, including agent folders.
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { DATA_ROOT, resolveDataPath } from '@/lib/path-security';
import { AGENTS_DIR } from '@/lib/memory';
import { loadDataEnv } from '@/lib/bootstrap';
import { disconnectAll } from '@/lib/mcp-client';

export const runtime = 'nodejs';

function isValidTopLevelFile(name: string): boolean {
  return (
    name === '.env' ||
    name === '.ui-settings.json' ||
    (/^[a-zA-Z0-9_\- ]+\.md$/.test(name) && !name.includes('..'))
  );
}

function isValidAgentFile(name: string): boolean {
  return (
    /^agents\/[a-zA-Z0-9_\-]+\/[a-zA-Z0-9_\- /.]+\.(md|json)$/.test(name) &&
    !name.includes('..') &&
    !name.includes('\\') &&
    !name.split('/').some((part) => part === '')
  );
}

function isValidFile(name: string): boolean {
  return typeof name === 'string' && (isValidTopLevelFile(name) || isValidAgentFile(name));
}

const PINNED = ['system.md'];

function sortFiles(files: string[]): string[] {
  return [...files].sort((a, b) => {
    const ai = PINNED.indexOf(a);
    const bi = PINNED.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });
}

function listFilesRecursive(dir: string, prefix: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const result: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = path.join(prefix, entry.name);
    if (entry.isDirectory()) {
      result.push(...listFilesRecursive(abs, rel));
    } else if (/\.(md|json)$/.test(entry.name)) {
      result.push(rel);
    }
  }
  return result;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const file = searchParams.get('file');

  if (file) {
    if (!isValidFile(file)) {
      return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
    }
    const filePath = resolveDataPath(file);
    if (!filePath) return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
    if (!fs.existsSync(filePath)) return NextResponse.json({ content: '' });
    const content = fs.readFileSync(filePath, 'utf-8');
    return NextResponse.json({ content });
  }

  const entries = fs.readdirSync(DATA_ROOT, { withFileTypes: true });
  const topLevelFiles = entries
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => e.name);
  const agentFiles = listFilesRecursive(AGENTS_DIR, 'agents');
  return NextResponse.json({ files: sortFiles([...topLevelFiles, ...agentFiles]) });
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { file, content } = body;

  if (!isValidFile(file)) return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  if (typeof content !== 'string')
    return NextResponse.json({ error: 'content required' }, { status: 400 });

  const filePath = resolveDataPath(file);
  if (!filePath) return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');

  if (file === '.env') {
    loadDataEnv();
    await disconnectAll();
  }

  return NextResponse.json({ ok: true });
}
