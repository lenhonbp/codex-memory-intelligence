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

function clone(value) {
  return structuredClone(value);
}

function fail(pathName, detail) {
  throw new Error(`Contract compatibility break at ${pathName}: ${detail}`);
}

function compareExact(actual, expected, pathName) {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) fail(pathName, `expected array, received ${typeof actual}`);
    if (actual.length !== expected.length) fail(pathName, `expected length ${expected.length}, received ${actual.length}`);
    for (let index = 0; index < expected.length; index += 1) {
      compareExact(actual[index], expected[index], `${pathName}[${index}]`);
    }
    return;
  }

  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object' || Array.isArray(actual)) {
      fail(pathName, `expected object, received ${Array.isArray(actual) ? 'array' : typeof actual}`);
    }
    for (const key of Object.keys(expected)) {
      if (!Object.hasOwn(actual, key)) fail(`${pathName}.${key}`, 'required value is missing');
      compareExact(actual[key], expected[key], `${pathName}.${key}`);
    }
    return;
  }

  if (!Object.is(actual, expected)) {
    fail(pathName, `expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

function projectProtected(value, fields, pathName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(pathName, 'expected protected object');
  const projected = {};
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) fail(`${pathName}.${field}`, 'protected field is missing');
    projected[field] = value[field];
  }
  return projected;
}

function assertV1ExchangeCompatible(actual, expected, archetype) {
  compareExact(actual.handoffHumanEvidenceBlock, expected.handoffHumanEvidenceBlock, `${archetype}.handoffHumanEvidenceBlock`);
  compareExact(actual.closingHumanAlertBlock, expected.closingHumanAlertBlock, `${archetype}.closingHumanAlertBlock`);
  compareExact(
    projectProtected(actual.finding, v1.finding.requiredFields, `${archetype}.finding`),
    expected.finding,
    `${archetype}.finding`,
  );
  compareExact(
    projectProtected(actual.recommendation, v1.recommendation.requiredFields, `${archetype}.recommendation`),
    expected.recommendation,
    `${archetype}.recommendation`,
  );
  compareExact(
    projectProtected(actual.closingAlert, v1.closingAlert.requiredFields, `${archetype}.closingAlert`),
    expected.closingAlert,
    `${archetype}.closingAlert`,
  );
}

function v2RequiredFields(section) {
  return [...v1[section].requiredFields, v2Simulation.additiveProbe.field];
}

function getPath(value, pathName) {
  return pathName.split('.').reduce((current, segment) => current?.[segment], value);
}

function setPath(value, pathName, replacement) {
  const segments = pathName.split('.');
  let current = value;
  for (const segment of segments.slice(0, -1)) current = current[segment];
  current[segments.at(-1)] = replacement;
}

function buildSimulatedV2Exchange(archetype, { includeBreakingChange = false } = {}) {
  const exchange = clone(goldenV1.exchanges[archetype]);
  const { field, values } = v2Simulation.additiveProbe;
  exchange.finding[field] = values.finding;
  exchange.recommendation[field] = values.recommendation;
  exchange.closingAlert[field] = values.closingAlert;

  if (includeBreakingChange) {
    const change = v2Simulation.breakingChange;
    assert.equal(archetype, change.archetype, 'breaking simulation is intentionally bounded to one archetype');
    setPath(exchange, change.path, change.to);
  }

  return exchange;
}

function assertV2ExchangeCompatible(actual, archetype, { includeBreakingChange = false } = {}) {
  const expected = buildSimulatedV2Exchange(archetype, { includeBreakingChange });
  compareExact(actual.handoffHumanEvidenceBlock, expected.handoffHumanEvidenceBlock, `${archetype}.handoffHumanEvidenceBlock`);
  compareExact(actual.closingHumanAlertBlock, expected.closingHumanAlertBlock, `${archetype}.closingHumanAlertBlock`);
  compareExact(
    projectProtected(actual.finding, v2RequiredFields('finding'), `${archetype}.finding`),
    projectProtected(expected.finding, v2RequiredFields('finding'), `${archetype}.finding`),
    `${archetype}.finding`,
  );
  compareExact(
    projectProtected(actual.recommendation, v2RequiredFields('recommendation'), `${archetype}.recommendation`),
    projectProtected(expected.recommendation, v2RequiredFields('recommendation'), `${archetype}.recommendation`),
    `${archetype}.recommendation`,
  );
  compareExact(
    projectProtected(actual.closingAlert, v2RequiredFields('closingAlert'), `${archetype}.closingAlert`),
    projectProtected(expected.closingAlert, v2RequiredFields('closingAlert'), `${archetype}.closingAlert`),
    `${archetype}.closingAlert`,
  );
}

function validateUpgradeSimulation(plan) {
  if (plan.simulationOnly !== true) fail('simulationOnly', 'v2 fixture must remain explicitly simulation-only');
  if (plan.runtimeSupported !== false) fail('runtimeSupported', 'simulation must not claim runtime v2 support');
  if (plan.baseContractVersion !== v1.contractVersion) {
    fail('baseContractVersion', `expected ${v1.contractVersion}, received ${plan.baseContractVersion}`);
  }
  if (plan.simulatedContractVersion !== v1.contractVersion + 1) {
    fail('simulatedContractVersion', `expected ${v1.contractVersion + 1}, received ${plan.simulatedContractVersion}`);
  }
  if (plan.legacyReplay?.required !== true) fail('legacyReplay.required', 'prior-version replay must remain mandatory');
  if (plan.legacyReplay?.contractFixture !== 'v1.json') {
    fail('legacyReplay.contractFixture', 'v1 contract fixture must remain retained');
  }
  if (plan.legacyReplay?.goldenFixture !== 'golden-exchange-v1.json') {
    fail('legacyReplay.goldenFixture', 'v1 golden exchange corpus must remain retained');
  }

  const probe = plan.additiveProbe;
  if (!probe || typeof probe.field !== 'string' || probe.field.length === 0) {
    fail('additiveProbe.field', 'synthetic v2 probe field is required');
  }
  for (const section of ['finding', 'recommendation', 'closingAlert']) {
    if (v1[section].requiredFields.includes(probe.field)) {
      fail('additiveProbe.field', `${probe.field} must remain absent from v1 protected fields`);
    }
    if (!Object.hasOwn(probe.values || {}, section)) {
      fail(`additiveProbe.values.${section}`, 'synthetic v2 probe value is required');
    }
  }

  const breaking = plan.breakingChange;
  if (!breaking || breaking.requiresVersionBump !== true) {
    fail('breakingChange.requiresVersionBump', 'breaking semantic simulation must require a version bump');
  }
  if (breaking.fromContractVersion !== v1.contractVersion) {
    fail('breakingChange.fromContractVersion', 'breaking simulation must originate from v1');
  }
  if (breaking.toContractVersion !== plan.simulatedContractVersion) {
    fail('breakingChange.toContractVersion', 'breaking simulation must target the simulated next version');
  }
  if (!goldenV1.archetypes.includes(breaking.archetype)) {
    fail('breakingChange.archetype', 'breaking simulation must use a retained golden archetype');
  }
  if (getPath(goldenV1.exchanges[breaking.archetype], breaking.path) !== breaking.from) {
    fail('breakingChange.from', 'declared source meaning must match retained v1 golden evidence');
  }
  if (Object.is(breaking.from, breaking.to)) {
    fail('breakingChange.to', 'breaking simulation must actually change the protected meaning');
  }
}

function expectPathBreak(fn, expectedPath) {
  assert.throws(fn, (error) => {
    assert.ok(
      error.message.startsWith(`Contract compatibility break at ${expectedPath}:`),
      `expected failure at ${expectedPath}, received: ${error.message}`,
    );
    return true;
  });
}

test('dual-version upgrade simulation fixture is explicitly test-only and retains v1 replay coverage', () => {
  assert.doesNotThrow(() => validateUpgradeSimulation(v2Simulation));
  assert.equal(v2Simulation.simulationOnly, true);
  assert.equal(v2Simulation.runtimeSupported, false);
  assert.equal(v2Simulation.baseContractVersion, 1);
  assert.equal(v2Simulation.simulatedContractVersion, 2);
  assert.equal(v2Simulation.legacyReplay.contractFixture, 'v1.json');
  assert.equal(v2Simulation.legacyReplay.goldenFixture, 'golden-exchange-v1.json');
});

test('simulated additive v2 exchange remains replayable by v1 consumers and strict for v2 consumers', () => {
  for (const archetype of goldenV1.archetypes) {
    const expectedV1 = goldenV1.exchanges[archetype];
    const simulatedV2 = buildSimulatedV2Exchange(archetype);

    assert.doesNotThrow(() => assertV1ExchangeCompatible(simulatedV2, expectedV1, archetype), `v1 replay: ${archetype}`);
    assert.doesNotThrow(() => assertV2ExchangeCompatible(simulatedV2, archetype), `v2 replay: ${archetype}`);
  }
});

test('simulated v2-only required field does not become a v1 requirement', () => {
  const archetype = 'graph-drift';
  const expectedV1 = goldenV1.exchanges[archetype];
  const simulatedV2 = buildSimulatedV2Exchange(archetype);
  delete simulatedV2.closingAlert[v2Simulation.additiveProbe.field];

  assert.doesNotThrow(() => assertV1ExchangeCompatible(simulatedV2, expectedV1, archetype));
  expectPathBreak(
    () => assertV2ExchangeCompatible(simulatedV2, archetype),
    `graph-drift.closingAlert.${v2Simulation.additiveProbe.field}`,
  );
});

test('breaking semantic change cannot masquerade as Evidence Contract v1', () => {
  const change = v2Simulation.breakingChange;
  const archetype = change.archetype;
  const expectedV1 = goldenV1.exchanges[archetype];
  const simulatedBreakingV2 = buildSimulatedV2Exchange(archetype, { includeBreakingChange: true });

  expectPathBreak(
    () => assertV1ExchangeCompatible(simulatedBreakingV2, expectedV1, archetype),
    `${archetype}.${change.path}`,
  );
  assert.doesNotThrow(() => assertV2ExchangeCompatible(simulatedBreakingV2, archetype, { includeBreakingChange: true }));

  const masqueradingPlan = clone(v2Simulation);
  masqueradingPlan.simulatedContractVersion = v1.contractVersion;
  masqueradingPlan.breakingChange.toContractVersion = v1.contractVersion;
  expectPathBreak(() => validateUpgradeSimulation(masqueradingPlan), 'simulatedContractVersion');
});

test('simulated contract upgrade cannot drop retained v1 regression coverage', () => {
  const missingContract = clone(v2Simulation);
  missingContract.legacyReplay.contractFixture = 'v2-simulation.json';
  expectPathBreak(() => validateUpgradeSimulation(missingContract), 'legacyReplay.contractFixture');

  const missingGolden = clone(v2Simulation);
  missingGolden.legacyReplay.goldenFixture = 'golden-exchange-v2.json';
  expectPathBreak(() => validateUpgradeSimulation(missingGolden), 'legacyReplay.goldenFixture');

  const optionalReplay = clone(v2Simulation);
  optionalReplay.legacyReplay.required = false;
  expectPathBreak(() => validateUpgradeSimulation(optionalReplay), 'legacyReplay.required');
});

test('released v1 artifacts remain the compatibility reference after v2 simulation is introduced', () => {
  assert.equal(v1.contractVersion, 1);
  assert.equal(goldenV1.evidenceContractVersion, 1);
  assert.equal(v1.name, 'cmi-evidence-surface');
  assert.equal(goldenV1.name, 'cmi-golden-exchange');
  assert.match(v1.compatibilityPolicy.withinVersion, /additive-only/i);

  const probeField = v2Simulation.additiveProbe.field;
  assert.equal(v1.finding.requiredFields.includes(probeField), false);
  assert.equal(v1.recommendation.requiredFields.includes(probeField), false);
  assert.equal(v1.closingAlert.requiredFields.includes(probeField), false);
  assert.notEqual(v2Simulation.name, v1.name);
});
