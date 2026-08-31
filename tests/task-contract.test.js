import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanProject } from '../src/core.js';
import { prepareChangeBrief } from '../src/advisor.js';
import { buildTaskContract } from '../src/task-contract.js';
import { assessCompletionEvidence } from '../src/completion-evidence.js';
import { startChangeRecord, completeChangeRecord } from '../src/change-intelligence.js';
import { startSession, closeSession } from '../src/session-intelligence.js';

function observed(name, kind, overrides = {}) {
  return {
    name,
    kind,
    status: 'passed',
    provenance: 'observed-command',
    command: `check ${name}`,
    exitCode: 0,
    observedAt: '2026-08-31T00:00:00Z',
    ...overrides,
  };
}

function recordFor(contract, verifications, outcome = 'succeeded') {
  return {
    schemaVersion: 1,
    id: '11111111-1111-4111-8111-111111111111',
    status: 'completed',
    goal: contract.goal,
    before: { taskContract: contract },
    observations: [{ observedChangedFiles: ['src/login.js'] }],
    completion: { outcome, verifications },
  };
}

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-task-contract-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ type: 'module' }));
  await fs.mkdir(path.join(root, 'src', 'ui'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'ui', 'login.js'), 'export function login() { return true; }\n');
  await scanProject(root);
  return root;
}

test('task contract adapts depth and evidence requirements to deterministic task signals', () => {
  const docs = buildTaskContract({ goal: 'Update README documentation' });
  assert.equal(docs.taskKind, 'documentation');
  assert.equal(docs.depth, 'light');
  assert.ok(docs.requiredEvidence.every((item) => item.kind === 'implementation'));
  assert.ok(!docs.requiredEvidence.some((item) => ['behavior', 'environment-specific', 'external/live', 'release'].includes(item.kind)));

  const investigation = buildTaskContract({ goal: 'Investigate why login fails' });
  assert.equal(investigation.taskKind, 'investigation');
  assert.equal(investigation.requiredEvidence.length, 0);

  const mobile = buildTaskContract({
    goal: 'Fix the mobile login bug',
    topics: [{ id: 'identity-access', title: 'Identity and access control' }, { id: 'user-interface', title: 'User interface and rendering' }],
    files: ['src/ui/login.js'],
  });
  assert.equal(mobile.depth, 'deep');
  assert.deepEqual(mobile.requiredEvidence.map((item) => item.kind), ['implementation', 'behavior', 'environment-specific']);
  assert.ok(mobile.unknowns.some((item) => /device|browser|OS|viewport/i.test(item)));

  const release = buildTaskContract({
    goal: 'Deploy the authentication change to production and release it',
    topics: [{ id: 'identity-access', title: 'Identity and access control' }, { id: 'deployment-operations', title: 'Deployment and operations' }],
  });
  assert.ok(release.requiredEvidence.some((item) => item.kind === 'external/live'));
  assert.ok(release.requiredEvidence.some((item) => item.kind === 'release'));
  assert.ok(release.unknowns.some((item) => /approval|authorization/i.test(item)));
});

test('prepareChangeBrief exposes the derived contract without changing the existing brief seam', async () => {
  const root = await fixture();
  const brief = await prepareChangeBrief(root, 'Fix the mobile login UI bug');
  assert.equal(brief.ready, true);
  assert.equal(brief.taskContract.taskKind, 'change');
  assert.ok(brief.taskContract.requiredEvidence.some((item) => item.kind === 'behavior'));
  assert.ok(brief.taskContract.requiredEvidence.some((item) => item.kind === 'environment-specific'));
  assert.equal(brief.taskContract.risk.evidenceType, 'inferred');
});

test('required evidence keeps observed implementation separate from missing behavior and environment evidence', () => {
  const contract = buildTaskContract({
    goal: 'Fix the mobile login bug',
    topics: [{ id: 'identity-access', title: 'Identity and access control' }],
  });
  const incomplete = assessCompletionEvidence(recordFor(contract, [observed('unit tests', 'implementation')]));
  assert.equal(incomplete.claimState, 'unverified');
  assert.equal(incomplete.requiredEvidence.state, 'incomplete');
  assert.equal(incomplete.requiredEvidence.satisfiedCount, 1);
  assert.ok(incomplete.gaps.some((item) => /required task evidence/i.test(item)));

  const complete = assessCompletionEvidence(recordFor(contract, [
    observed('unit tests', 'implementation'),
    observed('login behavior', 'behavior'),
    observed('mobile browser', 'environment-specific'),
  ]));
  assert.equal(complete.claimState, 'supported');
  assert.equal(complete.requiredEvidence.state, 'satisfied');
  assert.equal(complete.requiredEvidence.satisfiedCount, 3);
});

test('reported or untyped evidence cannot satisfy specific required domains', () => {
  const contract = buildTaskContract({
    goal: 'Fix the mobile login bug',
    topics: [{ id: 'identity-access', title: 'Identity and access control' }],
  });
  const reported = assessCompletionEvidence(recordFor(contract, [
    { name: 'browser check', kind: 'behavior', status: 'passed', provenance: 'reported' },
    observed('unit tests', 'implementation'),
    observed('mobile check', 'environment-specific'),
  ]));
  assert.equal(reported.claimState, 'unverified');
  assert.equal(reported.requiredEvidence.requirements.find((item) => item.kind === 'behavior').state, 'reported');

  const untyped = assessCompletionEvidence(recordFor(contract, [observed('unit tests', undefined)]));
  assert.equal(untyped.claimState, 'unverified');
  assert.equal(untyped.requiredEvidence.requirements.find((item) => item.kind === 'behavior').state, 'missing');
});

test('Change snapshots the contract and Session reuses shared required-evidence assessment', async () => {
  const root = await fixture();
  const change = await startChangeRecord(root, 'Fix the mobile login bug');
  assert.ok(change.before.taskContract);
  assert.ok(change.before.taskContract.requiredEvidence.some((item) => item.kind === 'environment-specific'));

  const session = await startSession(root, 'Fix the mobile login bug');
  const completed = await completeChangeRecord(root, change.id, {
    outcome: 'succeeded',
    files: ['src/ui/login.js'],
    verifications: [observed('unit tests', 'implementation')],
  });
  assert.equal(completed.completion.outcome, 'succeeded');
  assert.equal(completed.completionEvidence.requiredEvidence.state, 'incomplete');

  const closed = await closeSession(root, session.id, { outcome: 'investigated' });
  assert.ok(closed.close.findings.some((item) => item.category === 'verification-incomplete' && /incomplete required evidence/i.test(item.detail)));
});

test('legacy records without a contract preserve generic completion semantics', () => {
  const result = assessCompletionEvidence({
    status: 'completed',
    completion: { outcome: 'succeeded', verifications: [observed('unit tests', 'implementation')] },
    observations: [{ observedChangedFiles: ['src/login.js'] }],
  });
  assert.equal(result.claimState, 'supported');
  assert.equal(result.requiredEvidence.state, 'not-assessed');
});
