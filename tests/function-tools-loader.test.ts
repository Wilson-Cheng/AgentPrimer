import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let tempDir: string;

async function loadModules() {
  vi.resetModules();
  const loader = await import('../lib/function-tools-loader');
  const db     = await import('../lib/db');
  return { ...loader, ...db };
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentprimer-fntools-'));
  fs.mkdirSync(path.join(tempDir, 'lib'), { recursive: true });
  // Copy the real worker so spawn() can require it from the temp cwd
  fs.copyFileSync(
    path.resolve(__dirname, '..', 'lib', 'function-tool-worker.js'),
    path.join(tempDir, 'lib', 'function-tool-worker.js'),
  );
  vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

// Helper: register one function tool whose index.js exports the given source.
function registerTool(upsert: (ft: {
  id: string; name: string; github_url: string; local_path: string;
  enabled: number; manifest_json: string;
}) => void, opts: {
  name: string;
  manifest: object;
  indexJs: string;
  enabled?: number;
}) {
  const toolDir = path.join(tempDir, 'data', 'function-tools', opts.name);
  fs.mkdirSync(toolDir, { recursive: true });
  fs.writeFileSync(path.join(toolDir, 'function.json'), JSON.stringify(opts.manifest), 'utf-8');
  fs.writeFileSync(path.join(toolDir, 'index.js'), opts.indexJs, 'utf-8');
  upsert({
    id: `ft-${opts.name}`,
    name: opts.name,
    github_url: `local://${opts.name}`,
    local_path: toolDir,
    enabled: opts.enabled ?? 1,
    manifest_json: JSON.stringify(opts.manifest),
  });
  return toolDir;
}

describe('function-tools-loader', () => {
  it('loads enabled function tools and skips disabled ones', async () => {
    const { loadFunctionTools, upsertFunctionTool } = await loadModules();
    registerTool(upsertFunctionTool, {
      name: 'echo',
      manifest: {
        name: 'echo',
        description: 'Echo back the input',
        parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
      },
      indexJs: `module.exports = { async echo({ text }) { return { echoed: text }; } };`,
    });
    registerTool(upsertFunctionTool, {
      name: 'disabled-tool',
      manifest: {
        name: 'disabled_tool',
        description: 'Should not appear',
        parameters: { type: 'object', properties: {} },
      },
      indexJs: `module.exports = { async disabled_tool() { return {}; } };`,
      enabled: 0,
    });

    const tools = loadFunctionTools('all');
    expect(Object.keys(tools)).toEqual(['echo']);
    expect(typeof tools.echo.execute).toBe('function');
    expect(tools.echo.description).toBe('Echo back the input');
  });

  it('filters function tools by name (per-agent allow-list)', async () => {
    const { loadFunctionTools, upsertFunctionTool } = await loadModules();
    registerTool(upsertFunctionTool, {
      name: 'alpha',
      manifest: { name: 'alpha', description: 'A', parameters: { type: 'object', properties: {} } },
      indexJs: `module.exports = { async alpha() { return {}; } };`,
    });
    registerTool(upsertFunctionTool, {
      name: 'beta',
      manifest: { name: 'beta', description: 'B', parameters: { type: 'object', properties: {} } },
      indexJs: `module.exports = { async beta() { return {}; } };`,
    });

    expect(Object.keys(loadFunctionTools(['alpha']))).toEqual(['alpha']);
    expect(Object.keys(loadFunctionTools(['beta']))).toEqual(['beta']);
    expect(Object.keys(loadFunctionTools('all')).sort()).toEqual(['alpha', 'beta']);
  });

  it('supports the multi-function `functions: [...]` manifest format', async () => {
    const { loadFunctionTools, upsertFunctionTool } = await loadModules();
    registerTool(upsertFunctionTool, {
      name: 'mathkit',
      manifest: {
        functions: [
          { name: 'add', description: 'Add two numbers', parameters: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } } } },
          { name: 'sub', description: 'Subtract',          parameters: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } } } },
        ],
      },
      indexJs: `module.exports = {
        async add({ a, b }) { return { result: a + b }; },
        async sub({ a, b }) { return { result: a - b }; },
      };`,
    });

    const tools = loadFunctionTools('all');
    expect(Object.keys(tools).sort()).toEqual(['add', 'sub']);
    expect(tools.add.description).toBe('Add two numbers');
    expect(tools.sub.description).toBe('Subtract');
  });

  it('execute() runs the tool in a subprocess and returns the result', async () => {
    const { loadFunctionTools, upsertFunctionTool } = await loadModules();
    registerTool(upsertFunctionTool, {
      name: 'multiply',
      manifest: {
        name: 'multiply',
        description: 'Multiply two integers',
        parameters: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } }, required: ['a', 'b'] },
      },
      indexJs: `module.exports = { async multiply({ a, b }) { return { product: a * b }; } };`,
    });

    const tools = loadFunctionTools('all');
    const result = await tools.multiply.execute({ a: 6, b: 7 });
    expect(result).toEqual({ product: 42 });
  });

  it('execute() surfaces errors thrown by the function tool', async () => {
    const { loadFunctionTools, upsertFunctionTool } = await loadModules();
    registerTool(upsertFunctionTool, {
      name: 'thrower',
      manifest: {
        name: 'thrower',
        description: 'Always throws',
        parameters: { type: 'object', properties: {} },
      },
      indexJs: `module.exports = { async thrower() { throw new Error('boom'); } };`,
    });

    const tools = loadFunctionTools('all');
    await expect(tools.thrower.execute({})).rejects.toThrow(/boom/);
  });

  it('execute() rejects when the requested function name is missing', async () => {
    const { loadFunctionTools, upsertFunctionTool } = await loadModules();
    registerTool(upsertFunctionTool, {
      name: 'mismatch',
      manifest: {
        name: 'declared_name',
        description: 'Declared but not exported',
        parameters: { type: 'object', properties: {} },
      },
      // No matching export — worker should return an error
      indexJs: `module.exports = { async other_name() { return {}; } };`,
    });

    const tools = loadFunctionTools('all');
    await expect(tools.declared_name.execute({})).rejects.toThrow(/not found/i);
  });

  it('execute() does not expose application secrets through inherited env', async () => {
    const { loadFunctionTools, upsertFunctionTool } = await loadModules();
    vi.stubEnv('AGENT_PRIMER_SECRET', 'super-secret-value');
    registerTool(upsertFunctionTool, {
      name: 'envcheck',
      manifest: {
        name: 'envcheck',
        description: 'Check env',
        parameters: { type: 'object', properties: {} },
      },
      indexJs: `module.exports = { async envcheck() { return { secret: process.env.AGENT_PRIMER_SECRET || null }; } };`,
    });

    const tools = loadFunctionTools('all');
    await expect(tools.envcheck.execute({})).resolves.toEqual({ secret: null });
  });

  it('skips function tools whose manifest_json is unparseable', async () => {
    const { loadFunctionTools, upsertFunctionTool } = await loadModules();
    const toolDir = path.join(tempDir, 'data', 'function-tools', 'broken');
    fs.mkdirSync(toolDir, { recursive: true });
    upsertFunctionTool({
      id: 'ft-broken',
      name: 'broken',
      github_url: 'local://broken',
      local_path: toolDir,
      enabled: 1,
      manifest_json: '{ not valid json',
    });

    // Silence the warn so test output stays clean
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tools = loadFunctionTools('all');
    expect(Object.keys(tools)).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
  });
});
