import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { scanProject } from '../src/core.js';
import { captureEvaluation, reviewEvaluation, getEvaluation, buildEvaluationReport } from '../src/evaluation.js';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-eval-review-'));
  await fs.writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'src', 'index.js'), 'export const value = 1;\n');
  await scanProject(root);
  return root;
}

function immutableSnapshot(record) {
  return JSON.stringify({ subject: record.subject, source: record.source, protocol: record.protocol, repository: record.repository, task: record.task, measurements: record.measurements, stress: record.stress, policy: record.policy });
}

test('post-hoc human review changes only review evidence and contributes to human usefulness metrics', async () => {
  const root = await fixture();
  const captured = await captureEvaluation(root, { sourceKind: 'external-real', repositoryClass: 'library', taskKind: 'review', session: 'none' });
  const before = immutableSnapshot(captured);
  const reviewed = await reviewEvaluation(root, captured.id.slice(0, 12), {
    reviewOutcome: 'pass', reviewProvenance: 'human', falsePositiveFindings: 0, missedFindings: 0,
    nextActionRating: 'useful', handoffRating: 'unknown',
  });
  assert.equal(immutableSnapshot(reviewed), before);
  assert.equal(reviewed.review.provenance, 'human');
  assert.equal(reviewed.review.nextActionRating, 'useful');
  assert.match(reviewed.review.reviewedAt, /^\d{4}-/);
  const stored = await getEvaluation(root, captured.id);
  assert.equal(stored.review.provenance, 'human');
  const report = await buildEvaluationReport(root);
  assert.equal(report.reviewedUsefulness.provenance.human, 1);
  assert.equal(report.reviewedUsefulness.human.nextActionUsefulRate, 1);
});

test('post-hoc review is one-time and concurrent writers cannot overwrite reviewer provenance', async () => {
  const root = await fixture();
  const captured = await captureEvaluation(root, { sourceKind: 'external-real', repositoryClass: 'library', taskKind: 'audit', session: 'none' });
  const results = await Promise.allSettled([
    reviewEvaluation(root, captured.id, { reviewOutcome: 'pass', reviewProvenance: 'human' }),
    reviewEvaluation(root, captured.id, { reviewOutcome: 'partial', reviewProvenance: 'agent' }),
  ]);
  assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
  assert.equal(results.filter((item) => item.status === 'rejected').length, 1);
  const stored = await getEvaluation(root, captured.id);
  assert.ok(['human', 'agent'].includes(stored.review.provenance));
  await assert.rejects(() => reviewEvaluation(root, captured.id, { reviewOutcome: 'pass', reviewProvenance: 'human' }), /already reviewed/i);
});

test('CLI evaluate review performs explicit post-hoc review', async () => {
  const root = await fixture();
  const captured = await captureEvaluation(root, { sourceKind: 'external-real', repositoryClass: 'library', taskKind: 'review', session: 'none' });
  const cli = path.resolve('src/cli-entry.js');
  const result = spawnSync(process.execPath, [cli, 'evaluate', 'review', captured.id.slice(0, 12), '--review-outcome', 'pass', '--review-provenance', 'agent', '--next-action-rating', 'useful', '--json'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const reviewed = JSON.parse(result.stdout);
  assert.equal(reviewed.review.outcome, 'pass');
  assert.equal(reviewed.review.provenance, 'agent');
  assert.equal(reviewed.review.nextActionRating, 'useful');
});
