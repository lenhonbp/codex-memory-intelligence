import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initProject, scanProject, remember } from '../src/core.js';
import { freezePortableEvidence, inspectPortableEvidence, restorePortableEvidence } from '../src/portable-evidence.js';

function digestText(value) { return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`; }

function legacyV2IdentityMaterial(manifest) {
  return {
    schemaVersion: manifest.schemaVersion,
    kind: manifest.kind,
    format: manifest.format,
    cmi: { version: manifest.cmi.version, sourceRevision: manifest.cmi.sourceRevision || null },
    project: {
      sourceIdentity: manifest.project.sourceIdentity,
      identityPolicy: manifest.project.identityPolicy,
      repository: manifest.project.repository,
      sourceRevision: manifest.project.sourceRevision,
      worktreeClean: manifest.project.worktreeClean,
    },
    evidence: {
      format: manifest.evidence.format,
      files: manifest.evidence.files,
      digest: manifest.evidence.digest,
    },
  };
}

async function project(prefix = 'cmi-portable-integrity-') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'portable-integrity-fixture', type: 'module' }));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'index.js'), 'export const value = 1;\n');
  await initProject(root);
  await scanProject(root);
  await remember(root, 'decision', 'Portable manifest provenance must be integrity-bound separately from deterministic evidence identity.', { sources: ['src/index.js'] });
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

async function asLegacyV2(bundlePath) {
  const manifest = await readManifest(bundlePath);
  manifest.schemaVersion = 2;
  delete manifest.integrity;
  manifest.identity = {
    algorithm: 'sha256',
    digest: digestText(JSON.stringify(legacyV2IdentityMaterial(manifest))),
  };
  await writeManifest(bundlePath, manifest);
  return manifest;
}

async function expectIntegrityMutationRejected(bundlePath, parent, name, mutate) {
  const candidate = path.join(parent, name);
  await fs.cp(bundlePath, candidate, { recursive: true });
  const manifest = await readManifest(candidate);
  mutate(manifest);
  await writeManifest(candidate, manifest);
  await assert.rejects(() => inspectPortableEvidence(candidate), (cause) => {
    assert.equal(cause.code, 'CMI_PORTABLE_MANIFEST_CORRUPT');
    assert.match(cause.message, /provenance integrity digest/i);
    return true;
  });
}

test('Portable Evidence v3 separates deterministic evidence identity from manifest provenance integrity', async () => {
  const root = await project();
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-portable-integrity-bundles-'));
  const first = await freezePortableEvidence(root, path.join(parent, 'first'));
  const second = await freezePortableEvidence(root, path.join(parent, 'second'));

  assert.equal(first.schemaVersion, 3);
  assert.equal(first.manifest.schemaVersion, 3);
  assert.equal(first.identity.digest, second.identity.digest);
  assert.equal(first.manifest.integrity.algorithm, 'sha256');
  assert.equal(first.manifest.integrity.coverage, 'manifest-provenance-v1');
  assert.equal(first.manifestIntegrity.state, 'verified');
  assert.equal(first.manifestIntegrity.manifestProvenanceBound, true);
  assert.equal(first.manifestIntegrity.originBound, true);
  assert.equal(first.manifestIntegrity.authenticated, false);
  assert.deepEqual(first.manifestIntegrity.unboundFields, []);

  const inspected = await inspectPortableEvidence(first.path);
  assert.equal(inspected.schemaVersion, 3);
  assert.equal(inspected.manifestIntegrity.state, 'verified');
  assert.equal(inspected.manifestIntegrity.authenticated, false);
});

test('v3 integrity rejects mutation of every formerly unbound provenance family before artifacts are trusted', async () => {
  const root = await project('cmi-portable-integrity-mutation-');
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-portable-integrity-mutations-'));
  const bundle = await freezePortableEvidence(root, path.join(parent, 'bundle'));

  const mutations = [
    ['location', (manifest) => { manifest.project.location.path = `${manifest.project.location.path}-tampered`; }],
    ['creation', (manifest) => { manifest.creation.frozenAt = '2030-01-01T00:00:00.000Z'; }],
    ['invocation', (manifest) => { manifest.cmi.invocationKind = 'tampered-invocation'; }],
    ['package-root', (manifest) => { manifest.cmi.packageRoot = '/tampered/cmi-package-root'; }],
    ['health', (manifest) => { manifest.evidence.health.state = manifest.evidence.health.state === 'healthy' ? 'blocked' : 'healthy'; }],
    ['trust-boundary', (manifest) => { manifest.provenance.trustBoundary = 'authenticated provenance'; }],
  ];

  for (const [name, mutate] of mutations) await expectIntegrityMutationRejected(bundle.path, parent, name, mutate);
});

test('missing or altered v3 integrity metadata fails closed instead of falling back to legacy v2 semantics', async () => {
  const root = await project('cmi-portable-integrity-block-');
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-portable-integrity-blocks-'));
  const bundle = await freezePortableEvidence(root, path.join(parent, 'bundle'));

  await expectIntegrityMutationRejected(bundle.path, parent, 'digest', (manifest) => { manifest.integrity.digest = 'sha256:'.padEnd(71, '0'); });

  const missing = path.join(parent, 'missing');
  await fs.cp(bundle.path, missing, { recursive: true });
  const manifest = await readManifest(missing);
  delete manifest.integrity;
  await writeManifest(missing, manifest);
  await assert.rejects(() => inspectPortableEvidence(missing), (cause) => {
    assert.equal(cause.code, 'CMI_PORTABLE_MANIFEST_CORRUPT');
    return true;
  });
});

test('legacy v2 remains readable but unbound location can never promote exact restore state', async () => {
  const root = await project('cmi-portable-integrity-v2-');
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-portable-integrity-v2-bundle-'));
  const bundle = await freezePortableEvidence(root, path.join(parent, 'bundle'));
  const destination = path.join(parent, 'destination');
  await copyWithoutMemory(root, destination);

  const manifest = await asLegacyV2(bundle.path);
  manifest.project.location.path = await fs.realpath(destination);
  await writeManifest(bundle.path, manifest);

  const inspected = await inspectPortableEvidence(bundle.path);
  assert.equal(inspected.schemaVersion, 2);
  assert.equal(inspected.manifestIntegrity.state, 'legacy-partial');
  assert.equal(inspected.manifestIntegrity.manifestProvenanceBound, false);
  assert.equal(inspected.manifestIntegrity.originBound, false);
  assert.ok(inspected.manifestIntegrity.unboundFields.includes('project.location'));

  const restored = await restorePortableEvidence(destination, bundle.path, { rebind: true });
  assert.notEqual(restored.state, 'exact');
  assert.equal(restored.state, 'compatible-relocated');
  assert.equal(restored.verification.originBinding, 'legacy-unbound');
  assert.equal(restored.verification.samePathObserved, true);
  assert.equal(restored.verification.samePath, false);
  assert.equal(restored.manifestIntegrity.state, 'legacy-partial');
  assert.equal(restored.provenance.original.manifestIntegrity, undefined);
});

test('released relocated v2 rebind provenance remains reusable without synthesizing v3 verification fields', async () => {
  const root = await project('cmi-portable-integrity-v2-provenance-');
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-portable-integrity-v2-provenance-bundle-'));
  const bundle = await freezePortableEvidence(root, path.join(parent, 'bundle'));
  const destination = path.join(parent, 'destination');
  await copyWithoutMemory(root, destination);
  await asLegacyV2(bundle.path);

  const restored = await restorePortableEvidence(destination, bundle.path, { rebind: true });
  assert.equal(restored.state, 'compatible-relocated');

  const provenancePath = path.join(destination, '.codex-memory', 'portable-provenance.json');
  const legacyProvenance = JSON.parse(await fs.readFile(provenancePath, 'utf8'));
  delete legacyProvenance.verification.samePathObserved;
  delete legacyProvenance.verification.originBinding;
  await fs.writeFile(provenancePath, `${JSON.stringify(legacyProvenance, null, 2)}\n`);

  const reused = await restorePortableEvidence(destination, bundle.path, { rebind: true });
  assert.equal(reused.alreadyPresent, true);
  assert.equal(reused.state, 'compatible-relocated');
  assert.equal(reused.provenance.verification.samePathObserved, undefined);
  assert.equal(reused.provenance.verification.originBinding, undefined);
  assert.equal(reused.verification.originBinding, 'legacy-unbound');
});

test('v3 bound origin retains exact restore semantics at the frozen project location', async () => {
  const root = await project('cmi-portable-integrity-exact-');
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-portable-integrity-exact-bundle-'));
  const bundle = await freezePortableEvidence(root, path.join(parent, 'bundle'));
  await fs.rm(path.join(root, '.codex-memory'), { recursive: true });

  const restored = await restorePortableEvidence(root, bundle.path);
  assert.equal(restored.state, 'exact');
  assert.equal(restored.verification.originBinding, 'integrity-bound');
  assert.equal(restored.verification.samePathObserved, true);
  assert.equal(restored.verification.samePath, true);
  assert.equal(restored.manifestIntegrity.state, 'verified');
  assert.equal(restored.provenance.original.portableSchemaVersion, 3);
  assert.equal(restored.provenance.original.manifestIntegrity, bundle.manifest.integrity.digest);
});
