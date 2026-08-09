import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { doctor, initProject, readConfig, remember, scanProject, status } from '../src/core.js';
import { buildContextPack, searchMemory } from '../src/search.js';
import { impactAnalysis, inspectProjectGraphHealth } from '../src/graph.js';
import { checkStaleMemory, refreshMemory, setMemoryLifecycle } from '../src/stale.js';
import { prepareChangeBrief } from '../src/advisor.js';
import { listChangeRecords } from '../src/change-intelligence.js';
import { listSessions } from '../src/session-intelligence.js';
import { listFindings } from '../src/session-intelligence.js';
import { listEvaluations } from '../src/evaluation.js';
import { validateRecommendationContract, validateSessionRecordContract } from '../src/durable-contracts.js';

const fixtureRoot = fileURLToPath(new URL('./fixtures/compatibility/', import.meta.url));
const manifest = JSON.parse(await fs.readFile(path.join(fixtureRoot, 'manifest.json'), 'utf8'));
const baseConfig = path.join(fixtureRoot, 'v0.5.0', 'config.json');
const cliPath = fileURLToPath(new URL('../src/cli.js', import.meta.url));

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

function cliJson(root, command) {
  const result = spawnSync(process.execPath, [cliPath, command, root, '--json'], { encoding: 'utf8' });
  assert.equal(result.signal, null, result.stderr);
  assert.ok(result.stdout.trim(), result.stderr);
  return { exitCode: result.status, value: JSON.parse(result.stdout) };
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
  assert.equal(projectStatus.memoryHealth.blocked, 0);
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
  const sessionRelative = 'sessions/33333333-3333-4333-8333-333333333333.json';
  const sessionBefore = await bytes(sessionRoot, sessionRelative);
  const sessions = await listSessions(sessionRoot);
  assert.equal(sessions.invalidRecords, 0);
  assert.equal(sessions.records[0].id, '33333333-3333-4333-8333-333333333333');
  assert.equal(JSON.parse(sessionBefore.toString('utf8')).close.handoff.nextAction.id, undefined);
  assert.deepEqual(await bytes(sessionRoot, sessionRelative), sessionBefore);

  const findingRoot = await historicalProject('v0.9.0');
  const findingBefore = await bytes(findingRoot, 'findings.json');
  const findings = await listFindings(findingRoot);
  assert.equal(findings.total, 1);
  assert.equal(findings.findings[0].state, 'open');
  assert.deepEqual(await bytes(findingRoot, 'findings.json'), findingBefore);

  const evaluationRoot = await historicalProject('v0.9.1');
  const evaluationRelative = 'evaluations/55555555-5555-4555-8555-555555555555.json';
  const evaluationBefore = await bytes(evaluationRoot, evaluationRelative);
  const evaluations = await listEvaluations(evaluationRoot);
  assert.equal(evaluations.invalidRecords, 0);
  assert.equal(evaluations.records[0].reviewOutcome, 'unreviewed');
  assert.deepEqual(await bytes(evaluationRoot, evaluationRelative), evaluationBefore);
});

test('v0.8 compatibility accepts only the exact released id-less fallback', async () => {
  const session = JSON.parse(await fs.readFile(path.join(fixtureRoot, 'v0.8.0', 'sessions', '33333333-3333-4333-8333-333333333333.json'), 'utf8'));
  assert.equal(validateSessionRecordContract(session).valid, true);

  const alteredAction = structuredClone(session);
  alteredAction.close.handoff.nextAction.action = 'Review the next user-prioritized goal.';
  assert.equal(validateSessionRecordContract(alteredAction).valid, false);

  const alteredReason = structuredClone(session);
  alteredReason.close.handoff.nextAction.reason = 'No additional historical evidence was recorded.';
  assert.equal(validateSessionRecordContract(alteredReason).valid, false);

  const extraField = structuredClone(session);
  extraField.close.handoff.nextAction.relatedFindingIds = [];
  assert.equal(validateSessionRecordContract(extraField).valid, false);

  const current = { id: 'current-no-follow-up', priority: 'P3', action: 'No evidence-based follow-up is currently required; begin the next user-prioritized project goal.', reason: 'CMI found no unresolved evidence requiring a more specific action.', evidenceType: 'observed', evidence: [], confidence: 'high', relatedFindingIds: [] };
  assert.equal(validateRecommendationContract(current).valid, true);
  const deletedId = structuredClone(current);
  delete deletedId.id;
  assert.equal(validateRecommendationContract(deletedId).valid, false);
});

