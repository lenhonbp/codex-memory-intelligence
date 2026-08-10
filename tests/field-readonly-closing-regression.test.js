import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { initProject, scanProject, status as getProjectStatus } from '../src/core.js';
import {
  startSession,
  observeSession,
  closeSession,
  listFindings,
  setFindingState,
  classifySessionGraphEvidence,
} from '../src/session-intelligence.js';
import { buildClosingIntelligence } from '../src/closing-intelligence.js';

const execFileAsync = promisify(execFile);

async function git(root, args) {
  return execFileAsync('git', args, { cwd: root, encoding: 'utf8' });
}

async function gitFixture(options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-field-readonly-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ type: 'module' }));
  await fs.writeFile(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true } }));
  await fs.writeFile(path.join(root, 'vitest.config.ts'), 'export default {}\n');
  await fs.writeFile(path.join(root, 'playwright.config.ts'), 'export default {}\n');
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.mkdir(path.join(root, 'tests'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'service.js'), 'export function service() { return true; }\n');
  await fs.writeFile(path.join(root, 'tests', 'service.test.js'), 'export const covered = true;\n');
  await initProject(root);
  if (options.scan !== false) await scanProject(root);
  try {
    await git(root, ['init']);
    await git(root, ['config', 'user.email', 'test@example.com']);
    await git(root, ['config', 'user.name', 'CMI Test']);
    await git(root, ['add', '.']);
    await git(root, ['commit', '-m', 'Initial']);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  return root;
}

test('session graph evidence classifier distinguishes missing, drifted, and current graphs', () => {
  assert.equal(classifySessionGraphEvidence({ initialized: true, graph: { available: false, state: 'missing', current: false } }), 'missing');
  assert.equal(classifySessionGraphEvidence({ initialized: true, graph: { available: true, state: 'stale', current: false } }), 'drifted');
  assert.equal(classifySessionGraphEvidence({ initialized: true, graph: { available: true, state: 'healthy', current: true } }), 'current');
});

test('missing graph and index remain health guidance without becoming durable graph drift', async () => {
  const root = await gitFixture({ scan: false });
  if (!root) return;

  const beforeHead = (await git(root, ['rev-parse', 'HEAD'])).stdout.trim();
  const health = await getProjectStatus(root);
  assert.equal(health.indexHealth.state, 'missing');
  assert.equal(health.graphHealth.state, 'missing');
  assert.equal(health.evidenceHealth.capabilities.graphContext, 'blocked');
  assert.equal(health.evidenceHealth.capabilities.impactAnalysis, 'blocked');
  assert.ok(health.evidenceHealth.recommendations.some((item) => item.command === 'cmi scan'));

  const session = await startSession(root, 'controlled read-only inspected-path field probe');
  await observeSession(root, session.id, {
    files: ['package.json', 'tsconfig.json', 'vitest.config.ts', 'playwright.config.ts'],
    accomplished: ['Recorded read-only inspected paths for field validation.'],
  });
  const closed = await closeSession(root, session.id, { outcome: 'investigated' });

  assert.equal(closed.close.current.project.graph.state, 'missing');
  assert.deepEqual(new Set(closed.close.scope.paths), new Set(['package.json', 'tsconfig.json', 'vitest.config.ts', 'playwright.config.ts']));
  assert.deepEqual(new Set(closed.close.scope.explicitlyObservedPaths), new Set(['package.json', 'tsconfig.json', 'vitest.config.ts', 'playwright.config.ts']));
  assert.deepEqual(closed.close.scope.mutationPaths, []);
  assert.deepEqual(closed.close.scope.newDirtyPaths, []);
  assert.deepEqual(closed.close.scope.committedPaths, []);
  assert.equal(closed.close.handoff.repository.clean, true);
  assert.equal((await git(root, ['rev-parse', 'HEAD'])).stdout.trim(), beforeHead);
  assert.ok(!closed.close.findings.some((item) => item.category === 'graph-drift'));

  const open = await listFindings(root, { state: 'open', limit: 20 });
  assert.equal(open.total, 0);
  assert.equal(await pathExists(path.join(root, '.codex-memory', 'findings.json')), false);

  const closing = await buildClosingIntelligence(root, session.id);
  assert.equal(closing.state, 'clean');
  assert.deepEqual(closing.alerts, []);
  assert.ok(!['P0', 'P1'].includes(closing.nextAction?.priority));
});

