import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanProject, remember, status } from '../src/core.js';
import { searchMemory } from '../src/search.js';
import { checkStaleMemory, refreshMemory, setMemoryLifecycle } from '../src/stale.js';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-lifecycle-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ type: 'module' }));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'policy.js'), 'export const retryLimit = 3;\n');
  await scanProject(root);
  return root;
}

test('inactive knowledge is preserved as history but excluded from trusted retrieval by default', async () => {
  const root = await fixture();
  const entry = await remember(root, 'decision', 'Checkout retries use a limit of three.', { sources: ['src/policy.js'] });

  let results = await searchMemory(root, 'checkout retries');
  assert.ok(results.some((item) => item.metadata?.id === entry.id));

  const lifecycle = await setMemoryLifecycle(root, entry.id, 'deprecated', { changedBy: 'reviewer', reason: 'Retry policy was replaced.' });
  assert.equal(lifecycle.state, 'deprecated');

  results = await searchMemory(root, 'checkout retries');
  assert.ok(!results.some((item) => item.metadata?.id === entry.id));

  const historical = await searchMemory(root, 'checkout retries', 10, { includeInactive: true, stalePolicy: 'include' });
  const deprecated = historical.find((item) => item.metadata?.id === entry.id);
  assert.equal(deprecated.metadata.knowledgeState, 'deprecated');
  assert.equal(deprecated.metadata.lifecycle.changedBy, 'reviewer');

  const health = await checkStaleMemory(root);
  assert.equal(health.counts.inactive, 1);
  assert.equal(health.entries.find((item) => item.id === entry.id).status, 'inactive');
  assert.equal((await status(root)).healthy, true);
  await assert.rejects(() => refreshMemory(root, entry.id), /reactivate it explicitly/i);
});

test('supersession requires a distinct active replacement and records the full replacement id', async () => {
  const root = await fixture();
  const oldEntry = await remember(root, 'fact', 'The retry limit is three.', { sources: ['src/policy.js'] });
  const replacement = await remember(root, 'fact', 'The retry limit is configurable.', { sources: ['src/policy.js'] });

  await assert.rejects(() => setMemoryLifecycle(root, oldEntry.id, 'superseded', { reason: 'New fact replaces it.' }), /replacement memory id/i);
  await assert.rejects(() => setMemoryLifecycle(root, oldEntry.id, 'superseded', { reason: 'Invalid self replacement.', supersededBy: oldEntry.id }), /supersede itself/i);

  const result = await setMemoryLifecycle(root, oldEntry.id.slice(0, 12), 'superseded', { changedBy: 'reviewer', reason: 'New fact is more general.', supersededBy: replacement.id.slice(0, 12) });
  assert.equal(result.supersededBy, replacement.id);

  const health = await checkStaleMemory(root);
  const oldHealth = health.entries.find((item) => item.id === oldEntry.id);
  assert.equal(oldHealth.lifecycleState, 'superseded');
  assert.equal(oldHealth.lifecycle.supersededBy, replacement.id);

  await setMemoryLifecycle(root, replacement.id, 'rejected', { reason: 'Replacement was later disproven.' });
  await setMemoryLifecycle(root, oldEntry.id, 'active', { reason: 'Restore the prior reviewed fact.' });
  const restored = await searchMemory(root, 'retry limit', 10, { stalePolicy: 'include' });
  assert.ok(restored.some((item) => item.metadata?.id === oldEntry.id));
  assert.ok(!restored.some((item) => item.metadata?.id === replacement.id));
});

test('memory mutations reject ambiguous id prefixes instead of editing multiple entries', async () => {
  const root = await fixture();
  const memoryPath = path.join(root, '.codex-memory', 'memory.md');
  const firstId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const secondId = 'aaaaaaab-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const now = new Date().toISOString();
  const first = `\n## ${now}\n\n<!-- cmi-meta:${JSON.stringify({ id: firstId, type: 'fact', createdAt: now, sources: [], sourceHashes: {}, projectHash: null })} -->\n\nFirst ambiguous fact.\n`;
  const second = `\n## ${new Date(Date.now() + 1).toISOString()}\n\n<!-- cmi-meta:${JSON.stringify({ id: secondId, type: 'fact', createdAt: now, sources: [], sourceHashes: {}, projectHash: null })} -->\n\nSecond ambiguous fact.\n`;
  await fs.appendFile(memoryPath, `${first}${second}`, 'utf8');

  await assert.rejects(() => refreshMemory(root, 'aaaa'), /ambiguous/i);
  await assert.rejects(() => setMemoryLifecycle(root, 'aaaa', 'rejected', { reason: 'Should not select multiple entries.' }), /ambiguous/i);
});
