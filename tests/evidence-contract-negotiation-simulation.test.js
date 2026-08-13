import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(here, 'fixtures', 'evidence-contract');
const v1 = JSON.parse(await fs.readFile(path.join(fixtureRoot, 'v1.json'), 'utf8'));
const goldenV1 = JSON.parse(await fs.readFile(path.join(fixtureRoot, 'golden-exchange-v1.json'), 'utf8'));
const v2Simulation = JSON.parse(await fs.readFile(path.join(fixtureRoot, 'v2-simulation.json'), 'utf8'));
const negotiation = JSON.parse(await fs.readFile(path.join(fixtureRoot, 'negotiation-simulation.json'), 'utf8'));

function clone(value) {
  return structuredClone(value);
}

function fail(pathName, detail) {
  throw new Error(`Contract negotiation simulation break at ${pathName}: ${detail}`);
}

function expectedContractFixture(version) {
  if (version === v1.contractVersion) return 'v1.json';
  if (version === v2Simulation.simulatedContractVersion) return 'v2-simulation.json';
  return null;
}

function validateNegotiationPlan(plan) {
  if (plan.simulationOnly !== true) fail('simulationOnly', 'negotiation fixture must remain simulation-only');
  if (plan.runtimeNegotiationImplemented !== false) {
    fail('runtimeNegotiationImplemented', 'simulation must not claim runtime negotiation support');
  }
  if (!Number.isInteger(plan.currentRuntimeContractVersion) || plan.currentRuntimeContractVersion < 1) {
    fail('currentRuntimeContractVersion', 'current runtime contract must be a positive integer');
  }
  if (!Array.isArray(plan.supportedContractVersions) || plan.supportedContractVersions.length === 0) {
    fail('supportedContractVersions', 'at least one exact supported version is required');
  }
  if (new Set(plan.supportedContractVersions).size !== plan.supportedContractVersions.length) {
    fail('supportedContractVersions', 'supported versions must be unique');
  }
  for (const version of plan.supportedContractVersions) {
    if (!Number.isInteger(version) || version < 1) fail('supportedContractVersions', 'supported versions must be positive integers');
    const artifacts = plan.contractArtifacts?.[String(version)];
    if (!artifacts || typeof artifacts.contractFixture !== 'string' || !artifacts.contractFixture) {
      fail(`contractArtifacts.${version}.contractFixture`, 'each supported version must map to an explicit contract artifact');
    }
    const expectedFixture = expectedContractFixture(version);
    if (expectedFixture && artifacts.contractFixture !== expectedFixture) {
      fail(`contractArtifacts.${version}.contractFixture`, `version ${version} must map to ${expectedFixture}`);
    }
  }
  if (!plan.supportedContractVersions.includes(plan.currentRuntimeContractVersion)) {
    fail('supportedContractVersions', 'current runtime contract must be explicitly supported');
  }

  const knownUnsupported = plan.knownButUnsupportedSimulations || [];
  for (const version of knownUnsupported) {
    if (plan.supportedContractVersions.includes(version)) {
      fail('knownButUnsupportedSimulations', `version ${version} cannot be both supported and unsupported`);
    }
  }

  if (plan.policy?.selection !== 'exact-match-only') fail('policy.selection', 'negotiation must use exact version matching');
  if (plan.policy?.unsupported !== 'fail-closed') fail('policy.unsupported', 'unsupported versions must fail closed');
  if (plan.policy?.silentDowngrade !== false) fail('policy.silentDowngrade', 'silent downgrade must remain disabled');
  if (plan.policy?.silentUpgrade !== false) fail('policy.silentUpgrade', 'silent upgrade must remain disabled');
  if (plan.policy?.semanticNormalizationAcrossVersions !== false) {
    fail('policy.semanticNormalizationAcrossVersions', 'cross-version semantic normalization must remain disabled');
  }
  if (plan.policy?.fallbackToCurrentOnUnsupported !== false) {
    fail('policy.fallbackToCurrentOnUnsupported', 'unsupported requests must not fall back to current contract');
  }

  if (plan.refusal?.code !== 'CMI_EVIDENCE_CONTRACT_UNSUPPORTED') {
    fail('refusal.code', 'unsupported-version refusal code must remain explicit');
  }
  if (plan.refusal?.mustIncludeRequestedVersion !== true) {
    fail('refusal.mustIncludeRequestedVersion', 'refusal must name the requested version');
  }
  if (plan.refusal?.mustIncludeSupportedVersions !== true) {
    fail('refusal.mustIncludeSupportedVersions', 'refusal must list supported versions');
  }
  if (plan.invalidRequest?.code !== 'CMI_EVIDENCE_CONTRACT_INVALID_VERSION') {
    fail('invalidRequest.code', 'invalid version requests must have a distinct error code');
  }

  if (plan.retainedArtifacts?.contractV1 !== 'v1.json') fail('retainedArtifacts.contractV1', 'v1 contract fixture must remain retained');
  if (plan.retainedArtifacts?.goldenV1 !== 'golden-exchange-v1.json') fail('retainedArtifacts.goldenV1', 'v1 golden corpus must remain retained');
  if (plan.retainedArtifacts?.v2Simulation !== 'v2-simulation.json') fail('retainedArtifacts.v2Simulation', 'v2 simulation fixture must remain explicit');
}

