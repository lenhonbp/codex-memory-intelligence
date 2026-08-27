import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanProject } from '../src/core.js';
import { startChangeRecord, completeChangeRecord, getChangeRecord, listChangeRecords, formatChangeRecord } from '../src/change-intelligence.js';
import { startSession, closeSession } from '../src/session-intelligence.js';
import { assessCompletionEvidence } from '../src/completion-evidence.js';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-completion-evidence-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ type: 'module' }));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'service.js'), 'export function service() { return true; }\n');
  await scanProject(root);
  return root;
}

function record({ status = 'completed', outcome = 'succeeded', verifications, paths = ['src/service.js'], progress = null } = {}) {
  const target = progress ? { outcome, verifications } : { outcome, verifications };
  return {
    schemaVersion: 1,
    id: '11111111-1111-4111-8111-111111111111',
    status,
    goal: 'completion evidence fixture',
    observations: paths === null ? [] : [{ observedChangedFiles: paths }],
    ...(progress ? { completion: null, progress: target } : { completion: target }),
  };
}

function observedVerification(overrides = {}) {
  return {
    name: 'npm test', status: 'passed', provenance: 'observed-command',
    command: 'npm test', exitCode: 0, observedAt: '2026-08-27T00:00:00Z', ...overrides,
  };
}

test('baseline: succeeded with no verification remains durably completed for later finding detection', async () => {
  const root = await fixture();
  const change = await startChangeRecord(root, 'baseline unsupported completion');
  const session = await startSession(root, 'baseline unsupported completion');
  const completed = await completeChangeRecord(root, change.id, { outcome: 'succeeded', files: ['src/service.js'] });
  assert.equal(completed.status, 'completed');
  assert.equal(completed.completion.outcome, 'succeeded');
  assert.deepEqual(completed.completion.verifications, []);

  const closed = await closeSession(root, session.id, { outcome: 'investigated' });
  assert.ok(closed.close.findings.some((item) => item.category === 'verification-missing'));
});

test('baseline: partial completion keeps the Change active and does not create a terminal completion', async () => {
  const root = await fixture();
  const change = await startChangeRecord(root, 'baseline partial completion');
  const partial = await completeChangeRecord(root, change.id, { outcome: 'partial', files: ['src/service.js'] });
  assert.equal(partial.status, 'active');
  assert.equal(partial.completion, null);
  assert.equal(partial.progress.outcome, 'partial');
  assert.equal((await getChangeRecord(root, change.id)).status, 'active');
});

test('baseline: Change completion preserves reported and observed-command provenance separately', async () => {
  const root = await fixture();
  const change = await startChangeRecord(root, 'baseline verification provenance');
  const observedAt = new Date().toISOString();
  const completed = await completeChangeRecord(root, change.id, {
    outcome: 'succeeded',
    files: ['src/service.js'],
    verifications: [
      { name: 'reported check', status: 'passed' },
      { name: 'observed check', status: 'passed', command: 'node --test', exitCode: 0, observedAt },
    ],
  });
  assert.equal(completed.completion.verifications[0].provenance, 'reported');
  assert.equal(completed.completion.verifications[1].provenance, 'observed-command');
  assert.equal(completed.completion.verifications[1].command, 'node --test');
});

test('assessment: succeeded with zero verification is observed implementation but unverified completion', () => {
  const result = assessCompletionEvidence(record({ verifications: [] }));
  assert.equal(result.claimState, 'unverified');
  assert.equal(result.implementation.state, 'observed');
  assert.equal(result.verification.state, 'missing');
  assert.ok(result.reasons.some((item) => /changed paths/i.test(item)));
  assert.ok(result.gaps.some((item) => /verification evidence/i.test(item)));
});

test('assessment: reported passing verification remains reported and unverified', () => {
  const result = assessCompletionEvidence(record({ verifications: [{ name: 'npm test', status: 'passed', provenance: 'reported' }] }));
  assert.equal(result.claimState, 'unverified');
  assert.equal(result.verification.state, 'reported');
  assert.equal(result.verification.provenance, 'reported');
  assert.ok(result.gaps.some((item) => /did not observe command execution/i.test(item)));
});

