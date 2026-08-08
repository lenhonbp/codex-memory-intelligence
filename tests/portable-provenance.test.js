import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { initProject, scanProject, remember, status } from '../src/core.js';
import { checkStaleMemory } from '../src/stale.js';
import { freezePortableEvidence, inspectPortableEvidence, restorePortableEvidence } from '../src/portable-evidence.js';
import { collectExecutableProvenance } from '../src/provenance.js';

const exec = promisify(execFile);
const cli = fileURLToPath(new URL('../src/cli-entry.js', import.meta.url));

async function git(root, ...args) {
  const result = await exec('git', args, { cwd: root, encoding: 'utf8' });
  return String(result.stdout || '').trim();
}

async function project(prefix = 'cmi-portable-') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'portable-fixture', type: 'module' }));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'index.js'), 'export const value = 1;\n');
  await initProject(root);
  await scanProject(root);
  await remember(root, 'decision', 'Portable evidence preserves source compatibility without treating path as identity.', { sources: ['src/index.js'] });
  return root;
}

async function run(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function copyWithoutMemory(source, target) {
  await fs.cp(source, target, { recursive: true });
  await fs.rm(path.join(target, '.codex-memory'), { recursive: true, force: true });
}

test('freezing the same exact state yields a deterministic identity and verifies the bundle', async () => {
  const root = await project();
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-bundles-'));
  const first = await freezePortableEvidence(root, path.join(parent, 'first'));
  const second = await freezePortableEvidence(root, path.join(parent, 'second'));
  assert.equal(first.identity.digest, second.identity.digest);
  assert.equal(first.evidenceDigest, second.evidenceDigest);
  assert.equal((await inspectPortableEvidence(first.path)).state, 'verified');
  assert.equal((await inspectPortableEvidence(second.path)).identity.digest, first.identity.digest);
});

test('restore is exact at the original location and compatible after relocation', async () => {
  const root = await project();
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-relocation-'));
  const bundle = await freezePortableEvidence(root, path.join(parent, 'bundle'));
  await fs.rm(path.join(root, '.codex-memory'), { recursive: true });
  const exact = await restorePortableEvidence(root, bundle.path);
  assert.equal(exact.state, 'exact');
  assert.equal(exact.restored, true);

  const relocated = path.join(parent, 'relocated');
  await copyWithoutMemory(root, relocated);
  const rebound = await restorePortableEvidence(relocated, bundle.path, { rebind: true });
  assert.equal(rebound.state, 'compatible-relocated');
  assert.equal(rebound.restored, true);
  const provenance = JSON.parse(await fs.readFile(path.join(relocated, '.codex-memory', 'portable-provenance.json'), 'utf8'));
  assert.equal(provenance.requested.operation, 'rebind');
  assert.equal(provenance.original.manifestIdentity, bundle.identity.digest);
  assert.equal(provenance.verification.state, 'compatible-relocated');
  assert.equal(provenance.trust.authenticated, false);
});

test('Git revision mismatch fails closed even when source content is unchanged', async () => {
  const root = await project('cmi-portable-git-');
  await git(root, 'init');
  await git(root, 'config', 'user.email', 'cmi-test@example.invalid');
  await git(root, 'config', 'user.name', 'CMI Test');
  await git(root, 'add', 'package.json', 'src');
  await git(root, 'commit', '-m', 'base');
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-git-bundle-'));
  const bundle = await freezePortableEvidence(root, path.join(parent, 'bundle'));
  await git(root, 'commit', '--allow-empty', '-m', 'revision-only');
  await assert.rejects(() => restorePortableEvidence(root, bundle.path), (error) => {
    assert.equal(error.code, 'CMI_EVIDENCE_MISMATCH');
    assert.match(error.message, /revision differs/i);
    return true;
  });
  assert.equal(await fs.lstat(path.join(root, '.codex-memory')).then(() => true).catch(() => false), true);
});

test('a clean Git worktree at the frozen revision is compatible after relocation', async () => {
  const root = await project('cmi-portable-worktree-');
  await git(root, 'init');
  await git(root, 'config', 'user.email', 'cmi-test@example.invalid');
  await git(root, 'config', 'user.name', 'CMI Test');
  await git(root, 'add', 'package.json', 'src');
  await git(root, 'commit', '-m', 'base');
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-worktree-bundle-'));
  const bundle = await freezePortableEvidence(root, path.join(parent, 'bundle'));
  const worktree = path.join(parent, 'worktree');
  await git(root, 'worktree', 'add', '--detach', worktree, 'HEAD');
  const restored = await restorePortableEvidence(worktree, bundle.path, { rebind: true });
  assert.equal(restored.state, 'compatible-relocated');
  assert.equal(restored.verification.repository.revision, bundle.manifest.project.sourceRevision);
  assert.equal((await checkStaleMemory(worktree)).counts.blocked, 0);
});

test('source content mismatch and corrupted artifacts fail closed without destination writes', async () => {
  const root = await project();
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-mismatch-'));
  const bundle = await freezePortableEvidence(root, path.join(parent, 'bundle'));
  const destination = path.join(parent, 'destination');
  await copyWithoutMemory(root, destination);
  await fs.writeFile(path.join(destination, 'src', 'index.js'), 'export const value = 2;\n');
  await assert.rejects(() => restorePortableEvidence(destination, bundle.path), (error) => error.code === 'CMI_EVIDENCE_MISMATCH');
  assert.equal(await fs.lstat(path.join(destination, '.codex-memory')).then(() => true).catch(() => false), false);

  const artifact = path.join(bundle.path, 'evidence', '.codex-memory', 'memory.md');
  await fs.appendFile(artifact, '\ncorruption\n');
  await assert.rejects(() => inspectPortableEvidence(bundle.path), (error) => error.code === 'CMI_PORTABLE_DIGEST_MISMATCH');
});

test('manifest corruption, unsupported schema, traversal, symlink input, and destination conflicts fail closed', async (t) => {
  const root = await project();
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-adversarial-'));
  const bundle = await freezePortableEvidence(root, path.join(parent, 'bundle'));
  const originalManifest = JSON.parse(await fs.readFile(path.join(bundle.path, 'manifest.json'), 'utf8'));

  const unsupported = path.join(parent, 'unsupported');
  await fs.cp(bundle.path, unsupported, { recursive: true });
  const unsupportedManifest = { ...originalManifest, schemaVersion: 999 };
  await fs.writeFile(path.join(unsupported, 'manifest.json'), JSON.stringify(unsupportedManifest));
  await assert.rejects(() => inspectPortableEvidence(unsupported), (error) => error.code === 'CMI_PORTABLE_SCHEMA_UNSUPPORTED');

  const traversal = path.join(parent, 'traversal');
  await fs.cp(bundle.path, traversal, { recursive: true });
  const traversalManifest = JSON.parse(await fs.readFile(path.join(traversal, 'manifest.json'), 'utf8'));
  traversalManifest.evidence.files[0].path = '.codex-memory/../outside';
  await fs.writeFile(path.join(traversal, 'manifest.json'), JSON.stringify(traversalManifest));
  await assert.rejects(() => inspectPortableEvidence(traversal), (error) => error.code === 'CMI_PORTABLE_PATH_INVALID');

  const symlink = path.join(parent, 'symlink');
  await fs.cp(bundle.path, symlink, { recursive: true });
  await fs.rm(path.join(symlink, 'evidence', '.codex-memory', 'memory.md'));
  try {
    await fs.symlink(path.join(bundle.path, 'evidence', '.codex-memory', 'decisions.md'), path.join(symlink, 'evidence', '.codex-memory', 'memory.md'));
  } catch (cause) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(cause?.code)) { t.skip(`Symlink creation is unavailable on this runner (${cause.code}).`); return; }
    else throw cause;
  }
  await assert.rejects(() => inspectPortableEvidence(symlink), (error) => error.code === 'CMI_PORTABLE_UNSAFE_PATH');

  const conflict = path.join(parent, 'conflict');
  await copyWithoutMemory(root, conflict);
  await initProject(conflict);
  await fs.writeFile(path.join(conflict, '.codex-memory', 'memory.md'), '# different evidence\n');
  await assert.rejects(() => restorePortableEvidence(conflict, bundle.path), (error) => error.code === 'CMI_PORTABLE_DESTINATION_CONFLICT');
  assert.equal(await fs.readFile(path.join(conflict, '.codex-memory', 'memory.md'), 'utf8'), '# different evidence\n');
});

