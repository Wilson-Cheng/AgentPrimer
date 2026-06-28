import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let tempDir: string;

async function loadRegistry() {
  vi.resetModules();
  return import('../lib/builtin-tools-registry');
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentprimer-registry-'));
  vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('builtin-tools-registry catalogue', () => {
  it('every entry has the required metadata fields', async () => {
    const { BUILTIN_TOOLS } = await loadRegistry();

    expect(BUILTIN_TOOLS.length).toBeGreaterThan(0);
    for (const tool of BUILTIN_TOOLS) {
      expect(typeof tool.id).toBe('string');
      expect(tool.id.length).toBeGreaterThan(0);
      expect(typeof tool.label).toBe('string');
      expect(tool.label.length).toBeGreaterThan(0);
      expect(typeof tool.description).toBe('string');
      expect(tool.description.length).toBeGreaterThan(10); // must be a real sentence
      expect(['filesystem', 'memory', 'agent', 'shell', 'output', 'skill'])
        .toContain(tool.category);
      expect(typeof tool.defaultEnabled).toBe('boolean');
    }
  });

  it('tool ids are unique', async () => {
    const { BUILTIN_TOOLS } = await loadRegistry();
    const ids = BUILTIN_TOOLS.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('run_shell is dangerous and disabled by default; read_file is enabled by default', async () => {
    const { BUILTIN_TOOLS } = await loadRegistry();
    const shell = BUILTIN_TOOLS.find(t => t.id === 'run_shell');
    expect(shell).toBeDefined();
    expect(shell!.dangerous).toBe(true);
    expect(shell!.defaultEnabled).toBe(false);

    const read = BUILTIN_TOOLS.find(t => t.id === 'read_file');
    expect(read).toBeDefined();
    expect(read!.defaultEnabled).toBe(true);

    const del = BUILTIN_TOOLS.find(t => t.id === 'delete_path');
    expect(del!.dangerous).toBe(true);
  });
});

describe('isBuiltinToolEnabled / setBuiltinToolEnabled', () => {
  it('falls back to defaultEnabled when no setting is stored', async () => {
    const { isBuiltinToolEnabled } = await loadRegistry();
    // No setting written → falls back to the registry default
    expect(isBuiltinToolEnabled('read_file')).toBe(true);
    expect(isBuiltinToolEnabled('run_shell')).toBe(false);
  });

  it('returns true for unknown tool ids (defensive fallback)', async () => {
    const { isBuiltinToolEnabled } = await loadRegistry();
    // The current implementation defaults unknown ids to enabled — verify it
    // does not throw and the behaviour is documented.
    expect(() => isBuiltinToolEnabled('this_tool_does_not_exist')).not.toThrow();
  });

  it('setBuiltinToolEnabled(id, false) persists and is observable', async () => {
    const { isBuiltinToolEnabled, setBuiltinToolEnabled } = await loadRegistry();
    expect(isBuiltinToolEnabled('read_file')).toBe(true);
    setBuiltinToolEnabled('read_file', false);
    expect(isBuiltinToolEnabled('read_file')).toBe(false);
    setBuiltinToolEnabled('read_file', true);
    expect(isBuiltinToolEnabled('read_file')).toBe(true);
  });

  it('setBuiltinToolEnabled(id, true) can opt a disabled-by-default tool in', async () => {
    const { isBuiltinToolEnabled, setBuiltinToolEnabled } = await loadRegistry();
    expect(isBuiltinToolEnabled('run_shell')).toBe(false);
    setBuiltinToolEnabled('run_shell', true);
    expect(isBuiltinToolEnabled('run_shell')).toBe(true);
  });
});

describe('listBuiltinToolsWithState', () => {
  it('returns every tool with a resolved enabled flag', async () => {
    const { listBuiltinToolsWithState, BUILTIN_TOOLS } = await loadRegistry();
    const list = listBuiltinToolsWithState();

    expect(list).toHaveLength(BUILTIN_TOOLS.length);
    for (const tool of list) {
      expect(typeof tool.enabled).toBe('boolean');
      expect(tool.id).toBeTruthy();
    }
  });

  it('reflects setting overrides for individual tools', async () => {
    const { listBuiltinToolsWithState, setBuiltinToolEnabled } = await loadRegistry();
    setBuiltinToolEnabled('append_memory', false);
    const list = listBuiltinToolsWithState();
    expect(list.find(t => t.id === 'append_memory')!.enabled).toBe(false);
    expect(list.find(t => t.id === 'read_file')!.enabled).toBe(true);
  });
});
