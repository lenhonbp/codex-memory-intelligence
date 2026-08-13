import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(here, 'fixtures', 'evidence-contract');

const plan = JSON.parse(await fs.readFile(path.join(fixtureRoot, 'handshake-toctou-simulation.json'), 'utf8'));
const negotiation = JSON.parse(await fs.readFile(path.join(fixtureRoot, 'negotiation-simulation.json'), 'utf8'));
const capability = JSON.parse(await fs.readFile(path.join(fixtureRoot, 'capability-advertisement-simulation.json'), 'utf8'));
const v1 = JSON.parse(await fs.readFile(path.join(fixtureRoot, 'v1.json'), 'utf8'));
const goldenV1 = JSON.parse(await fs.readFile(path.join(fixtureRoot, 'golden-exchange-v1.json'), 'utf8'));
const v2Simulation = JSON.parse(await fs.readFile(path.join(fixtureRoot, 'v2-simulation.json'), 'utf8'));

function clone(value) {
  return structuredClone(value);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function fail(pathName, detail) {
  throw new Error(`Evidence Contract handshake TOCTOU simulation break at ${pathName}: ${detail}`);
}

function artifactProjection(artifacts) {
  return Object.fromEntries(
    Object.entries(artifacts || {})
      .sort(([left], [right]) => left.localeCompare(right, 'en'))
      .map(([version, artifact]) => [version, {
        contractFixture: artifact?.contractFixture || null,
        goldenFixture: artifact?.goldenFixture || null,
      }]),
  );
}

function authorityProjection(authority) {
  return {
    runtimeNegotiationImplemented: authority.runtimeNegotiationImplemented,
    currentRuntimeContractVersion: authority.currentRuntimeContractVersion,
    supportedContractVersions: [...(authority.supportedContractVersions || [])],
    knownButUnsupportedSimulations: [...(authority.knownButUnsupportedSimulations || [])],
    contractArtifacts: artifactProjection(authority.contractArtifacts),
    selectionPolicy: authority.policy?.selection || null,
    unsupportedPolicy: authority.policy?.unsupported || null,
    silentDowngrade: authority.policy?.silentDowngrade,
    silentUpgrade: authority.policy?.silentUpgrade,
    semanticNormalizationAcrossVersions: authority.policy?.semanticNormalizationAcrossVersions,
    fallbackToCurrentOnUnsupported: authority.policy?.fallbackToCurrentOnUnsupported,
  };
}

function capabilityProjection(snapshot) {
  return {
    runtimeCapabilityAdvertisementImplemented: snapshot.runtimeCapabilityAdvertisementImplemented,
    runtimeNegotiationImplemented: snapshot.runtimeNegotiationImplemented,
    sourceNegotiationFixture: snapshot.sourceNegotiationFixture,
    advertisement: {
      currentContractVersion: snapshot.advertisement?.currentContractVersion,
      supportedContractVersions: [...(snapshot.advertisement?.supportedContractVersions || [])],
      selectionPolicy: snapshot.advertisement?.selectionPolicy || null,
      contractArtifacts: artifactProjection(snapshot.advertisement?.contractArtifacts),
    },
    visibility: clone(snapshot.visibility || {}),
    consistencyPolicy: clone(snapshot.consistencyPolicy || {}),
  };
}

function validatePlan(value) {
  if (value.simulationOnly !== true) fail('simulationOnly', 'handshake fixture must remain simulation-only');
  if (value.runtimeHandshakeImplemented !== false) fail('runtimeHandshakeImplemented', 'simulation must not claim a runtime handshake');
  if (value.runtimeCapabilityAdvertisementImplemented !== false) {
    fail('runtimeCapabilityAdvertisementImplemented', 'simulation must not claim runtime capability discovery');
  }
  if (value.runtimeNegotiationImplemented !== false) fail('runtimeNegotiationImplemented', 'simulation must not claim runtime negotiation');
  assert.deepEqual(value.lifecycle, ['discover', 'choose-exact-version', 'negotiate', 'consume-replay']);

  const policy = value.bindingPolicy || {};
  if (policy.discoveryFingerprint !== 'required') fail('bindingPolicy.discoveryFingerprint', 'capability fingerprint binding must remain required');
  if (policy.authorityFingerprint !== 'required') fail('bindingPolicy.authorityFingerprint', 'authority fingerprint binding must remain required');
  if (policy.revalidateCapabilityBeforeNegotiation !== true) fail('bindingPolicy.revalidateCapabilityBeforeNegotiation', 'capability must be revalidated before negotiation');
  if (policy.revalidateAuthorityBeforeNegotiation !== true) fail('bindingPolicy.revalidateAuthorityBeforeNegotiation', 'authority must be revalidated before negotiation');
  if (policy.revalidateCapabilityBeforeConsume !== true) fail('bindingPolicy.revalidateCapabilityBeforeConsume', 'capability must be revalidated before consume');
  if (policy.revalidateAuthorityBeforeConsume !== true) fail('bindingPolicy.revalidateAuthorityBeforeConsume', 'authority must be revalidated before consume');
  if (policy.exactVersionContinuity !== true) fail('bindingPolicy.exactVersionContinuity', 'version continuity must remain exact');
  if (policy.exactArtifactContinuity !== true) fail('bindingPolicy.exactArtifactContinuity', 'artifact continuity must remain exact');
  if (policy.silentDowngrade !== false) fail('bindingPolicy.silentDowngrade', 'silent downgrade must remain disabled');
  if (policy.silentUpgrade !== false) fail('bindingPolicy.silentUpgrade', 'silent upgrade must remain disabled');
  if (policy.artifactSubstitution !== false) fail('bindingPolicy.artifactSubstitution', 'artifact substitution must remain disabled');
  if (policy.staleState !== 'fail-closed') fail('bindingPolicy.staleState', 'stale state must fail closed');
}

function compareVersionSets(actual, expected, pathName) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(pathName, `expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

function validateCapabilityAgainstAuthority(snapshot, authority) {
  if (snapshot.sourceNegotiationFixture !== plan.sources.negotiationFixture) {
    fail('capability.sourceNegotiationFixture', 'capability snapshot must identify the negotiation authority');
  }
  if (snapshot.advertisement?.currentContractVersion !== authority.currentRuntimeContractVersion) {
    fail('capability.advertisement.currentContractVersion', 'capability current version does not match negotiation authority');
  }
  compareVersionSets(
    snapshot.advertisement?.supportedContractVersions || [],
    authority.supportedContractVersions || [],
    'capability.advertisement.supportedContractVersions',
  );
  if (snapshot.advertisement?.selectionPolicy !== authority.policy?.selection) {
    fail('capability.advertisement.selectionPolicy', 'capability selection policy does not match negotiation authority');
  }

  for (const version of authority.supportedContractVersions || []) {
    const advertised = snapshot.advertisement?.contractArtifacts?.[String(version)];
    const authoritative = authority.contractArtifacts?.[String(version)];
    if (!advertised || !authoritative) fail(`capability.advertisement.contractArtifacts.${version}`, 'exact artifact mapping is required');
    if (advertised.contractFixture !== authoritative.contractFixture) {
      fail(`capability.advertisement.contractArtifacts.${version}.contractFixture`, 'contract artifact mapping diverged');
    }
    if ((advertised.goldenFixture || null) !== (authoritative.goldenFixture || null)) {
      fail(`capability.advertisement.contractArtifacts.${version}.goldenFixture`, 'golden artifact mapping diverged');
    }
  }
}

function discover(snapshot, authority) {
  validatePlan(plan);
  validateCapabilityAgainstAuthority(snapshot, authority);
  return {
    ok: true,
    currentContractVersion: snapshot.advertisement.currentContractVersion,
    supportedContractVersions: [...snapshot.advertisement.supportedContractVersions],
    selectionPolicy: snapshot.advertisement.selectionPolicy,
    contractArtifacts: clone(snapshot.advertisement.contractArtifacts),
    capabilityFingerprint: fingerprint(capabilityProjection(snapshot)),
    authorityFingerprint: fingerprint(authorityProjection(authority)),
  };
}

function chooseVersion(discovery, requestedVersion) {
  if (!Number.isInteger(requestedVersion) || requestedVersion < 1 || !discovery.supportedContractVersions.includes(requestedVersion)) {
    return {
      ok: false,
      error: {
        code: plan.refusal.selectionCode,
        requestedVersion,
        advertisedVersions: [...discovery.supportedContractVersions],
      },
    };
  }

  const artifact = discovery.contractArtifacts[String(requestedVersion)];
  return {
    ok: true,
    requestedVersion,
    chosenVersion: requestedVersion,
    contractFixture: artifact.contractFixture,
    goldenFixture: artifact.goldenFixture || null,
    capabilityFingerprint: discovery.capabilityFingerprint,
    authorityFingerprint: discovery.authorityFingerprint,
  };
}

function staleResult(stage, binding, snapshot, authority) {
  const changed = [];
  if (binding.capabilityFingerprint !== fingerprint(capabilityProjection(snapshot))) changed.push('capability');
  if (binding.authorityFingerprint !== fingerprint(authorityProjection(authority))) changed.push('authority');
  if (changed.length === 0) return null;
  return {
    ok: false,
    error: {
      code: plan.refusal.staleCode,
      stage,
      changed,
    },
  };
}

function negotiate(binding, snapshot, authority) {
  const stale = staleResult('negotiate', binding, snapshot, authority);
  if (stale) return stale;
  validateCapabilityAgainstAuthority(snapshot, authority);

  if (binding.requestedVersion !== binding.chosenVersion || !authority.supportedContractVersions.includes(binding.chosenVersion)) {
    return {
      ok: false,
      error: {
        code: plan.refusal.selectionCode,
        requestedVersion: binding.requestedVersion,
        chosenVersion: binding.chosenVersion,
      },
    };
  }

  const authoritative = authority.contractArtifacts[String(binding.chosenVersion)];
  const advertised = snapshot.advertisement.contractArtifacts[String(binding.chosenVersion)];
  if (
    binding.contractFixture !== authoritative?.contractFixture
    || binding.contractFixture !== advertised?.contractFixture
    || (binding.goldenFixture || null) !== (authoritative?.goldenFixture || null)
    || (binding.goldenFixture || null) !== (advertised?.goldenFixture || null)
  ) {
    return {
      ok: false,
      error: {
        code: plan.refusal.artifactCode,
        stage: 'negotiate',
      },
    };
  }

  return {
    ok: true,
    requestedVersion: binding.requestedVersion,
    selectedContractVersion: binding.chosenVersion,
    contractFixture: binding.contractFixture,
    goldenFixture: binding.goldenFixture,
    capabilityFingerprint: binding.capabilityFingerprint,
    authorityFingerprint: binding.authorityFingerprint,
  };
}

function contractVersionForFixture(name) {
  if (name === 'v1.json') return v1.contractVersion;
  if (name === 'v2-simulation.json') return v2Simulation.simulatedContractVersion;
  return null;
}

function consumeReplay(receipt, snapshot, authority) {
  const stale = staleResult('consume-replay', receipt, snapshot, authority);
  if (stale) return stale;
  validateCapabilityAgainstAuthority(snapshot, authority);

  if (receipt.requestedVersion !== receipt.selectedContractVersion) {
    return {
      ok: false,
      error: {
        code: plan.refusal.selectionCode,
        stage: 'consume-replay',
      },
    };
  }

  const authoritative = authority.contractArtifacts[String(receipt.selectedContractVersion)];
  const advertised = snapshot.advertisement.contractArtifacts[String(receipt.selectedContractVersion)];
  if (
    receipt.contractFixture !== authoritative?.contractFixture
    || receipt.contractFixture !== advertised?.contractFixture
    || (receipt.goldenFixture || null) !== (authoritative?.goldenFixture || null)
    || (receipt.goldenFixture || null) !== (advertised?.goldenFixture || null)
  ) {
    return {
      ok: false,
      error: {
        code: plan.refusal.artifactCode,
        stage: 'consume-replay',
      },
    };
  }

  const artifactVersion = contractVersionForFixture(receipt.contractFixture);
  if (artifactVersion !== receipt.selectedContractVersion) {
    return {
      ok: false,
      error: {
        code: plan.refusal.artifactCode,
        stage: 'consume-replay',
      },
    };
  }
  if (receipt.goldenFixture === 'golden-exchange-v1.json' && goldenV1.evidenceContractVersion !== receipt.selectedContractVersion) {
    return {
      ok: false,
      error: {
        code: plan.refusal.artifactCode,
        stage: 'consume-replay',
      },
    };
  }

  return {
    ok: true,
    consumedContractVersion: receipt.selectedContractVersion,
    contractFixture: receipt.contractFixture,
    goldenFixture: receipt.goldenFixture,
  };
}

function assertStale(result, stage, changed) {
  assert.equal(result.ok, false);
  assert.equal(result.error.code, plan.refusal.staleCode);
  assert.equal(result.error.stage, stage);
  assert.deepEqual(result.error.changed, changed);
  assert.equal(Object.hasOwn(result, 'selectedContractVersion'), false);
  assert.equal(Object.hasOwn(result, 'contractFixture'), false);
}

function futureAuthorityAndCapability() {
  const nextAuthority = clone(negotiation);
  nextAuthority.currentRuntimeContractVersion = 2;
  nextAuthority.supportedContractVersions = [1, 2];
  nextAuthority.knownButUnsupportedSimulations = [];
  nextAuthority.contractArtifacts['2'] = {
    contractFixture: 'v2-simulation.json',
    goldenFixture: null,
  };

  const nextCapability = clone(capability);
  nextCapability.advertisement.currentContractVersion = 2;
  nextCapability.advertisement.supportedContractVersions = [1, 2];
  nextCapability.advertisement.contractArtifacts['2'] = {
    contractFixture: 'v2-simulation.json',
    goldenFixture: null,
  };
  return { nextAuthority, nextCapability };
}

test('handshake fixture is simulation-only and requires revalidation across the full lifecycle', () => {
  assert.doesNotThrow(() => validatePlan(plan));
  assert.equal(plan.simulationOnly, true);
  assert.equal(plan.runtimeHandshakeImplemented, false);
  assert.equal(plan.runtimeCapabilityAdvertisementImplemented, false);
  assert.equal(plan.runtimeNegotiationImplemented, false);
});

test('discover → choose v1 → negotiate → consume/replay preserves exact version and artifacts', () => {
  const discovery = discover(capability, negotiation);
  const choice = chooseVersion(discovery, 1);
  assert.equal(choice.ok, true);
  const receipt = negotiate(choice, capability, negotiation);
  assert.deepEqual(receipt, {
    ok: true,
    requestedVersion: 1,
    selectedContractVersion: 1,
    contractFixture: 'v1.json',
    goldenFixture: 'golden-exchange-v1.json',
    capabilityFingerprint: discovery.capabilityFingerprint,
    authorityFingerprint: discovery.authorityFingerprint,
  });
  assert.deepEqual(consumeReplay(receipt, capability, negotiation), {
    ok: true,
    consumedContractVersion: 1,
    contractFixture: 'v1.json',
    goldenFixture: 'golden-exchange-v1.json',
  });
});

test('consumer cannot choose an unadvertised version and the gate never falls back to v1', () => {
  const discovery = discover(capability, negotiation);
  for (const requestedVersion of [2, 3, 99]) {
    const result = chooseVersion(discovery, requestedVersion);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, plan.refusal.selectionCode);
    assert.equal(result.error.requestedVersion, requestedVersion);
    assert.deepEqual(result.error.advertisedVersions, [1]);
    assert.equal(Object.hasOwn(result, 'chosenVersion'), false);
    assert.equal(Object.hasOwn(result, 'contractFixture'), false);
  }
});

test('authority change after discovery is rejected before negotiation even when the new authority is internally valid', () => {
  const discovery = discover(capability, negotiation);
  const choice = chooseVersion(discovery, 1);
  const { nextAuthority, nextCapability } = futureAuthorityAndCapability();

  assertStale(negotiate(choice, nextCapability, nextAuthority), 'negotiate', ['capability', 'authority']);
});

test('capability mutation after discovery is rejected before artifact selection can be substituted', () => {
  const discovery = discover(capability, negotiation);
  const choice = chooseVersion(discovery, 1);
  const mutatedCapability = clone(capability);
  mutatedCapability.advertisement.contractArtifacts['1'].contractFixture = 'v2-simulation.json';

  assertStale(negotiate(choice, mutatedCapability, negotiation), 'negotiate', ['capability']);
});

test('authority change after negotiation is rejected before consume/replay', () => {
  const discovery = discover(capability, negotiation);
  const choice = chooseVersion(discovery, 1);
  const receipt = negotiate(choice, capability, negotiation);
  assert.equal(receipt.ok, true);

  const changedAuthority = clone(negotiation);
  changedAuthority.policy.selection = 'nearest-supported';
  assertStale(consumeReplay(receipt, capability, changedAuthority), 'consume-replay', ['authority']);
});

test('capability change after negotiation is rejected before consume/replay', () => {
  const discovery = discover(capability, negotiation);
  const choice = chooseVersion(discovery, 1);
  const receipt = negotiate(choice, capability, negotiation);
  assert.equal(receipt.ok, true);

  const changedCapability = clone(capability);
  changedCapability.advertisement.selectionPolicy = 'nearest-supported';
  assertStale(consumeReplay(receipt, changedCapability, negotiation), 'consume-replay', ['capability']);
});

test('tampered negotiation receipt cannot change selected version or substitute contract/golden artifacts', () => {
  const discovery = discover(capability, negotiation);
  const choice = chooseVersion(discovery, 1);
  const receipt = negotiate(choice, capability, negotiation);
  assert.equal(receipt.ok, true);

  const wrongVersion = clone(receipt);
  wrongVersion.selectedContractVersion = 2;
  const versionResult = consumeReplay(wrongVersion, capability, negotiation);
  assert.equal(versionResult.ok, false);
  assert.equal(versionResult.error.code, plan.refusal.selectionCode);

  const wrongContract = clone(receipt);
  wrongContract.contractFixture = 'v2-simulation.json';
  const contractResult = consumeReplay(wrongContract, capability, negotiation);
  assert.equal(contractResult.ok, false);
  assert.equal(contractResult.error.code, plan.refusal.artifactCode);

  const wrongGolden = clone(receipt);
  wrongGolden.goldenFixture = null;
  const goldenResult = consumeReplay(wrongGolden, capability, negotiation);
  assert.equal(goldenResult.ok, false);
  assert.equal(goldenResult.error.code, plan.refusal.artifactCode);
});

test('a fresh future v1+v2 discovery can negotiate exact v2, while an old v1 binding cannot cross the authority change', () => {
  const oldDiscovery = discover(capability, negotiation);
  const oldChoice = chooseVersion(oldDiscovery, 1);
  const { nextAuthority, nextCapability } = futureAuthorityAndCapability();
  assertStale(negotiate(oldChoice, nextCapability, nextAuthority), 'negotiate', ['capability', 'authority']);

  const freshDiscovery = discover(nextCapability, nextAuthority);
  assert.deepEqual(freshDiscovery.supportedContractVersions, [1, 2]);
  const v2Choice = chooseVersion(freshDiscovery, 2);
  assert.equal(v2Choice.ok, true);
  const v2Receipt = negotiate(v2Choice, nextCapability, nextAuthority);
  assert.equal(v2Receipt.ok, true);
  assert.equal(v2Receipt.requestedVersion, 2);
  assert.equal(v2Receipt.selectedContractVersion, 2);
  assert.equal(v2Receipt.contractFixture, 'v2-simulation.json');
  assert.equal(v2Receipt.goldenFixture, null);
  assert.deepEqual(consumeReplay(v2Receipt, nextCapability, nextAuthority), {
    ok: true,
    consumedContractVersion: 2,
    contractFixture: 'v2-simulation.json',
    goldenFixture: null,
  });
});
