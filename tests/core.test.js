import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initProject, scanProject, remember, snapshot, status, doctor, explainIgnore } from '../src/core.js';
import { searchMemory, tokenize } from '../src/search.js';
import { loadProjectGraph, impactAnalysis } from '../src/graph.js';
import { checkStaleMemory, refreshMemory, loadTrackedMemory, setMemoryLifecycle } from '../src/stale.js';

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

test('initializes and builds stack, graph, and v0.5 metadata', async () => {
  const root = await fixture();
  await initProject(root);
  const scan = await scanProject(root);
  assert.equal(scan.files, 5);
  assert.ok(scan.stack.includes('Node.js'));
  assert.ok(scan.stack.includes('Cloudflare Workers/Pages'));
  assert.equal(scan.schemaVersion, 5);
  assert.equal(scan.graph.sourceFiles, 3);
  assert.equal(scan.graph.localEdges, 2);
  assert.equal(scan.graph.parsedFiles, 3);
  assert.equal(scan.graph.reusedFiles, 0);
  const graph = await loadProjectGraph(root);
  assert.equal(graph.schemaVersion, 4);
  assert.equal(graph.parserVersion, 4);
  assert.equal(graph.freshness.version, 1);
  assert.equal(graph.reverseDependents['src/db.js'][0], 'src/service.js');
  const config = JSON.parse(await fs.readFile(path.join(root, '.codex-memory', 'config.json'), 'utf8'));
  assert.equal(config.version, 4);
  assert.equal(config.incrementalScan, true);
});

test('incremental scans reuse unchanged nodes and reparse changed files only', async () => {
  const root = await fixture();
  await scanProject(root, { full: true });
  const noOp = await scanProject(root);
  assert.equal(noOp.graph.parsedFiles, 0);
  assert.equal(noOp.graph.reusedFiles, 3);
  await fs.appendFile(path.join(root, 'src', 'db.js'), 'export const version = 2;\n');
  const changed = await scanProject(root);
  assert.equal(changed.graph.parsedFiles, 1);
  assert.equal(changed.graph.reusedFiles, 2);
});

test('.cmiignore supports directories, globs, negation, and explanations', async () => {
  const root = await fixture();
  await fs.writeFile(path.join(root, '.cmiignore'), 'generated/\n*.tmp\n!keep.tmp\n');
  await fs.mkdir(path.join(root, 'generated'));
  await fs.writeFile(path.join(root, 'generated', 'hidden.js'), 'export const hidden = true;\n');
  await fs.writeFile(path.join(root, 'drop.tmp'), 'drop');
  await fs.writeFile(path.join(root, 'keep.tmp'), 'keep');
  const scan = await scanProject(root);
  assert.equal(scan.graph.sourceFiles, 3);
  assert.equal(scan.files, 7);
  const ignored = await explainIgnore(root, 'generated', { directory: true });
  assert.equal(ignored.ignored, true);
  assert.match(ignored.reason, /.cmiignore/);
  const included = await explainIgnore(root, 'keep.tmp');
  assert.equal(included.ignored, false);
  assert.match(included.reason, /Re-included/);
});

