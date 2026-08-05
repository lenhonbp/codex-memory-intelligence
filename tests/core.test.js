import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initProject, scanProject, remember, snapshot, status } from '../src/core.js';
import { searchMemory, tokenize } from '../src/search.js';
import { loadProjectGraph, impactAnalysis } from '../src/graph.js';
import { checkStaleMemory, refreshMemory } from '../src/stale.js';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-'));
  await fs.writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  await fs.writeFile(path.join(root, 'wrangler.toml'), 'name = "demo"');
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'src', 'db.js'), 'export function migrate() { return true; }\n');
  await fs.writeFile(path.join(root, 'src', 'service.js'), "import { migrate } from './db.js';\nexport function run() { return migrate(); }\n");
  await fs.writeFile(path.join(root, 'src', 'index.js'), "import { run } from './service.js';\nrun();\n");
  return root;
}

test('initializes and builds stack, import, and symbol intelligence', async () => {
  const root = await fixture();
  await initProject(root);
  const scan = await scanProject(root);
  assert.equal(scan.files, 5);
  assert.ok(scan.stack.includes('Node.js'));
  assert.ok(scan.stack.includes('Cloudflare Workers/Pages'));
  assert.equal(scan.schemaVersion, 3);
  assert.equal(scan.graph.sourceFiles, 3);
  assert.equal(scan.graph.localEdges, 2);
  assert.ok(scan.graph.symbols >= 2);

  const graph = await loadProjectGraph(root);
  assert.equal(graph.reverseDependents['src/db.js'][0], 'src/service.js');
  assert.ok(graph.nodes.find((node) => node.path === 'src/db.js').symbols.some((symbol) => symbol.name === 'migrate'));

  const config = JSON.parse(await fs.readFile(path.join(root, '.codex-memory', 'config.json'), 'utf8'));
  assert.equal(config.version, 2);
  assert.equal(config.staleAfterDays, 90);
});

test('impact analysis follows reverse dependencies from files and symbols', async () => {
  const root = await fixture();
  await scanProject(root);
  const byFile = await impactAnalysis(root, 'src/db.js', 3);
  assert.equal(byFile.found, true);
  assert.deepEqual(byFile.directDependents, ['src/service.js']);
  assert.ok(byFile.affectedFiles.includes('src/index.js'));

  const bySymbol = await impactAnalysis(root, 'migrate', 3);
  assert.equal(bySymbol.found, true);
  assert.equal(bySymbol.matchedSymbols[0].path, 'src/db.js');
});

test('stores source-linked memory and detects source changes', async () => {
  const root = await fixture();
  await scanProject(root);
  const metadata = await remember(root, 'decision', 'Database migrations must remain idempotent.', { sources: ['src/db.js'] });
  assert.equal(metadata.sources[0], 'src/db.js');

  let health = await checkStaleMemory(root);
  assert.equal(health.counts.fresh, 1);
  assert.equal(health.counts.stale, 0);

  await fs.appendFile(path.join(root, 'src', 'db.js'), '\nexport const schemaVersion = 2;\n');
  health = await checkStaleMemory(root);
  assert.equal(health.counts.stale, 1);
  assert.match(health.entries[0].reasons.join(' '), /changed/i);

  const refreshed = await refreshMemory(root, metadata.id.slice(0, 8));
  assert.equal(refreshed.updated, 1);
  health = await checkStaleMemory(root);
  assert.equal(health.counts.fresh, 1);
});

test('unscoped memory requests review after project structure changes', async () => {
  const root = await fixture();
  await scanProject(root);
  await remember(root, 'fact', 'Production runs on Cloudflare Pages.');
  await fs.writeFile(path.join(root, 'src', 'worker.js'), 'export default {};\n');
  await scanProject(root);
  const health = await checkStaleMemory(root);
  assert.equal(health.counts.review, 1);
  assert.match(health.entries[0].reasons.join(' '), /structure changed/i);
});

test('legacy entries are visible as untracked and can be migrated', async () => {
  const root = await fixture();
  await scanProject(root);
  await fs.appendFile(path.join(root, '.codex-memory', 'memory.md'), '\n## 2026-01-01T00:00:00.000Z\n\nLegacy fact.\n');
  let health = await checkStaleMemory(root);
  assert.equal(health.counts.untracked, 1);
  const migration = await refreshMemory(root, 'all');
  assert.equal(migration.updated, 1);
  health = await checkStaleMemory(root);
  assert.equal(health.counts.untracked, 0);
  assert.equal(health.counts.fresh, 1);
});

test('search retrieves durable memory and indexed symbols', async () => {
  const root = await fixture();
  await scanProject(root);
  await remember(root, 'mistake', 'Direct schema edits caused drift; always deploy migrations.', { sources: ['src/db.js'] });
  const memoryResults = await searchMemory(root, 'schema migration', 6);
  assert.ok(memoryResults.some((item) => /schema edits/i.test(item.text)));
  const symbolResults = await searchMemory(root, 'migrate', 6);
  assert.ok(symbolResults.some((item) => item.source === 'project-graph.json' && item.title.includes('src/db.js')));
});

test('secret guard rejects credentials but allows security policy notes', async () => {
  const root = await fixture();
  await assert.rejects(() => remember(root, 'fact', 'api_key = abcdefghijklmnop'), /secret/i);
  await remember(root, 'decision', 'Password reset flows require email verification.');
  const projectStatus = await status(root);
  assert.equal(projectStatus.entries.decisions, 1);
});

test('creates snapshots even outside a git repository', async () => {
  const root = await fixture();
  const name = await snapshot(root, 'before-change');
  assert.match(name, /before-change/);
  const projectStatus = await status(root);
  assert.equal(projectStatus.snapshots, 1);
});

test('tokenizer is case and accent insensitive', () => {
  assert.deepEqual(tokenize('Quyết định D1 Migration'), ['quyet', 'dinh', 'd1', 'migration']);
});
