import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanProject } from '../src/core.js';
import { captureEvaluation, buildEvaluationReport, validateEvaluationRecord } from '../src/evaluation.js';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-eval-stress-'));
  await fs.writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'src', 'index.js'), 'export const x = 1;\n');
  await scanProject(root);
  return root;
}

test('observational evaluations reject controlled-stress assertions', async () => {
  const root = await fixture();
  await assert.rejects(() => captureEvaluation(root, {
    sourceKind: 'external-real', protocolKind: 'observational', repositoryClass: 'library', taskKind: 'audit', session: 'none',
    stressScenario: 'stale-graph', stressExpected: 1, stressPassed: 1, stressFailed: 0,
  }), /observational evaluation cannot assert controlled-stress/i);
});

test('controlled-stress requires explicit scenario and complete invariant counts', async () => {
  const root = await fixture();
  await assert.rejects(() => captureEvaluation(root, {
    sourceKind: 'external-real', protocolKind: 'controlled-stress', repositoryClass: 'library', taskKind: 'verification', session: 'none',
  }), /stress scenario/i);
  await assert.rejects(() => captureEvaluation(root, {
    sourceKind: 'external-real', protocolKind: 'controlled-stress', repositoryClass: 'library', taskKind: 'verification', session: 'none',
    stressScenario: 'history-rewrite', stressExpected: 3, stressPassed: 2, stressFailed: 0,
  }), /must equal expected/i);
});

test('stress outcome is derived from invariant counts and remains outside observational coverage', async () => {
  const root = await fixture();
  const partial = await captureEvaluation(root, {
    sourceKind: 'external-real', protocolKind: 'controlled-stress', repositoryClass: 'library', taskKind: 'verification', session: 'none',
    stressScenario: 'history-rewrite', stressExpected: 3, stressPassed: 2, stressFailed: 1,
  });
  assert.equal(partial.stress.outcome, 'partial');
  assert.equal(validateEvaluationRecord(partial), true);
  const failed = await captureEvaluation(root, {
    sourceKind: 'external-real', protocolKind: 'controlled-stress', repositoryClass: 'library', taskKind: 'verification', session: 'none',
    stressScenario: 'dirty-worktree', stressExpected: 2, stressPassed: 0, stressFailed: 2,
  });
  assert.equal(failed.stress.outcome, 'fail');
  const report = await buildEvaluationReport(root);
  assert.equal(report.coverage.state, 'none');
  assert.equal(report.corpus.externalReal.observationalRecords, 0);
  assert.equal(report.controlledStress.records, 2);
  assert.equal(report.controlledStress.outcomes.partial, 1);
  assert.equal(report.controlledStress.outcomes.fail, 1);
  assert.equal(report.controlledStress.expectedInvariantCount, 5);
  assert.equal(report.controlledStress.passedInvariantCount, 2);
  assert.equal(report.controlledStress.failedInvariantCount, 3);
});

test('expanded task taxonomy accepts refactor, migration, and architecture analysis', async () => {
  for (const taskKind of ['refactor', 'migration', 'architecture-analysis']) {
    const root = await fixture();
    const record = await captureEvaluation(root, { sourceKind: 'synthetic', repositoryClass: 'tooling', taskKind, session: 'none' });
    assert.equal(record.task.kind, taskKind);
    assert.equal(record.review.provenance, 'unreviewed');
    assert.equal(record.stress.outcome, 'not-applicable');
  }
});
