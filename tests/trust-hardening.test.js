import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanProject, remember, status, doctor } from '../src/core.js';
import { loadMemory, searchMemory, buildContextPack } from '../src/search.js';

test('stale durable memory is labeled, demoted by default, and can be explicitly included or excluded', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-trust-memory-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ type: 'module' }));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  const source = path.join(root, 'src', 'policy.js');
  await fs.writeFile(source, 'export const retryPolicy = "three-attempts";\n');
  await scanProject(root);
  const metadata = await remember(root, 'decision', 'Checkout retries use the three-attempts policy.', { sources: ['src/policy.js'] });

  let results = await searchMemory(root, 'checkout retries', 10);
  const fresh = results.find((item) => item.metadata?.id === metadata.id);
  assert.equal(fresh.metadata.evidenceStatus, 'reviewed-current');

  await fs.writeFile(source, 'export const retryPolicy = "five-attempts";\n');
  const demotedResults = await searchMemory(root, 'checkout retries', 10);
  const demoted = demotedResults.find((item) => item.metadata?.id === metadata.id);
  assert.equal(demoted.metadata.evidenceStatus, 'stale');
  assert.ok(demoted.metadata.staleReasons.some((reason) => /source changed/i.test(reason)));

  const includedResults = await searchMemory(root, 'checkout retries', 10, { stalePolicy: 'include' });
  const included = includedResults.find((item) => item.metadata?.id === metadata.id);
  assert.equal(included.metadata.evidenceStatus, 'stale');
  assert.ok(included.score > demoted.score);

  const excluded = await searchMemory(root, 'checkout retries', 10, { stalePolicy: 'exclude' });
  assert.ok(!excluded.some((item) => item.metadata?.id === metadata.id));
});

test('stale graph nodes are not returned as current graph evidence and health surfaces the drift', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-trust-graph-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ type: 'module' }));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  const source = path.join(root, 'src', 'service.js');
  await fs.writeFile(source, 'export function oldService() { return true; }\n');
  await scanProject(root);

  const before = await loadMemory(root, { withHealth: true });
  assert.equal(before.graphHealth.current, true);
  assert.equal((await status(root)).healthy, true);
  assert.ok(before.chunks.some((item) => item.kind === 'graph' && item.metadata.path === 'src/service.js'));

  await fs.writeFile(source, 'export function newService() { return true; }\n');
  const after = await loadMemory(root, { withHealth: true });
  assert.equal(after.graphHealth.current, false);
  assert.equal(after.graphHealth.staleNodes, 1);
  assert.ok(!after.chunks.some((item) => item.kind === 'graph' && item.metadata.path === 'src/service.js'));

  const projectStatus = await status(root);
  assert.equal(projectStatus.healthy, false);
  assert.equal(projectStatus.graphHealth.current, false);
  assert.equal(projectStatus.graphHealth.staleNodes, 1);

  const diagnostic = await doctor(root);
  assert.equal(diagnostic.healthy, true);
  assert.ok(diagnostic.checks.some((check) => check.name === 'graph-health' && check.status === 'warn'));

  const context = await buildContextPack(root, 'service', 10);
  assert.equal(context.health.graph.current, false);
  assert.equal(context.health.graph.staleNodes, 1);
});
