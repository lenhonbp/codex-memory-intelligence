import fs from 'node:fs/promises';
import path from 'node:path';

const MEMORY_DIR = '.codex-memory';
const LOCK_STALE_MS = 30_000;
const LOCK_RETRIES = 80;
const LOCK_RETRY_MS = 15;

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function lockPath(root) {
  return path.join(root, MEMORY_DIR, 'snapshots', '.memory-write.lock');
}

async function acquireLock(root) {
  const target = lockPath(root);
  await fs.mkdir(path.dirname(target), { recursive: true });
  for (let attempt = 0; attempt < LOCK_RETRIES; attempt += 1) {
    try {
      const handle = await fs.open(target, 'wx', 0o600);
      await handle.writeFile(`${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`, 'utf8');
      return { target, handle };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      let stat = null;
      try { stat = await fs.stat(target); } catch {}
      if (!stat) continue;
      if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
        await fs.rm(target, { force: true }).catch(() => {});
        continue;
      }
      await sleep(LOCK_RETRY_MS + Math.min(60, attempt));
    }
  }
  throw new Error('Timed out waiting for the durable-memory write lock. Another local CMI writer may still be active.');
}

export async function withMemoryWriteLock(root, operation) {
  const lock = await acquireLock(root);
  try {
    return await operation();
  } finally {
    await lock.handle.close().catch(() => {});
    await fs.rm(lock.target, { force: true }).catch(() => {});
  }
}
