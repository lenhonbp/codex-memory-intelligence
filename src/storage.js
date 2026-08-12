import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const MEMORY_DIR = '.codex-memory';
export const DEFAULT_MAX_DURABLE_BYTES = 1_000_000;
export const DEFAULT_MAX_GENERATED_CACHE_BYTES = 64 * 1024 * 1024;

function unsafe(reason) {
  const error = new Error(`Unsafe CMI storage: ${reason}`);
  error.code = 'CMI_UNSAFE_STORAGE';
  return error;
}

function normalizeRelative(value) {
  const raw = String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (!raw || raw.startsWith('/') || /^[A-Za-z]:\//.test(raw)) throw unsafe(`invalid durable path: ${value}`);
  const parts = raw.split('/').filter(Boolean);
  if (!parts.length || parts.some((part) => part === '.' || part === '..')) throw unsafe(`durable path escapes storage root: ${value}`);
  return parts.join('/');
}

function inside(base, candidate) {
  const relative = path.relative(base, candidate);
  return Boolean(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

export async function ensureSafeMemoryRoot(root, options = {}) {
  const rootAbsolute = path.resolve(root);
  const memory = path.join(rootAbsolute, MEMORY_DIR);
  let stat = null;
  try { stat = await fs.lstat(memory); }
  catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    if (!options.create) return null;
    try { await fs.mkdir(memory, { mode: 0o700 }); }
    catch (mkdirError) { if (mkdirError?.code !== 'EEXIST') throw mkdirError; }
    stat = await fs.lstat(memory);
  }
  if (stat.isSymbolicLink()) throw unsafe(`${MEMORY_DIR} must not be a symbolic link.`);
  if (!stat.isDirectory()) throw unsafe(`${MEMORY_DIR} must be a directory.`);
  const [realRoot, realMemory] = await Promise.all([fs.realpath(rootAbsolute), fs.realpath(memory)]);
  if (!inside(realRoot, realMemory)) throw unsafe(`${MEMORY_DIR} resolves outside the project.`);
  return memory;
}

export async function safeEnsureMemoryDir(root, relative) {
  const memory = await ensureSafeMemoryRoot(root, { create: true });
  let current = memory;
  for (const part of normalizeRelative(relative).split('/')) {
    current = path.join(current, part);
    try { await fs.mkdir(current, { mode: 0o700 }); }
    catch (error) { if (error?.code !== 'EEXIST') throw error; }
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw unsafe(`durable directory is not a safe directory: ${relative}`);
    const realMemory = await fs.realpath(memory);
    const realCurrent = await fs.realpath(current);
    if (!inside(realMemory, realCurrent)) throw unsafe(`durable directory escapes storage root: ${relative}`);
  }
  return current;
}

async function resolveSafeFile(root, relative, options = {}) {
  const normalized = normalizeRelative(relative);
  const parent = path.posix.dirname(normalized);
  const memory = await ensureSafeMemoryRoot(root, { create: Boolean(options.createParent) });
  if (!memory) return null;
  if (parent && parent !== '.') {
    if (options.createParent) await safeEnsureMemoryDir(root, parent);
    else {
      let current = memory;
      for (const part of parent.split('/')) {
        current = path.join(current, part);
        const stat = await fs.lstat(current);
        if (stat.isSymbolicLink() || !stat.isDirectory()) throw unsafe(`unsafe durable parent: ${parent}`);
      }
    }
  }
  const target = path.join(memory, ...normalized.split('/'));
  if (!inside(memory, target)) throw unsafe(`durable file escapes storage root: ${relative}`);
  return target;
}

async function openNoFollow(target, flags, mode) {
  const noFollow = typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0;
  try { return await fs.open(target, flags | noFollow, mode); }
  catch (error) {
    if (!noFollow || !['EINVAL', 'ENOTSUP'].includes(error?.code)) throw error;
    return fs.open(target, flags, mode);
  }
}

export async function safeReadMemoryFile(root, relative, options = {}) {
  const target = await resolveSafeFile(root, relative, { createParent: false }).catch((error) => {
    if (options.optional && error?.code === 'ENOENT') return null;
    throw error;
  });
  if (!target) return null;
  let handle;
  try {
    const before = await fs.lstat(target);
    if (before.isSymbolicLink() || !before.isFile()) throw unsafe(`durable file is not a regular file: ${relative}`);
    const maxBytes = Number(options.maxBytes) || DEFAULT_MAX_DURABLE_BYTES;
    if (before.size > maxBytes) throw unsafe(`durable file exceeds ${maxBytes} bytes: ${relative}`);
    handle = await openNoFollow(target, fsConstants.O_RDONLY);
    const opened = await handle.stat();
    if (!opened.isFile() || opened.size > maxBytes) throw unsafe(`durable file changed or is oversized: ${relative}`);
    if (before.dev !== opened.dev || before.ino !== opened.ino) throw unsafe(`durable file identity changed while opening: ${relative}`);
    return await handle.readFile(options.encoding || 'utf8');
  } catch (error) {
    if (options.optional && error?.code === 'ENOENT') return null;
    throw error;
  } finally { await handle?.close().catch(() => {}); }
}

export async function safeReadMemoryJson(root, relative, options = {}) {
  const text = await safeReadMemoryFile(root, relative, options);
  return text === null ? null : JSON.parse(text);
}

async function existingTargetStat(target, relative) {
  try {
    const stat = await fs.lstat(target);
    if (stat.isSymbolicLink() || !stat.isFile()) throw unsafe(`durable write target is not a regular file: ${relative}`);
    return stat;
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeAndCloseOrCleanup(handle, target, content, encoding) {
  try {
    await handle.writeFile(content, encoding);
    await handle.close();
  } catch (error) {
    await handle.close().catch(() => {});
    await fs.rm(target, { force: true }).catch(() => {});
    throw error;
  }
}

export async function safeWriteMemoryFile(root, relative, content, options = {}) {
  const target = await resolveSafeFile(root, relative, { createParent: true });
  const existingStat = await existingTargetStat(target, relative);
  const exists = Boolean(existingStat);
  if (options.ifMissing && exists) return false;
  if (options.ifMissing) {
    const handle = await openNoFollow(target, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL, 0o600);
    await writeAndCloseOrCleanup(handle, target, content, options.encoding || 'utf8');
    return true;
  }
  const temporary = `${target}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  const tempHandle = await fs.open(temporary, 'wx', 0o600);
  await writeAndCloseOrCleanup(tempHandle, temporary, content, options.encoding || 'utf8');
  try {
    await fs.rename(temporary, target);
  } catch (error) {
    if (!exists || !['EEXIST', 'EPERM'].includes(error?.code)) {
      await fs.rm(temporary, { force: true }).catch(() => {});
      throw error;
    }
    const backup = `${target}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.bak`;
    let moved = false;
    try {
      await fs.rename(target, backup);
      moved = true;
      await fs.rename(temporary, target);
      await fs.rm(backup, { force: true });
    } catch (fallbackError) {
      await fs.rm(temporary, { force: true }).catch(() => {});
      if (moved) {
        const targetExists = await fs.lstat(target).then(() => true).catch(() => false);
        if (!targetExists) await fs.rename(backup, target).catch(() => {});
      }
      throw fallbackError;
    }
  }
  return true;
}

export async function safeAppendMemoryFile(root, relative, content) {
  const target = await resolveSafeFile(root, relative, { createParent: true });
  const before = await existingTargetStat(target, relative);
  const exists = Boolean(before);
  const flags = fsConstants.O_WRONLY | fsConstants.O_APPEND | (exists ? 0 : fsConstants.O_CREAT) | (exists ? 0 : fsConstants.O_EXCL);
  const handle = await openNoFollow(target, flags, 0o600);
  try {
    const opened = await handle.stat();
    if (!opened.isFile()) throw unsafe(`durable append target is not a regular file: ${relative}`);
    if (before && (before.dev !== opened.dev || before.ino !== opened.ino)) throw unsafe(`durable append target identity changed while opening: ${relative}`);
    await handle.writeFile(content, 'utf8');
  } finally { await handle.close(); }
}

export async function safeListMemoryDir(root, relative) {
  const directory = await safeEnsureMemoryDir(root, relative);
  return fs.readdir(directory);
}
