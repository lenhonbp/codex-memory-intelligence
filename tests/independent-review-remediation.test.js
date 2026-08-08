import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanProject, remember, status } from '../src/core.js';
import { loadProjectGraph, inspectProjectGraphHealth, impactAnalysis } from '../src/graph.js';
import { searchMemory } from '../src/search.js';
import { refreshMemory, setMemoryLifecycle } from '../src/stale.js';

async function rootFixture(prefix = 'cmi-review-remediation-') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture', type: 'module' }));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  return root;
}

test('graph freshness fails closed when a new source file appears after scan', async () => {
  const root = await rootFixture();
  await fs.writeFile(path.join(root, 'src', 'a.js'), 'export const a = 1;\n');
  await scanProject(root);
  assert.equal((await inspectProjectGraphHealth(root)).current, true);

  await fs.writeFile(path.join(root, 'src', 'new.js'), 'export const added = true;\n');
  const health = await inspectProjectGraphHealth(root);
  assert.equal(health.current, false);
  assert.equal(health.sourceSetChanged, true);

  const impact = await impactAnalysis(root, 'src/new.js');
  assert.equal(impact.blocked, true);
  assert.match(impact.reason, /stale|discovery inputs changed/i);
});

test('graph freshness detects resolver configuration drift before impact can lie', async () => {
  const root = await rootFixture();
  await fs.mkdir(path.join(root, 'src', 'one'), { recursive: true });
  await fs.mkdir(path.join(root, 'src', 'two'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'one', 'util.ts'), 'export const util = 1;\n');
  await fs.writeFile(path.join(root, 'src', 'two', 'util.ts'), 'export const util = 2;\n');
  await fs.writeFile(path.join(root, 'src', 'app.ts'), "import { util } from '@app/util';\nexport const value = util;\n");
  await fs.writeFile(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@app/*': ['src/one/*'] } } }));
  await scanProject(root);
  let graph = await loadProjectGraph(root);
  assert.equal(graph.nodes.find((node) => node.path === 'src/app.ts').imports[0].resolved, 'src/one/util.ts');

  await fs.writeFile(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@app/*': ['src/two/*'] } } }));
  const health = await inspectProjectGraphHealth(root);
  assert.equal(health.current, false);
  assert.equal(health.resolverInputsChanged, true);
  assert.equal((await impactAnalysis(root, 'util')).blocked, true);
});

test('source freshness never impersonates semantic review', async () => {
  const root = await rootFixture();
  const source = path.join(root, 'src', 'policy.js');
  await fs.writeFile(source, 'export const policy = "v1";\n');
  await scanProject(root);
  const memory = await remember(root, 'fact', 'The policy module defines the active policy.', { sources: ['src/policy.js'] });

  let result = (await searchMemory(root, 'active policy', 10)).find((item) => item.metadata?.id === memory.id);
  assert.equal(result.metadata.evidenceStatus, 'fresh-source');
  assert.equal(result.metadata.semanticReviewCurrent, false);

  await setMemoryLifecycle(root, memory.id, 'active', { changedBy: 'human-reviewer', reason: 'Reviewed source and fact together.' });
  result = (await searchMemory(root, 'active policy', 10)).find((item) => item.metadata?.id === memory.id);
  assert.equal(result.metadata.evidenceStatus, 'reviewed-current');
  assert.equal(result.metadata.semanticReviewCurrent, true);

  await fs.writeFile(source, 'export const policy = "v2";\n');
  await refreshMemory(root, memory.id, { refreshedBy: 'test-agent', reason: 'Refresh source fingerprint only.' });
  result = (await searchMemory(root, 'active policy', 10)).find((item) => item.metadata?.id === memory.id);
  assert.equal(result.metadata.evidenceStatus, 'fresh-source');
  assert.equal(result.metadata.semanticReviewCurrent, false);
});

test('oversized durable memory is visible as blocked evidence and cannot participate in search', async () => {
  const root = await rootFixture();
  await fs.writeFile(path.join(root, 'src', 'a.js'), 'export const a = 1;\n');
  await scanProject(root);
  await fs.writeFile(path.join(root, '.codex-memory', 'memory.md'), `# Project Memory\n${'x'.repeat(1_000_100)}`);

  const project = await status(root);
  assert.equal(project.healthy, false);
  assert.equal(project.memoryHealth.blocked, 1);
  assert.equal(project.evidenceHealth.blocked, true);
  assert.equal(project.evidenceHealth.domains.memory.state, 'blocked');
  await assert.rejects(() => searchMemory(root, 'anything'), (error) => error?.code === 'CMI_MEMORY_BLOCKED');
});

test('heuristic parser rejects JS comment/string imports and resolves reviewed Python/Rust edge cases', async () => {
  const root = await rootFixture();
  await fs.writeFile(path.join(root, 'src', 'fake.js'), 'export const fake = true;\n');
  await fs.writeFile(path.join(root, 'src', 'js.js'), [
    "// import './fake.js'",
    "const example = \"import './fake.js'\";",
    'export const ok = example.length;',
    '',
  ].join('\n'));

  await fs.mkdir(path.join(root, 'src', 'pkg'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'pkg', '__init__.py'), '');
  await fs.writeFile(path.join(root, 'src', 'pkg', 'util.py'), 'VALUE = 1\n');
  await fs.writeFile(path.join(root, 'src', 'pkg', 'consumer.py'), 'from . import util\n');

  await fs.writeFile(path.join(root, 'Cargo.toml'), '[package]\nname = "fixture"\nversion = "0.1.0"\n');
  await fs.writeFile(path.join(root, 'src', 'thing.rs'), 'pub fn value() -> i32 { 1 }\n');
  await fs.writeFile(path.join(root, 'src', 'lib.rs'), 'mod thing;\nuse crate::thing::value;\n');

  await scanProject(root);
  const graph = await loadProjectGraph(root);
  const js = graph.nodes.find((node) => node.path === 'src/js.js');
  assert.equal(js.rawImports.length, 0);
  assert.equal(js.imports.length, 0);
  const python = graph.nodes.find((node) => node.path === 'src/pkg/consumer.py');
  assert.equal(python.imports[0].resolved, 'src/pkg/util.py');
  const rust = graph.nodes.find((node) => node.path === 'src/lib.rs');
  assert.ok(rust.imports.some((item) => item.specifier === 'crate::thing::value' && item.resolved === 'src/thing.rs'));
});
