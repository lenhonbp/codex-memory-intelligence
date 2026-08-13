import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(here, 'fixtures', 'evidence-contract');
const negotiation = JSON.parse(await fs.readFile(path.join(fixtureRoot, 'negotiation-simulation.json'), 'utf8'));
const capability = JSON.parse(await fs.readFile(path.join(fixtureRoot, 'capability-advertisement-simulation.json'), 'utf8'));
const v2Simulation = JSON.parse(await fs.readFile(path.join(fixtureRoot, 'v2-simulation.json'), 'utf8'));

const STALE_CODE = 'CMI_EVIDENCE_CONTRACT_CAPABILITY_STALE';

function clone(value) {
  return structuredClone(value);
}

function fail(pathName, detail) {
  throw new Error(`Contract capability advertisement simulation break at ${pathName}: ${detail}`);
}

function assertPositiveUniqueVersions(versions, pathName) {
  if (!Array.isArray(versions) || versions.length === 0) fail(pathName, 'at least one advertised version is required');
  if (new Set(versions).size !== versions.length) fail(pathName, 'advertised versions must be unique');
  if (versions.some((version) => !Number.isInteger(version) || version < 1)) {
    fail(pathName, 'advertised versions must be positive integers');
  }
}

function compareArtifact(actual, expected, pathName) {
  if (!actual || typeof actual !== 'object' || Array.isArray(actual)) fail(pathName, 'artifact mapping is required');
  if (actual.contractFixture !== expected?.contractFixture) {
    fail(`${pathName}.contractFixture`, `expected ${expected?.contractFixture ?? 'no artifact'}, received ${actual.contractFixture ?? 'none'}`);
  }
  const expectedGolden = expected?.goldenFixture || null;
  const actualGolden = actual.goldenFixture || null;
  if (actualGolden !== expectedGolden) {
    fail(`${pathName}.goldenFixture`, `expected ${expectedGolden ?? 'null'}, received ${actualGolden ?? 'null'}`);
  }
}

function validateCapabilityAdvertisement(snapshot, authority) {
  if (snapshot.simulationOnly !== true) fail('simulationOnly', 'capability fixture must remain simulation-only');
  if (snapshot.runtimeCapabilityAdvertisementImplemented !== false) {
    fail('runtimeCapabilityAdvertisementImplemented', 'simulation must not claim a production discovery surface');
  }
  if (snapshot.runtimeNegotiationImplemented !== authority.runtimeNegotiationImplemented) {
    fail('runtimeNegotiationImplemented', 'advertisement must not disagree with negotiation implementation status');
  }
  if (snapshot.sourceNegotiationFixture !== 'negotiation-simulation.json') {
    fail('sourceNegotiationFixture', 'advertisement must identify the negotiation authority explicitly');
  }

  const policy = snapshot.consistencyPolicy || {};
  if (policy.sourceOfTruth !== 'negotiation-simulation.json') fail('consistencyPolicy.sourceOfTruth', 'negotiation fixture must remain authoritative');
  if (policy.currentVersionMustMatch !== true) fail('consistencyPolicy.currentVersionMustMatch', 'current version parity must remain mandatory');
  if (policy.supportedVersionSetMustMatch !== true) fail('consistencyPolicy.supportedVersionSetMustMatch', 'supported-version parity must remain mandatory');
  if (policy.artifactMappingMustMatch !== true) fail('consistencyPolicy.artifactMappingMustMatch', 'artifact mapping parity must remain mandatory');
  if (policy.refusalSupportedVersionsMustMatch !== true) fail('consistencyPolicy.refusalSupportedVersionsMustMatch', 'refusal version parity must remain mandatory');
  if (policy.staleMetadata !== 'fail-closed') fail('consistencyPolicy.staleMetadata', 'stale capability metadata must fail closed');
  if (snapshot.staleMetadataRefusal?.code !== STALE_CODE) fail('staleMetadataRefusal.code', 'stale capability metadata needs a stable simulation refusal code');

  const advertised = snapshot.advertisement || {};
  if (!Number.isInteger(advertised.currentContractVersion) || advertised.currentContractVersion < 1) {
    fail('advertisement.currentContractVersion', 'current advertised contract must be a positive integer');
  }
  if (advertised.currentContractVersion !== authority.currentRuntimeContractVersion) {
    fail('advertisement.currentContractVersion', `expected ${authority.currentRuntimeContractVersion}, received ${advertised.currentContractVersion}`);
  }

  assertPositiveUniqueVersions(advertised.supportedContractVersions, 'advertisement.supportedContractVersions');
  if (!Array.isArray(authority.supportedContractVersions)) fail('authority.supportedContractVersions', 'negotiation authority must expose supported versions');
  if (!Object.is(JSON.stringify(advertised.supportedContractVersions), JSON.stringify(authority.supportedContractVersions))) {
    fail(
      'advertisement.supportedContractVersions',
      `expected ${JSON.stringify(authority.supportedContractVersions)}, received ${JSON.stringify(advertised.supportedContractVersions)}`,
    );
  }
  if (!advertised.supportedContractVersions.includes(advertised.currentContractVersion)) {
    fail('advertisement.supportedContractVersions', 'current advertised contract must also be supported');
  }
  if (advertised.selectionPolicy !== authority.policy?.selection) {
    fail('advertisement.selectionPolicy', `expected ${authority.policy?.selection ?? 'none'}, received ${advertised.selectionPolicy ?? 'none'}`);
  }

  const artifactKeys = Object.keys(advertised.contractArtifacts || {}).sort();
  const expectedArtifactKeys = advertised.supportedContractVersions.map(String).sort();
  if (!Object.is(JSON.stringify(artifactKeys), JSON.stringify(expectedArtifactKeys))) {
    fail('advertisement.contractArtifacts', 'advertisement must expose artifacts for supported versions only');
  }
  for (const version of advertised.supportedContractVersions) {
    compareArtifact(
      advertised.contractArtifacts[String(version)],
      authority.contractArtifacts?.[String(version)],
      `advertisement.contractArtifacts.${version}`,
    );
  }

  if (snapshot.visibility?.includeKnownUnsupportedSimulations !== false) {
    fail('visibility.includeKnownUnsupportedSimulations', 'known unsupported simulations must not be advertised as capabilities');
  }
  if (snapshot.visibility?.includeRuntimeUnsupportedContracts !== false) {
    fail('visibility.includeRuntimeUnsupportedContracts', 'runtime-unsupported contracts must remain hidden from discovery');
  }
  for (const unsupported of authority.knownButUnsupportedSimulations || []) {
    if (advertised.supportedContractVersions.includes(unsupported)) {
      fail('advertisement.supportedContractVersions', `unsupported simulation version ${unsupported} cannot be advertised`);
    }
    if (Object.hasOwn(advertised.contractArtifacts || {}, String(unsupported))) {
      fail('advertisement.contractArtifacts', `unsupported simulation version ${unsupported} cannot expose an advertised artifact`);
    }
  }
}

