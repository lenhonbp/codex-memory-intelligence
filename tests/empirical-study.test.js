import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  aggregateStudyLedgers,
  createStudyLedger,
  recordStudyCondition,
  reportStudyLedger,
  validateStudyLedger,
} from '../src/empirical-study.js';

const REVISION = 'a'.repeat(40);

function study(overrides = {}) {
  return createStudyLedger({
    studyId: 'study-001',
    pairId: 'pair-001',
    repositoryStudyId: 'repo-alpha',
    revision: REVISION,
    repoClass: 'application',
    taskClass: 'continuation',
    order: 'plain-first',
    agentConfiguration: 'same model and reasoning settings; condition tools differ only by CMI availability',
    taskReference: 'study-spec:task-001',
    acceptanceReference: 'study-spec:acceptance-001',
    negativeControl: false,
    ...overrides,
  }, new Date('2026-08-08T09:00:00.000Z'));
}

function result(overrides = {}) {
  return {
    conditionConfiguration: 'fresh isolated agent session with condition-appropriate tools',
    observedStartRevision: REVISION,
    freshSession: true,
    sameStartRevision: true,
    cleanStartState: true,
    crossConditionLeakage: 'none',
    reconstructionAdequacyReached: true,
    inspectionCount: 8,
    searchCount: 3,
    gitQueryCount: 2,
    clarificationCount: 0,
    filesInspected: ['src/index.js', 'src/service.js'],
    materialRisksFoundEarly: 1,
    materialRisksFoundLate: 0,
    materialRisksMissed: 0,
    falsePositiveFindings: 0,
    verificationPlan: ['npm test'],
    verificationOutcome: 'passed',
    verificationChoiceOutcome: 'not-applicable',
    taskOutcome: 'succeeded',
    handoffScore: 4,
    reviewerKind: 'agent',
    reviewerAssurance: 'declared',
    notesReference: 'study-notes:plain-001',
    startedAt: null,
    endedAt: null,
    ...overrides,
  };
}

test('study preregistration creates exactly two pending external-ledger conditions', () => {
  const ledger = study();
  const validated = validateStudyLedger(ledger);
  assert.equal(validated.kind, 'cmi-empirical-study-ledger');
  assert.equal(validated.policy.storage, 'external-ledger');
  assert.equal(validated.policy.cmiDurableWrite, false);
  assert.equal(validated.policy.claimDiscipline, 'descriptive-only');
  assert.deepEqual(validated.conditions.map((entry) => [entry.condition, entry.order, entry.status]), [
    ['plain', 'first', 'pending'],
    ['cmi', 'second', 'pending'],
  ]);
});

test('condition capture is immutable and requires the preregistered start revision', () => {
  const ledger = study();
  const withPlain = recordStudyCondition(ledger, 'plain', result());
  assert.equal(withPlain.conditions.find((entry) => entry.condition === 'plain').status, 'completed');
  assert.equal(withPlain.conditions.find((entry) => entry.condition === 'plain').result.reviewerBlinding, 'unknown');
  assert.throws(() => recordStudyCondition(withPlain, 'plain', result()), /already recorded/i);
  assert.throws(() => recordStudyCondition(ledger, 'cmi', result({ observedStartRevision: 'b'.repeat(40) })), /does not match preregistered revision/i);
});

test('paired report exposes raw deltas but remains descriptive-only with declared agent review', () => {
  let ledger = study();
  ledger = recordStudyCondition(ledger, 'plain', result({
    inspectionCount: 12,
    searchCount: 5,
    gitQueryCount: 4,
    filesInspected: ['src/a.js', 'src/b.js', 'src/c.js', 'src/d.js'],
    materialRisksMissed: 1,
    handoffScore: 2,
  }));
  ledger = recordStudyCondition(ledger, 'cmi', result({
    inspectionCount: 6,
    searchCount: 2,
    gitQueryCount: 1,
    filesInspected: ['src/a.js', 'src/b.js'],
    materialRisksFoundEarly: 2,
    materialRisksMissed: 0,
    verificationChoiceOutcome: 'improved',
    handoffScore: 5,
    notesReference: 'study-notes:cmi-001',
  }));

  const report = reportStudyLedger(ledger);
  assert.equal(report.status, 'complete');
  assert.equal(report.protocolEligible, true);
  assert.equal(report.productValueEligible, false);
  assert.equal(report.claimDiscipline, 'descriptive-only');
  assert.deepEqual(report.deltas, {
    inspectionCount: 6,
    searchCount: 3,
    gitQueryCount: 3,
    clarificationCount: 0,
    filesInspected: 2,
    materialRisksMissed: 1,
    falsePositiveFindings: 0,
    handoffScore: 3,
  });
  assert.equal(report.pairedEffects.fewerInspections, 6);
  assert.equal(report.pairedEffects.moreRisksFoundEarly, 1);
  assert.equal(report.pairedEffects.fewerMissedRisks, 1);
  assert.equal(report.pairedEffects.higherHandoffScore, 3);
  assert.equal(report.pairedEffects.fasterByMs, null);
  assert.equal(report.verificationChoiceOutcome, 'improved');
  assert.ok(report.limitations.some((item) => /agent/i.test(item)));
  assert.ok(report.limitations.some((item) => /single pair/i.test(item)));
  assert.ok(!Object.hasOwn(report, 'supportsCmi'));
});

