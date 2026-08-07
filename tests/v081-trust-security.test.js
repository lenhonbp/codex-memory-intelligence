import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initProject, scanProject, status, doctor, remember } from '../src/core.js';
import { impactAnalysis } from '../src/graph.js';
import { loadMemory } from '../src/search.js';
import { refreshMemory, loadTrackedMemory, checkStaleMemory, setMemoryLifecycle } from '../src/stale.js';
import { acquireLeaseLock, releaseLeaseLock } from '../src/lease-lock.js';

async function project(prefix = 'cmi-v081-') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ type: 'module' }));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  return root;
}

test('truncated graph is current but incomplete and never reports healthy', async () => {
  const root = await project('cmi-v081-truncated-');
  await initProject(root);
  const configPath = path.join(root, '.codex-memory', 'config.json');
  const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  config.maxGraphFiles = 1;
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  await fs.writeFile(path.join(root, 'src', 'a.js'), 'export const a = 1;\n');
  await fs.writeFile(path.join(root, 'src', 'b.js'), 'export const b = 2;\n');
  const scan = await scanProject(root);
  assert.equal(scan.graph.truncated, true);
  const result = await status(root);
  assert.equal(result.graphHealth.current, true);
  assert.equal(result.graphHealth.complete, false);
  assert.equal(result.graphHealth.healthy, false);
  assert.equal(result.graphHealth.state, 'incomplete');
  assert.equal(result.healthy, false);
  const diagnostic = await doctor(root);
  assert.ok(diagnostic.checks.some((item) => item.name === 'graph-health' && item.status === 'warn' && /truncated=true/.test(item.detail)));
});

test('impact analysis fails closed when graph fingerprints are stale', async () => {
  const root = await project('cmi-v081-impact-');
  await fs.writeFile(path.join(root, 'src', 'base.js'), 'export const base = 1;\n');
  await fs.writeFile(path.join(root, 'src', 'user.js'), "import { base } from './base.js';\nexport const user = base;\n");
  await scanProject(root);
  const before = await impactAnalysis(root, 'src/base.js');
  assert.equal(before.found, true);
  assert.deepEqual(before.directDependents, ['src/user.js']);
  await fs.writeFile(path.join(root, 'src', 'user.js'), 'export const user = 2;\n');
  const after = await impactAnalysis(root, 'src/base.js');
  assert.equal(after.found, false);
  assert.equal(after.blocked, true);
  assert.equal(after.graphHealth.current, false);
  assert.match(after.reason, /graph is stale/i);
  assert.equal(after.recommendedAction.command, 'cmi scan');
});

