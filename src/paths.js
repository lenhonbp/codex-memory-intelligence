import fs from 'node:fs/promises';
import path from 'node:path';

function slash(value) {
  return value.split(path.sep).join('/');
}

export function isPathInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return Boolean(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

export async function resolveProjectFile(root, source) {
  const rootAbsolute = path.resolve(root);
  const raw = String(source ?? '').trim();
  if (!raw) return { ok: false, code: 'empty', reason: 'Source path is empty.' };

  const candidate = path.resolve(rootAbsolute, raw);
  if (!isPathInside(rootAbsolute, candidate)) {
    return { ok: false, code: 'outside', reason: `Source escapes the project: ${source}` };
  }

  let stat;
  try {
    stat = await fs.lstat(candidate);
  } catch (error) {
    if (error?.code === 'ENOENT') return { ok: false, code: 'missing', reason: `Source does not exist: ${source}` };
    return { ok: false, code: 'unreadable', reason: `Source cannot be inspected: ${source}` };
  }

  if (stat.isSymbolicLink()) {
    return { ok: false, code: 'symlink', reason: `Symbolic-link sources are not allowed: ${source}` };
  }
  if (!stat.isFile()) {
    return { ok: false, code: 'not-file', reason: `Source must be a regular file: ${source}` };
  }

  let realRoot = rootAbsolute;
  let realCandidate = candidate;
  try {
    realRoot = await fs.realpath(rootAbsolute);
    realCandidate = await fs.realpath(candidate);
  } catch {
    return { ok: false, code: 'unreadable', reason: `Source cannot be resolved safely: ${source}` };
  }

  if (!isPathInside(realRoot, realCandidate)) {
    return { ok: false, code: 'outside', reason: `Resolved source escapes the project: ${source}` };
  }

  return {
    ok: true,
    absolute: realCandidate,
    relative: slash(path.relative(rootAbsolute, candidate)),
    size: stat.size,
    modifiedAt: stat.mtime.toISOString(),
  };
}