test('externally verified blinded human review and external timing create product-value-eligible paired evidence', () => {
  let ledger = study();
  ledger = recordStudyCondition(ledger, 'plain', result({
    inspectionCount: 10,
    materialRisksFoundEarly: 1,
    materialRisksFoundLate: 1,
    materialRisksMissed: 1,
    handoffScore: 2,
    reviewerKind: 'human',
    reviewerAssurance: 'externally-verified',
    reviewerBlinding: 'blinded',
    startedAt: '2026-08-08T09:00:00.000Z',
    endedAt: '2026-08-08T09:10:00.000Z',
  }));
  ledger = recordStudyCondition(ledger, 'cmi', result({
    inspectionCount: 6,
    materialRisksFoundEarly: 2,
    materialRisksFoundLate: 0,
    materialRisksMissed: 0,
    handoffScore: 5,
    reviewerKind: 'human',
    reviewerAssurance: 'externally-verified',
    reviewerBlinding: 'blinded',
    startedAt: '2026-08-08T10:00:00.000Z',
    endedAt: '2026-08-08T10:06:00.000Z',
  }));

  const report = reportStudyLedger(ledger);
  assert.equal(report.protocolEligible, true);
  assert.equal(report.productValueEligible, true);
  assert.equal(report.conditions[0].taskDurationMs, 600000);
  assert.equal(report.conditions[1].taskDurationMs, 360000);
  assert.equal(report.pairedEffects.fasterByMs, 240000);
  assert.equal(report.pairedEffects.moreRisksFoundEarly, 1);
  assert.equal(report.pairedEffects.fewerRisksFoundLate, 1);
  assert.equal(report.pairedEffects.fewerMissedRisks, 1);
  assert.equal(report.pairedEffects.higherHandoffScore, 3);
});

test('cross-condition contamination excludes a complete pair from protocol-eligible pooling', () => {
  let ledger = study({ order: 'cmi-first' });
  ledger = recordStudyCondition(ledger, 'plain', result());
  ledger = recordStudyCondition(ledger, 'cmi', result({ crossConditionLeakage: 'known', verificationChoiceOutcome: 'unchanged' }));
  const report = reportStudyLedger(ledger);
  assert.equal(report.status, 'complete');
  assert.equal(report.protocolEligible, false);
  assert.equal(report.productValueEligible, false);
  assert.ok(report.limitations.some((item) => /cross-condition leakage is known/i.test(item)));
});