test('plain legacy memory without a metadata marker remains untracked rather than blocked', async () => {
  const root = await project('cmi-untracked-memory-');
  await writeText(path.join(root, '.codex-memory', 'memory.md'), '# Project Memory\n\n## 2026-08-01T00:00:00.000Z\n\nPlain legacy entry.\n');
  const report = await checkStaleMemory(root);
  assert.equal(report.counts.untracked, 1);
  assert.equal(report.counts.blocked, 0);
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

test('future config blocks status, doctor, and mutations without changing a healthy project', async () => {
  const root = await project('cmi-future-config-');
  await scanProject(root);
  const currentConfig = JSON.parse(await fs.readFile(path.join(root, '.codex-memory', 'config.json'), 'utf8'));
  await writeText(path.join(root, '.codex-memory', 'config.json'), `${JSON.stringify({ ...currentConfig, version: 999 }, null, 2)}\n`);
  const before = await bytes(root, 'config.json');
  await assert.rejects(() => readConfig(root), (error) => error.code === 'CMI_CONFIG_VERSION_UNSUPPORTED');
  await assert.rejects(() => initProject(root), (error) => error.code === 'CMI_CONFIG_VERSION_UNSUPPORTED');
  const projectStatus = await status(root);
  assert.equal(projectStatus.configHealth.state, 'unsupported');
  assert.equal(projectStatus.evidenceHealth.domains.configuration.state, 'unsupported');
  assert.equal(projectStatus.evidenceHealth.state, 'blocked');
  assert.equal(projectStatus.graphHealth.current, false);
  assert.equal(projectStatus.graphHealth.scanAllowed, false);
  assert.ok(projectStatus.evidenceHealth.recommendations.every((item) => item.command !== 'cmi scan'));
  const diagnostic = await doctor(root);
  assert.equal(diagnostic.healthy, false);
  assert.equal(diagnostic.checks.find((check) => check.name === 'configuration')?.status, 'fail');
  const cliStatus = cliJson(root, 'status');
  assert.equal(cliStatus.exitCode, 2);
  assert.equal(cliStatus.value.configHealth.state, 'unsupported');
  const cliDoctor = cliJson(root, 'doctor');
  assert.equal(cliDoctor.exitCode, 1);
  assert.equal(cliDoctor.value.checks.find((check) => check.name === 'configuration')?.status, 'fail');
  assert.deepEqual(await bytes(root, 'config.json'), before);
});

test('future generated formats block normal scan and preserve bytes in paired and mixed states', async () => {
  const root = await project('cmi-future-generated-');
  await scanProject(root);
  const reviewedMemory = await remember(root, 'fact', 'Reviewed durable memory must survive generated compatibility refusal.');
  await setMemoryLifecycle(root, reviewedMemory.id, 'active', { reason: 'compatibility fixture review', changedBy: 'test' });
  const memoryBefore = await bytes(root, 'memory.md');
  await copyIntoMemory(root, 'future/project-index.json', 'project-index.json');
  await copyIntoMemory(root, 'future/project-graph.json', 'project-graph.json');
  const indexBefore = await bytes(root, 'project-index.json');
  const graphBefore = await bytes(root, 'project-graph.json');
  const projectStatus = await status(root);
  assert.equal(projectStatus.index, null);
  assert.equal(projectStatus.indexHealth.state, 'unsupported');
  assert.equal(projectStatus.graphHealth.formatStatus, 'unsupported');
  assert.equal(projectStatus.graphHealth.current, false);
  assert.equal(projectStatus.graphHealth.scanAllowed, false);
  assert.equal(projectStatus.evidenceHealth.state, 'blocked');
  assert.ok(projectStatus.evidenceHealth.recommendations.every((item) => item.command !== 'cmi scan'));
  const blockedImpact = await impactAnalysis(root, 'src/policy.js');
  assert.equal(blockedImpact.blocked, true);
  assert.equal(blockedImpact.recommendedAction.command, null);
  const blockedContext = await buildContextPack(root, 'policy');
  assert.equal(blockedContext.health.overall.state, 'blocked');
  assert.deepEqual(blockedContext.recommendedFiles, []);
  await assert.rejects(() => scanProject(root), (error) => error.code === 'CMI_GENERATED_VERSION_UNSUPPORTED');
  assert.deepEqual(await bytes(root, 'project-index.json'), indexBefore);
  assert.deepEqual(await bytes(root, 'project-graph.json'), graphBefore);
  assert.deepEqual(await bytes(root, 'memory.md'), memoryBefore);

  const futureGraphRoot = await project('cmi-future-graph-mixed-');
  await scanProject(futureGraphRoot);
  const futureGraphMemory = await remember(futureGraphRoot, 'fact', 'Mixed future graph must preserve reviewed memory.');
  await setMemoryLifecycle(futureGraphRoot, futureGraphMemory.id, 'active', { reason: 'compatibility fixture review', changedBy: 'test' });
  const futureGraphMemoryBefore = await bytes(futureGraphRoot, 'memory.md');
  await copyIntoMemory(futureGraphRoot, 'future/project-graph.json', 'project-graph.json');
  const futureGraphBefore = await bytes(futureGraphRoot, 'project-graph.json');
  const mixedGraphStatus = await status(futureGraphRoot);
  assert.equal(mixedGraphStatus.indexHealth.state, 'current');
  assert.equal(mixedGraphStatus.graphHealth.generatedState, 'unsupported');
  assert.equal(mixedGraphStatus.evidenceHealth.state, 'blocked');
  assert.ok(mixedGraphStatus.evidenceHealth.recommendations.every((item) => item.command !== 'cmi scan'));
  await assert.rejects(() => scanProject(futureGraphRoot), (error) => error.code === 'CMI_GENERATED_VERSION_UNSUPPORTED');
  assert.deepEqual(await bytes(futureGraphRoot, 'project-graph.json'), futureGraphBefore);
  assert.deepEqual(await bytes(futureGraphRoot, 'memory.md'), futureGraphMemoryBefore);

  const futureIndexRoot = await project('cmi-future-index-mixed-');
  await scanProject(futureIndexRoot);
  const futureIndexMemory = await remember(futureIndexRoot, 'fact', 'Mixed future index must preserve reviewed memory.');
  await setMemoryLifecycle(futureIndexRoot, futureIndexMemory.id, 'active', { reason: 'compatibility fixture review', changedBy: 'test' });
  const futureIndexMemoryBefore = await bytes(futureIndexRoot, 'memory.md');
  await copyIntoMemory(futureIndexRoot, 'future/project-index.json', 'project-index.json');
  const futureIndexBefore = await bytes(futureIndexRoot, 'project-index.json');
  const mixedIndexStatus = await status(futureIndexRoot);
  assert.equal(mixedIndexStatus.indexHealth.state, 'unsupported');
  assert.equal(mixedIndexStatus.graphHealth.current, false);
  assert.equal(mixedIndexStatus.graphHealth.generatedState, 'unsupported');
  assert.ok(mixedIndexStatus.evidenceHealth.recommendations.every((item) => item.command !== 'cmi scan'));
  await assert.rejects(() => scanProject(futureIndexRoot), (error) => error.code === 'CMI_GENERATED_VERSION_UNSUPPORTED');
  assert.deepEqual(await bytes(futureIndexRoot, 'project-index.json'), futureIndexBefore);
  assert.deepEqual(await bytes(futureIndexRoot, 'memory.md'), futureIndexMemoryBefore);
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

  const memoryRoot = await project('cmi-future-memory-');
  await scanProject(memoryRoot);
  await copyIntoMemory(memoryRoot, 'future/memory.md', 'memory.md');
  const memoryBefore = await bytes(memoryRoot, 'memory.md');
  const decisionsBefore = await bytes(memoryRoot, 'decisions.md');
  const mistakesBefore = await bytes(memoryRoot, 'mistakes.md');
  const assertDurableBytesPreserved = async () => {
    assert.deepEqual(await bytes(memoryRoot, 'memory.md'), memoryBefore);
    assert.deepEqual(await bytes(memoryRoot, 'decisions.md'), decisionsBefore);
    assert.deepEqual(await bytes(memoryRoot, 'mistakes.md'), mistakesBefore);
  };
  const stale = await checkStaleMemory(memoryRoot);
  assert.equal(stale.counts.untracked, 0);
  assert.equal(stale.counts.blocked, 1);
  assert.equal(stale.entries.find((entry) => entry.status === 'blocked')?.diagnostic?.code, 'CMI_MEMORY_VERSION_UNSUPPORTED');
  const memoryStatus = await status(memoryRoot);
  assert.equal(memoryStatus.evidenceHealth.domains.memory.state, 'blocked');
  assert.equal(memoryStatus.evidenceHealth.capabilities.durableMemory, 'blocked');
  await assert.rejects(() => searchMemory(memoryRoot, 'future memory'), (error) => error.code === 'CMI_MEMORY_VERSION_UNSUPPORTED');
  await assertDurableBytesPreserved();
  await assert.rejects(() => buildContextPack(memoryRoot, 'future memory'), (error) => error.code === 'CMI_MEMORY_VERSION_UNSUPPORTED');
  await assertDurableBytesPreserved();
  await assert.rejects(() => prepareChangeBrief(memoryRoot, 'change policy'), (error) => error.code === 'CMI_MEMORY_VERSION_UNSUPPORTED');
  await assertDurableBytesPreserved();
  await assert.rejects(() => refreshMemory(memoryRoot, 'all'), (error) => error.code === 'CMI_MEMORY_VERSION_UNSUPPORTED');
  await assertDurableBytesPreserved();
  await assert.rejects(() => refreshMemory(memoryRoot, '99999999-9999-4999-8999-999999999999'), (error) => error.code === 'CMI_MEMORY_VERSION_UNSUPPORTED');
  await assertDurableBytesPreserved();
  await assert.rejects(() => setMemoryLifecycle(memoryRoot, '99999999-9999-4999-8999-999999999999', 'deprecated', { reason: 'compatibility test' }), (error) => error.code === 'CMI_MEMORY_VERSION_UNSUPPORTED');
  await assertDurableBytesPreserved();
  await assert.rejects(() => remember(memoryRoot, 'fact', 'Must not append while future metadata is present.'), (error) => error.code === 'CMI_MEMORY_VERSION_UNSUPPORTED');
  await assertDurableBytesPreserved();
});

test('invalid current-version memory metadata blocks targeted mutation without rewrite', async () => {
  const root = await project('cmi-invalid-memory-metadata-');
  const invalid = '# Project Memory\n\n## 2026-08-01T00:00:00.000Z\n\n<!-- cmi-meta:{"schemaVersion":1,"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","createdAt":"2026-08-01T00:00:00.000Z","sources":[],"sourceHashes":{},"projectHash":null,"lifecycle":{"state":"active"}} -->\n\nInvalid current metadata.\n';
  await writeText(path.join(root, '.codex-memory', 'memory.md'), invalid);
  const before = await bytes(root, 'memory.md');
  const report = await checkStaleMemory(root);
  assert.equal(report.counts.blocked, 1);
  assert.equal(report.entries[0].diagnostic.code, 'CMI_MEMORY_METADATA_INVALID');
  await assert.rejects(() => refreshMemory(root, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), (error) => error.code === 'CMI_MEMORY_BLOCKED');
  await assert.rejects(() => setMemoryLifecycle(root, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'deprecated', { reason: 'must fail closed' }), (error) => error.code === 'CMI_MEMORY_BLOCKED');
  assert.deepEqual(await bytes(root, 'memory.md'), before);
});

test('corrupt config fails closed without replacing the original bytes', async () => {
  const root = await project('cmi-corrupt-config-');
  const target = path.join(root, '.codex-memory', 'config.json');
  await fs.writeFile(target, '{"version":');
  const before = await fs.readFile(target);
  await assert.rejects(() => initProject(root), (error) => error.code === 'CMI_CONFIG_INVALID');
  assert.deepEqual(await fs.readFile(target), before);
});
