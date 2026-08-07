import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanProject } from '../src/core.js';
import { startChangeRecord, observeChangeRecord, completeChangeRecord } from '../src/change-intelligence.js';
import { startSession, assessSession, closeSession } from '../src/session-intelligence.js';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-session-change-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ type: 'module' }));
  await fs.mkdir(path.join(root, 'src', 'auth'), { recursive: true });
  await fs.mkdir(path.join(root, 'src', 'billing'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'auth', 'session.js'), 'export function retrySession() { return true; }\n');
  await fs.writeFile(path.join(root, 'src', 'billing', 'invoice.js'), 'export function invoice() { return true; }\n');
  await scanProject(root);
  return root;
}

test('concurrent active change does not hijack a session with stronger goal evidence', async () => {
  const root = await fixture();
  const auth = await startChangeRecord(root, 'authentication retry handling');
  const billing = await startChangeRecord(root, 'billing invoice export');
  const session = await startSession(root, 'investigate authentication retries');

  const live = await assessSession(root, session.id);
  assert.ok(live.association.relatedActive.some((item) => item.id === auth.id));
  assert.ok(live.association.concurrentActive.some((item) => item.id === billing.id));

  const authFinding = live.findings.find((item) => item.key === `active-change:${auth.id}`);
  const billingFinding = live.findings.find((item) => item.key === `active-change:${billing.id}`);
  assert.equal(authFinding.sessionRelevance, 'related');
  assert.equal(billingFinding.sessionRelevance, 'concurrent-unattributed');

  const authAction = live.recommendations.find((item) => item.relatedFindingIds?.includes(authFinding.id));
  const billingAction = live.recommendations.find((item) => item.relatedFindingIds?.includes(billingFinding.id));
  assert.equal(authAction.priority, 'P1');
  assert.equal(billingAction.priority, 'P3');
  assert.notEqual(live.recommendations[0].id, billingAction.id);
});

test('a completed concurrent change in the same time window does not create session verification findings without association evidence', async () => {
  const root = await fixture();
  const session = await startSession(root, 'investigate authentication retries');
  const billing = await startChangeRecord(root, 'billing invoice export');
  await observeChangeRecord(root, billing.id, { files: ['src/billing/invoice.js'] });
  await completeChangeRecord(root, billing.id, { outcome: 'succeeded', files: ['src/billing/invoice.js'], verifications: [] });

  const closed = await closeSession(root, session.id, { outcome: 'investigated', notes: ['Authentication investigation did not touch billing.'] });
  assert.ok(closed.close.association.concurrentCompleted.some((item) => item.id === billing.id));
  assert.ok(!closed.close.association.relatedCompleted.some((item) => item.id === billing.id));
  assert.ok(!closed.close.findings.some((item) => item.key === `verification-missing:${billing.id}`));
  assert.ok(!closed.close.handoff.completedChanges.some((item) => item.id === billing.id));
  assert.ok(closed.close.handoff.concurrentChanges.completed.some((item) => item.id === billing.id));
});
