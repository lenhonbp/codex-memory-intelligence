import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { scanProject } from '../src/core.js';
import { startChangeRecord, observeChangeRecord, completeChangeRecord } from '../src/change-intelligence.js';
import { startSession, closeSession } from '../src/session-intelligence.js';

const execFileAsync = promisify(execFile);
const cli = fileURLToPath(new URL('../src/cli-entry.js', import.meta.url));

async function fixture(prefix) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'session-handoff-hardening', type: 'module' }));
  await fs.mkdir(path.join(root, 'src', 'api'), { recursive: true });
  await fs.mkdir(path.join(root, 'src', 'billing'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'billing', 'ledger.js'), 'export function recordCharge() { return true; }\n');
  await fs.writeFile(path.join(root, 'src', 'api', 'checkout.js'), "import { recordCharge } from '../billing/ledger.js';\nexport function checkout() { return recordCharge(); }\n");
  await scanProject(root);
  return root;
}

async function initializeGit(root, context) {
  try {
    await execFileAsync('git', ['init'], { cwd: root, windowsHide: true });
    await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: root, windowsHide: true });
    await execFileAsync('git', ['config', 'user.name', 'CMI Test'], { cwd: root, windowsHide: true });
    await execFileAsync('git', ['add', '.'], { cwd: root, windowsHide: true });
    await execFileAsync('git', ['commit', '-m', 'Initial fixture'], { cwd: root, windowsHide: true });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      context.skip('Git is unavailable on this runner.');
      return false;
    }
    throw error;
  }
  return true;
}

function runCli(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('stale trust-policy preflight rejects invalid or ambiguous fail-on before emitting success JSON', async (t) => {
  const root = await fixture('cmi-stale-preflight-');
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  for (const args of [
    ['stale', '--fail-on', 'invalid', '--json'],
    ['stale', '--fail-on', '--json'],
    ['stale', '--fail-on', 'stale', '--fail-on', 'any', '--json'],
  ]) {
    const result = await runCli(args, root);
    assert.equal(result.code, 1, `${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
    assert.equal(result.stdout, '', 'invalid trust-policy input must not emit a success payload before failure');
    const lines = result.stderr.trim().split(/\r?\n/).filter(Boolean);
    assert.equal(lines.length, 1, result.stderr);
    const payload = JSON.parse(lines[0]);
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, 'CMI_CLI_ERROR');
    assert.match(payload.error.message, /--fail-on/);
  }
});

test('session handoff human output preserves finding/change ids, files, source anchors, evidence state, and action', async (t) => {
  const root = await fixture('cmi-handoff-address-');
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  if (!await initializeGit(root, t)) return;

  const change = await startChangeRecord(root, 'change checkout flow');
  const session = await startSession(root, 'change checkout flow');
  await fs.appendFile(path.join(root, 'src', 'api', 'checkout.js'), '\nexport const checkoutVersion = 2;\n');
  await fs.mkdir(path.join(root, 'src', 'cache'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'cache', 'profile.js'), 'export const cacheProfile = true;\n');

  const observation = await observeChangeRecord(root, change.id, { files: ['src/cache/profile.js'] });
  assert.ok(observation.comparison.missedByPrediction.includes('src/cache/profile.js'));
  await completeChangeRecord(root, change.id, {
    outcome: 'succeeded',
    files: ['src/api/checkout.js', 'src/cache/profile.js'],
    verifications: [{ name: 'npm test', status: 'passed' }],
  });

  const closed = await closeSession(root, session.id, { outcome: 'succeeded' });
  const finding = closed.close.handoff.openFindings.find((item) => item.category === 'prediction-gap' && item.evidence.includes(`change:${change.id}`));
  assert.ok(finding, JSON.stringify(closed.close.handoff.openFindings, null, 2));
  assert.ok(finding.relatedFiles.includes('src/cache/profile.js'));

  const handoff = await runCli(['session', 'handoff', session.id], root);
  assert.equal(handoff.code, 0, handoff.stderr);
  assert.equal(handoff.stderr, '');
  assert.match(handoff.stdout, /## Evidence addresses/);
  assert.match(handoff.stdout, new RegExp(`finding ${finding.id}`));
  assert.match(handoff.stdout, new RegExp(`change ${change.id}`));
  assert.match(handoff.stdout, /Files: .*src\/cache\/profile\.js/);
  assert.match(handoff.stdout, /Source: .*src\/cache\/profile\.js/);
  assert.match(handoff.stdout, /Evidence: observed · confidence high · observed|Evidence: inferred · confidence low · suspected|Evidence: observed · confidence low · observed/);
  assert.match(handoff.stdout, /Action: Review the missed changed paths/);

  const shown = await runCli(['session', 'show', session.id], root);
  assert.equal(shown.code, 0, shown.stderr);
  assert.match(shown.stdout, new RegExp(`finding ${finding.id}`));
  assert.match(shown.stdout, new RegExp(`change ${change.id}`));
  assert.match(shown.stdout, /src\/cache\/profile\.js/);
});