test('blocked existing evidence is never overwritten and semantic review remains separate', async () => {
  const root = await project();
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-blocked-'));
  const bundle = await freezePortableEvidence(root, path.join(parent, 'bundle'));
  const destination = path.join(parent, 'destination');
  await copyWithoutMemory(root, destination);
  await initProject(destination);
  const blocked = '# Project Memory\n' + 'x'.repeat(1_000_100);
  await fs.writeFile(path.join(destination, '.codex-memory', 'memory.md'), blocked);
  const before = await checkStaleMemory(destination);
  assert.ok(before.counts.blocked > 0);
  await assert.rejects(() => restorePortableEvidence(destination, bundle.path), (error) => error.code === 'CMI_PORTABLE_DESTINATION_CONFLICT');
  assert.equal((await fs.readFile(path.join(destination, '.codex-memory', 'memory.md'), 'utf8')).length, blocked.length);
  assert.equal((await status(destination)).memoryHealth.blocked > 0, true);
});

test('CLI JSON success and trust-critical failure contracts are machine-readable', async () => {
  const root = await project();
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-cli-portable-'));
  const bundlePath = path.join(parent, 'bundle');
  const frozen = await run(['evidence', 'freeze', bundlePath, '--json'], root);
  assert.equal(frozen.code, 0, frozen.stderr);
  const frozenJson = JSON.parse(frozen.stdout);
  assert.equal(frozenJson.authenticated, false);
  const inspected = await run(['evidence', 'inspect', bundlePath, '--json'], root);
  assert.equal(inspected.code, 0, inspected.stderr);
  assert.equal(JSON.parse(inspected.stdout).state, 'verified');

  await fs.writeFile(path.join(root, 'src', 'index.js'), 'export const value = 9;\n');
  const mismatch = await run(['evidence', 'restore', bundlePath, '--json'], root);
  assert.equal(mismatch.code, 1);
  assert.equal(mismatch.stdout, '');
  const error = JSON.parse(mismatch.stderr);
  assert.equal(error.ok, false);
  assert.equal(error.error.code, 'CMI_EVIDENCE_MISMATCH');
  assert.ok(error.error.details.mismatches.length > 0);
});

