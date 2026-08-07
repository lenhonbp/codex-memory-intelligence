import path from 'node:path';
import { safeEnsureMemoryDir } from './storage.js';
import { withLeaseLock } from './lease-lock.js';

const LOCK_STALE_MS = 30_000;
const LOCK_RETRIES = 80;
const LOCK_RETRY_MS = 15;

export async function withMemoryWriteLock(root, operation) {
  const snapshots = await safeEnsureMemoryDir(root, 'snapshots');
  const target = path.join(snapshots, '.memory-write.lock');
  return withLeaseLock(target, operation, { staleMs: LOCK_STALE_MS, retries: LOCK_RETRIES, retryMs: LOCK_RETRY_MS });
}
