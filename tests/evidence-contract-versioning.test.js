import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanProject } from '../src/core.js';
import { startSession, closeSession } from '../src/session-intelligence.js';
import { buildClosingIntelligence } from '../src/closing-intelligence.js';
import { formatEvidenceAddresses } from '../src/session-evidence-view.js';
import {
  validateFindingContract,
  validateRecommendationContract,
  validateHandoffContract,
  validateSessionRecordContract,
} from '../src/durable-contracts.js';
import { VERSION } from '../src/version.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const contractPath = path.join(here, 'fixtures', 'evidence-contract', 'v1.json');
const compatibilitySessionPath = path.join(here, 'fixtures', 'compatibility', 'v0.8.0', 'sessions', '33333333-3333-4333-8333-333333333333.json');
const corpusTestPath = path.join(here, 'cross-surface-evidence-consistency.test.js');
const contract = JSON.parse(await fs.readFile(contractPath, 'utf8'));

function assertFields(value, fields, label) {
  for (const field of fields) assert.ok(Object.hasOwn(value, field), `${label} must preserve v${contract.contractVersion} field ${field}`);
}

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-evidence-contract-versioning-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'evidence-contract-versioning', type: 'module' }));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'service.js'), 'export function service() { return true; }\n');
  await scanProject(root);
  return root;
}

function exampleFinding() {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    key: 'prediction-gap:22222222-2222-4222-8222-222222222222',
    state: 'open',
    category: 'prediction-gap',
    severity: 'medium',
    title: 'Observed related work escaped predicted scope',
    detail: 'One changed path was outside predicted scope.',
    confidence: 'high',
    evidenceType: 'observed',
    sessionRelevance: 'related',
    evidence: [
      'change:22222222-2222-4222-8222-222222222222',
      'expected-vs-actual',
      'source:src/api/checkout.js:12-18',
    ],
    relatedFiles: ['src/api/checkout.js'],
    occurrences: 1,
  };
}

function exampleRecommendation(findingId) {
  return {
    id: 'finding-action:prediction-gap',
    priority: 'P2',
    action: 'Review the escaped predicted scope before relying on the same prediction boundary again.',
    reason: 'Observed path evidence escaped the predicted scope.',
    evidenceType: 'observed',
    evidence: ['expected-vs-actual'],
    confidence: 'high',
    relatedFindingIds: [findingId],
  };
}

test('evidence contract v1 is explicit, bounded, and independent from the runtime release number', async () => {
  assert.equal(contract.schemaVersion, 1);
  assert.equal(contract.contractVersion, 1);
  assert.equal(contract.name, 'cmi-evidence-surface');
  assert.match(contract.introducedRuntimeVersion, /^\d+\.\d+\.\d+$/);
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
  assert.notEqual(String(contract.contractVersion), VERSION);
  assert.equal(contract.compatibilityPolicy.withinVersion, 'additive-only');
  assert.match(contract.compatibilityPolicy.breakingChanges, /new contract version/i);
  assert.match(contract.compatibilityPolicy.runtimeVersionIndependence, /independent/i);
  assert.deepEqual(contract.coveredFindingArchetypes, [
    'prediction-gap',
    'verification-failed',
    'graph-drift',
    'uncaptured-session-change',
    'active-change',
    'session-blocker',
  ]);
});

test('new Session, Handoff, and Closing read models satisfy the v1 required evidence fields', async (t) => {
  const root = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const session = await startSession(root, 'verify the evidence compatibility contract');
  const closed = await closeSession(root, session.id, { blockers: ['Compatibility blocker remains unresolved.'] });
  assert.equal(validateSessionRecordContract(closed).valid, true);
  assert.equal(validateHandoffContract(closed.close.handoff).valid, true);

  const finding = closed.close.handoff.openFindings.find((item) => item.category === 'session-blocker');
  assert.ok(finding, JSON.stringify(closed.close.handoff.openFindings, null, 2));
  assertFields(finding, contract.finding.requiredFields, 'Handoff Finding');
  assert.equal(validateFindingContract(finding).valid, true);

  const recommendation = closed.close.handoff.nextActions.find((item) => (item.relatedFindingIds || []).includes(finding.id));
  assert.ok(recommendation, JSON.stringify(closed.close.handoff.nextActions, null, 2));
  assertFields(recommendation, contract.recommendation.requiredFields, 'Handoff Recommendation');
  assert.equal(validateRecommendationContract(recommendation).valid, true);

  const closing = await buildClosingIntelligence(root, closed.id);
  const alert = closing.alerts.find((item) => item.findingId === finding.id);
  assert.ok(alert, JSON.stringify(closing.alerts, null, 2));
  assertFields(alert, contract.closingAlert.requiredFields, 'Closing alert');
  assert.equal(alert.evidenceType, finding.evidenceType);
  assert.equal(alert.confidence, finding.confidence);
  assert.equal(alert.findingState, finding.state);
  assert.equal(alert.verificationState, 'established');
  assert.equal(alert.violationEstablished, true);
  assert.deepEqual(alert.relatedFindingIds, [finding.id]);
  assert.equal(alert.recommendedAction, recommendation.action);
});

