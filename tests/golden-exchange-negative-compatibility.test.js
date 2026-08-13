import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const contract = JSON.parse(await fs.readFile(path.join(here, 'fixtures', 'evidence-contract', 'v1.json'), 'utf8'));
const golden = JSON.parse(await fs.readFile(path.join(here, 'fixtures', 'evidence-contract', 'golden-exchange-v1.json'), 'utf8'));

function clone(value) {
  return structuredClone(value);
}

function fail(pathName, detail) {
  throw new Error(`Golden compatibility break at ${pathName}: ${detail}`);
}

function compareExact(actual, expected, pathName) {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) fail(pathName, `expected array, received ${typeof actual}`);
    if (actual.length !== expected.length) fail(pathName, `expected length ${expected.length}, received ${actual.length}`);
    for (let index = 0; index < expected.length; index += 1) compareExact(actual[index], expected[index], `${pathName}[${index}]`);
    return;
  }

  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object' || Array.isArray(actual)) fail(pathName, `expected object, received ${Array.isArray(actual) ? 'array' : typeof actual}`);
    for (const key of Object.keys(expected)) {
      if (!Object.hasOwn(actual, key)) fail(`${pathName}.${key}`, 'required golden value is missing');
      compareExact(actual[key], expected[key], `${pathName}.${key}`);
    }
    return;
  }

  if (!Object.is(actual, expected)) fail(pathName, `expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
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

function assertExchangeCompatible(actual, expected, archetype) {
  compareExact(actual.handoffHumanEvidenceBlock, expected.handoffHumanEvidenceBlock, `${archetype}.handoffHumanEvidenceBlock`);
  compareExact(actual.closingHumanAlertBlock, expected.closingHumanAlertBlock, `${archetype}.closingHumanAlertBlock`);
  compareExact(
    projectProtected(actual.finding, contract.finding.requiredFields, `${archetype}.finding`),
    expected.finding,
    `${archetype}.finding`,
  );
  compareExact(
    projectProtected(actual.recommendation, contract.recommendation.requiredFields, `${archetype}.recommendation`),
    expected.recommendation,
    `${archetype}.recommendation`,
  );
  compareExact(
    projectProtected(actual.closingAlert, contract.closingAlert.requiredFields, `${archetype}.closingAlert`),
    expected.closingAlert,
    `${archetype}.closingAlert`,
  );
}

function expectBreak(archetype, mutationName, mutate, expectedPath) {
  const expected = golden.exchanges[archetype];
  const actual = clone(expected);
  mutate(actual);
  assert.throws(
    () => assertExchangeCompatible(actual, expected, archetype),
    (error) => {
      assert.match(error.message, new RegExp(`^Golden compatibility break at ${expectedPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`), mutationName);
      return true;
    },
    mutationName,
  );
}

test('negative compatibility mutation gate rejects protected consumer breaks at their evidence address', async (t) => {
  const cases = [
    {
      name: 'verification truth cannot regress from established to observed',
      archetype: 'verification-failed',
      path: 'verification-failed.closingAlert.verificationState',
      mutate: (exchange) => { exchange.closingAlert.verificationState = 'observed'; },
    },
    {
      name: 'established failed verification cannot lose violation establishment',
      archetype: 'verification-failed',
      path: 'verification-failed.closingAlert.violationEstablished',
      mutate: (exchange) => { exchange.closingAlert.violationEstablished = false; },
    },
    {
      name: 'verification finding cannot lose its related Change provenance',
      archetype: 'verification-failed',
      path: 'verification-failed.finding.evidence[0]',
      mutate: (exchange) => { exchange.finding.evidence[0] = 'verification:npm test'; },
    },
    {
      name: 'closing alert cannot lose the related Change identity',
      archetype: 'verification-failed',
      path: 'verification-failed.closingAlert.relatedChangeIds',
      mutate: (exchange) => { exchange.closingAlert.relatedChangeIds = []; },
    },
    {
      name: 'graph drift cannot lose its concrete affected source file',
      archetype: 'graph-drift',
      path: 'graph-drift.closingAlert.relatedFiles',
      mutate: (exchange) => { exchange.closingAlert.relatedFiles = []; },
    },
    {
      name: 'graph drift source anchor cannot silently move to another file',
      archetype: 'graph-drift',
      path: 'graph-drift.closingAlert.evidenceAnchors[0].path',
      mutate: (exchange) => { exchange.closingAlert.evidenceAnchors[0].path = 'src/other.js'; },
    },
    {
      name: 'graph drift remediation text is a protected consumer action',
      archetype: 'graph-drift',
      path: 'graph-drift.recommendation.action',
      mutate: (exchange) => { exchange.recommendation.action = 'Refresh later.'; },
    },
    {
      name: 'prediction gap confidence cannot be silently downgraded',
      archetype: 'prediction-gap',
      path: 'prediction-gap.finding.confidence',
      mutate: (exchange) => { exchange.finding.confidence = 'low'; },
    },
    {
      name: 'human Handoff Record label is part of the v1 consumer surface',
      archetype: 'prediction-gap',
      path: 'prediction-gap.handoffHumanEvidenceBlock',
      mutate: (exchange) => { exchange.handoffHumanEvidenceBlock = exchange.handoffHumanEvidenceBlock.replace('Record:', 'Context:'); },
    },
    {
      name: 'human Closing Source address cannot disappear',
      archetype: 'graph-drift',
      path: 'graph-drift.closingHumanAlertBlock',
      mutate: (exchange) => { exchange.closingHumanAlertBlock = exchange.closingHumanAlertBlock.replace('\nSource: src/service.js', ''); },
    },
    {
      name: 'scope relation cannot collapse current-session evidence into historical-project evidence',
      archetype: 'graph-drift',
      path: 'graph-drift.closingAlert.scopeRelation',
      mutate: (exchange) => { exchange.closingAlert.scopeRelation = 'historical-project'; },
    },
    {
      name: 'recommendation cannot lose the Finding it is linked to',
      archetype: 'prediction-gap',
      path: 'prediction-gap.recommendation.relatedFindingIds',
      mutate: (exchange) => { exchange.recommendation.relatedFindingIds = []; },
    },
  ];

  for (const mutation of cases) {
    await t.test(mutation.name, () => {
      expectBreak(mutation.archetype, mutation.name, mutation.mutate, mutation.path);
    });
  }
});

test('negative compatibility gate is not over-strict about additive v1 evolution', () => {
  for (const archetype of golden.archetypes) {
    const expected = golden.exchanges[archetype];
    const actual = clone(expected);
    actual.finding.futureAdditiveField = { consumerMayIgnore: true };
    actual.recommendation.futureAdditiveField = 'additive';
    actual.closingAlert.futureAdditiveField = 1;
    assert.doesNotThrow(() => assertExchangeCompatible(actual, expected, archetype), archetype);
  }
});

test('mutation matrix covers the v1 truth, provenance, actionability, location, scope, and human-label boundaries', () => {
  assert.deepEqual(golden.archetypes, ['prediction-gap', 'verification-failed', 'graph-drift']);
  assert.ok(contract.finding.semanticInvariants.some((item) => /durable identity/i.test(item)));
  assert.ok(contract.recommendation.semanticInvariants.some((item) => /advisory/i.test(item)));
  assert.ok(contract.closingAlert.semanticInvariants.some((item) => /verificationState/i.test(item)));
  assert.ok(contract.closingAlert.semanticInvariants.some((item) => /Evidence anchors explain location/i.test(item)));
  assert.ok(contract.humanEvidenceAddress.stableLabels.includes('Record:'));
  assert.ok(contract.humanEvidenceAddress.stableLabels.includes('Source:'));
  assert.match(contract.compatibilityPolicy.withinVersion, /additive-only/i);
});
