import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { scanProject } from '../src/core.js';
import { startSession, closeSession } from '../src/session-intelligence.js';
import { captureEvaluation, listEvaluations, buildEvaluationReport, validateEvaluationRecord } from '../src/evaluation.js';

async function projectFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-evaluation-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'anonymous-evaluation-fixture', type: 'module' }));
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'src', 'index.js'), 'export const value = 1;\n');
  await fs.writeFile(path.join(root, 'ROADMAP.md'), '# Next\n\n- [ ] Review the next evidence-backed task.\n');
  await scanProject(root);
  return root;
}

async function closeAuditSession(root) {
  const session = await startSession(root, 'private evaluation goal that must not enter the retained evaluation record');
  return closeSession(root, session.id, { outcome: 'investigated', accomplished: ['Reviewed project state without product edits.'] });
}

test('evaluation capture stores bounded anonymized evidence without raw repository/session text', async () => {
  const root = await projectFixture();
  const closed = await closeAuditSession(root);
  const record = await captureEvaluation(root, { sourceKind: 'self-host', repositoryClass: 'cli-tool', taskKind: 'audit', session: closed.id });
  assert.equal(record.schemaVersion, 1);
  assert.equal(record.source.kind, 'self-host');
  assert.equal(record.source.independent, false);
  assert.equal(record.task.sessionId, closed.id);
  assert.match(record.repository.fingerprint, /^sha256:[0-9a-f]{64}$/);
  assert.equal(validateEvaluationRecord(record), true);
  const serialized = JSON.stringify(record);
  assert.doesNotMatch(serialized, /private evaluation goal/i);
  assert.doesNotMatch(serialized, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(serialized, /anonymous-evaluation-fixture/);
});

test('evaluation report never counts self-host or synthetic records as independent real-repository evidence', async () => {
  const root = await projectFixture();
  await captureEvaluation(root, { sourceKind: 'self-host', repositoryClass: 'tooling', taskKind: 'audit', session: 'none' });
  await captureEvaluation(root, { sourceKind: 'synthetic', repositoryClass: 'application', taskKind: 'verification', session: 'none' });
  const report = await buildEvaluationReport(root);
  assert.equal(report.corpus.totalRecords, 2);
  assert.equal(report.corpus.externalReal.records, 0);
  assert.equal(report.corpus.externalReal.uniqueRepositories, 0);
  assert.equal(report.coverage.hasExternalRealEvidence, false);
  assert.equal(report.coverage.hasMultipleExternalRepositories, false);
  assert.equal(report.coverage.state, 'self-host-only');
  assert.equal(Object.hasOwn(report, 'productionValidated'), false);
});

test('external-real review metrics remain descriptive and require explicit reviewed evidence', async () => {
  const root = await projectFixture();
  await closeAuditSession(root);
  await assert.rejects(() => captureEvaluation(root, {
    sourceKind: 'external-real', repositoryClass: 'application', taskKind: 'audit',
    nextActionRating: 'useful',
  }), /reviewed outcome/i);
  await captureEvaluation(root, {
    sourceKind: 'external-real', repositoryClass: 'application', taskKind: 'audit',
    reviewOutcome: 'pass', falsePositiveFindings: 0, missedFindings: 0,
    nextActionRating: 'useful', handoffRating: 'useful',
  });
  const report = await buildEvaluationReport(root);
  assert.equal(report.coverage.state, 'external-single-repository');
  assert.equal(report.corpus.externalReal.uniqueRepositories, 1);
  assert.equal(report.reviewedUsefulness.reviewedExternalRecords, 1);
  assert.equal(report.reviewedUsefulness.nextActionUsefulRate, 1);
  assert.match(report.policy, /does not declare v1\.0 readiness/i);
});

test('invalid durable evaluation records are ignored and counted', async () => {
  const root = await projectFixture();
  const valid = await captureEvaluation(root, { sourceKind: 'synthetic', repositoryClass: 'unknown', taskKind: 'unknown', session: 'none' });
  await fs.writeFile(path.join(root, '.codex-memory', 'evaluations', '00000000-0000-4000-8000-000000000000.json'), '{"schemaVersion":1,"id":"bad"}\n');
  const listed = await listEvaluations(root);
  assert.equal(listed.records.length, 1);
  assert.equal(listed.records[0].id, valid.id);
  assert.equal(listed.invalidRecords, 1);
});

test('CLI exposes the evaluation group and source classification contract', async () => {
  const cli = path.resolve('src/cli-entry.js');
  const help = spawnSync(process.execPath, [cli, 'evaluate', '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /evaluate <capture\|list\|show\|report>/i);
  assert.match(help.stdout, /external-real/i);
  const top = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8' });
  assert.equal(top.status, 0, top.stderr);
  assert.match(top.stdout, /cmi evaluate/);
});
