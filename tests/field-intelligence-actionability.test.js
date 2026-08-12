import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { scanProject } from '../src/core.js';
import { startChangeRecord, observeChangeRecord, completeChangeRecord } from '../src/change-intelligence.js';
import { startSession, closeSession } from '../src/session-intelligence.js';
import { buildClosingIntelligence, formatClosingIntelligence } from '../src/closing-intelligence.js';
import { VERSION } from '../src/version.js';

const execFileAsync = promisify(execFile);

async function git(root, args) {
  return execFileAsync('git', args, { cwd: root, encoding: 'utf8' });
}

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-field-actionability-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ type: 'module' }));
  await fs.mkdir(path.join(root, 'src', 'api'), { recursive: true });
  await fs.mkdir(path.join(root, 'src', 'cache'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'service.js'), 'export function service() { return true; }\n');
  await fs.writeFile(path.join(root, 'src', 'api', 'checkout.js'), 'export function checkout() { return true; }\n');
  await scanProject(root);
  try {
    await git(root, ['init']);
    await git(root, ['config', 'user.email', 'test@example.com']);
    await git(root, ['config', 'user.name', 'CMI Field Test']);
    await git(root, ['add', '.']);
    await git(root, ['commit', '-m', 'Initial']);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  return root;
}

test('Closing Intelligence exposes runtime version and actionable graph-drift locations', async () => {
  const root = await fixture();
  if (!root) return;

  const session = await startSession(root, 'update service implementation');
  await fs.writeFile(path.join(root, 'src', 'service.js'), 'export function service() { return false; }\n');
  await git(root, ['add', 'src/service.js']);
  await git(root, ['commit', '-m', 'Update service']);
  await closeSession(root, session.id, { outcome: 'succeeded', files: ['src/service.js'] });

  const closing = await buildClosingIntelligence(root, session.id);
  assert.equal(closing.runtime.name, 'codex-memory-intelligence');
  assert.equal(closing.runtime.version, VERSION);

  const drift = closing.alerts.find((item) => item.kind === 'graph-drift');
  assert.ok(drift);
  assert.equal(drift.scopeRelation, 'current-session');
  assert.deepEqual(drift.relatedFiles, ['src/service.js']);
  assert.ok(drift.evidenceAnchors.some((anchor) => anchor.path === 'src/service.js'));
  assert.match(drift.recommendedAction, /cmi scan/i);
  assert.match(drift.recommendedAction, /src\/service\.js/);

  const formatted = formatClosingIntelligence(closing);
  assert.match(formatted, new RegExp(`Runtime: codex-memory-intelligence v${VERSION.replaceAll('.', '\\.')}`));
  assert.match(formatted, /Files: src\/service\.js/);
  assert.match(formatted, /Source: src\/service\.js/);
  assert.match(formatted, /Action: .*cmi scan/i);
});

test('prediction-gap Closing alert exposes the missed path and related Change record', async () => {
  const root = await fixture();
  if (!root) return;

  const session = await startSession(root, 'change checkout flow');
  const change = await startChangeRecord(root, 'change checkout flow');
  await fs.appendFile(path.join(root, 'src', 'api', 'checkout.js'), '\nexport const checkoutVersion = 2;\n');
  await fs.writeFile(path.join(root, 'src', 'cache', 'profile.js'), 'export const profileCache = true;\n');
  const observation = await observeChangeRecord(root, change.id, { files: ['src/cache/profile.js'] });
  assert.ok(observation.comparison.missedByPrediction.includes('src/cache/profile.js'));
  await completeChangeRecord(root, change.id, {
    outcome: 'succeeded',
    files: ['src/api/checkout.js', 'src/cache/profile.js'],
    verifications: [{ name: 'focused regression', status: 'passed' }],
  });
  await closeSession(root, session.id, {
    outcome: 'succeeded',
    files: ['src/api/checkout.js', 'src/cache/profile.js'],
  });

  const closing = await buildClosingIntelligence(root, session.id);
  const gap = closing.alerts.find((item) => item.kind === 'prediction-gap');
  assert.ok(gap);
  assert.equal(gap.scopeRelation, 'current-session');
  assert.ok(gap.relatedFiles.includes('src/cache/profile.js'));
  assert.ok(gap.relatedChangeIds.includes(change.id));
  assert.match(gap.recommendedAction, /src\/cache\/profile\.js/);

  const formatted = formatClosingIntelligence(closing);
  assert.match(formatted, /Files: .*src\/cache\/profile\.js/);
  assert.match(formatted, new RegExp(`change ${change.id}`));
  assert.match(formatted, /scope current-session/);
});

test('historical uncaptured-session-change cannot remain a material P1 for a later clean session', async () => {
  const root = await fixture();
  if (!root) return;

  const first = await startSession(root, 'make an uncaptured service change');
  await fs.writeFile(path.join(root, 'src', 'service.js'), 'export function service() { return "changed"; }\n');
  const firstClosed = await closeSession(root, first.id, { outcome: 'partial', files: ['src/service.js'] });
  const uncaptured = firstClosed.close.findings.find((item) => item.category === 'uncaptured-session-change');
  assert.ok(uncaptured);

  await git(root, ['add', 'src/service.js']);
  await git(root, ['commit', '-m', 'Preserve field mutation']);
  await scanProject(root);

  const second = await startSession(root, 'read current service state');
  await closeSession(root, second.id, { outcome: 'investigated', files: ['src/service.js'] });
  const closing = await buildClosingIntelligence(root, second.id);

  const historical = closing.alerts.find((item) => item.kind === 'uncaptured-session-change');
  assert.ok(historical);
  assert.equal(historical.scopeRelation, 'historical-project');
  assert.ok(historical.relatedFiles.includes('src/service.js'));
  assert.ok(!['P0', 'P1'].includes(closing.nextAction?.priority));
  if (closing.nextAction) assert.equal(closing.nextAction.priority, 'P3');

  const formatted = formatClosingIntelligence(closing);
  assert.match(formatted, /scope historical-project/);
  assert.match(formatted, /Files: src\/service\.js/);
  assert.match(formatted, new RegExp(`finding ${uncaptured.id}`));
});
