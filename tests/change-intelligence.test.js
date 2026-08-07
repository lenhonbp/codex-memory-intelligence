import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { scanProject } from '../src/core.js';
import {
  startChangeRecord,
  observeChangeRecord,
  completeChangeRecord,
  getChangeRecord,
  listChangeRecords,
  buildChangeInsights,
} from '../src/change-intelligence.js';

const execFileAsync = promisify(execFile);

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-change-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ type: 'module' }));
  await fs.mkdir(path.join(root, 'src', 'api'), { recursive: true });
  await fs.mkdir(path.join(root, 'src', 'billing'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'billing', 'ledger.js'), 'export function recordCharge() { return true; }\n');
  await fs.writeFile(path.join(root, 'src', 'api', 'checkout.js'), "import { recordCharge } from '../billing/ledger.js';\nexport function checkout() { return recordCharge(); }\n");
  await scanProject(root);
  return root;
}

async function initializeGit(root, context) {
  try {
    await execFileAsync('git', ['init'], { cwd: root });
    await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
    await execFileAsync('git', ['config', 'user.name', 'CMI Test'], { cwd: root });
    await execFileAsync('git', ['add', '.'], { cwd: root });
    await execFileAsync('git', ['commit', '-m', 'Initial fixture'], { cwd: root });
  } catch (error) {
    if (error.code === 'ENOENT') { context.skip('Git is unavailable on this runner.'); return false; }
    throw error;
  }
  return true;
}

test('change record captures bounded BEFORE evidence without turning proposals into memory', async (context) => {
  const root = await fixture();
  if (!await initializeGit(root, context)) return;
  const decisionsBefore = await fs.readFile(path.join(root, '.codex-memory', 'decisions.md'), 'utf8');
  const record = await startChangeRecord(root, 'add retry-safe checkout billing handling');
  const decisionsAfter = await fs.readFile(path.join(root, '.codex-memory', 'decisions.md'), 'utf8');
  assert.equal(decisionsBefore, decisionsAfter);
  assert.equal(record.status, 'active');
  assert.equal(record.before.baseline.clean, true);
  assert.ok(record.before.predicted.files.includes('src/api/checkout.js'));
  assert.ok(record.before.predicted.boundaries.length > 0);
  assert.equal(record.before.attribution, 'strong');
  assert.ok(!JSON.stringify(record).includes(root));
  const stored = JSON.parse(await fs.readFile(path.join(root, '.codex-memory', 'changes', `${record.id}.json`), 'utf8'));
  assert.equal(stored.id, record.id);
  assert.match(stored.policy, /does not automatically create durable facts/i);
});

test('DURING observation compares predicted scope with Git and explicit evidence without self-observing CMI files', async (context) => {
  const root = await fixture();
  if (!await initializeGit(root, context)) return;
  const record = await startChangeRecord(root, 'change checkout billing flow');
  await fs.appendFile(path.join(root, 'src', 'api', 'checkout.js'), '\nexport const checkoutVersion = 2;\n');
  await fs.mkdir(path.join(root, 'src', 'cache'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'cache', 'profile.js'), 'export const cache = true;\n');
  const observation = await observeChangeRecord(root, record.id, { files: ['src/cache/profile.js'] });
  assert.ok(observation.observedChangedFiles.includes('src/api/checkout.js'));
  assert.ok(observation.observedChangedFiles.includes('src/cache/profile.js'));
  assert.ok(observation.comparison.missedByPrediction.includes('src/cache/profile.js'));
  assert.ok(observation.observedChangedFiles.every((file) => !file.startsWith('.codex-memory/')));
  assert.equal(observation.attribution, 'strong');
  assert.match(observation.comparison.interpretation, /do not prove full impact accuracy/i);
});

test('AFTER completion stores verification evidence and review-only learning candidates', async (context) => {
  const root = await fixture();
  if (!await initializeGit(root, context)) return;
  const record = await startChangeRecord(root, 'change checkout billing flow');
  await fs.appendFile(path.join(root, 'src', 'api', 'checkout.js'), '\nexport const checkoutVersion = 3;\n');
  const completed = await completeChangeRecord(root, record.id, {
    outcome: 'partial',
    files: ['src/cache/profile.js'],
    verifications: [{ name: 'npm test', status: 'passed', evidence: '25 tests passed' }, { name: 'integration retry', status: 'failed' }],
    unexpectedImpact: ['Profile cache also required invalidation.'],
    notes: ['Retry behavior still needs provider-level validation.'],
  });
  assert.equal(completed.status, 'completed');
  assert.equal(completed.completion.outcome, 'partial');
  assert.equal(completed.completion.verifications[0].status, 'passed');
  assert.ok(completed.completion.learningCandidates.some((item) => item.type === 'failure-mode'));
  assert.ok(completed.completion.learningCandidates.some((item) => item.type === 'unexpected-impact'));
  assert.match(completed.completion.policy, /never writes project memory automatically/i);
  await assert.rejects(() => observeChangeRecord(root, record.id), /immutable/i);
  await assert.rejects(() => startChangeRecord(root, 'api_key=abcdefghijk secret migration'), /secret/i);
});

test('historical insights expose correlation with explicit limitations instead of claiming causality', async () => {
  const root = await fixture();
  const first = await startChangeRecord(root, 'checkout billing retry');
  await completeChangeRecord(root, first.id, {
    outcome: 'succeeded',
    files: ['src/api/checkout.js', 'src/billing/ledger.js'],
    verifications: [{ name: 'payment regression', status: 'passed' }],
  });
  const second = await startChangeRecord(root, 'checkout billing consistency');
  await completeChangeRecord(root, second.id, {
    outcome: 'succeeded',
    files: ['src/api/checkout.js', 'src/billing/ledger.js'],
    verifications: [{ name: 'payment regression', status: 'passed' }],
  });
  const insights = await buildChangeInsights(root, 'checkout billing');
  assert.equal(insights.corpus.completedRecords, 2);
  assert.equal(insights.matches.length, 2);
  const edge = insights.behavioralEvidence.fileCoChanges.find((item) => item.from === 'src/api/checkout.js' && item.to === 'src/billing/ledger.js');
  assert.equal(edge.count, 2);
  assert.equal(edge.confidence, 'medium');
  assert.ok(insights.behavioralEvidence.verificationPatterns.some((item) => item.name === 'payment regression' && item.passed === 2));
  assert.ok(insights.limitations.some((item) => /correlation, not a causal dependency/i.test(item)));
  assert.ok(insights.limitations.some((item) => /does not execute/i.test(item)));
});

test('non-Git projects remain usable through explicit observed paths', async () => {
  const root = await fixture();
  const record = await startChangeRecord(root, 'change checkout flow without git');
  assert.equal(record.before.baseline.available, false);
  assert.equal(record.before.attribution, 'explicit-files-only');
  const observation = await observeChangeRecord(root, record.id, { files: ['src/api/checkout.js'] });
  assert.deepEqual(observation.observedChangedFiles, ['src/api/checkout.js']);
  assert.equal(observation.attribution, 'explicit-files-only');
  const completed = await completeChangeRecord(root, record.id, { outcome: 'succeeded', files: ['src/api/checkout.js'] });
  assert.equal(completed.status, 'completed');
  const list = await listChangeRecords(root, { status: 'completed' });
  assert.equal(list.records.length, 1);
  const loaded = await getChangeRecord(root, record.id.slice(0, 8));
  assert.equal(loaded.id, record.id);
});
