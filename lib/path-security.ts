import fs from 'fs';
import path from 'path';

export const DATA_ROOT = path.join(/* turbopackIgnore: true */ process.cwd(), 'data');

export function isInsideRoot(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function realpathIfExists(p: string): string | null {
  try {
    return fs.realpathSync(p);
  } catch {
    return null;
  }
}

function nearestExistingPath(target: string): string | null {
  let current = target;
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  return current;
}

function resolvePathWithinRoot(root: string, target: string, allowMissingLeaf = false): string | null {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  if (!isInsideRoot(resolvedRoot, resolvedTarget)) return null;

  const rootReal = realpathIfExists(resolvedRoot);
  if (!rootReal) return resolvedTarget;

  const existing = nearestExistingPath(resolvedTarget);
  if (!existing) return null;

  const existingReal = realpathIfExists(existing);
  if (!existingReal || !isInsideRoot(rootReal, existingReal)) return null;

  if (fs.existsSync(resolvedTarget)) {
    const targetReal = realpathIfExists(resolvedTarget);
    return targetReal && isInsideRoot(rootReal, targetReal) ? targetReal : null;
  }

  if (!allowMissingLeaf) return null;
  const suffix = path.relative(existing, resolvedTarget);
  return path.resolve(existingReal, suffix);
}

export function resolveInsideRoot(root: string, relPath: string): string | null {
  if (!relPath || typeof relPath !== 'string') return null;
  const resolvedRoot = path.resolve(root);
  const sanitizedPath = relPath.replace(/^[\\/]+/, '');
  return resolvePathWithinRoot(resolvedRoot, path.resolve(resolvedRoot, sanitizedPath), true);
}

export function resolveDataPath(relPath: string): string | null {
  return resolveInsideRoot(DATA_ROOT, relPath);
}

export function resolveAgentPath(p: string): string | null {
  if (!p || typeof p !== 'string') return null;
  const absolute = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
  return resolvePathWithinRoot(DATA_ROOT, absolute, true);
}
