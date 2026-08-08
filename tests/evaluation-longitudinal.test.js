import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { scanProject } from '../src/core.js';
import { startSession, closeSession } from '../src/session-intelligence.js';
import { captureEvaluation, reviewEvaluation, buildEvaluationReport, exportEvaluations, importEvaluations, validateEvaluationRecord } from '../src/evaluation.js';

async function fixture(prefix = 'cmi-longitudinal-') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture', type: 'module' }));
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'src', 'index.js'), 'export const value = 1;\n');
  await fs.writeFile(path.join(root, 'ROADMAP.md'), '# Next\n\n- [ ] Continue the next evidence-backed task.\n');
  await scanProject(root);
  return root;
}
async function captureSession(root, taskKind = 'review') {
  const session = await startSession(root, `fixture ${taskKind}`);
  const closed = await closeSession(root, session.id, { outcome: 'investigated', accomplished: ['Observed fixture state.'] });
  return captureEvaluation(root, { sourceKind: 'external-real', repositoryClass: 'application', taskKind, session: closed.id });
}

test('human longitudinal review records reconstruction and follow-up judgments only when captured evidence supports them', async () => {
  const root = await fixture();
  const first = await captureSession(root, 'review');
  const second = await captureSession(root, 'research');
  const firstReviewed = await reviewEvaluation(root, first.id, {
    reviewOutcome: 'pass', reviewProvenance: 'human', nextActionRating: 'useful', handoffRating: 'useful',
    reconstructionRating: 'reduced', followUpOutcome: 'not-needed', historyRating: 'not-applicable', verificationChoiceOutcome: 'not-applicable',
  });
  assert.equal(firstReviewed.review.reconstructionRating, 'reduced');
  assert.equal(firstReviewed.review.followUpOutcome, 'not-needed');
  await reviewEvaluation(root, second.id, {
    reviewOutcome: 'pass', reviewProvenance: 'human', reconstructionRating: 'reduced', followUpOutcome: 'not-needed', historyRating: 'not-applicable', verificationChoiceOutcome: 'not-applicable',
  });
  const report = await buildEvaluationReport(root);
  assert.equal(report.longitudinal.repeatedRepositories, 1);
  assert.equal(report.longitudinal.repeatedRecords, 2);
  assert.equal(report.longitudinal.repeatedRepositoriesWithMultipleTaskKinds, 1);
  assert.equal(report.longitudinal.human.reconstructionRatedRecords, 2);
  assert.equal(report.longitudinal.human.reconstructionReducedRate, 1);
  assert.equal(report.longitudinal.human.followUpNotNeededRate, 1);
  assert.equal(report.evidenceDiagnostics.state, 'collecting');
  assert.ok(report.evidenceDiagnostics.gaps.some((item) => /at least two independent/i.test(item)));
  assert.equal(report.evidenceDiagnostics.automaticRecalibrationAllowed, false);
});

test('history and verification-choice judgments fail closed without captured history evidence', async () => {
  const root = await fixture();
  const record = await captureSession(root, 'verification');
  await assert.rejects(() => reviewEvaluation(root, record.id, {
    reviewOutcome: 'partial', reviewProvenance: 'human', historyRating: 'useful', verificationChoiceOutcome: 'improved',
  }), /requires at least one completed change-history record/i);
});

test('unreviewed capture cannot smuggle longitudinal outcome judgments', async () => {
  const root = await fixture();
  await assert.rejects(() => captureEvaluation(root, {
    sourceKind: 'external-real', repositoryClass: 'application', taskKind: 'audit', session: 'none', reconstructionRating: 'reduced',
  }), /unreviewed evaluation cannot assert/i);
});