function discoverCapabilities(snapshot, authority) {
  try {
    validateCapabilityAdvertisement(snapshot, authority);
  } catch (error) {
    return {
      ok: false,
      error: {
        code: STALE_CODE,
        message: error.message,
      },
    };
  }

  const advertised = snapshot.advertisement;
  return {
    ok: true,
    currentContractVersion: advertised.currentContractVersion,
    supportedContractVersions: [...advertised.supportedContractVersions],
    selectionPolicy: advertised.selectionPolicy,
    contractArtifacts: clone(advertised.contractArtifacts),
  };
}

function simulateNegotiationRefusal(authority, requestedVersion) {
  assert.ok(Number.isInteger(requestedVersion) && requestedVersion > 0, 'refusal simulation requires a positive integer version');
  assert.equal(authority.supportedContractVersions.includes(requestedVersion), false, 'requested version must be unsupported');
  return {
    ok: false,
    error: {
      code: authority.refusal.code,
      requestedVersion,
      supportedVersions: [...authority.supportedContractVersions],
    },
  };
}

function expectStale(snapshot, authority, expectedPath) {
  const result = discoverCapabilities(snapshot, authority);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, STALE_CODE);
  assert.ok(
    result.error.message.startsWith(`Contract capability advertisement simulation break at ${expectedPath}:`),
    `expected stale failure at ${expectedPath}, received: ${result.error.message}`,
  );
  assert.equal(Object.hasOwn(result, 'supportedContractVersions'), false);
  assert.equal(Object.hasOwn(result, 'contractArtifacts'), false);
}

test('capability advertisement fixture is explicitly simulation-only and derived from the negotiation authority', () => {
  assert.doesNotThrow(() => validateCapabilityAdvertisement(capability, negotiation));
  assert.equal(capability.simulationOnly, true);
  assert.equal(capability.runtimeCapabilityAdvertisementImplemented, false);
  assert.equal(capability.runtimeNegotiationImplemented, false);
  assert.equal(capability.sourceNegotiationFixture, 'negotiation-simulation.json');
  assert.equal(capability.consistencyPolicy.sourceOfTruth, 'negotiation-simulation.json');
});

test('version discovery advertises only released runtime-supported v1 and never leaks the v2 simulation', () => {
  const result = discoverCapabilities(capability, negotiation);
  assert.deepEqual(result, {
    ok: true,
    currentContractVersion: 1,
    supportedContractVersions: [1],
    selectionPolicy: 'exact-match-only',
    contractArtifacts: {
      '1': {
        contractFixture: 'v1.json',
        goldenFixture: 'golden-exchange-v1.json',
      },
    },
  });
  assert.equal(v2Simulation.simulatedContractVersion, 2);
  assert.equal(v2Simulation.runtimeSupported, false);
  assert.equal(result.supportedContractVersions.includes(2), false);
  assert.equal(Object.hasOwn(result.contractArtifacts, '2'), false);
});

