import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { scanProject } from '../src/core.js';
import {
  startSession,
  observeSession,
  assessSession,
  closeSession,
  getSessionHandoff,
  listFindings,
  getFinding,
  setFindingState,
  validateSessionRecord,
} from '../src/session-intelligence.js';

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-session-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ type: 'module' }));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'service.js'), 'export function service() { return true; }\n');
  await scanProject(root);
  return root;
}

async function gitFixture() {
  const root = await fixture();
  try {
    await execFileAsync('git', ['init'], { cwd: root });
    await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
    await execFileAsync('git', ['config', 'user.name', 'CMI Test'], { cwd: root });
    await execFileAsync('git', ['add', '.'], { cwd: root });
    await execFileAsync('git', ['commit', '-m', 'Initial'], { cwd: root });
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  return root;
}

test('no-code investigation closes with a handoff and explicit next action', async () => {
  const root = await fixture();
  const session = await startSession(root, 'understand retry behavior');
  assert.equal(session.status, 'active');
  assert.ok(validateSessionRecord(session));

  await observeSession(root, session.id, {
    accomplished: ['Mapped the current retry flow.'],
    decisions: ['Keep retries bounded at the API boundary pending review.'],
    questions: ['Does the worker retry the same request independently?'],
  });
  const closed = await closeSession(root, session.id);
  assert.equal(closed.status, 'closed');
  assert.equal(closed.close.outcome, 'investigated');
  assert.ok(closed.close.findings.some((item) => item.category === 'open-question'));
  assert.ok(closed.close.recommendations.length > 0);
  assert.ok(closed.close.handoff.nextAction.action.length > 10);
  assert.ok(closed.close.knowledgeCandidates.some((item) => item.type === 'decision'));
  assert.ok(validateSessionRecord(closed));

  const handoff = await getSessionHandoff(root, session.id);
  assert.equal(handoff.objective, 'understand retry behavior');
  assert.equal(handoff.outcome, 'investigated');
  assert.ok(handoff.openQuestions.length === 1);
});

test('graph drift and uncaptured changed scope produce evidence-based next actions', async () => {
  const root = await gitFixture();
  if (!root) return;
  const session = await startSession(root, 'change service behavior');
  await fs.writeFile(path.join(root, 'src', 'service.js'), 'export function service() { return false; }\n');

  const live = await assessSession(root, session.id);
  assert.ok(live.findings.some((item) => item.category === 'graph-drift'));

  const closed = await closeSession(root, session.id, { files: ['src/service.js'] });
  const categories = new Set(closed.close.findings.map((item) => item.category));
  assert.ok(categories.has('graph-drift'));
  assert.ok(categories.has('uncaptured-session-change'));
  assert.ok(closed.close.recommendations.some((item) => item.priority === 'P1' && /cmi scan/i.test(item.action)));
  assert.equal(closed.close.outcome, 'partial');
});

test('unresolved blockers persist across sessions until explicitly resolved', async () => {
  const root = await fixture();
  const first = await startSession(root, 'investigate a production-style blocker');
  const closed = await closeSession(root, first.id, { blockers: ['Migration ordering is still unknown.'] });
  assert.equal(closed.close.outcome, 'blocked');

  let open = await listFindings(root, { state: 'open' });
  const blocker = open.findings.find((item) => item.category === 'session-blocker');
  assert.ok(blocker);

  const second = await startSession(root, 'inspect an unrelated module');
  await closeSession(root, second.id, { outcome: 'investigated', notes: ['No code change was required.'] });
  open = await listFindings(root, { state: 'open' });
  assert.ok(open.findings.some((item) => item.id === blocker.id));

  const full = await getFinding(root, blocker.id);
  assert.equal(full.state, 'open');
  const resolved = await setFindingState(root, blocker.id, 'resolved', { reason: 'Migration order was verified manually.', changedBy: 'reviewer' });
  assert.equal(resolved.state, 'resolved');
  open = await listFindings(root, { state: 'open' });
  assert.ok(!open.findings.some((item) => item.id === blocker.id));
});

test('deterministic graph-drift findings auto-resolve when the condition disappears', async () => {
  const root = await fixture();
  const first = await startSession(root, 'inspect graph freshness');
  await fs.writeFile(path.join(root, 'src', 'service.js'), 'export function changed() { return true; }\n');
  await closeSession(root, first.id, { files: ['src/service.js'], outcome: 'partial' });
  let open = await listFindings(root, { state: 'open' });
  assert.ok(open.findings.some((item) => item.category === 'graph-drift'));

  await scanProject(root);
  const second = await startSession(root, 'confirm refreshed intelligence');
  await closeSession(root, second.id, { outcome: 'investigated', notes: ['Graph was refreshed and checked.'] });
  open = await listFindings(root, { state: 'open' });
  assert.ok(!open.findings.some((item) => item.category === 'graph-drift'));
});

test('CLI session close emits problems and next actions without an extra user question', async () => {
  const root = await fixture();
  const cli = path.join(projectRoot, 'src', 'cli-entry.js');
  const start = await execFileAsync(process.execPath, [cli, 'session', 'start', 'review', 'worker', 'flow', '--json'], { cwd: root });
  const session = JSON.parse(start.stdout);
  const close = await execFileAsync(process.execPath, [cli, 'session', 'close', session.id, '--blocker', 'Worker retry ownership is unresolved.'], { cwd: root });
  assert.match(close.stdout, /Problems \/ unresolved findings/i);
  assert.match(close.stdout, /Recommended next actions/i);
  assert.match(close.stdout, /P0/i);
});
