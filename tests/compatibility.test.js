import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initProject, readConfig, scanProject, status } from '../src/core.js';
import { searchMemory } from '../src/search.js';
import { inspectProjectGraphHealth } from '../src/graph.js';
import { checkStaleMemory } from '../src/stale.js';
import { listChangeRecords } from '../src/change-intelligence.js';
import { listSessions } from '../src/session-intelligence.js';
import { listFindings } from '../src/session-intelligence.js';
import { listEvaluations } from '../src/evaluation.js';

const fixtureRoot = fileURLToPath(new URL('./fixtures/compatibility/', import.meta.url));
const manifest = JSON.parse(await fs.readFile(path.join(fixtureRoot, 'manifest.json'), 'utf8'));
const baseConfig = path.join(fixtureRoot, 'v0.5.0', 'config.json');

async function writeText(file, content) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
}

async function project(prefix = 'cmi-compatibility-') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  await writeText(path.join(root, 'package.json'), '{"name":"compatibility-fixture","type":"module"}\n');
  await writeText(path.join(root, 'src', 'policy.js'), 'export const policy = true;\n');
  const memory = path.join(root, '.codex-memory');
  await fs.mkdir(path.join(memory, 'snapshots'), { recursive: true });
  await fs.copyFile(baseConfig, path.join(memory, 'config.json'));
  await writeText(path.join(memory, 'memory.md'), '# Project Memory\n\n');
  await writeText(path.join(memory, 'decisions.md'), '# Architecture Decisions\n\n');
  await writeText(path.join(memory, 'mistakes.md'), '# Mistakes and Lessons\n\n');
  await writeText(path.join(memory, 'architecture.md'), '# Project Architecture\n\n');
  await writeText(path.join(memory, 'agent-instructions.md'), '# Agent Instructions\n\n');
  await writeText(path.join(memory, '.gitignore'), 'project-graph.json\nproject-index.json\nsnapshots/\n');
  return root;
}