test('assessment: observed-command passing verification supports the bounded Change claim only', () => {
  const result = assessCompletionEvidence(record({ verifications: [observedVerification()] }));
  assert.equal(result.claimState, 'supported');
  assert.equal(result.verification.state, 'observed');
  assert.equal(result.verification.provenance, 'observed-command');
  assert.ok(result.reasons.some((item) => /observed-command/i.test(item)));
  assert.ok(result.gaps.some((item) => /external|live|release|acceptance criteria/i.test(item)));
});

test('assessment: reported and observed failures both contradict a succeeded claim without collapsing provenance', () => {
  const reported = assessCompletionEvidence(record({ verifications: [{ name: 'reported check', status: 'failed', provenance: 'reported' }] }));
  const observed = assessCompletionEvidence(record({ verifications: [observedVerification({ status: 'failed' })] }));
  assert.equal(reported.claimState, 'contradicted');
  assert.equal(reported.verification.state, 'failed');
  assert.equal(reported.verification.provenance, 'reported');
  assert.equal(observed.claimState, 'contradicted');
  assert.equal(observed.verification.state, 'failed');
  assert.equal(observed.verification.provenance, 'observed-command');
});

test('assessment: skipped and unknown verification remain incomplete and unverified', () => {
  for (const status of ['skipped', 'unknown']) {
    const result = assessCompletionEvidence(record({ verifications: [{ name: `${status} check`, status, provenance: 'reported' }] }));
    assert.equal(result.claimState, 'unverified');
    assert.equal(result.verification.state, 'incomplete');
  }
});

test('assessment: partial Change stays active and is never implicitly terminalized', () => {
  const result = assessCompletionEvidence(record({ status: 'active', outcome: 'partial', progress: true, verifications: [] }));
  assert.equal(result.claimState, 'unverified');
  assert.equal(result.lifecycle.status, 'active');
  assert.equal(result.lifecycle.outcome, 'partial');
  assert.equal(result.lifecycle.terminal, false);
});

test('assessment: sparse legacy record fails conservatively without crashing', () => {
  const result = assessCompletionEvidence({ status: 'completed', completion: { outcome: 'succeeded' }, observations: [] });
  assert.equal(result.claimState, 'unverified');
  assert.equal(result.implementation.state, 'not-observed');
  assert.equal(result.verification.state, 'missing');
});

test('assessment: mixed passing provenance remains bounded and exposes the mix', () => {
  const result = assessCompletionEvidence(record({ verifications: [
    { name: 'reported check', status: 'passed', provenance: 'reported' },
    observedVerification({ name: 'observed check' }),
  ] }));
  assert.equal(result.claimState, 'supported');
  assert.equal(result.verification.state, 'observed');
  assert.equal(result.verification.provenance, 'mixed');
  assert.equal(result.verification.records.length, 2);
});

test('assessment: observed-command status and exitCode conflicts fail closed', () => {
  const cases = [
    { label: 'passed + zero', status: 'passed', exitCode: 0, claimState: 'supported', verificationState: 'observed' },
    { label: 'passed + non-zero', status: 'passed', exitCode: 1, claimState: 'contradicted', verificationState: 'failed' },
    { label: 'failed + non-zero', status: 'failed', exitCode: 1, claimState: 'contradicted', verificationState: 'failed' },
    { label: 'failed + zero', status: 'failed', exitCode: 0, claimState: 'contradicted', verificationState: 'failed' },
    { label: 'skipped + zero', status: 'skipped', exitCode: 0, claimState: 'unverified', verificationState: 'incomplete' },
    { label: 'unknown + zero', status: 'unknown', exitCode: 0, claimState: 'unverified', verificationState: 'incomplete' },
  ];
  for (const item of cases) {
    const result = assessCompletionEvidence(record({ verifications: [observedVerification({ status: item.status, exitCode: item.exitCode })] }));
    assert.equal(result.claimState, item.claimState, item.label);
    assert.equal(result.verification.state, item.verificationState, item.label);
  }
});

test('assessment: observed contradictory command cannot be hidden by passing evidence or ordering', () => {
  const contradictory = observedVerification({ name: 'contradictory command', status: 'passed', exitCode: 1 });
  const first = assessCompletionEvidence(record({ verifications: [observedVerification(), contradictory] }));
  const reversed = assessCompletionEvidence(record({ verifications: [contradictory, observedVerification()] }));
  assert.equal(first.claimState, 'contradicted');
  assert.equal(first.verification.state, 'failed');
  assert.equal(reversed.claimState, 'contradicted');
  assert.equal(reversed.verification.state, 'failed');
  assert.equal(first.verification.provenance, 'observed-command');
  assert.equal(reversed.verification.provenance, 'observed-command');
});