test('detects workspaces, resolves TypeScript aliases, and reports cross-workspace impact', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-monorepo-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'repo', private: true, workspaces: ['packages/*'] }));
  await fs.writeFile(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@repo/b/*': ['packages/b/src/*'] } } }));
  for (const name of ['a','b']) {
    await fs.mkdir(path.join(root, 'packages', name, 'src'), { recursive: true });
    await fs.writeFile(path.join(root, 'packages', name, 'package.json'), JSON.stringify({ name: `@repo/${name}` }));
  }
  await fs.writeFile(path.join(root, 'packages', 'b', 'src', 'util.ts'), 'export function shared() { return true; }\n');
  await fs.writeFile(path.join(root, 'packages', 'a', 'src', 'index.ts'), "import { shared } from '@repo/b/util';\nexport const run = () => shared();\n");
  const scan = await scanProject(root);
  assert.equal(scan.workspaces.count, 3);
  assert.equal(scan.graph.localEdges, 1);
  assert.equal(scan.graph.crossWorkspaceEdges, 1);
  const graph = await loadProjectGraph(root);
  const app = graph.nodes.find((node) => node.path.endsWith('packages/a/src/index.ts'));
  assert.equal(app.imports[0].resolved, 'packages/b/src/util.ts');
  const impact = await impactAnalysis(root, 'shared');
  assert.ok(impact.affectedWorkspaces.includes('node:packages/a'));
  assert.ok(impact.affectedWorkspaces.includes('node:packages/b'));
});

test('resolves representative Python, Go, and Rust local imports', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-parsers-'));
  await fs.mkdir(path.join(root, 'src', 'pkg'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'pkg', '__init__.py'), '');
  await fs.writeFile(path.join(root, 'src', 'pkg', 'util.py'), 'def helper():\n    return True\n');
  await fs.writeFile(path.join(root, 'src', 'app.py'), 'from pkg.util import helper\n');
  await fs.writeFile(path.join(root, 'go.mod'), 'module example.com/demo\n');
  await fs.mkdir(path.join(root, 'lib'));
  await fs.writeFile(path.join(root, 'lib', 'util.go'), 'package lib\nfunc Help() {}\n');
  await fs.writeFile(path.join(root, 'main.go'), 'package main\nimport "example.com/demo/lib"\n');
  await fs.writeFile(path.join(root, 'Cargo.toml'), '[package]\nname = "demo"\nversion = "0.1.0"\n');
  await fs.writeFile(path.join(root, 'src', 'lib.rs'), 'mod api;\n');
  await fs.writeFile(path.join(root, 'src', 'api.rs'), 'pub fn serve() {}\n');
  const scan = await scanProject(root);
  assert.equal(scan.graph.unresolvedImports, 0);
  const graph = await loadProjectGraph(root);
  assert.equal(graph.nodes.find((node) => node.path === 'src/app.py').imports[0].resolved, 'src/pkg/util.py');
  assert.equal(graph.nodes.find((node) => node.path === 'main.go').imports[0].resolved, 'lib/util.go');
  assert.equal(graph.nodes.find((node) => node.path === 'src/lib.rs').imports[0].resolved, 'src/api.rs');
});

test('impact analysis follows reverse dependencies from files and symbols', async () => {
  const root = await fixture();
  await scanProject(root);
  const byFile = await impactAnalysis(root, 'src/db.js', 3);
  assert.equal(byFile.found, true);
  assert.deepEqual(byFile.directDependents, ['src/service.js']);
  assert.ok(byFile.affectedFiles.includes('src/index.js'));
  const bySymbol = await impactAnalysis(root, 'migrate', 3);
  assert.equal(bySymbol.matchedSymbols[0].path, 'src/db.js');
});

test('stores source-linked memory and detects source changes', async () => {
  const root = await fixture();
  await scanProject(root);
  const metadata = await remember(root, 'decision', 'Database migrations must remain idempotent.', { sources: ['src/db.js'] });
  let health = await checkStaleMemory(root);
  assert.equal(health.counts.fresh, 1);
  await fs.appendFile(path.join(root, 'src', 'db.js'), '\nexport const schemaVersion = 2;\n');
  health = await checkStaleMemory(root);
  assert.equal(health.counts.stale, 1);
  const refreshed = await refreshMemory(root, metadata.id.slice(0, 8), { reviewedBy: 'tester', reason: 'Refresh source fingerprint only.' });
  assert.equal(refreshed.updated, 1);
  assert.equal(refreshed.semanticReview, false);
  health = await checkStaleMemory(root);
  assert.equal(health.entries[0].reviewedBy, null);
  assert.equal(health.counts.fresh, 1);
  const tracked = (await loadTrackedMemory(root)).find((entry) => entry.metadata?.id === metadata.id);
  assert.equal(tracked.metadata.sourceRefreshedBy, 'tester');
  assert.equal(tracked.metadata.reviewedBy, undefined);
});

test('workspace-scoped search ranks only matching graph context', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-search-workspace-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ private: true, workspaces: ['packages/*'] }));
  for (const name of ['alpha','beta']) {
    await fs.mkdir(path.join(root, 'packages', name), { recursive: true });
    await fs.writeFile(path.join(root, 'packages', name, 'package.json'), JSON.stringify({ name }));
    await fs.writeFile(path.join(root, 'packages', name, 'index.js'), `export function shared${name}() {}\n`);
  }
  await scanProject(root);
  const results = await searchMemory(root, 'shared', 10, { workspace: 'packages/alpha' });
  assert.ok(results.some((item) => item.metadata?.path === 'packages/alpha/index.js'));
  assert.ok(!results.some((item) => item.metadata?.path === 'packages/beta/index.js'));
});

test('legacy entries, status health, and secret guards remain compatible', async () => {
  const root = await fixture();
  await scanProject(root);
  await assert.rejects(() => remember(root, 'fact', 'api_key = abcdefghijklmnop'), /secret/i);
  await fs.appendFile(path.join(root, '.codex-memory', 'memory.md'), '\n## 2026-01-01T00:00:00.000Z\n\nLegacy fact.\n');
  assert.equal((await status(root)).healthy, false);
  await refreshMemory(root, 'all');
  assert.equal((await status(root)).healthy, false);
  const legacy = (await loadTrackedMemory(root)).find((entry) => entry.text === 'Legacy fact.');
  assert.ok(legacy?.metadata?.id);
  await setMemoryLifecycle(root, legacy.metadata.id, 'active', { changedBy: 'tester', reason: 'Explicitly reviewed legacy fact.' });
  assert.equal((await status(root)).healthy, true);
});

test('edited metadata cannot fingerprint files outside the project', async () => {
  const root = await fixture();
  await scanProject(root);
  await remember(root, 'fact', 'Tracked fact.');
  const memoryPath = path.join(root, '.codex-memory', 'memory.md');
  const content = await fs.readFile(memoryPath, 'utf8');
  await fs.writeFile(memoryPath, content.replace('"sources":[]', '"sources":["../../etc/passwd"]'));
  const health = await checkStaleMemory(root);
  assert.equal(health.counts.stale, 1);
  assert.match(health.entries[0].reasons.join(' '), /escapes the project/i);
});

test('symbolic links are skipped and cannot be tracked as sources', async (context) => {
  const root = await fixture();
  const outside = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-outside-')), 'secret.js');
  await fs.writeFile(outside, 'export const secret = 1;\n');
  const link = path.join(root, 'src', 'linked.js');
  try { await fs.symlink(outside, link); }
  catch (error) {
    if (['EPERM','EACCES','ENOTSUP'].includes(error.code)) { context.skip('Symlinks unavailable on this runner.'); return; }
    throw error;
  }
  const scan = await scanProject(root);
  assert.equal(scan.graph.sourceFiles, 3);
  assert.ok(scan.ignore.symlinks >= 1);
  await assert.rejects(() => remember(root, 'fact', 'Do not track link.', { sources: ['src/linked.js'] }), /symbolic-link/i);
});

test('doctor and snapshots report project readiness', async () => {
  const root = await fixture();
  let report = await doctor(root);
  assert.equal(report.healthy, false);
  assert.ok(report.checks.some((check) => check.name === 'memory' && check.status === 'warn'));
  assert.ok(report.checks.some((check) => check.name === 'evidence-health' && check.status === 'fail' && /cmi init.*cmi scan/i.test(check.detail)));
  await scanProject(root);
  report = await doctor(root);
  assert.ok(report.checks.some((check) => check.name === 'index' && check.status === 'pass'));
  const name = await snapshot(root, 'before-change');
  assert.match(name, /before-change/);
  assert.equal((await status(root)).snapshots, 1);
});

test('tokenizer is case and accent insensitive', () => {
  assert.deepEqual(tokenize('Quyết định D1 Migration'), ['quyet','dinh','d1','migration']);
});