test('aggregate keeps paired results, order balance, negative controls, and reviewer provenance separate', () => {
  let first = study();
  first = recordStudyCondition(first, 'plain', result({ inspectionCount: 10 }));
  first = recordStudyCondition(first, 'cmi', result({ inspectionCount: 6, verificationChoiceOutcome: 'improved' }));

  let second = study({
    studyId: 'study-002',
    pairId: 'pair-002',
    repositoryStudyId: 'repo-beta',
    order: 'cmi-first',
    taskClass: 'negative-control',
    negativeControl: true,
  });
  second = recordStudyCondition(second, 'plain', result({
    inspectionCount: 3,
    reviewerKind: 'human',
    reviewerAssurance: 'externally-verified',
    reviewerBlinding: 'blinded',
  }));
  second = recordStudyCondition(second, 'cmi', result({
    inspectionCount: 3,
    verificationChoiceOutcome: 'unchanged',
    reviewerKind: 'human',
    reviewerAssurance: 'externally-verified',
    reviewerBlinding: 'blinded',
  }));

  const aggregate = aggregateStudyLedgers([first, second]);
  assert.equal(aggregate.repositories, 2);
  assert.deepEqual(aggregate.pairs, { total: 2, complete: 2, protocolEligible: 2, productValueEligible: 1, negativeControls: 1 });
  assert.deepEqual(aggregate.orderDistribution, { 'plain-first': 1, 'cmi-first': 1 });
  assert.deepEqual(aggregate.verificationChoiceOutcomes, { improved: 1, unchanged: 1 });
  assert.deepEqual(aggregate.reviewerDistribution, { 'declared-agent': 2, 'externally-verified-human': 2 });
  assert.deepEqual(aggregate.reviewerBlindingDistribution, { unknown: 2, blinded: 2 });
  assert.equal(aggregate.reconstruction.plain.inspectionCount.median, 6.5);
  assert.equal(aggregate.reconstruction.cmi.inspectionCount.median, 4.5);
  assert.equal(aggregate.pairedEffects.fewerInspections.median, 2);
  assert.equal(aggregate.productValuePairedEffects.fewerInspections.median, 0);
  assert.equal(aggregate.claimDiscipline, 'descriptive-only');
  assert.equal(aggregate.pairedResults.length, 2);
});

test('ledger rejects absolute or escaping file paths in externally observed inspection evidence', () => {
  const ledger = study();
  assert.throws(() => recordStudyCondition(ledger, 'plain', result({ filesInspected: ['/tmp/secret.js'] })), /repository-relative/i);
  assert.throws(() => recordStudyCondition(ledger, 'plain', result({ filesInspected: ['src/../outside.js'] })), /must not escape/i);
});

test('unreviewed evidence cannot claim reviewer blinding', () => {
  const ledger = study();
  assert.throws(() => recordStudyCondition(ledger, 'plain', result({
    reviewerKind: 'unreviewed',
    reviewerAssurance: 'not-applicable',
    reviewerBlinding: 'blinded',
  })), /reviewerBlinding must be unknown/i);
});

test('CLI can preregister, record, validate, report, and aggregate without writing CMI durable state', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-empirical-study-'));
  const ledgerPath = path.join(root, 'ledger.json');
  const plainPath = path.join(root, 'plain.json');
  const cmiPath = path.join(root, 'cmi.json');
  await fs.writeFile(plainPath, `${JSON.stringify(result(), null, 2)}\n`);
  await fs.writeFile(cmiPath, `${JSON.stringify(result({ verificationChoiceOutcome: 'unchanged', notesReference: 'study-notes:cmi-cli' }), null, 2)}\n`);

  const run = (...args) => spawnSync(process.execPath, ['scripts/empirical-study.js', ...args], { cwd: process.cwd(), encoding: 'utf8' });
  let command = run('init', '--out', ledgerPath, '--study-id', 'cli-study', '--pair-id', 'cli-pair', '--repository-study-id', 'cli-repo', '--revision', REVISION, '--repo-class', 'application', '--task-class', 'audit', '--order', 'plain-first', '--agent-configuration', 'test agent configuration');
  assert.equal(command.status, 0, command.stderr);
  command = run('record', '--file', ledgerPath, '--condition', 'plain', '--input', plainPath);
  assert.equal(command.status, 0, command.stderr);
  command = run('record', '--file', ledgerPath, '--condition', 'cmi', '--input', cmiPath);
  assert.equal(command.status, 0, command.stderr);
  command = run('validate', '--file', ledgerPath);
  assert.equal(command.status, 0, command.stderr);
  command = run('report', '--file', ledgerPath, '--json');
  assert.equal(command.status, 0, command.stderr);
  const report = JSON.parse(command.stdout);
  assert.equal(report.status, 'complete');
  assert.equal(report.protocolEligible, true);
  assert.equal(report.productValueEligible, false);
  command = run('aggregate', '--file', ledgerPath, '--json');
  assert.equal(command.status, 0, command.stderr);
  const aggregate = JSON.parse(command.stdout);
  assert.equal(aggregate.pairs.complete, 1);
  assert.equal(await fs.stat(path.join(root, '.codex-memory')).then(() => true).catch(() => false), false);
});