test('canonical executable provenance resolves the invoked source checkout and exposes candidate ambiguity safely', async () => {
  const result = await collectExecutableProvenance({ projectRoot: process.cwd() });
  assert.equal(result.kind, 'cmi-executable-provenance');
  assert.equal(result.observed.packageName, 'codex-memory-intelligence');
  assert.equal(result.observed.packageVersion, '0.9.2');
  assert.equal(result.observed.installKind, 'source-checkout');
  assert.match(result.observed.sourceRevision, /^[0-9a-f]{40}$/);
  assert.equal(result.ambiguity.candidates[0].source, 'actual-invocation');
  assert.equal(typeof result.confidence, 'string');
  assert.match(result.policy, /does not infer provenance from the current working directory/i);
});

test('CLI provenance JSON identifies the actual script rather than a cwd package.json', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-provenance-fixture-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'unrelated-project', version: '99.99.99' }));
  await fs.mkdir(path.join(root, 'node_modules', 'codex-memory-intelligence'), { recursive: true });
  await fs.writeFile(path.join(root, 'node_modules', 'codex-memory-intelligence', 'package.json'), JSON.stringify({ name: 'codex-memory-intelligence', version: '0.1.0' }));
  const result = await run(['provenance', '--json'], root);
  assert.equal(result.code, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.observed.packageVersion, '0.9.2');
  assert.notEqual(parsed.observed.packageVersion, '99.99.99');
  assert.ok(parsed.ambiguity.candidates.some((item) => item.source === 'project-local-candidate'));
});