test('unsupported-version refusal lists exactly the set returned by capability discovery', () => {
  const discovery = discoverCapabilities(capability, negotiation);
  assert.equal(discovery.ok, true);

  for (const requestedVersion of [2, 3, 99]) {
    const refusal = simulateNegotiationRefusal(negotiation, requestedVersion);
    assert.equal(refusal.error.code, 'CMI_EVIDENCE_CONTRACT_UNSUPPORTED');
    assert.deepEqual(refusal.error.supportedVersions, discovery.supportedContractVersions);
  }
});

test('stale current version or supported-version metadata fails closed instead of returning capabilities', () => {
  const staleCurrent = clone(capability);
  staleCurrent.advertisement.currentContractVersion = 2;
  expectStale(staleCurrent, negotiation, 'advertisement.currentContractVersion');

  const staleSupported = clone(capability);
  staleSupported.advertisement.supportedContractVersions = [1, 2];
  staleSupported.advertisement.contractArtifacts['2'] = {
    contractFixture: 'v2-simulation.json',
    goldenFixture: null,
  };
  expectStale(staleSupported, negotiation, 'advertisement.supportedContractVersions');
});

test('stale or masquerading artifact metadata fails closed at its exact capability address', () => {
  const wrongV1Artifact = clone(capability);
  wrongV1Artifact.advertisement.contractArtifacts['1'].contractFixture = 'v2-simulation.json';
  expectStale(wrongV1Artifact, negotiation, 'advertisement.contractArtifacts.1.contractFixture');

  const leakedV2Artifact = clone(capability);
  leakedV2Artifact.advertisement.contractArtifacts['2'] = {
    contractFixture: 'v2-simulation.json',
    goldenFixture: null,
  };
  expectStale(leakedV2Artifact, negotiation, 'advertisement.contractArtifacts');
});

test('capability policy cannot weaken source authority, visibility, or fail-closed stale handling', () => {
  const wrongSource = clone(capability);
  wrongSource.sourceNegotiationFixture = 'v2-simulation.json';
  expectStale(wrongSource, negotiation, 'sourceNegotiationFixture');

  const leaksUnsupported = clone(capability);
  leaksUnsupported.visibility.includeKnownUnsupportedSimulations = true;
  expectStale(leaksUnsupported, negotiation, 'visibility.includeKnownUnsupportedSimulations');

  const permissiveStale = clone(capability);
  permissiveStale.consistencyPolicy.staleMetadata = 'warn-and-continue';
  expectStale(permissiveStale, negotiation, 'consistencyPolicy.staleMetadata');
});

test('future v1+v2 simulation advertises both versions only when negotiation authority changes in lockstep', () => {
  const futureNegotiation = clone(negotiation);
  futureNegotiation.currentRuntimeContractVersion = 2;
  futureNegotiation.supportedContractVersions = [1, 2];
  futureNegotiation.knownButUnsupportedSimulations = [];
  futureNegotiation.contractArtifacts['2'] = {
    contractFixture: 'v2-simulation.json',
    goldenFixture: null,
  };

  const futureCapability = clone(capability);
  futureCapability.advertisement.currentContractVersion = 2;
  futureCapability.advertisement.supportedContractVersions = [1, 2];
  futureCapability.advertisement.contractArtifacts['2'] = {
    contractFixture: 'v2-simulation.json',
    goldenFixture: null,
  };

  const discovery = discoverCapabilities(futureCapability, futureNegotiation);
  assert.equal(discovery.ok, true);
  assert.equal(discovery.currentContractVersion, 2);
  assert.deepEqual(discovery.supportedContractVersions, [1, 2]);
  assert.equal(discovery.contractArtifacts['2'].contractFixture, 'v2-simulation.json');

  const refusal = simulateNegotiationRefusal(futureNegotiation, 3);
  assert.deepEqual(refusal.error.supportedVersions, discovery.supportedContractVersions);

  expectStale(capability, futureNegotiation, 'advertisement.currentContractVersion');
});

test('advertised version lists reject duplicates and invalid values before discovery can succeed', () => {
  const duplicate = clone(capability);
  duplicate.advertisement.supportedContractVersions = [1, 1];
  expectStale(duplicate, negotiation, 'advertisement.supportedContractVersions');

  const invalid = clone(capability);
  invalid.advertisement.supportedContractVersions = [1, 1.5];
  expectStale(invalid, negotiation, 'advertisement.supportedContractVersions');
});