test('assessment: incomplete observed-command metadata never becomes observed', () => {
  const result = assessCompletionEvidence(record({ verifications: [{
    name: 'malformed command', status: 'passed', provenance: 'observed-command', command: 'npm test', exitCode: 0,
  }] }));
  assert.equal(result.claimState, 'unverified');
  assert.equal(result.verification.state, 'incomplete');
  assert.notEqual(result.verification.provenance, 'observed-command');
});

test('assessment does not mutate its input record', () => {
  const input = record({ verifications: [observedVerification()] });
  const before = structuredClone(input);
  assessCompletionEvidence(input);
  assert.deepEqual(input, before);
});

test('Change read and human output expose additive derived assessment without changing persisted schema', async () => {
  const root = await fixture();
  const change = await startChangeRecord(root, 'read completion assessment');
  const completed = await completeChangeRecord(root, change.id, { outcome: 'succeeded', files: ['src/service.js'] });
  const loaded = await getChangeRecord(root, change.id);
  assert.equal(loaded.completionEvidence.claimState, 'unverified');
  assert.equal(loaded.completionEvidence.verification.state, 'missing');
  assert.equal((await listChangeRecords(root, { status: 'completed' })).records[0].completionEvidence.claimState, 'unverified');
  assert.match(formatChangeRecord(loaded), /Completion claim: unverified/);
  assert.match(formatChangeRecord(loaded), /Verification evidence: missing/);
  const stored = JSON.parse(await fs.readFile(path.join(root, '.codex-memory', 'changes', `${change.id}.json`), 'utf8'));
  assert.equal(stored.completionEvidence, undefined);
  assert.equal(completed.completionEvidence.claimState, 'unverified');
});

test('Session uses shared assessment semantics for missing verification and failed verification', async () => {
  const missingRoot = await fixture();
  const missingChange = await startChangeRecord(missingRoot, 'shared assessment missing verification');
  const missingSession = await startSession(missingRoot, 'shared assessment missing verification');
  await completeChangeRecord(missingRoot, missingChange.id, { outcome: 'succeeded', files: ['src/service.js'] });
  const missingClosed = await closeSession(missingRoot, missingSession.id, { outcome: 'investigated' });
  const missingFinding = missingClosed.close.findings.find((item) => item.category === 'verification-missing');
  assert.ok(missingFinding);
  assert.ok(missingClosed.close.handoff.completedChanges.some((item) => item.id === missingChange.id));

  const failedRoot = await fixture();
  const failedChange = await startChangeRecord(failedRoot, 'shared assessment failed verification');
  const failedSession = await startSession(failedRoot, 'shared assessment failed verification');
  await completeChangeRecord(failedRoot, failedChange.id, {
    outcome: 'succeeded', files: ['src/service.js'], verifications: [{ name: 'npm test', status: 'failed', provenance: 'reported' }],
  });
  const failedClosed = await closeSession(failedRoot, failedSession.id, { outcome: 'investigated' });
  const failedFinding = failedClosed.close.findings.find((item) => item.category === 'verification-failed');
  assert.ok(failedFinding);
});

test('Session surfaces contradictory observed-command evidence without rewriting the actor claim', async () => {
  const root = await fixture();
  const change = await startChangeRecord(root, 'shared assessment contradictory command');
  const session = await startSession(root, 'shared assessment contradictory command');
  const completed = await completeChangeRecord(root, change.id, {
    outcome: 'succeeded', files: ['src/service.js'], verifications: [{
      name: 'npm test', status: 'passed', provenance: 'observed-command', command: 'npm test', exitCode: 1, observedAt: '2026-08-27T00:00:00Z',
    }],
  });
  assert.equal(completed.completion.outcome, 'succeeded');
  assert.equal(completed.completion.verifications[0].status, 'passed');
  const loaded = await getChangeRecord(root, change.id);
  assert.equal(loaded.completionEvidence.claimState, 'contradicted');
  assert.equal(loaded.completionEvidence.verification.state, 'failed');
  assert.equal(loaded.completionEvidence.verification.records[0].conflict, 'status-exitCode');
  const closed = await closeSession(root, session.id, { outcome: 'investigated' });
  assert.ok(closed.close.findings.some((item) => item.category === 'verification-failed'));
});
