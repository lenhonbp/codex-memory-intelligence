import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const fixtureDir = path.join(here, 'fixtures', 'evidence-contract');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readRepo(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

const decision = readJson(path.join(fixtureDir, 'production-surface-go-no-go.json'));
const negotiation = readJson(path.join(fixtureDir, 'negotiation-simulation.json'));
const capability = readJson(path.join(fixtureDir, 'capability-advertisement-simulation.json'));
const handshake = readJson(path.join(fixtureDir, 'handshake-toctou-simulation.json'));

const packageJson = JSON.parse(readRepo('package.json'));
const cliEntry = readRepo('src/cli-entry.js');
const mcpEntry = readRepo('src/mcp-entry.js');
const readme = readRepo('README.md');

test('production contract surface decision is evidence-bound and currently NO-GO', () => {
  assert.equal(decision.schemaVersion, 1);
  assert.equal(decision.decisionType, 'production-contract-surface-go-no-go');
  assert.match(decision.baselineCommit, /^[0-9a-f]{40}$/);
  assert.equal(decision.verdict, 'PRODUCTION_CONTRACT_SURFACE_NO_GO');

  assert.deepEqual(decision.currentState.runtimeSupportedContractVersions, [1]);
  assert.deepEqual(decision.currentState.namedProductionConsumersRequiringNegotiation, []);
  assert.equal(decision.currentState.productionCapabilityAdvertisementImplemented, false);
  assert.equal(decision.currentState.productionNegotiationImplemented, false);
  assert.equal(decision.currentState.productionHandshakeImplemented, false);
  assert.equal(decision.currentState.simulationSpecificationAvailable, true);
});

test('NO-GO agrees with the retained simulation authority instead of treating v2 as runtime support', () => {
  assert.equal(negotiation.simulationOnly, true);
  assert.equal(negotiation.runtimeNegotiationImplemented, false);
  assert.deepEqual(negotiation.supportedContractVersions, [1]);
  assert.deepEqual(negotiation.knownButUnsupportedSimulations, [2]);

  assert.equal(capability.simulationOnly, true);
  assert.equal(capability.runtimeCapabilityAdvertisementImplemented, false);
  assert.equal(capability.runtimeNegotiationImplemented, false);
  assert.deepEqual(capability.advertisement.supportedContractVersions, [1]);

  assert.equal(handshake.simulationOnly, true);
  assert.equal(handshake.runtimeHandshakeImplemented, false);
  assert.equal(handshake.runtimeCapabilityAdvertisementImplemented, false);
  assert.equal(handshake.runtimeNegotiationImplemented, false);
});

test('current public package, CLI, and MCP inventory has no production contract negotiation surface', () => {
  assert.deepEqual(packageJson.bin, {
    cmi: 'src/cli-entry.js',
    'cmi-mcp': 'src/mcp-entry.js',
  });

  for (const token of ['--evidence-contract-version', '--contract-version', 'contract discover', 'contract negotiate']) {
    assert.equal(cliEntry.includes(token), false, `unexpected CLI production contract surface token: ${token}`);
  }

  for (const token of [
    "name: 'get_evidence_contract_capabilities'",
    "name: 'negotiate_evidence_contract'",
    "name: 'get_evidence_contract_handshake'",
  ]) {
    assert.equal(mcpEntry.includes(token), false, `unexpected MCP production contract surface token: ${token}`);
  }

  assert.equal(readme.includes('Evidence Contract negotiation'), false);
  assert.equal(readme.includes('Evidence Contract discovery'), false);
});

test('repository evidence addresses remain concrete and cover each production-surface boundary', () => {
  const paths = decision.repositoryEvidence.map((entry) => entry.path);
  assert.deepEqual(paths, [
    'package.json',
    'src/cli-entry.js',
    'src/mcp-entry.js',
    'README.md',
    'tests/fixtures/evidence-contract/negotiation-simulation.json',
    'tests/fixtures/evidence-contract/capability-advertisement-simulation.json',
    'tests/fixtures/evidence-contract/handshake-toctou-simulation.json',
  ]);

  for (const entry of decision.repositoryEvidence) {
    assert.equal(typeof entry.kind, 'string');
    assert.ok(entry.kind.length > 0);
    assert.equal(typeof entry.observation, 'string');
    assert.ok(entry.observation.length > 0);
    assert.equal(path.isAbsolute(entry.path), false);
    assert.equal(entry.path.includes('..'), false);
    assert.ok(fs.existsSync(path.join(root, entry.path)), `missing decision evidence path: ${entry.path}`);
  }
});

test('GO cannot be declared without a named consumer, an operational interop need, and a bounded read-only design', () => {
  assert.equal(decision.goCriteria.requiresNamedProductionConsumer, true);
  assert.equal(decision.goCriteria.requiresOperationalInteropNeed, true);
  assert.equal(decision.goCriteria.requiresMinimalReadOnlySurfaceDesign, true);
  assert.equal(decision.goCriteria.requiresRetainedV1Compatibility, true);
  assert.equal(decision.goCriteria.requiresFailClosedUnsupportedVersionHandling, true);
  assert.equal(decision.goCriteria.requiresNoSilentDowngrade, true);

  const hypotheticalGo = {
    namedProductionConsumers: decision.currentState.namedProductionConsumersRequiringNegotiation,
    operationalInteropNeed: false,
    minimalReadOnlySurfaceDesigned: false,
  };
  assert.equal(
    hypotheticalGo.namedProductionConsumers.length > 0
      && hypotheticalGo.operationalInteropNeed
      && hypotheticalGo.minimalReadOnlySurfaceDesigned,
    false,
  );
});

test('NO-GO preserves the specification corpus and requires re-evaluation when real demand appears', () => {
  assert.equal(decision.noGoRequirements.doNotAddProductionNegotiationSurface, true);
  assert.equal(decision.noGoRequirements.doNotAdvertiseV2SimulationAsRuntimeSupport, true);
  assert.equal(decision.noGoRequirements.retainSimulationAndGoldenRegressionCorpus, true);
  assert.equal(decision.noGoRequirements.retainEvidenceContractV1Compatibility, true);
  assert.equal(decision.noGoRequirements.reEvaluateOnTriggerEvidence, true);

  assert.equal(decision.reEvaluationTriggers.length, 4);
  assert.ok(decision.reEvaluationTriggers.some((item) => item.includes('named production consumer')));
  assert.ok(decision.reEvaluationTriggers.some((item) => item.includes('second Evidence Contract version')));
  assert.ok(decision.reEvaluationTriggers.some((item) => item.includes('interoperability failure')));
  assert.ok(decision.reEvaluationTriggers.some((item) => item.includes('external integration')));
});

test('external demand observation is advisory evidence, not a permanent runtime invariant', () => {
  assert.equal(decision.externalObservation.kind, 'maintainer-recon');
  assert.equal(decision.externalObservation.githubIssueSearch, 'Evidence Contract negotiation discovery');
  assert.equal(decision.externalObservation.matchingIssuesAtDecisionTime, 0);
  assert.match(decision.externalObservation.note, /not treated as a durable runtime invariant/i);
  assert.match(decision.externalObservation.note, /future demand must trigger re-evaluation/i);
});