function invalidVersion(requestedVersion) {
  return !Number.isInteger(requestedVersion) || requestedVersion < 1;
}

function renderUnsupportedMessage(plan, requestedVersion) {
  return plan.refusal.messageTemplate
    .replace('<REQUESTED_VERSION>', String(requestedVersion))
    .replace('<SUPPORTED_VERSIONS>', plan.supportedContractVersions.join(', '));
}

function negotiateContract(plan, requestedVersion) {
  validateNegotiationPlan(plan);

  if (invalidVersion(requestedVersion)) {
    return {
      ok: false,
      error: {
        code: plan.invalidRequest.code,
        message: plan.invalidRequest.message,
        requestedVersion,
        supportedVersions: [...plan.supportedContractVersions],
      },
    };
  }

  if (!plan.supportedContractVersions.includes(requestedVersion)) {
    return {
      ok: false,
      error: {
        code: plan.refusal.code,
        message: renderUnsupportedMessage(plan, requestedVersion),
        requestedVersion,
        supportedVersions: [...plan.supportedContractVersions],
      },
    };
  }

  const artifacts = plan.contractArtifacts[String(requestedVersion)];
  return {
    ok: true,
    requestedVersion,
    selectedContractVersion: requestedVersion,
    contractFixture: artifacts.contractFixture,
    goldenFixture: artifacts.goldenFixture || null,
  };
}

function assertRefusal(result, requestedVersion, supportedVersions) {
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'CMI_EVIDENCE_CONTRACT_UNSUPPORTED');
  assert.equal(result.error.requestedVersion, requestedVersion);
  assert.deepEqual(result.error.supportedVersions, supportedVersions);
  assert.match(result.error.message, new RegExp(`version ${requestedVersion}\\b`, 'i'));
  for (const supported of supportedVersions) assert.match(result.error.message, new RegExp(`\\b${supported}\\b`));
  assert.equal(Object.hasOwn(result, 'selectedContractVersion'), false);
  assert.equal(Object.hasOwn(result, 'contractFixture'), false);
  assert.equal(Object.hasOwn(result, 'goldenFixture'), false);
}

function expectPlanBreak(mutator, expectedPath) {
  const plan = clone(negotiation);
  mutator(plan);
  assert.throws(
    () => validateNegotiationPlan(plan),
    (error) => {
      assert.ok(
        error.message.startsWith(`Contract negotiation simulation break at ${expectedPath}:`),
        `expected failure at ${expectedPath}, received: ${error.message}`,
      );
      return true;
    },
  );
}

test('negotiation fixture is explicitly simulation-only and advertises only released Evidence Contract v1', () => {
  assert.doesNotThrow(() => validateNegotiationPlan(negotiation));
  assert.equal(negotiation.simulationOnly, true);
  assert.equal(negotiation.runtimeNegotiationImplemented, false);
  assert.deepEqual(negotiation.supportedContractVersions, [1]);
  assert.deepEqual(negotiation.knownButUnsupportedSimulations, [2]);
  assert.equal(negotiation.currentRuntimeContractVersion, 1);
  assert.equal(v2Simulation.simulatedContractVersion, 2);
  assert.equal(v2Simulation.runtimeSupported, false);
});

test('exact v1 request selects only the v1 contract and retained golden corpus', () => {
  const result = negotiateContract(negotiation, 1);
  assert.deepEqual(result, {
    ok: true,
    requestedVersion: 1,
    selectedContractVersion: 1,
    contractFixture: 'v1.json',
    goldenFixture: 'golden-exchange-v1.json',
  });
  assert.equal(result.selectedContractVersion, v1.contractVersion);
  assert.equal(goldenV1.evidenceContractVersion, result.selectedContractVersion);
});

