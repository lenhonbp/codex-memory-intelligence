import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function readLease(target) {
  let handle;
  try {
    const noFollow = typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0;
    handle = await fs.open(target, fsConstants.O_RDONLY | noFollow);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 16_384) return null;
    const value = JSON.parse(await handle.readFile('utf8'));
    return value && typeof value.ownerId === 'string' ? { ...value, mtimeMs: stat.mtimeMs } : null;
  } catch { return null; }
  finally { await handle?.close().catch(() => {}); }
}

async function removeIfOwned(target, ownerId) {
  const current = await readLease(target);
  if (!current || current.ownerId !== ownerId) return false;
  await fs.rm(target, { force: true }).catch(() => {});
  return true;
}

export async function acquireLeaseLock(target, options = {}) {
  const staleMs = Math.max(50, Number(options.staleMs) || 30_000);
  const retries = Math.max(0, Number(options.retries) || 80);
  const retryMs = Math.max(1, Number(options.retryMs) || 15);
  await fs.mkdir(path.dirname(target), { recursive: true });
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const ownerId = crypto.randomUUID();
    try {
      const handle = await fs.open(target, 'wx', 0o600);
      const createdAt = new Date().toISOString();
      await handle.writeFile(`${JSON.stringify({ ownerId, pid: process.pid, createdAt })}\n`, 'utf8');
      const heartbeatMs = Math.max(25, Math.floor(staleMs / 3));
      const heartbeat = setInterval(() => {
        const now = new Date();
        handle.utimes(now, now).catch(() => {});
      }, heartbeatMs);
      heartbeat.unref?.();
      return { target, ownerId, handle, heartbeat, staleMs };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const observed = await readLease(target);
      if (!observed) {
        await sleep(retryMs);
        continue;
      }
      if (Date.now() - observed.mtimeMs > staleMs) {
        await sleep(2);
        const confirmed = await readLease(target);
        if (confirmed?.ownerId === observed.ownerId && Date.now() - confirmed.mtimeMs > staleMs) {
          await removeIfOwned(target, observed.ownerId);
          continue;
        }
      }
      if (attempt >= retries) throw new Error(`Timed out waiting for lock: ${path.basename(target)}`);
      await sleep(retryMs + Math.min(100, attempt));
    }
  }
  throw new Error(`Unable to acquire lock: ${path.basename(target)}`);
}

export async function releaseLeaseLock(lock) {
  if (!lock) return;
  clearInterval(lock.heartbeat);
  await removeIfOwned(lock.target, lock.ownerId);
  await lock.handle?.close().catch(() => {});
}

export async function withLeaseLock(target, operation, options = {}) {
  const lock = await acquireLeaseLock(target, options);
  try { return await operation(lock); }
  finally { await releaseLeaseLock(lock); }
}
