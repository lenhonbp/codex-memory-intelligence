import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { initProject, scanProject, remember } from '../src/core.js';
import { freezePortableEvidence, inspectPortableEvidence, restorePortableEvidence } from '../src/portable-evidence.js';

async function project(prefix = 'cmi-portable-boundary-') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'portable-boundary-fixture', type: 'module' }));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'index.js'), 'export const value = 1;\n');
  await initProject(root);
  await scanProject(root);
  await remember(root, 'decision', 'Portable evidence must remain bound to the verified destination state.', { sources: ['src/index.js'] });
  return root;
}

async function copyWithoutMemory(source, target) {
  await fs.cp(source, target, { recursive: true });
  await fs.rm(path.join(target, '.codex-memory'), { recursive: true, force: true });
}

async function readManifest(bundlePath) {
  return JSON.parse(await fs.readFile(path.join(bundlePath, 'manifest.json'), 'utf8'));
}

async function writeManifest(bundlePath, manifest) {
  await fs.writeFile(path.join(bundlePath, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

test('portable artifact inventory rejects cross-platform aliases and Windows-unsafe names before artifact reads', async () => {
  const root = await project('cmi-portable-path-alias-');
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-portable-path-alias-bundle-'));
  const frozen = await freezePortableEvidence(root, path.join(parent, 'bundle'));
  const original = await readManifest(frozen.path);

  const collision = path.join(parent, 'collision');
  await fs.cp(frozen.path, collision, { recursive: true });
  const collisionManifest = structuredClone(original);
  const first = collisionManifest.evidence.files.find((item) => item.path === '.codex-memory/memory.md');
  assert.ok(first);
  collisionManifest.evidence.files.push({ ...first, path: '.codex-memory/MEMORY.md' });
  collisionManifest.evidence.files.sort((left, right) => left.path.localeCompare(right.path));
  await writeManifest(collision, collisionManifest);
  await assert.rejects(() => inspectPortableEvidence(collision), (cause) => {
    assert.equal(cause.code, 'CMI_PORTABLE_MANIFEST_INVALID');
    assert.match(cause.message, /duplicate|unsafe/i);
    return true;
  });

  const unsafe = path.join(parent, 'windows-unsafe');
  await fs.cp(frozen.path, unsafe, { recursive: true });
  const unsafeManifest = structuredClone(original);
  unsafeManifest.evidence.files[0].path = '.codex-memory/memory.md:alternate-stream';
  unsafeManifest.evidence.files.sort((left, right) => left.path.localeCompare(right.path));
  await writeManifest(unsafe, unsafeManifest);
  await assert.rejects(() => inspectPortableEvidence(unsafe), (cause) => {
    assert.equal(cause.code, 'CMI_PORTABLE_MANIFEST_INVALID');
    assert.match(cause.message, /unsafe/i);
    return true;
  });
});

test('existing rebind provenance must match every durable verification field before it is reused', async () => {
  const root = await project('cmi-portable-rebind-provenance-');
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-portable-rebind-provenance-bundle-'));
  const frozen = await freezePortableEvidence(root, path.join(parent, 'bundle'));
  const destination = path.join(parent, 'destination');
  await fs.cp(root, destination, { recursive: true });

  const first = await restorePortableEvidence(destination, frozen.path, { rebind: true });
  assert.equal(first.alreadyPresent, true);
  const provenancePath = path.join(destination, '.codex-memory', 'portable-provenance.json');
  const original = JSON.parse(await fs.readFile(provenancePath, 'utf8'));

  const mutations = [
    ['original frozenAt', (value) => { value.original.frozenAt = '2000-01-01T00:00:00.000Z'; }],
    ['original location', (value) => { value.original.location = { path: path.join(destination, 'invented-origin') }; }],
    ['verification identity policy', (value) => { value.verification.identityPolicy.scan.maxGraphFiles += 1; }],
    ['verification git proof', (value) => { value.verification.gitCheckoutProof = !value.verification.gitCheckoutProof; }],
    ['verification notes', (value) => { value.verification.notes = [...value.verification.notes, 'invented verification note']; }],
    ['trust statement', (value) => { value.trust.statement = 'Invented stronger trust statement.'; }],
  ];

  for (const [label, mutate] of mutations) {
    const tampered = structuredClone(original);
    mutate(tampered);
    await fs.writeFile(provenancePath, `${JSON.stringify(tampered, null, 2)}\n`);
    await assert.rejects(() => restorePortableEvidence(destination, frozen.path, { rebind: true }), (cause) => {
      assert.equal(cause.code, 'CMI_PORTABLE_DESTINATION_CONFLICT', label);
      assert.match(cause.message, /provenance/i, label);
      return true;
    });
    await fs.writeFile(provenancePath, `${JSON.stringify(original, null, 2)}\n`);
  }
});

test('restore revalidates destination source identity after staging and installs nothing when it changes mid-operation', async () => {
  const root = await project('cmi-portable-toctou-source-');
  const snapshots = path.join(root, '.codex-memory', 'snapshots');
  await fs.mkdir(snapshots, { recursive: true });
  for (let index = 0; index < 40; index += 1) {
    await fs.writeFile(path.join(snapshots, `portable-padding-${String(index).padStart(2, '0')}.txt`), `${'x'.repeat(8192)}\n`);
  }

  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-portable-toctou-source-bundle-'));
  const frozen = await freezePortableEvidence(root, path.join(parent, 'bundle'));
  const destination = path.join(parent, 'destination');
  await copyWithoutMemory(root, destination);

  let mutationObserved = false;
  const mutateDuringStage = (async () => {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const entries = await fs.readdir(destination);
      if (entries.some((name) => name.startsWith('.cmi-restore-'))) {
        await fs.writeFile(path.join(destination, 'src', 'index.js'), 'export const value = 2;\n');
        mutationObserved = true;
        return;
      }
      await delay(1);
    }
    throw new Error('Portable restore staging directory was not observed before timeout.');
  })();

  await assert.rejects(() => restorePortableEvidence(destination, frozen.path, { rebind: true }), (cause) => {
    assert.equal(cause.code, 'CMI_PORTABLE_READ_RACE');
    assert.match(cause.message, /changed during portable (?:restore|rebind)|identity changed/i);
    return true;
  });
  await mutateDuringStage;
  assert.equal(mutationObserved, true);
  assert.equal(await fs.lstat(path.join(destination, '.codex-memory')).then(() => true).catch(() => false), false);
  assert.equal(await fs.readFile(path.join(destination, 'src', 'index.js'), 'utf8'), 'export const value = 2;\n');
});
