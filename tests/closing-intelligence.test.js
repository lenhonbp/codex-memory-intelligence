import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { scanProject, remember } from '../src/core.js';
import { setMemoryLifecycle } from '../src/stale.js';
import { startChangeRecord, observeChangeRecord, completeChangeRecord, listChangeRecords } from '../src/change-intelligence.js';
import { startSession, observeSession, closeSession, getSessionHandoff } from '../src/session-intelligence.js';
import { buildClosingIntelligence, formatClosingIntelligence } from '../src/closing-intelligence.js';
import { activateProject } from '../src/activation.js';

const execFileAsync = promisify(execFile);

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-closing-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ type: 'module' }));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'feature-a.js'), 'export const featureA = true;\n');
  await fs.writeFile(path.join(root, 'src', 'feature-b.js'), 'export const featureB = true;\n');
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

test('unfinished feature A remains visible after unrelated feature B closes, then disappears after A is completed', async () => {
  const root = await fixture();
  const changeA = await startChangeRecord(root, 'feature A profile flow');
  const sessionA = await startSession(root, 'feature A profile flow');
  await closeSession(root, sessionA.id, { outcome: 'partial', notes: ['Feature A is intentionally left unfinished for now.'] });
  const sessionB = await startSession(root, 'feature B notification copy');
  await closeSession(root, sessionB.id, { outcome: 'investigated', notes: ['Reviewed feature B without touching feature A.'] });
  const closingB = await buildClosingIntelligence(root, sessionB.id);
  const carryover = closingB.alerts.find((item) => item.kind === 'unfinished-work' && item.relatedChangeIds.includes(changeA.id));
  assert.ok(carryover);
  assert.equal(carryover.severity, 'reminder');
  assert.match(carryover.title, /Unfinished previous work.*feature A/i);
  assert.equal(carryover.evidenceType, 'observed');
  assert.equal(closingB.nextAction.priority, 'P3');
  assert.match(closingB.nextAction.action, /do not block.*unrelated task/i);
  await completeChangeRecord(root, changeA.id, { outcome: 'abandoned', notes: ['Explicitly deferred by project owner.'] });
  const sessionC = await startSession(root, 'feature C unrelated review');
  await closeSession(root, sessionC.id, { outcome: 'investigated', notes: ['No implementation change.'] });
  const closingC = await buildClosingIntelligence(root, sessionC.id);
  assert.ok(!closingC.alerts.some((item) => item.relatedChangeIds.includes(changeA.id)));
});

test('intentional partial session closes without finalizing its active Change', async () => {
  const root = await fixture();
  await activateProject(root, { agent: 'generic' });
  const session = await startSession(root, 'implement feature A profile flow');
  const change = await startChangeRecord(root, 'feature A profile flow');
  await fs.appendFile(path.join(root, 'src', 'feature-a.js'), 'export const profileCheckpoint = true;\n');
  await observeChangeRecord(root, change.id, { files: ['src/feature-a.js'] });
  await observeSession(root, session.id, { accomplished: ['Implemented the reversible profile checkpoint.'], notes: ['Verification passed for the checkpoint; final integration is intentionally deferred for review.'] });

  const closed = await closeSession(root, session.id, { outcome: 'partial', notes: ['Stopped before final integration for user review.'] });
  assert.equal(closed.status, 'closed');
  const handoff = await getSessionHandoff(root, session.id);
  assert.ok(handoff.activeChanges.some((item) => item.id === change.id));
  assert.ok(!handoff.completedChanges.some((item) => item.id === change.id));
  const active = await listChangeRecords(root, { status: 'active' });
  const completed = await listChangeRecords(root, { status: 'completed' });
  assert.ok(active.records.some((item) => item.id === change.id));
  assert.ok(!completed.records.some((item) => item.id === change.id));

  const closing = await buildClosingIntelligence(root, session.id);
  assert.equal(closing.counts.blocker, 0);
  const reminder = closing.alerts.find((item) => item.relatedChangeIds.includes(change.id));
  assert.ok(reminder);
  assert.equal(reminder.severity, 'reminder');
  assert.equal(reminder.violationEstablished, false);
});

