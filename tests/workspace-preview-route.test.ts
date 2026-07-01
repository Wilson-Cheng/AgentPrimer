import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentprimer-preview-route-'));
  vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

async function loadWorkspaceRoute() {
  vi.resetModules();
  vi.doMock('../lib/auth', () => ({ getSessionUser: vi.fn(async () => 'admin') }));
  return import('../app/api/workspace/[...slug]/route');
}

describe('workspace preview route', () => {
  it('injects storage shim into React/Babel HTML previews before user scripts run', async () => {
    const projectDir = path.join(tempDir, 'data', 'projects', 'react-todo-demo');
    fs.mkdirSync(projectDir, { recursive: true });
    const htmlPath = path.join(projectDir, 'index.html');
    fs.writeFileSync(
      htmlPath,
      `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <script src="./react.production.min.js"></script>
  <script src="./react-dom.production.min.js"></script>
  <script src="./babel.min.js"></script>
</head>
<body>
  <div id="root"></div>
  <script type="text/plain" id="app-jsx">
    const STORAGE_KEY = "react-todo-demo:v1";
    localStorage.getItem(STORAGE_KEY);
  </script>
</body>
</html>`,
      'utf8',
    );

    const { GET } = await loadWorkspaceRoute();
    const slug = htmlPath.split(path.sep).filter(Boolean);
    const response = await GET(
      new NextRequest(`http://localhost:15432/api/workspace/${slug.join('/')}`),
      {
        params: Promise.resolve({ slug }),
      },
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-security-policy')).toContain("'unsafe-eval'");
    expect(body).toContain('Object.defineProperty(window,k');
    expect(body.indexOf('Object.defineProperty(window,k')).toBeLessThan(
      body.indexOf('<script src="./react.production.min.js">'),
    );
    expect(Number(response.headers.get('content-length'))).toBe(Buffer.byteLength(body));
  });
});