async function copyIntoMemory(root, sourceRelative, targetRelative = sourceRelative) {
  const source = path.join(fixtureRoot, sourceRelative);
  const target = path.join(root, '.codex-memory', targetRelative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

async function historicalProject(family) {
  const root = await project(`cmi-${family.replaceAll('.', '-')}-`);
  const familyRoot = path.join(fixtureRoot, family);
  const entries = await fs.readdir(familyRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'config.json') {
      await copyIntoMemory(root, `${family}/config.json`, 'config.json');
      continue;
    }
    if (entry.name === 'memory.md') {
      await copyIntoMemory(root, `${family}/memory.md`, 'memory.md');
      continue;
    }
    await fs.cp(path.join(familyRoot, entry.name), path.join(root, '.codex-memory', entry.name), { recursive: true });
  }
  return root;
}

async function bytes(root, relative) {
  return fs.readFile(path.join(root, '.codex-memory', relative));
}

test('fixture manifest records release provenance and expected behavior for every fixture family', async () => {
  assert.equal(manifest.kind, 'cmi-persistence-compatibility-fixtures');
  assert.ok(manifest.fixtures.length >= 7);
  for (const fixture of manifest.fixtures) {
    assert.match(fixture.originatingVersion, /^(?:\d+\.\d+\.\d+|future)$/);
    assert.ok(fixture.dataClass);
    assert.ok(fixture.materialization);
    assert.ok(fixture.transformation);
    assert.ok(fixture.expected?.read);
    for (const relative of fixture.files) {
      assert.ok(!path.isAbsolute(relative), `fixture path must be relative: ${relative}`);
      await fs.access(path.join(fixtureRoot, relative));
    }
    if (fixture.originatingCommit) assert.match(fixture.originatingCommit, /^[0-9a-f]{40}$/);
  }
});

test('v0.5 config and legacy memory are readable without rewrite or review promotion', async () => {
  const root = await historicalProject('v0.5.0');
  const beforeConfig = await bytes(root, 'config.json');
  const beforeMemory = await bytes(root, 'memory.md');
  const beforeInstructions = await bytes(root, 'agent-instructions.md');
  const beforeGraph = await bytes(root, 'project-graph.json');
  const config = await readConfig(root);
  assert.equal(config.version, 4);
  const projectStatus = await status(root);
  assert.equal(projectStatus.indexHealth.state, 'current');
  assert.equal(projectStatus.graphHealth.formatStatus, 'obsolete');
  assert.equal(projectStatus.graphHealth.rebuildRequired, true);
  assert.equal(projectStatus.evidenceHealth.state, 'blocked');
  const results = await searchMemory(root, 'legacy memory entry');
  const legacyResult = results.find((result) => result.text.includes('legacy memory entry'));
  assert.ok(legacyResult);
  assert.notEqual(legacyResult.metadata.evidenceStatus, 'reviewed-current');
  await initProject(root);
  assert.deepEqual(await bytes(root, 'config.json'), beforeConfig);
  assert.deepEqual(await bytes(root, 'memory.md'), beforeMemory);
  assert.deepEqual(await bytes(root, 'agent-instructions.md'), beforeInstructions);
  assert.deepEqual(await bytes(root, 'project-graph.json'), beforeGraph);
});

test('old generated graph is detected and rebuilt without changing durable memory', async () => {
  const root = await historicalProject('v0.5.0');
  const beforeMemory = await bytes(root, 'memory.md');
  const oldGraph = JSON.parse(await fs.readFile(path.join(root, '.codex-memory', 'project-graph.json'), 'utf8'));
  const health = await inspectProjectGraphHealth(root, oldGraph);
  assert.equal(health.formatStatus, 'obsolete');
  assert.equal(health.current, false);
  assert.equal(health.rebuildRequired, true);
  await scanProject(root);
  const current = await status(root);
  assert.equal(current.graphHealth.formatStatus, 'current');
  assert.equal(current.graphHealth.current, true);
  assert.deepEqual(await bytes(root, 'memory.md'), beforeMemory);
  const results = await searchMemory(root, 'legacy memory entry');
  assert.notEqual(results[0].metadata.evidenceStatus, 'reviewed-current');
});

test('released v0.7, v0.8, v0.9, and v0.9.1 durable records remain readable without rewrite', async () => {
  const changeRoot = await historicalProject('v0.7.0');
  const changeBefore = await bytes(changeRoot, 'changes/22222222-2222-4222-8222-222222222222.json');
  const changes = await listChangeRecords(changeRoot);
  assert.equal(changes.invalidRecords, 0);
  assert.equal(changes.records[0].id, '22222222-2222-4222-8222-222222222222');
  assert.deepEqual(await bytes(changeRoot, 'changes/22222222-2222-4222-8222-222222222222.json'), changeBefore);

  const sessionRoot = await historicalProject('v0.8.0');
  const sessions = await listSessions(sessionRoot);
  assert.equal(sessions.invalidRecords, 0);
  assert.equal(sessions.records[0].id, '33333333-3333-4333-8333-333333333333');

  const findingRoot = await historicalProject('v0.9.0');
  const findings = await listFindings(findingRoot);
  assert.equal(findings.total, 1);
  assert.equal(findings.findings[0].state, 'open');

  const evaluationRoot = await historicalProject('v0.9.1');
  const evaluations = await listEvaluations(evaluationRoot);
  assert.equal(evaluations.invalidRecords, 0);
  assert.equal(evaluations.records[0].reviewOutcome, 'unreviewed');
});

test('mixed historical/current state is read per domain rather than normalized as one generation', async () => {
  const root = await historicalProject('v0.5.0');
  await copyIntoMemory(root, 'v0.9.0/findings.json', 'findings.json');
  const beforeMemory = await bytes(root, 'memory.md');
  const beforeFindings = await bytes(root, 'findings.json');
  const projectStatus = await status(root);
  assert.equal(projectStatus.memoryHealth.blocked, 0);
  assert.equal(projectStatus.graphHealth.formatStatus, 'obsolete');
  const findings = await listFindings(root);
  assert.equal(findings.total, 1);
  assert.deepEqual(await bytes(root, 'memory.md'), beforeMemory);
  assert.deepEqual(await bytes(root, 'findings.json'), beforeFindings);
});

test('future config fails closed before init writes defaults', async () => {
  const root = await project('cmi-future-config-');
  await copyIntoMemory(root, 'future/config.json', 'config.json');
  const before = await bytes(root, 'config.json');
  await assert.rejects(() => readConfig(root), (error) => error.code === 'CMI_CONFIG_VERSION_UNSUPPORTED');
  await assert.rejects(() => initProject(root), (error) => error.code === 'CMI_CONFIG_VERSION_UNSUPPORTED');
  assert.deepEqual(await bytes(root, 'config.json'), before);
});

test('future generated formats are not current and require rebuild', async () => {
  const root = await project('cmi-future-generated-');
  await copyIntoMemory(root, 'future/project-index.json', 'project-index.json');
  await copyIntoMemory(root, 'future/project-graph.json', 'project-graph.json');
  const projectStatus = await status(root);
  assert.equal(projectStatus.index, null);
  assert.equal(projectStatus.indexHealth.state, 'unsupported');
  assert.equal(projectStatus.graphHealth.formatStatus, 'unsupported');
  assert.equal(projectStatus.graphHealth.current, false);
  assert.equal(projectStatus.evidenceHealth.state, 'blocked');
});

test('future durable records and metadata are rejected or reported invalid without overwrite', async () => {
  const changeRoot = await project('cmi-future-change-');
  await copyIntoMemory(changeRoot, 'future/changes/66666666-6666-4666-8666-666666666666.json', 'changes/66666666-6666-4666-8666-666666666666.json');
  const changeBefore = await bytes(changeRoot, 'changes/66666666-6666-4666-8666-666666666666.json');
  assert.equal((await listChangeRecords(changeRoot)).invalidRecords, 1);
  assert.deepEqual(await bytes(changeRoot, 'changes/66666666-6666-4666-8666-666666666666.json'), changeBefore);

  const sessionRoot = await project('cmi-future-session-');
  await copyIntoMemory(sessionRoot, 'future/sessions/77777777-7777-4777-8777-777777777777.json', 'sessions/77777777-7777-4777-8777-777777777777.json');
  const sessionBefore = await bytes(sessionRoot, 'sessions/77777777-7777-4777-8777-777777777777.json');
  assert.equal((await listSessions(sessionRoot)).invalidRecords, 1);
  assert.deepEqual(await bytes(sessionRoot, 'sessions/77777777-7777-4777-8777-777777777777.json'), sessionBefore);

  const findingRoot = await project('cmi-future-finding-');
  await copyIntoMemory(findingRoot, 'future/findings.json', 'findings.json');
  const findingBefore = await bytes(findingRoot, 'findings.json');
  await assert.rejects(() => listFindings(findingRoot), (error) => error.code === 'CMI_FINDINGS_BLOCKED');
  assert.deepEqual(await bytes(findingRoot, 'findings.json'), findingBefore);

  const evaluationRoot = await project('cmi-future-evaluation-');
  await copyIntoMemory(evaluationRoot, 'future/evaluations/88888888-8888-4888-8888-888888888888.json', 'evaluations/88888888-8888-4888-8888-888888888888.json');
  const evaluationBefore = await bytes(evaluationRoot, 'evaluations/88888888-8888-4888-8888-888888888888.json');
  assert.equal((await listEvaluations(evaluationRoot)).invalidRecords, 1);
  assert.deepEqual(await bytes(evaluationRoot, 'evaluations/88888888-8888-4888-8888-888888888888.json'), evaluationBefore);

  const memoryRoot = await historicalProject('v0.5.0');
  await copyIntoMemory(memoryRoot, 'future/memory.md', 'memory.md');
  const memoryBefore = await bytes(memoryRoot, 'memory.md');
  const stale = await checkStaleMemory(memoryRoot);
  assert.equal(stale.counts.untracked, 1);
  assert.deepEqual(await bytes(memoryRoot, 'memory.md'), memoryBefore);
});

test('corrupt config fails closed without replacing the original bytes', async () => {
  const root = await project('cmi-corrupt-config-');
  const target = path.join(root, '.codex-memory', 'config.json');
  await fs.writeFile(target, '{"version":');
  const before = await fs.readFile(target);
  await assert.rejects(() => initProject(root), (error) => error.code === 'CMI_CONFIG_INVALID');
  assert.deepEqual(await fs.readFile(target), before);
});