test('same-session source-only graph drift closes as a non-blocking refresh reminder', async () => {
  const root = await gitFixture();
  if (!root) return;
  const session = await startSession(root, 'update feature A implementation');
  await fs.appendFile(path.join(root, 'src', 'feature-a.js'), 'export const updatedFeatureA = true;\n');
  await closeSession(root, session.id, { outcome: 'partial', files: ['src/feature-a.js'] });
  const closing = await buildClosingIntelligence(root, session.id);
  const drift = closing.alerts.find((item) => item.kind === 'graph-drift');
  assert.ok(drift);
  assert.equal(drift.severity, 'reminder');
  assert.equal(drift.violationEstablished, false);
  assert.ok(drift.evidence.includes('session-source-mutation'));
});

test('reviewed UI rule is surfaced as applicability evidence without inventing a Figma violation', async () => {
  const root = await fixture();
  await fs.mkdir(path.join(root, 'docs'), { recursive: true });
  await fs.writeFile(path.join(root, 'docs', 'design-system.md'), '# Design system\nUse Figma spacing tokens and the reviewed primary-button sizing contract.\n');
  await fs.writeFile(path.join(root, 'src', 'ui.js'), 'export const buttonLayout = true;\n');
  await scanProject(root);
  const decision = await remember(root, 'decision', 'UI button layout must follow the reviewed Figma spacing tokens and primary-button sizing contract.', { sources: ['docs/design-system.md'] });
  await setMemoryLifecycle(root, decision.id, 'active', { changedBy: 'design-reviewer', reason: 'Design-system rule reviewed for project UI work.' });
  const session = await startSession(root, 'update UI button layout from Figma');
  await closeSession(root, session.id, { outcome: 'investigated', files: ['src/ui.js'], notes: ['Reviewed UI layout implementation.'] });
  const closing = await buildClosingIntelligence(root, session.id);
  const rule = closing.alerts.find((item) => item.kind === 'consistency-rule');
  assert.ok(rule);
  assert.equal(rule.evidenceType, 'reviewed');
  assert.equal(rule.violationEstablished, false);
  assert.match(rule.detail, /has not established a violation/i);
});

test('clean closing emits a single branded CLEAN line', async () => {
  const root = await fixture();
  const session = await startSession(root, 'read current feature names');
  await closeSession(root, session.id, { outcome: 'investigated', notes: ['Read-only inspection completed.'] });
  const closing = await buildClosingIntelligence(root, session.id);
  assert.equal(closing.state, 'clean');
  assert.deepEqual(closing.alerts, []);
  assert.match(formatClosingIntelligence(closing), /^### CMI Intelligence\n✓ CLEAN/m);
});

test('closing intelligence shows at most three highest-priority alerts', async () => {
  const root = await fixture();
  const session = await startSession(root, 'investigate multiple blockers');
  await closeSession(root, session.id, { blockers: ['Blocker one.', 'Blocker two.', 'Blocker three.', 'Blocker four.'] });
  const closing = await buildClosingIntelligence(root, session.id);
  assert.equal(closing.alerts.length, 3);
  assert.ok(closing.counts.totalCandidates >= 4);
  assert.ok(closing.alerts.every((item) => item.severity === 'blocker'));
});

test('Codex activation instructs the agent to append bounded evidence-based CMI Intelligence', async () => {
  const root = await fixture();
  await activateProject(root, { agent: 'codex' });
  const agents = await fs.readFile(path.join(root, 'AGENTS.md'), 'utf8');
  assert.match(agents, /### CMI Intelligence/);
  assert.match(agents, /at most three alerts/i);
  assert.match(agents, /CLEAN/i);
  assert.match(agents, /not proof of a violation/i);
  assert.match(agents, /do not rely on graph\/impact output as current evidence/i);
  assert.match(agents, /do not scan merely to make Closing Intelligence CLEAN/i);
});
