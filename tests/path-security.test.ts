import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { resolveAgentPath, resolveDataPath, isInsideRoot, DATA_ROOT } from '../lib/path-security';

describe('resolveAgentPath', () => {
  it('accepts a relative path inside ./data/', () => {
    const result = resolveAgentPath('data/notes.md');
    expect(result).toBe(path.join(DATA_ROOT, 'notes.md'));
  });

  it('accepts a dot-prefixed relative path inside ./data/', () => {
    const result = resolveAgentPath('./data/.env');
    expect(result).toBe(path.join(DATA_ROOT, '.env'));
  });

  it('accepts an absolute path inside DATA_ROOT', () => {
    const target = path.join(DATA_ROOT, 'sub', 'file.txt');
    expect(resolveAgentPath(target)).toBe(target);
  });

  it('refuses a relative path that escapes via ../', () => {
    expect(resolveAgentPath('../etc/passwd')).toBeNull();
    expect(resolveAgentPath('data/../../../etc/passwd')).toBeNull();
  });

  it('refuses an absolute path outside DATA_ROOT', () => {
    expect(resolveAgentPath('/etc/passwd')).toBeNull();
    expect(resolveAgentPath('/tmp/evil.sh')).toBeNull();
  });

  it('refuses an absolute path that traverses out via ../', () => {
    expect(resolveAgentPath(path.join(DATA_ROOT, '..', '..', 'etc', 'passwd'))).toBeNull();
  });

  it('refuses a symlink that points outside DATA_ROOT', () => {
    fs.mkdirSync(DATA_ROOT, { recursive: true });
    const outside = path.join(path.dirname(DATA_ROOT), 'outside-secret.txt');
    const link = path.join(DATA_ROOT, 'outside-link.txt');
    fs.writeFileSync(outside, 'secret');
    fs.symlinkSync(outside, link);

    expect(resolveAgentPath(link)).toBeNull();
    expect(resolveDataPath('outside-link.txt')).toBeNull();

    fs.unlinkSync(link);
    fs.unlinkSync(outside);
  });

  it('refuses empty or non-string input', () => {
    expect(resolveAgentPath('')).toBeNull();
    // @ts-expect-error testing runtime guard
    expect(resolveAgentPath(null)).toBeNull();
    // @ts-expect-error testing runtime guard
    expect(resolveAgentPath(undefined)).toBeNull();
  });
});

describe('isInsideRoot', () => {
  it('returns true for an empty relative path (same as root)', () => {
    expect(isInsideRoot(DATA_ROOT, DATA_ROOT)).toBe(true);
  });

  it('returns true for direct children', () => {
    expect(isInsideRoot(DATA_ROOT, path.join(DATA_ROOT, 'a'))).toBe(true);
  });

  it('returns false for parents', () => {
    expect(isInsideRoot(DATA_ROOT, path.dirname(DATA_ROOT))).toBe(false);
  });
});

describe('resolveDataPath (legacy)', () => {
  it('resolves a path under DATA_ROOT', () => {
    expect(resolveDataPath('notes.md')).toBe(path.join(DATA_ROOT, 'notes.md'));
  });

  it('resolves a missing path under DATA_ROOT when the parent is safe', () => {
    expect(resolveDataPath('new-folder/new-file.txt')).toBe(
      path.join(DATA_ROOT, 'new-folder', 'new-file.txt'),
    );
  });

  it('refuses a missing path below an escaping symlink parent', () => {
    fs.mkdirSync(DATA_ROOT, { recursive: true });
    const outsideDir = path.join(path.dirname(DATA_ROOT), 'outside-dir');
    const link = path.join(DATA_ROOT, 'outside-dir-link');
    fs.mkdirSync(outsideDir, { recursive: true });
    fs.symlinkSync(outsideDir, link);

    expect(resolveDataPath('outside-dir-link/new-file.txt')).toBeNull();

    fs.unlinkSync(link);
    fs.rmSync(outsideDir, { recursive: true, force: true });
  });
});