test('portable evaluation bundles round-trip validated anonymized records and dedupe identical ids', async () => {
  const source = await fixture('cmi-longitudinal-source-');
  const target = await fixture('cmi-longitudinal-target-');
  const record = await captureSession(source, 'review');
  const bundle = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-evaluation-bundle-')), 'corpus.json');
  const exported = await exportEvaluations(source, bundle, { sourceKind: 'external-real' });
  assert.equal(exported.records, 1);
  const parsed = JSON.parse(await fs.readFile(bundle, 'utf8'));
  assert.equal(parsed.kind, 'cmi-evaluation-bundle');
  assert.equal(parsed.records[0].id, record.id);
  assert.doesNotMatch(JSON.stringify(parsed), new RegExp(source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const imported = await importEvaluations(target, bundle);
  assert.equal(imported.imported, 1);
  assert.equal(imported.skipped, 0);
  const repeated = await importEvaluations(target, bundle);
  assert.equal(repeated.imported, 0);
  assert.equal(repeated.skipped, 1);
  const report = await buildEvaluationReport(target, { sourceKind: 'external-real' });
  assert.equal(report.corpus.externalReal.records, 1);
});

test('portable import rejects conflicting evidence for an existing evaluation id', async () => {
  const source = await fixture('cmi-longitudinal-conflict-source-');
  const target = await fixture('cmi-longitudinal-conflict-target-');
  const record = await captureSession(source, 'review');
  const bundleDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-evaluation-conflict-'));
  const bundle = path.join(bundleDir, 'corpus.json');
  await exportEvaluations(source, bundle);
  await importEvaluations(target, bundle);
  const parsed = JSON.parse(await fs.readFile(bundle, 'utf8'));
  parsed.records[0].task.kind = 'research';
  const conflict = path.join(bundleDir, 'conflict.json');
  await fs.writeFile(conflict, JSON.stringify(parsed));
  await assert.rejects(() => importEvaluations(target, conflict), new RegExp(`conflict for id ${record.id}`, 'i'));
});

test('report filters bound longitudinal windows without changing stored evidence', async () => {
  const root = await fixture();
  const record = await captureSession(root, 'review');
  const file = path.join(root, '.codex-memory', 'evaluations', `${record.id}.json`);
  const saved = JSON.parse(await fs.readFile(file, 'utf8'));
  saved.recordedAt = '2020-01-01T00:00:00.000Z';
  assert.equal(validateEvaluationRecord(saved), true);
  await fs.writeFile(file, `${JSON.stringify(saved, null, 2)}\n`);
  const recent = await buildEvaluationReport(root, { sinceDays: 7 });
  assert.equal(recent.corpus.totalRecords, 0);
  const all = await buildEvaluationReport(root, { taskKind: 'review' });
  assert.equal(all.corpus.totalRecords, 1);
});

test('CLI exposes explicit longitudinal review and portable corpus commands', async () => {
  const root = await fixture();
  const record = await captureSession(root, 'review');
  const cli = path.resolve('src/cli-entry.js');
  const reviewed = spawnSync(process.execPath, [cli, 'evaluate', 'review', record.id, '--review-outcome', 'pass', '--review-provenance', 'human', '--reconstruction-rating', 'reduced', '--follow-up-outcome', 'not-needed', '--history-rating', 'not-applicable', '--verification-choice-outcome', 'not-applicable', '--json'], { cwd: root, encoding: 'utf8' });
  assert.equal(reviewed.status, 0, reviewed.stderr);
  assert.equal(JSON.parse(reviewed.stdout).review.reconstructionRating, 'reduced');
  const bundle = path.join(root, 'evaluation-export.json');
  const exported = spawnSync(process.execPath, [cli, 'evaluate', 'export', bundle, '--source-kind', 'external-real', '--json'], { cwd: root, encoding: 'utf8' });
  assert.equal(exported.status, 0, exported.stderr);
  assert.equal(JSON.parse(exported.stdout).records, 1);
  const report = spawnSync(process.execPath, [cli, 'evaluate', 'report', '--since-days', '30', '--json'], { cwd: root, encoding: 'utf8' });
  assert.equal(report.status, 0, report.stderr);
  assert.ok(Object.hasOwn(JSON.parse(report.stdout), 'longitudinal'));
});
