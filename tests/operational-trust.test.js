import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  assessOperationalTrust,
  formatOperationalTrust,
  inspectCmiSharingPolicy,
  OPERATIONAL_TRUST_POLICY,
  scanCmiStateForSecrets,
  scanExportCandidate,
} from '../src/operational-trust.js';

function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

async function fixture(options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-operational-trust-'));
  await fs.mkdir(path.join(root, '.codex-memory'), { recursive: true });
  await fs.writeFile(path.join(root, '.codex-memory', '.gitignore'), `${options.ignore ?? 'project-graph.json\nproject-index.json\nsnapshots/\n'}`);
  await fs.writeFile(path.join(root, '.codex-memory', 'memory.md'), '# Project Memory\n\nReviewed durable knowledge.\n');
  await fs.writeFile(path.join(root, '.codex-memory', 'decisions.md'), '# Decisions\n');
  if (options.git !== false) {
    git(root, 'init', '--quiet');
    git(root, 'add', '.codex-memory/.gitignore', '.codex-memory/memory.md', '.codex-memory/decisions.md');
  }
  return root;
}

async function cleanup(root) { await fs.rm(root, { recursive: true, force: true }); }

test('clean reviewed CMI state is share-ready while generated caches remain policy-local', async () => {
  const root = await fixture();
  try {
    await fs.writeFile(path.join(root, '.codex-memory', 'project-index.json'), '{"schemaVersion":5}\n');
    const result = await assessOperationalTrust(root);
    assert.equal(result.state, 'healthy');
    assert.equal(result.readyToShare, true);
    assert.equal(result.sharing.gitAvailable, true);
    assert.equal(result.sharing.trackedFiles, 3);
    assert.deepEqual(result.sharing.generatedTracked, []);
    assert.equal(result.secretScan.state, 'clean');
    assert.ok(result.secretScan.filesScanned >= 3);
    assert.match(result.policy, /generated or transient/i);
    assert.equal(OPERATIONAL_TRUST_POLICY, result.policy);
    assert.match(formatOperationalTrust(result), /Ready to share: yes/i);
  } finally { await cleanup(root); }
});

test('tracked generated CMI state blocks sharing without classifying durable records as forbidden', async () => {
  const root = await fixture();
  try {
    await fs.writeFile(path.join(root, '.codex-memory', 'project-index.json'), '{"schemaVersion":5}\n');
    git(root, 'add', '-f', '.codex-memory/project-index.json');
    const sharing = await inspectCmiSharingPolicy(root);
    assert.equal(sharing.state, 'blocked');
    assert.deepEqual(sharing.generatedTracked, ['.codex-memory/project-index.json']);
    const trust = await assessOperationalTrust(root);
    assert.equal(trust.readyToShare, false);
    assert.ok(trust.recommendations.some((item) => item.id === 'untrack-generated-cmi-state'));
  } finally { await cleanup(root); }
});

test('missing internal ignore coverage is degraded rather than silently treated as a clean sharing policy', async () => {
  const root = await fixture({ ignore: 'project-graph.json\n' });
  try {
    const sharing = await inspectCmiSharingPolicy(root);
    assert.equal(sharing.state, 'degraded');
    assert.deepEqual(sharing.ignorePolicy.missing, ['project-index.json', 'snapshots/']);
    const trust = await assessOperationalTrust(root);
    assert.equal(trust.state, 'degraded');
    assert.equal(trust.readyToShare, false);
  } finally { await cleanup(root); }
});

test('credential-like durable content blocks trust while never echoing the credential value', async () => {
  const root = await fixture();
  const secret = 'api_key=CMI_SUPER_SECRET_ABC123456789xyz';
  try {
    await fs.appendFile(path.join(root, '.codex-memory', 'memory.md'), `${secret}\n`);
    const scan = await scanCmiStateForSecrets(root);
    assert.equal(scan.state, 'blocked');
    assert.equal(scan.findings[0].code, 'CMI_TRUST_SENSITIVE_CONTENT');
    assert.equal(scan.findings[0].path, '.codex-memory/memory.md');
    assert.equal(JSON.stringify(scan).includes(secret), false);
    const trust = await assessOperationalTrust(root);
    assert.equal(trust.state, 'blocked');
    assert.ok(trust.recommendations.some((item) => item.id === 'remove-sensitive-cmi-content'));
  } finally { await cleanup(root); }
});