test('known simulated v2 and unknown future versions are refused without downgrade or fallback', () => {
  for (const requestedVersion of [2, 3, 99]) {
    const result = negotiateContract(negotiation, requestedVersion);
    assertRefusal(result, requestedVersion, [1]);
    assert.notEqual(result.error.requestedVersion, 1);
  }
});

test('presence of a v2 simulation fixture never implies runtime negotiation support', () => {
  assert.equal(v2Simulation.simulationOnly, true);
  assert.equal(v2Simulation.runtimeSupported, false);
  assert.equal(negotiation.knownButUnsupportedSimulations.includes(v2Simulation.simulatedContractVersion), true);
  assert.equal(negotiation.supportedContractVersions.includes(v2Simulation.simulatedContractVersion), false);

  const result = negotiateContract(negotiation, v2Simulation.simulatedContractVersion);
  assertRefusal(result, 2, [1]);
});

test('invalid version values fail separately from unsupported positive versions', () => {
  for (const requestedVersion of [0, -1, 1.5, '1', null]) {
    const result = negotiateContract(negotiation, requestedVersion);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'CMI_EVIDENCE_CONTRACT_INVALID_VERSION');
    assert.deepEqual(result.error.supportedVersions, [1]);
    assert.equal(Object.hasOwn(result, 'selectedContractVersion'), false);
  }

  const unsupported = negotiateContract(negotiation, 2);
  assert.equal(unsupported.error.code, 'CMI_EVIDENCE_CONTRACT_UNSUPPORTED');
});

test('negotiation policy cannot be weakened into downgrade, upgrade, normalization, or fallback behavior', () => {
  expectPlanBreak((plan) => { plan.policy.silentDowngrade = true; }, 'policy.silentDowngrade');
  expectPlanBreak((plan) => { plan.policy.silentUpgrade = true; }, 'policy.silentUpgrade');
  expectPlanBreak((plan) => { plan.policy.semanticNormalizationAcrossVersions = true; }, 'policy.semanticNormalizationAcrossVersions');
  expectPlanBreak((plan) => { plan.policy.fallbackToCurrentOnUnsupported = true; }, 'policy.fallbackToCurrentOnUnsupported');
  expectPlanBreak((plan) => { plan.policy.selection = 'nearest-supported'; }, 'policy.selection');
  expectPlanBreak((plan) => { plan.policy.unsupported = 'fallback'; }, 'policy.unsupported');
});

test('a future simulated runtime may add v2 only by exact mapping while retaining v1 and still refusing v3', () => {
  const future = clone(negotiation);
  future.currentRuntimeContractVersion = 2;
  future.supportedContractVersions = [1, 2];
  future.knownButUnsupportedSimulations = [];
  future.contractArtifacts['2'] = {
    contractFixture: 'v2-simulation.json',
    goldenFixture: null,
  };

  assert.doesNotThrow(() => validateNegotiationPlan(future));
  assert.deepEqual(negotiateContract(future, 1), {
    ok: true,
    requestedVersion: 1,
    selectedContractVersion: 1,
    contractFixture: 'v1.json',
    goldenFixture: 'golden-exchange-v1.json',
  });
  assert.deepEqual(negotiateContract(future, 2), {
    ok: true,
    requestedVersion: 2,
    selectedContractVersion: 2,
    contractFixture: 'v2-simulation.json',
    goldenFixture: null,
  });
  assertRefusal(negotiateContract(future, 3), 3, [1, 2]);
});

test('a supported version cannot be mapped to another version artifact or overlap unsupported versions', () => {
  expectPlanBreak((plan) => {
    plan.contractArtifacts['1'].contractFixture = '';
  }, 'contractArtifacts.1.contractFixture');

  expectPlanBreak((plan) => {
    plan.knownButUnsupportedSimulations = [1, 2];
  }, 'knownButUnsupportedSimulations');

  const masquerading = clone(negotiation);
  masquerading.currentRuntimeContractVersion = 2;
  masquerading.supportedContractVersions = [1, 2];
  masquerading.knownButUnsupportedSimulations = [];
  masquerading.contractArtifacts['2'] = {
    contractFixture: 'v1.json',
    goldenFixture: 'golden-exchange-v1.json',
  };
  assert.throws(
    () => validateNegotiationPlan(masquerading),
    /Contract negotiation simulation break at contractArtifacts\.2\.contractFixture:/,
  );
});