test('v1 human evidence-address labels remain stable and absent evidence is not synthesized', () => {
  const finding = exampleFinding();
  const recommendation = exampleRecommendation(finding.id);
  const rendered = formatEvidenceAddresses([finding], [recommendation]);
  for (const label of contract.humanEvidenceAddress.stableLabels) assert.ok(rendered.includes(label), `Expected stable human label ${label}\n${rendered}`);
  assert.ok(rendered.includes(`finding ${finding.id}`));
  assert.ok(rendered.includes('change 22222222-2222-4222-8222-222222222222'));
  assert.ok(rendered.includes('src/api/checkout.js'));

  const minimal = {
    ...finding,
    id: '33333333-3333-4333-8333-333333333333',
    key: 'session-blocker:minimal',
    category: 'session-blocker',
    evidence: ['session-observation'],
    relatedFiles: [],
  };
  const minimalAction = exampleRecommendation(minimal.id);
  const minimalRendered = formatEvidenceAddresses([minimal], [minimalAction]);
  assert.doesNotMatch(minimalRendered, /^\s*Files:/m);
  assert.doesNotMatch(minimalRendered, /^\s*Source:/m);
  assert.doesNotMatch(minimalRendered, /\bchange [0-9a-f-]{8,}\b/i);
});

test('v1 public shape is stricter than generic durable recommendation validation while permitting additive fields', () => {
  const finding = exampleFinding();
  assert.equal(validateFindingContract(finding).valid, true);
  assert.equal(validateFindingContract({ ...finding, additiveFutureField: { safe: true } }).valid, true);
  for (const field of ['id', 'key', 'state', 'category', 'severity', 'title', 'detail', 'confidence', 'evidenceType', 'occurrences']) {
    const altered = structuredClone(finding);
    delete altered[field];
    assert.equal(validateFindingContract(altered).valid, false, `Removing ${field} must be rejected`);
  }

  const recommendation = exampleRecommendation(finding.id);
  assert.equal(validateRecommendationContract(recommendation).valid, true);
  assert.equal(validateRecommendationContract({ ...recommendation, additiveFutureField: true }).valid, true);
  for (const field of contract.recommendation.requiredFields.filter((item) => item !== 'relatedFindingIds')) {
    const altered = structuredClone(recommendation);
    delete altered[field];
    assert.equal(validateRecommendationContract(altered).valid, false, `Removing recommendation.${field} must be rejected`);
  }

  const unlinked = structuredClone(recommendation);
  delete unlinked.relatedFindingIds;
  assert.equal(validateRecommendationContract(unlinked).valid, true);
  assert.throws(
    () => assertFields(unlinked, contract.recommendation.requiredFields, 'Versioned public Recommendation'),
    /relatedFindingIds/,
  );
});

test('released pre-v1 durable handoff remains readable without rewrite while unsupported durable schema still fails closed', async () => {
  const bytes = await fs.readFile(compatibilitySessionPath);
  const legacy = JSON.parse(bytes.toString('utf8'));
  assert.equal(validateSessionRecordContract(legacy).valid, true);
  assert.equal(legacy.close.handoff.nextAction.id, undefined);

  const additive = structuredClone(legacy);
  additive.close.handoff.evidenceContractVersion = contract.contractVersion;
  assert.equal(validateSessionRecordContract(additive).valid, true);

  const future = structuredClone(legacy);
  future.schemaVersion = 999;
  assert.equal(validateSessionRecordContract(future).valid, false);
  assert.deepEqual(await fs.readFile(compatibilitySessionPath), bytes);
});

test('the v1 contract stays coupled to the six-archetype cross-surface regression corpus', async () => {
  const source = await fs.readFile(corpusTestPath, 'utf8');
  for (const archetype of contract.coveredFindingArchetypes) assert.ok(source.includes(`'${archetype}'`), `Cross-surface corpus lost ${archetype}`);
  assert.match(source, /assertFindingIdentity/);
  assert.match(source, /assertTextContract/);
  assert.match(source, /evidenceAnchors/);
  assert.match(source, /verificationState/);
  assert.match(source, /recommendedAction/);
});
