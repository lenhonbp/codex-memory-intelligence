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
  getSession,
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
  assert.ok(closed.close.guardrails.some((item) => item.id === 'do-not-trust-stale-graph'));
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
  assert.match(close.stdout, /Guardrails \/ do not assume/i);
  assert.match(close.stdout, /P0/i);
});

test('CMI session files do not make an otherwise clean project handoff look dirty', async () => {
  const root = await gitFixture();
  if (!root) return;
  const session = await startSession(root, 'inspect without changing project files');
  const closed = await closeSession(root, session.id, { outcome: 'investigated', notes: ['Reviewed current behavior only.'] });
  assert.equal(closed.close.handoff.repository.clean, true);
  assert.deepEqual(closed.close.handoff.repository.changes, []);
  assert.ok(!closed.close.findings.some((item) => item.category === 'uncommitted-session-work'));
});

test('a session that starts dirty reports attribution limits and a do-not-overattribute guardrail', async () => {
  const root = await gitFixture();
  if (!root) return;
  await fs.appendFile(path.join(root, 'src', 'service.js'), '\nexport const preexisting = true;\n');
  const session = await startSession(root, 'investigate another concern');
  const live = await assessSession(root, session.id);
  assert.ok(live.findings.some((item) => item.category === 'preexisting-worktree'));
  assert.ok(live.guardrails.some((item) => item.id === 'do-not-overattribute-dirty-worktree'));
  const closed = await closeSession(root, session.id, { outcome: 'investigated', notes: ['No attempt was made to claim the pre-existing edit.'] });
  assert.ok(closed.close.handoff.guardrails.some((item) => item.id === 'do-not-overattribute-dirty-worktree'));
});

test('latest handoff selects the most recent closed session even when a newer session is active', async () => {
  const root = await fixture();
  const first = await startSession(root, 'finish first investigation');
  await closeSession(root, first.id, { outcome: 'investigated', notes: ['First investigation complete.'] });
  const second = await startSession(root, 'new active investigation');
  const handoff = await getSessionHandoff(root, 'latest');
  assert.equal(handoff.sessionId, first.id);
  assert.notEqual(handoff.sessionId, second.id);
});

test('latest active mutation fails closed when multiple sessions are active', async () => {
  const root = await fixture();
  const first = await startSession(root, 'parallel investigation one');
  const second = await startSession(root, 'parallel investigation two');
  assert.notEqual(first.id, second.id);
  await assert.rejects(() => observeSession(root, 'latest', { notes: ['Ambiguous latest should not be accepted.'] }), /multiple active sessions|ambiguous/i);
  await observeSession(root, first.id, { notes: ['Explicit session ID remains safe.'] });
  assert.equal((await getSession(root, first.id)).observations.length, 1);
});

test('concurrent observations serialize without losing either update', async () => {
  const root = await fixture();
  const session = await startSession(root, 'collect parallel agent observations');
  await Promise.all([
    observeSession(root, session.id, { notes: ['Observation A'] }),
    observeSession(root, session.id, { notes: ['Observation B'] }),
  ]);
  const current = await getSession(root, session.id);
  const notes = current.observations.flatMap((item) => item.notes || []);
  assert.ok(notes.includes('Observation A'));
  assert.ok(notes.includes('Observation B'));
});

test('finding supersession is explicit, distinct, and points to a valid replacement', async () => {
  const root = await fixture();
  const firstSession = await startSession(root, 'record first blocker');
  await closeSession(root, firstSession.id, { blockers: ['Old blocker'] });
  const secondSession = await startSession(root, 'record replacement blocker');
  await closeSession(root, secondSession.id, { blockers: ['Replacement blocker'] });
  const open = await listFindings(root, { state: 'open', limit: 20 });
  const oldFinding = open.findings.find((item) => item.detail === 'Old blocker');
  const replacement = open.findings.find((item) => item.detail === 'Replacement blocker');
  assert.ok(oldFinding && replacement);
  await assert.rejects(() => setFindingState(root, oldFinding.id, 'superseded', { reason: 'Missing replacement.' }), /replacement finding/i);
  await assert.rejects(() => setFindingState(root, oldFinding.id, 'superseded', { reason: 'Self replacement.', supersededBy: oldFinding.id }), /supersede itself/i);
  const result = await setFindingState(root, oldFinding.id, 'superseded', { reason: 'Replacement is the current issue.', supersededBy: replacement.id.slice(0, 12), changedBy: 'reviewer' });
  assert.equal(result.supersededBy, replacement.id);
});

test('session durable input rejects secrets and unsafe explicit paths', async () => {
  const root = await fixture();
  await assert.rejects(() => startSession(root, 'debug api_key=supersecret123'), /secret/i);
  const session = await startSession(root, 'safe investigation');
  await assert.rejects(() => observeSession(root, session.id, { files: ['../outside.js'] }), /escapes the project/i);
  await assert.rejects(() => observeSession(root, session.id, { files: ['.codex-memory/private.json'] }), /must not point inside/i);
  await assert.rejects(() => observeSession(root, session.id, { notes: ['password=supersecret123'] }), /secret/i);
});