test('symlinked share-candidate state fails closed without following the target', async (t) => {
  if (process.platform === 'win32') t.skip('Symlink creation is not reliably available without elevated Windows privileges.');
  const root = await fixture();
  try {
    const outside = path.join(root, 'outside.txt');
    await fs.writeFile(outside, 'api_key=SHOULD_NOT_BE_READ_1234567890\n');
    await fs.symlink(outside, path.join(root, '.codex-memory', 'linked.md'));
    const scan = await scanCmiStateForSecrets(root);
    assert.equal(scan.state, 'blocked');
    assert.ok(scan.findings.some((item) => item.code === 'CMI_TRUST_UNSAFE_ENTRY' && item.path === '.codex-memory/linked.md'));
    assert.equal(JSON.stringify(scan).includes('SHOULD_NOT_BE_READ'), false);
  } finally { await cleanup(root); }
});

test('non-Git project remains inspectable but cannot receive a clean Git-sharing attestation', async () => {
  const root = await fixture({ git: false });
  try {
    const result = await assessOperationalTrust(root);
    assert.equal(result.state, 'degraded');
    assert.equal(result.sharing.gitAvailable, false);
    assert.equal(result.secretScan.state, 'clean');
    assert.equal(result.readyToShare, false);
  } finally { await cleanup(root); }
});

test('export preflight accepts bounded clean text and blocks sensitive or non-text artifacts', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-export-trust-'));
  try {
    const clean = path.join(root, 'report.json');
    const sensitive = path.join(root, 'secret.txt');
    const binary = path.join(root, 'binary.bin');
    await fs.writeFile(clean, '{"kind":"cmi-report","status":"clean"}\n');
    await fs.writeFile(sensitive, 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456\n');
    await fs.writeFile(binary, Buffer.from([0xff, 0xfe, 0xfd, 0x00]));
    assert.equal((await scanExportCandidate(clean)).safeToShare, true);
    const blocked = await scanExportCandidate(sensitive);
    assert.equal(blocked.safeToShare, false);
    assert.equal(blocked.findings[0].code, 'CMI_TRUST_EXPORT_SENSITIVE_CONTENT');
    const unscannable = await scanExportCandidate(binary);
    assert.equal(unscannable.safeToShare, false);
    assert.equal(unscannable.findings[0].code, 'CMI_TRUST_EXPORT_UNSCANNABLE');
  } finally { await cleanup(root); }
});

test('cmi-trust CLI exposes deterministic JSON, blocked exit codes, help, version, and strict argument validation', async () => {
  const root = await fixture();
  try {
    const run = (...args) => spawnSync(process.execPath, ['src/trust-entry.js', ...args], { cwd: process.cwd(), encoding: 'utf8' });
    let command = run('doctor', root, '--json');
    assert.equal(command.status, 0, command.stderr);
    assert.equal(JSON.parse(command.stdout).state, 'healthy');

    await fs.appendFile(path.join(root, '.codex-memory', 'memory.md'), 'password=abcdefghijklmnopqrstuvwxyz123456\n');
    command = run('doctor', root, '--json');
    assert.equal(command.status, 2, command.stderr);
    assert.equal(JSON.parse(command.stdout).state, 'blocked');

    command = run('--version');
    assert.equal(command.status, 0, command.stderr);
    assert.match(command.stdout.trim(), /^\d+\.\d+\.\d+$/);
    command = run('--help');
    assert.equal(command.status, 0, command.stderr);
    assert.match(command.stdout, /cmi-trust doctor/i);
    command = run('doctor', root, '--unknown', '--json');
    assert.equal(command.status, 1);
    assert.equal(JSON.parse(command.stderr).error.code, 'CMI_TRUST_CLI_ERROR');
  } finally { await cleanup(root); }
});

test('package metadata adds cmi-trust without changing the established cmi entrypoint', async () => {
  const packageJson = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(packageJson.bin.cmi, 'src/cli-entry.js');
  assert.equal(packageJson.bin['cmi-mcp'], 'src/mcp-entry.js');
  assert.equal(packageJson.bin['cmi-trust'], 'src/trust-entry.js');
  assert.equal(packageJson.scripts['trust:check'], 'node src/trust-entry.js doctor . --json');
});
