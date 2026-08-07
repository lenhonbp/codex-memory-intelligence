import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanProject, remember } from '../src/core.js';
import { loadMemory, searchMemory, buildContextPack } from '../src/search.js';

test('stale durable memory is labeled and can be excluded from retrieval', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-trust-memory-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ type: 'module' }));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  const source = path.join(root, 'src', 'policy.js');
  await fs.writeFile(source, 'export const retryPolicy = "three-attempts";\n');
  await scanProject(root);
  await remember(root, 'decision', 'Checkout retries use the three-attempts policy.', { sources: ['src/policy.js'] });

  let results = await searchMemory(root, 'checkout retries', 10);
  const fresh = results.find((item) => item.source === 'decisions.md');
  assert.equal(fresh.metadata.evidenceStatus, 'reviewed-current');

  await fs.writeFile(source, 'export const retryPolicy = "five-attempts";\n');
  results = await searchMemory(root, 'checkout retries', 10, { stalePolicy: 'include' });
  const stale = results.find((item) => item.source === 'decisions.md');
  assert.equal(stale.metadata.evidenceStatus, 'stale');
  assert.ok(stale.metadata.staleReasons.some((reason) => /source changed/i.test(reason)));

  const excluded = await searchMemory(root, 'checkout retries', 10, { stalePolicy: 'exclude' });
  assert.ok(!excluded.some((item) => item.source === 'decisions.md' && item.metadata?.id === stale.metadata.id));
});

test('stale graph nodes are not returned as current graph evidence', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-trust-graph-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ type: 'module' }));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  const source = path.join(root, 'src', 'service.js');
  await fs.writeFile(source, 'export function oldService() { return true; }\n');
  await scanProject(root);

  const before = await loadMemory(root, { withHealth: true });
  assert.equal(before.graphHealth.current, true);
  assert.ok(before.chunks.some((item) => item.kind === 'graph' && item.metadata.path === 'src/service.js'));

  await fs.writeFile(source, 'export function newService() { return true; }\n');
  const after = await loadMemory(root, { withHealth: true });
  assert.equal(after.graphHealth.current, false);
  assert.equal(after.graphHealth.staleNodes, 1);
  assert.ok(!after.chunks.some((item) => item.kind === 'graph' && item.metadata.path === 'src/service.js'));

  const context = await buildContextPack(root, 'service', 10);
  assert.equal(context.health.graph.current, false);
  assert.equal(context.health.graph.staleNodes, 1);
});
