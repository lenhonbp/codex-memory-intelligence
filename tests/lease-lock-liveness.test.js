import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { acquireLeaseLock, releaseLeaseLock } from '../src/lease-lock.js';

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function lockTarget() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-lease-liveness-'));
  return path.join(root, 'lease.lock');
}

test('a live owner cannot be reclaimed solely because its heartbeat timer is delayed', async () => {
  const target = await lockTarget();
  const first = await acquireLeaseLock(target, { staleMs: 50, retries: 1, retryMs: 5 });
  clearInterval(first.heartbeat);
  await sleep(90);

  try {
    await assert.rejects(
      () => acquireLeaseLock(target, { staleMs: 50, retries: 1, retryMs: 5 }),
      /timed out/i,
    );
  } finally {
    await releaseLeaseLock(first);
  }
});

test('an actually abandoned stale lease remains reclaimable', async () => {
  const target = await lockTarget();
  await fs.writeFile(target, `${JSON.stringify({ ownerId: 'abandoned-owner', pid: 2147483647, createdAt: new Date(0).toISOString() })}\n`);
  const old = new Date(Date.now() - 5_000);
  await fs.utimes(target, old, old);

  const replacement = await acquireLeaseLock(target, { staleMs: 50, retries: 2, retryMs: 5 });
  try {
    assert.notEqual(replacement.ownerId, 'abandoned-owner');
    const current = JSON.parse(await fs.readFile(target, 'utf8'));
    assert.equal(current.ownerId, replacement.ownerId);
  } finally {
    await releaseLeaseLock(replacement);
  }
});
