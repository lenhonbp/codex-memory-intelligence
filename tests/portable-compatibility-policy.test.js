import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initProject, scanProject, remember } from '../src/core.js';
import { freezePortableEvidence, inspectPortableEvidence, restorePortableEvidence } from '../src/portable-evidence.js';
import {
  PORTABLE_SCHEMA_COMPATIBILITY,
  portableSchemaCompatibility,
  isSupportedPortableSchemaVersion,
} from '../src/portable-manifest-integrity.js';

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

async function project(prefix) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'portable-compatibility-fixture', type: 'module' }));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'index.js'), 'export const value = 1;\n');
  await initProject(root);
  await scanProject(root);
  await remember(root, 'decision', 'Portable schema compatibility must remain explicit and fail closed.', { sources: ['src/index.js'] });
  return root;
}

async function copyWithoutMemory(source, target) {
  await fs.cp(source, target, { recursive: true });
  await fs.rm(path.join(target, '.codex-memory'), { recursive: true, force: true });
}

async function asLegacyV2(bundlePath) {
  const manifestPath = path.join(bundlePath, 'manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  manifest.schemaVersion = 2;
  delete manifest.integrity;
  manifest.identity = {
    algorithm: 'sha256',
    digest: digestText(JSON.stringify(legacyV2IdentityMaterial(manifest))),
  };
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

test('portable schema compatibility policy publishes the exact supported v2/v3 matrix', () => {
  assert.deepEqual(PORTABLE_SCHEMA_COMPATIBILITY, [
    {
      schemaVersion: 2,
      status: 'legacy-supported',
      firstPublicRelease: 'v0.12.0',
      writer: false,
      inspect: true,
      restore: true,
      rebind: true,
      manifestIntegrity: 'legacy-partial',
      originBinding: 'legacy-unbound',
    },
    {
      schemaVersion: 3,
      status: 'current',
      firstPublicRelease: 'v0.12.1',
      writer: true,
      inspect: true,
      restore: true,
      rebind: true,
      manifestIntegrity: 'verified',
      originBinding: 'integrity-bound',
    },
  ]);
  assert.equal(isSupportedPortableSchemaVersion(2), true);
  assert.equal(isSupportedPortableSchemaVersion(3), true);
  assert.equal(isSupportedPortableSchemaVersion(1), false);
  assert.equal(isSupportedPortableSchemaVersion(4), false);
  assert.equal(portableSchemaCompatibility(4).failureCode, 'CMI_PORTABLE_SCHEMA_UNSUPPORTED');
});

test('published v2/v3 inspect, restore, and rebind policy matches executable behavior', async () => {
  for (const schemaVersion of [2, 3]) {
    const policy = portableSchemaCompatibility(schemaVersion);
    const root = await project(`cmi-portable-policy-v${schemaVersion}-`);
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), `cmi-portable-policy-v${schemaVersion}-bundles-`));
    const bundle = await freezePortableEvidence(root, path.join(parent, 'bundle'));
    if (schemaVersion === 2) await asLegacyV2(bundle.path);

    const inspected = await inspectPortableEvidence(bundle.path);
    assert.equal(policy.inspect, true);
    assert.equal(inspected.schemaVersion, schemaVersion);
    assert.equal(inspected.manifestIntegrity.state, policy.manifestIntegrity);

    const restoreDestination = path.join(parent, 'restore-destination');
    await copyWithoutMemory(root, restoreDestination);
    const restored = await restorePortableEvidence(restoreDestination, bundle.path);
    assert.equal(policy.restore, true);
    assert.equal(restored.schemaVersion, schemaVersion);
    assert.equal(restored.restored, true);
    assert.equal(restored.verification.originBinding, policy.originBinding);

    const rebindDestination = path.join(parent, 'rebind-destination');
    await copyWithoutMemory(root, rebindDestination);
    const rebound = await restorePortableEvidence(rebindDestination, bundle.path, { rebind: true });
    assert.equal(policy.rebind, true);
    assert.equal(rebound.schemaVersion, schemaVersion);
    assert.equal(rebound.restored, true);
    assert.equal(rebound.verification.originBinding, policy.originBinding);
    assert.equal(rebound.provenance.requested.operation, 'rebind');
  }
});

test('unsupported future portable schemas remain outside the published matrix and fail closed', async () => {
  const policy = portableSchemaCompatibility(999);
  assert.equal(policy.status, 'unsupported');
  assert.equal(policy.inspect, false);
  assert.equal(policy.restore, false);
  assert.equal(policy.rebind, false);

  const root = await project('cmi-portable-policy-future-');
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-portable-policy-future-bundle-'));
  const bundle = await freezePortableEvidence(root, path.join(parent, 'bundle'));
  const manifestPath = path.join(bundle.path, 'manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  manifest.schemaVersion = 999;
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  await assert.rejects(() => inspectPortableEvidence(bundle.path), (cause) => {
    assert.equal(cause.code, policy.failureCode);
    return true;
  });
});
