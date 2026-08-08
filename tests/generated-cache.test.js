import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanProject, status } from '../src/core.js';
import { loadProjectGraph } from '../src/graph.js';
import { safeWriteMemoryFile, DEFAULT_MAX_DURABLE_BYTES, DEFAULT_MAX_GENERATED_CACHE_BYTES } from '../src/storage.js';

test('generated graph cache above durable-record limit remains readable under a separate bounded cache ceiling', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-large-cache-'));
  await fs.writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'src', 'index.js'), 'export const value = 1;\n');
  await scanProject(root);
  const graph = await loadProjectGraph(root);
  graph.externalDependencies = Array.from({ length: 42000 }, (_, index) => `generated-dependency-${index.toString().padStart(5, '0')}-xxxxxxxx`);
  graph.summary.externalDependencies = graph.externalDependencies.length;
  const serialized = `${JSON.stringify(graph, null, 2)}\n`;
  assert.ok(Buffer.byteLength(serialized) > DEFAULT_MAX_DURABLE_BYTES);
  assert.ok(Buffer.byteLength(serialized) < DEFAULT_MAX_GENERATED_CACHE_BYTES);
  await safeWriteMemoryFile(root, 'project-graph.json', serialized);
  const loaded = await loadProjectGraph(root);
  assert.equal(loaded.summary.externalDependencies, 42000);
  const current = await status(root);
  assert.equal(current.graphHealth.available, true);
  assert.equal(current.graphHealth.current, true);
  assert.equal(current.evidenceHealth.state, 'healthy');
});