test('symlinked .codex-memory root is rejected before durable writes escape project', async (t) => {
  const root = await project('cmi-v081-root-link-');
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-v081-outside-'));
  t.after(async () => { await fs.rm(root, { recursive: true, force: true }); await fs.rm(outside, { recursive: true, force: true }); });
  await fs.symlink(outside, path.join(root, '.codex-memory'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(() => initProject(root), /must not be a symbolic link/i);
  assert.deepEqual(await fs.readdir(outside), []);
});

test('symlinked durable Markdown is neither read nor appended', async (t) => {
  const root = await project('cmi-v081-markdown-link-');
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-v081-markdown-outside-'));
  t.after(async () => { await fs.rm(root, { recursive: true, force: true }); await fs.rm(outside, { recursive: true, force: true }); });
  await initProject(root);
  const outsideFile = path.join(outside, 'secret.md');
  await fs.writeFile(outsideFile, '# External\n\nDO-NOT-READ\n');
  const memoryFile = path.join(root, '.codex-memory', 'memory.md');
  await fs.rm(memoryFile);
  await fs.symlink(outsideFile, memoryFile, 'file');
  const loaded = await loadMemory(root, { withHealth: true });
  assert.ok(!loaded.chunks.some((chunk) => /DO-NOT-READ/.test(chunk.text)));
  await assert.rejects(() => remember(root, 'fact', 'Should not append through symlink.'), /unsafe cmi storage/i);
  assert.match(await fs.readFile(outsideFile, 'utf8'), /DO-NOT-READ/);
});

test('shared secret guard rejects representative token classes', async () => {
  const root = await project('cmi-v081-secret-');
  await scanProject(root);
  await assert.rejects(() => remember(root, 'fact', 'token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dGVzdHNpZ25hdHVyZQ'), /secret/i);
  await assert.rejects(() => remember(root, 'fact', 'npm_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKL012345'), /secret/i);
  await assert.rejects(() => remember(root, 'fact', 'Authorization: Bearer aB3dE5fG7hI9jK1mN3pQ5rS7tV9xY1z'), /secret/i);
});

test('refresh-memory updates source freshness without asserting semantic review', async () => {
  const root = await project('cmi-v081-refresh-');
  const source = path.join(root, 'src', 'policy.js');
  await fs.writeFile(source, 'export const limit = 3;\n');
  await scanProject(root);
  const entry = await remember(root, 'fact', 'Retry limit is three.', { sources: ['src/policy.js'] });
  await fs.writeFile(source, 'export const limit = 4;\n');
  const result = await refreshMemory(root, entry.id, { reviewedBy: 'legacy-caller', reason: 'Refresh fingerprint only.' });
  assert.equal(result.semanticReview, false);
  const tracked = (await loadTrackedMemory(root)).find((item) => item.metadata?.id === entry.id);
  assert.ok(tracked.metadata.sourceRefreshedAt);
  assert.equal(tracked.metadata.sourceRefreshedBy, 'legacy-caller');
  assert.equal(tracked.metadata.reviewedAt, undefined);
  assert.equal(tracked.metadata.reviewedBy, undefined);
});

test('explicit active lifecycle review updates semantic review provenance separately from source refresh', async () => {
  const root = await project('cmi-v081-semantic-review-');
  const source = path.join(root, 'src', 'policy.js');
  await fs.writeFile(source, 'export const policy = 1;\n');
  await scanProject(root);
  const entry = await remember(root, 'fact', 'Policy remains reviewed only after explicit attestation.', { sources: ['src/policy.js'] });
  await fs.writeFile(source, 'export const policy = 2;\n');
  await refreshMemory(root, entry.id, { refreshedBy: 'scanner', reason: 'Refresh fingerprints.' });
  let tracked = (await loadTrackedMemory(root)).find((item) => item.metadata?.id === entry.id);
  assert.equal(tracked.metadata.reviewedAt, undefined);
  const review = await setMemoryLifecycle(root, entry.id, 'active', { changedBy: 'reviewer', reason: 'Reviewed semantics after source update.' });
  assert.equal(review.state, 'active');
  tracked = (await loadTrackedMemory(root)).find((item) => item.metadata?.id === entry.id);
  assert.equal(tracked.metadata.reviewedBy, 'reviewer');
  assert.equal(tracked.metadata.reviewReason, 'Reviewed semantics after source update.');
  const health = await checkStaleMemory(root);
  assert.equal(health.counts.fresh, 1);
});

test('lease heartbeat prevents live lock reclamation and old owner cannot delete replacement lock', async () => {
  const root = await project('cmi-v081-lock-');
  const dir = path.join(root, '.codex-memory');
  await fs.mkdir(dir, { recursive: true });
  const target = path.join(dir, 'lease.lock');
  const first = await acquireLeaseLock(target, { staleMs: 60, retries: 2, retryMs: 10 });
  await new Promise((resolve) => setTimeout(resolve, 120));
  await assert.rejects(() => acquireLeaseLock(target, { staleMs: 60, retries: 2, retryMs: 5 }), /timed out/i);
  await fs.rm(target, { force: true });
  await fs.writeFile(target, `${JSON.stringify({ ownerId: 'replacement-owner', pid: 999, createdAt: new Date().toISOString() })}\n`);
  await releaseLeaseLock(first);
  const replacement = JSON.parse(await fs.readFile(target, 'utf8'));
  assert.equal(replacement.ownerId, 'replacement-owner');
});
