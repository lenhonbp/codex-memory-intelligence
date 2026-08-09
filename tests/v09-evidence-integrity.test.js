import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildEvidenceHealth } from '../src/evidence-health.js';
import { initProject, scanProject, status, remember } from '../src/core.js';
import { buildContextPack } from '../src/search.js';
import { checkStaleMemory } from '../src/stale.js';
import { startChangeRecord, observeChangeRecord } from '../src/change-intelligence.js';
import { startSession, assessSession, validateSessionRecord } from '../src/session-intelligence.js';
import { validateMemoryMetadataContract } from '../src/durable-contracts.js';

const exec = promisify(execFile);
async function project(prefix = 'cmi-v09-') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ type: 'module' }));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  return root;
}
async function git(root, ...args) {
  const result = await exec('git', args, { cwd: root, encoding: 'utf8' });
  return String(result.stdout || '').trim();
}
async function initGit(root) {
  await git(root, 'init');
  await git(root, 'config', 'user.email', 'cmi-test@example.invalid');
  await git(root, 'config', 'user.name', 'CMI Test');
  await git(root, 'add', 'package.json', 'src');
  await git(root, 'commit', '-m', 'base');
}
async function commitFile(root, relative, content, message) {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content);
  await git(root, 'add', relative);
  await git(root, 'commit', '-m', message);
  return git(root, 'rev-parse', 'HEAD');
}

test('evidence health distinguishes degraded incomplete graph from blocked stale graph', () => {
  const degraded = buildEvidenceHealth({ initialized: true, storageSafe: true, indexAvailable: true, graphHealth: { available: true, current: true, complete: false, truncated: true }, memoryHealth: { stale: 0, review: 0, untracked: 0 } });
  assert.equal(degraded.state, 'degraded');
  assert.equal(degraded.capabilities.graphContext, 'partial');
  assert.equal(degraded.capabilities.impactAnalysis, 'partial');
  const blocked = buildEvidenceHealth({ initialized: true, storageSafe: true, indexAvailable: true, graphHealth: { available: true, current: false, complete: true, staleNodes: 1, missingNodes: 0 }, memoryHealth: { stale: 0, review: 0, untracked: 0 } });
  assert.equal(blocked.state, 'blocked');
  assert.equal(blocked.capabilities.graphContext, 'blocked');
  assert.equal(blocked.capabilities.durableMemory, 'current');
});

test('status and context pack expose the same evidence-health state', async () => {
  const root = await project('cmi-v09-health-');
  await fs.writeFile(path.join(root, 'src', 'a.js'), 'export const a = 1;\n');
  await scanProject(root);
  const projectStatus = await status(root);
  const context = await buildContextPack(root, 'a');
  assert.equal(projectStatus.evidenceHealth.state, 'healthy');
  assert.equal(context.health.overall.state, projectStatus.evidenceHealth.state);
  assert.equal(context.health.overall.capabilities.impactAnalysis, 'current');
});

test('change attribution fails closed when Git history is rewritten after the baseline', async () => {
  const root = await project('cmi-v09-change-rewrite-');
  await fs.writeFile(path.join(root, 'src', 'base.js'), 'export const base = 1;\n');
  await initGit(root);
  const base = await git(root, 'rev-parse', 'HEAD');
  await commitFile(root, 'src/old.js', 'export const old = 1;\n', 'old-line');
  await scanProject(root);
  const record = await startChangeRecord(root, 'replace old line with new line');
  await git(root, 'reset', '--hard', base);
  await commitFile(root, 'src/new.js', 'export const next = 1;\n', 'new-line');
  const observation = await observeChangeRecord(root, record.id);
  assert.equal(observation.gitContinuity.state, 'rewritten');
  assert.equal(observation.gitContinuity.safeForCommittedAttribution, false);
  assert.equal(observation.attribution, 'limited-history-rewrite');
  assert.deepEqual(observation.committedFilesSinceStart, []);
  assert.ok(!observation.observedChangedFiles.includes('src/new.js'));
});

test('session assessment surfaces history rewrite instead of auto-attributing rewritten commits', async () => {
  const root = await project('cmi-v09-session-rewrite-');
  await fs.writeFile(path.join(root, 'src', 'base.js'), 'export const base = 1;\n');
  await initGit(root);
  const base = await git(root, 'rev-parse', 'HEAD');
  await commitFile(root, 'src/old.js', 'export const old = 1;\n', 'old-line');
  await scanProject(root);
  const session = await startSession(root, 'investigate replacement');
  await git(root, 'reset', '--hard', base);
  await commitFile(root, 'src/new.js', 'export const next = 1;\n', 'new-line');
  const assessment = await assessSession(root, session.id);
  assert.equal(assessment.scope.gitContinuity.state, 'rewritten');
  assert.deepEqual(assessment.scope.committedPaths, []);
  assert.ok(assessment.findings.some((item) => item.category === 'git-history-rewrite'));
  assert.ok(assessment.guardrails.some((item) => item.id === 'do-not-overattribute-rewritten-history'));
});

test('invalid versioned memory lifecycle metadata is blocked from trusted evidence', async () => {
  const root = await project('cmi-v09-memory-contract-');
  await fs.writeFile(path.join(root, 'src', 'policy.js'), 'export const policy = true;\n');
  await scanProject(root);
  const entry = await remember(root, 'fact', 'Policy is enabled.', { sources: ['src/policy.js'] });
  const file = path.join(root, '.codex-memory', 'memory.md');
  const content = await fs.readFile(file, 'utf8');
  const corrupted = content.replace('"state":"active"', '"state":"ghost"');
  await fs.writeFile(file, corrupted);
  const report = await checkStaleMemory(root);
  assert.equal(report.counts.untracked, 0);
  assert.equal(report.counts.blocked, 1);
  assert.equal(report.entries.find((item) => item.status === 'blocked')?.diagnostic?.code, 'CMI_MEMORY_METADATA_INVALID');
  const valid = validateMemoryMetadataContract({ schemaVersion: 1, id: entry.id, type: 'fact', createdAt: new Date().toISOString(), sources: [], sourceHashes: {}, projectHash: null, lifecycle: { state: 'active' } });
  assert.equal(valid.valid, true);
});

test('session runtime validation rejects malformed nested observation evidence', () => {
  const now = new Date().toISOString();
  const base = { schemaVersion: 1, id: '12345678-1234-4123-8123-123456789abc', revision: 1, status: 'active', goal: 'validate nested evidence', createdAt: now, updatedAt: now, start: {}, close: null };
  assert.equal(validateSessionRecord({ ...base, id: '12345678-abcd', observations: [] }), false);
  assert.equal(validateSessionRecord({ ...base, observations: [{ observedAt: now, files: [] }] }), false);
  assert.equal(validateSessionRecord({ ...base, observations: [{ observedAt: now, files: [], notes: [], accomplished: [], blockers: [], decisions: [], questions: [] }] }), true);
});
