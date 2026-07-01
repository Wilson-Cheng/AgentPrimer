import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentprimer-preview-api-'));
  vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

async function loadPreviewRoute() {
  vi.resetModules();
  return import('../app/api/preview/[...slug]/route');
}

describe('preview route /api/preview/[...slug]', () => {
  it('serves files from data/preview/ without authentication', async () => {
    fs.mkdirSync(path.join(tempDir, 'data', 'preview', 'myapp'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, 'data', 'preview', 'myapp', 'index.html'),
      '<!DOCTYPE html><html><body>Hello</body></html>',
    );

    const { GET } = await loadPreviewRoute();
    const response = await GET(
      new NextRequest('http://localhost:15432/api/preview/myapp/index.html'),
      { params: Promise.resolve({ slug: ['myapp', 'index.html'] }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
  });

  it('rejects path traversal with .. segments', async () => {
    fs.mkdirSync(path.join(tempDir, 'data', 'preview', 'myapp'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'data', 'db'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'data', 'db', 'agent.db'), 'secret-db');

    const { GET } = await loadPreviewRoute();
    const response = await GET(
      new NextRequest('http://localhost:15432/api/preview/myapp/../../db/agent.db'),
      { params: Promise.resolve({ slug: ['myapp', '..', '..', 'db', 'agent.db'] }) },
    );

    expect(response.status).toBe(404);
  });

  it('rejects symlink pointing outside data/preview/', async () => {
    fs.mkdirSync(path.join(tempDir, 'data', 'preview', 'myapp'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'data', 'db'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'data', 'db', 'agent.db'), 'secret-db');
    // Create a symlink inside preview that points to the database
    fs.symlinkSync(
      path.join(tempDir, 'data', 'db', 'agent.db'),
      path.join(tempDir, 'data', 'preview', 'myapp', 'leak.db'),
    );

    const { GET } = await loadPreviewRoute();
    const response = await GET(
      new NextRequest('http://localhost:15432/api/preview/myapp/leak.db'),
      { params: Promise.resolve({ slug: ['myapp', 'leak.db'] }) },
    );

    expect(response.status).toBe(404);
  });

  it('injects storage shim into HTML previews', async () => {
    fs.mkdirSync(path.join(tempDir, 'data', 'preview', 'myapp'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, 'data', 'preview', 'myapp', 'index.html'),
      '<!DOCTYPE html><html><head></head><body><script>localStorage.getItem("x")</script></body></html>',
    );

    const { GET } = await loadPreviewRoute();
    const response = await GET(
      new NextRequest('http://localhost:15432/api/preview/myapp/index.html'),
      { params: Promise.resolve({ slug: ['myapp', 'index.html'] }) },
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('Object.defineProperty(window,k');
  });

  it('serves non-HTML files as binary', async () => {
    fs.mkdirSync(path.join(tempDir, 'data', 'preview', 'myapp'), { recursive: true });
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    fs.writeFileSync(path.join(tempDir, 'data', 'preview', 'myapp', 'logo.png'), pngHeader);

    const { GET } = await loadPreviewRoute();
    const response = await GET(
      new NextRequest('http://localhost:15432/api/preview/myapp/logo.png'),
      { params: Promise.resolve({ slug: ['myapp', 'logo.png'] }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
  });
});