test('missing graph does not churn an existing unrelated findings registry', async () => {
  const root = await gitFixture({ scan: false });
  if (!root) return;

  const blockerSession = await startSession(root, 'record an unrelated blocker');
  await closeSession(root, blockerSession.id, { blockers: ['External review remains pending.'] });
  const registryPath = path.join(root, '.codex-memory', 'findings.json');
  const before = await fs.readFile(registryPath, 'utf8');

  const readOnlySession = await startSession(root, 'inspect files while structural intelligence is absent');
  await closeSession(root, readOnlySession.id, {
    outcome: 'investigated',
    files: ['package.json', 'tsconfig.json', 'vitest.config.ts', 'playwright.config.ts'],
  });

  assert.equal(await fs.readFile(registryPath, 'utf8'), before);
  const open = await listFindings(root, { state: 'open', limit: 20 });
  assert.ok(open.findings.some((item) => item.category === 'session-blocker'));
  assert.ok(!open.findings.some((item) => item.category === 'graph-drift'));
});

async function pathExists(target) {
  return fs.lstat(target).then(() => true).catch((error) => {
    if (error?.code === 'ENOENT') return false;
    throw error;
  });
}

test('read-only inspected files remain session scope but never become mutation evidence', async () => {
  const root = await gitFixture();
  if (!root) return;

  const session = await startSession(root, 'check project health without changing code');
  await observeSession(root, session.id, {
    files: ['package.json', 'tsconfig.json', 'src/service.js', 'tests/service.test.js'],
    accomplished: [
      'TypeScript strict typecheck passed',
      'Unit verification passed',
      'Production build verification passed',
    ],
  });

  const closed = await closeSession(root, session.id, {
    accomplished: ['Completed repository health verification without modifying source code'],
  });

  assert.equal(closed.close.outcome, 'investigated');
  assert.deepEqual(closed.close.scope.newDirtyPaths, []);
  assert.deepEqual(closed.close.scope.committedPaths, []);
  assert.deepEqual(closed.close.scope.mutationPaths, []);
  assert.deepEqual(new Set(closed.close.scope.explicitlyObservedPaths), new Set(['package.json', 'tsconfig.json', 'src/service.js', 'tests/service.test.js']));
  assert.equal(closed.close.scope.paths.length, 4);
  assert.ok(!closed.close.findings.some((item) => item.category === 'uncaptured-session-change'));
  assert.ok(!closed.close.findings.some((item) => item.category === 'uncommitted-session-work'));
  assert.ok(!closed.close.recommendations.some((item) => /Create\/complete a CMI change record/i.test(item.action)));

  const open = await listFindings(root, { state: 'open', limit: 20 });
  assert.equal(open.total, 0);
  assert.equal(await pathExists(path.join(root, '.codex-memory', 'findings.json')), false);

  const closing = await buildClosingIntelligence(root, session.id);
  assert.equal(closing.state, 'clean');
  assert.deepEqual(closing.alerts, []);
  assert.ok(!['P0', 'P1'].includes(closing.nextAction?.priority));
});

test('Closing Intelligence suppresses a historical material next action after its finding is resolved', async () => {
  const root = await gitFixture();
  if (!root) return;

  const session = await startSession(root, 'investigate a blocker');
  const closed = await closeSession(root, session.id, { blockers: ['External specification is unavailable.'] });
  assert.equal(closed.close.handoff.nextAction.priority, 'P0');

  const open = await listFindings(root, { state: 'open', limit: 20 });
  const blocker = open.findings.find((item) => item.category === 'session-blocker');
  assert.ok(blocker);

  await setFindingState(root, blocker.id, 'resolved', {
    reason: 'The external specification was obtained and verified.',
    changedBy: 'reviewer',
  });

  const closing = await buildClosingIntelligence(root, session.id);
  assert.equal(closing.state, 'clean');
  assert.deepEqual(closing.alerts, []);
  assert.equal(closing.nextAction, null);
});

test('actual Git mutation still produces uncaptured-session-change without a Change record', async () => {
  const root = await gitFixture();
  if (!root) return;

  const session = await startSession(root, 'change service behavior');
  await fs.writeFile(path.join(root, 'src', 'service.js'), 'export function service() { return false; }\n');
  const closed = await closeSession(root, session.id, { files: ['src/service.js'] });

  assert.deepEqual(closed.close.scope.mutationPaths, ['src/service.js']);
  const finding = closed.close.findings.find((item) => item.category === 'uncaptured-session-change');
  assert.ok(finding);
  assert.deepEqual(finding.relatedFiles, ['src/service.js']);
  assert.ok(finding.evidence.includes('git-session-mutation-scope'));
});
