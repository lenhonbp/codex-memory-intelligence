from pathlib import Path
import json


def must_replace(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"anchor not found in {path}: {old[:100]!r}")
    p.write_text(text.replace(old, new, 1))


# Runtime evaluation contract.
p = Path('src/evaluation-contracts.js')
t = p.read_text()
t = t.replace(
    "export const EVALUATION_TASK_KINDS = ['implementation', 'debugging', 'audit', 'review', 'research', 'verification', 'no-code-investigation', 'unknown'];",
    "export const EVALUATION_TASK_KINDS = ['implementation', 'debugging', 'audit', 'review', 'research', 'verification', 'refactor', 'migration', 'architecture-analysis', 'no-code-investigation', 'unknown'];",
)
t = t.replace(
    "export const EVALUATION_UTILITY_RATINGS = ['useful', 'not-useful', 'unknown'];",
    "export const EVALUATION_UTILITY_RATINGS = ['useful', 'not-useful', 'unknown'];\nexport const EVALUATION_STRESS_SCENARIOS = ['rename-after-scan', 'history-rewrite', 'dirty-worktree', 'clock-skew', 'interrupted-session', 'concurrent-sessions', 'large-monorepo', 'corrupt-durable-record', 'stale-graph'];\nexport const EVALUATION_STRESS_OUTCOMES = ['not-applicable', 'pass', 'partial', 'fail'];",
)
t = t.replace(
    "['schemaVersion', 'id', 'recordedAt', 'subject', 'source', 'protocol', 'repository', 'task', 'measurements', 'review', 'policy']",
    "['schemaVersion', 'id', 'recordedAt', 'subject', 'source', 'protocol', 'repository', 'task', 'measurements', 'stress', 'review', 'policy']",
)
anchor = "  const review = record.review;\n"
stress_block = """  const stress = record.stress;
  fail(hasOnlyKeys(stress, new Set(['scenario', 'expectedInvariantCount', 'passedInvariantCount', 'failedInvariantCount', 'outcome'])), 'stress shape is invalid');
  if (isObject(stress)) {
    fail(stress.scenario === null || validEnum(stress.scenario, EVALUATION_STRESS_SCENARIOS), 'stress scenario is invalid');
    for (const key of ['expectedInvariantCount', 'passedInvariantCount', 'failedInvariantCount']) fail(Number.isInteger(stress[key]) && stress[key] >= 0, `stress ${key} must be non-negative integer`);
    fail(validEnum(stress.outcome, EVALUATION_STRESS_OUTCOMES), 'stress outcome is invalid');
    if (Number.isInteger(stress.expectedInvariantCount) && Number.isInteger(stress.passedInvariantCount) && Number.isInteger(stress.failedInvariantCount)) {
      fail(stress.passedInvariantCount + stress.failedInvariantCount === stress.expectedInvariantCount, 'stress invariant counts must sum to expectedInvariantCount');
    }
    if (protocol?.kind === 'observational') {
      fail(stress.scenario === null && stress.expectedInvariantCount === 0 && stress.passedInvariantCount === 0 && stress.failedInvariantCount === 0 && stress.outcome === 'not-applicable', 'observational protocol cannot assert controlled-stress results');
    }
    if (protocol?.kind === 'controlled-stress') {
      fail(validEnum(stress.scenario, EVALUATION_STRESS_SCENARIOS), 'controlled-stress protocol requires an explicit stress scenario');
      fail(stress.expectedInvariantCount > 0, 'controlled-stress protocol requires at least one invariant');
      const expectedOutcome = stress.failedInvariantCount === 0 ? 'pass' : stress.passedInvariantCount === 0 ? 'fail' : 'partial';
      fail(stress.outcome === expectedOutcome, 'stress outcome must be derived from invariant counts');
    }
  }

  const review = record.review;
"""
if anchor not in t:
    raise SystemExit('evaluation-contracts review anchor missing')
t = t.replace(anchor, stress_block, 1)
p.write_text(t)


# Evaluation engine and reporting.
p = Path('src/evaluation.js')
t = p.read_text()
t = t.replace("  EVALUATION_UTILITY_RATINGS,\n", "  EVALUATION_UTILITY_RATINGS,\n  EVALUATION_STRESS_SCENARIOS,\n", 1)
anchor = "function sessionMetrics(session, handoff, openFindingCount) {\n"
helper = """function normalizeStress(options, protocolKind) {
  const supplied = [options.stressScenario, options.stressExpected, options.stressPassed, options.stressFailed].some((value) => value !== undefined && value !== null && value !== '');
  if (protocolKind === 'observational') {
    if (supplied) throw new Error('Observational evaluation cannot assert controlled-stress scenario or invariant results.');
    return { scenario: null, expectedInvariantCount: 0, passedInvariantCount: 0, failedInvariantCount: 0, outcome: 'not-applicable' };
  }
  const scenario = normalizeEnum(options.stressScenario, EVALUATION_STRESS_SCENARIOS, 'Stress scenario');
  const expectedInvariantCount = normalizeOptionalCount(options.stressExpected, 'Stress expected invariant count');
  const passedInvariantCount = normalizeOptionalCount(options.stressPassed, 'Stress passed invariant count');
  const failedInvariantCount = normalizeOptionalCount(options.stressFailed, 'Stress failed invariant count');
  if (!Number.isInteger(expectedInvariantCount) || expectedInvariantCount < 1) throw new Error('Controlled-stress evaluation requires --stress-expected >= 1.');
  if (!Number.isInteger(passedInvariantCount) || !Number.isInteger(failedInvariantCount)) throw new Error('Controlled-stress evaluation requires explicit --stress-passed and --stress-failed counts.');
  if (passedInvariantCount + failedInvariantCount !== expectedInvariantCount) throw new Error('Stress passed + failed invariant counts must equal expected invariant count.');
  const outcome = failedInvariantCount === 0 ? 'pass' : passedInvariantCount === 0 ? 'fail' : 'partial';
  return { scenario, expectedInvariantCount, passedInvariantCount, failedInvariantCount, outcome };
}

function sessionMetrics(session, handoff, openFindingCount) {
"""
if anchor not in t:
    raise SystemExit('evaluation sessionMetrics anchor missing')
t = t.replace(anchor, helper, 1)
t = t.replace("  const review = normalizeReview(options);\n", "  const review = normalizeReview(options);\n  const stress = normalizeStress(options, protocolKind);\n", 1)
must = "    review,\n    policy:"
if must not in t:
    raise SystemExit('evaluation record review marker missing')
t = t.replace(must, "    stress,\n    review,\n    policy:", 1)
old = """      taskKind: record.task.kind, reviewOutcome: record.review.outcome, reviewProvenance: record.review.provenance,
      evidenceState: record.measurements.project.evidenceState,
"""
new = """      taskKind: record.task.kind, stressScenario: record.stress.scenario, stressOutcome: record.stress.outcome, reviewOutcome: record.review.outcome, reviewProvenance: record.review.provenance,
      evidenceState: record.measurements.project.evidenceState,
"""
if old not in t:
    raise SystemExit('evaluation list summary anchor missing')
t = t.replace(old, new, 1)
anchor = "function reviewedMetrics(records) {\n"
stress_helper = """function controlledStressMetrics(records) {
  const expectedInvariantCount = records.reduce((sum, record) => sum + record.stress.expectedInvariantCount, 0);
  const passedInvariantCount = records.reduce((sum, record) => sum + record.stress.passedInvariantCount, 0);
  const failedInvariantCount = records.reduce((sum, record) => sum + record.stress.failedInvariantCount, 0);
  return {
    records: records.length,
    uniqueRepositories: uniqueCount(records, (record) => record.repository.fingerprint),
    scenarios: countBy(records, (record) => record.stress.scenario),
    outcomes: countBy(records, (record) => record.stress.outcome),
    passRate: rate(records.filter((record) => record.stress.outcome === 'pass').length, records.length),
    expectedInvariantCount,
    passedInvariantCount,
    failedInvariantCount,
    invariantPassRate: rate(passedInvariantCount, expectedInvariantCount),
  };
}

function reviewedMetrics(records) {
"""
if anchor not in t:
    raise SystemExit('evaluation reviewedMetrics anchor missing')
t = t.replace(anchor, stress_helper, 1)
t = t.replace(
    "  const externalWithSession = observationalExternal.filter((record) => record.measurements.continuation.sessionPresent);\n",
    "  const externalWithSession = observationalExternal.filter((record) => record.measurements.continuation.sessionPresent);\n  const stressMetrics = controlledStressMetrics(controlledStressExternal);\n",
    1,
)
t = t.replace(
    "        taskKinds: countBy(external, (record) => record.task.kind),\n        protocols: countBy(external, (record) => record.protocol.kind),\n",
    "        taskKinds: countBy(external, (record) => record.task.kind),\n        observationalTaskKinds: countBy(observationalExternal, (record) => record.task.kind),\n        stressScenarios: countBy(controlledStressExternal, (record) => record.stress.scenario),\n        protocols: countBy(external, (record) => record.protocol.kind),\n",
    1,
)
t = t.replace("    reviewedUsefulness: {\n", "    controlledStress: stressMetrics,\n    reviewedUsefulness: {\n", 1)
t = t.replace(
    "      'Coverage state is based on observational external-real runs; controlled-stress runs are reported separately and cannot inflate ordinary field-coverage state.',",
    "      'Coverage state is based on observational external-real runs; controlled-stress runs are reported separately with invariant pass/fail counts and cannot inflate ordinary field-coverage state.',",
    1,
)
old = """  return `# CMI evaluation ${record.id.slice(0, 12)}\n\n- CMI: ${record.subject.version}${record.subject.sourceRevision ? ` · ${record.subject.sourceRevision.slice(0, 12)}` : ''}\n- Source: ${record.source.kind}${record.source.independent ? ' · independent repository evidence' : ''}\n- Protocol: ${record.protocol.kind}\n- Repository class: ${record.repository.class}\n- Task kind: ${record.task.kind}\n- Evidence health: ${record.measurements.project.evidenceState}\n- Session outcome: ${record.measurements.continuation.outcome || 'none'}\n- Open findings: ${record.measurements.continuation.openFindingCount}\n- Next action: ${record.measurements.continuation.nextActionPresent ? record.measurements.continuation.nextActionPriority : 'none'}\n- Review: ${record.review.outcome} · ${record.review.provenance}\n\n${record.policy}`;
"""
new = """  return `# CMI evaluation ${record.id.slice(0, 12)}\n\n- CMI: ${record.subject.version}${record.subject.sourceRevision ? ` · ${record.subject.sourceRevision.slice(0, 12)}` : ''}\n- Source: ${record.source.kind}${record.source.independent ? ' · independent repository evidence' : ''}\n- Protocol: ${record.protocol.kind}\n- Stress: ${record.stress.scenario || 'n/a'} · ${record.stress.outcome} (${record.stress.passedInvariantCount}/${record.stress.expectedInvariantCount} invariants passed)\n- Repository class: ${record.repository.class}\n- Task kind: ${record.task.kind}\n- Evidence health: ${record.measurements.project.evidenceState}\n- Session outcome: ${record.measurements.continuation.outcome || 'none'}\n- Open findings: ${record.measurements.continuation.openFindingCount}\n- Next action: ${record.measurements.continuation.nextActionPresent ? record.measurements.continuation.nextActionPriority : 'none'}\n- Review: ${record.review.outcome} · ${record.review.provenance}\n\n${record.policy}`;
"""
if old not in t:
    raise SystemExit('evaluation format record anchor missing')
t = t.replace(old, new, 1)
old = """Records: ${report.corpus.totalRecords} · external-real ${external.records} · observational ${external.observationalRecords} · controlled-stress ${external.controlledStressRecords}\nIndependent repositories: ${external.uniqueRepositories} · observational repositories ${external.observationalUniqueRepositories}\nRepository classes: ${Object.keys(external.repositoryClasses).length} · task kinds: ${Object.keys(external.taskKinds).length}\nReviewed observational external records:"""
new = """Records: ${report.corpus.totalRecords} · external-real ${external.records} · observational ${external.observationalRecords} · controlled-stress ${external.controlledStressRecords}\nIndependent repositories: ${external.uniqueRepositories} · observational repositories ${external.observationalUniqueRepositories}\nRepository classes: ${Object.keys(external.repositoryClasses).length} · observational task kinds: ${Object.keys(external.observationalTaskKinds).length}\nControlled stress: ${report.controlledStress.records} records · ${Object.keys(report.controlledStress.scenarios).length} scenarios · record pass rate ${report.controlledStress.passRate ?? 'n/a'} · invariant pass rate ${report.controlledStress.invariantPassRate ?? 'n/a'}\nReviewed observational external records:"""
if old not in t:
    raise SystemExit('evaluation format report anchor missing')
t = t.replace(old, new, 1)
p.write_text(t)


# JSON Schema parity.
p = Path('schemas/evaluation-record.schema.json')
data = json.loads(p.read_text())
if 'stress' not in data['required']:
    data['required'].insert(data['required'].index('review'), 'stress')
data['properties']['task']['properties']['kind']['enum'] = ['implementation', 'debugging', 'audit', 'review', 'research', 'verification', 'refactor', 'migration', 'architecture-analysis', 'no-code-investigation', 'unknown']
data['properties']['stress'] = {
    'type': 'object',
    'required': ['scenario', 'expectedInvariantCount', 'passedInvariantCount', 'failedInvariantCount', 'outcome'],
    'properties': {
        'scenario': {'type': ['string', 'null'], 'enum': ['rename-after-scan', 'history-rewrite', 'dirty-worktree', 'clock-skew', 'interrupted-session', 'concurrent-sessions', 'large-monorepo', 'corrupt-durable-record', 'stale-graph', None]},
        'expectedInvariantCount': {'type': 'integer', 'minimum': 0},
        'passedInvariantCount': {'type': 'integer', 'minimum': 0},
        'failedInvariantCount': {'type': 'integer', 'minimum': 0},
        'outcome': {'enum': ['not-applicable', 'pass', 'partial', 'fail']},
    },
    'additionalProperties': False,
}
p.write_text(json.dumps(data, indent=2) + '\n')


# Repository quality checks.
p = Path('scripts/quality.js')
t = p.read_text()
t = t.replace(
    'EVALUATION_REVIEW_PROVENANCE, EVALUATION_UTILITY_RATINGS }',
    'EVALUATION_REVIEW_PROVENANCE, EVALUATION_UTILITY_RATINGS, EVALUATION_STRESS_SCENARIOS, EVALUATION_STRESS_OUTCOMES }',
    1,
)
anchor = "  if (!sameValues(evaluation.properties?.review?.properties?.handoffRating?.enum, EVALUATION_UTILITY_RATINGS)) errors.push('evaluation handoff ratings differ from runtime contract');\n"
extra = anchor + "  if (!sameValues((evaluation.properties?.stress?.properties?.scenario?.enum || []).filter((value) => value !== null), EVALUATION_STRESS_SCENARIOS)) errors.push('evaluation stress scenarios differ from runtime contract');\n  if (!sameValues(evaluation.properties?.stress?.properties?.outcome?.enum, EVALUATION_STRESS_OUTCOMES)) errors.push('evaluation stress outcomes differ from runtime contract');\n"
if anchor not in t:
    raise SystemExit('quality stress anchor missing')
p.write_text(t.replace(anchor, extra, 1))


# CLI stress capture flags.
p = Path('src/cli-entry.js')
t = p.read_text()
anchor = "    handoffRating: optionValues('--handoff-rating')[0],\n"
repl = anchor + "    stressScenario: optionValues('--stress-scenario')[0],\n    stressExpected: optionValues('--stress-expected')[0],\n    stressPassed: optionValues('--stress-passed')[0],\n    stressFailed: optionValues('--stress-failed')[0],\n"
if anchor not in t:
    raise SystemExit('CLI eval option anchor missing')
t = t.replace(anchor, repl, 1)
old = "['--source-kind','--protocol','--repository-class','--task-kind','--session','--review-outcome','--review-provenance','--false-positive-findings','--missed-findings','--next-action-rating','--handoff-rating','--limit']"
new = "['--source-kind','--protocol','--repository-class','--task-kind','--session','--review-outcome','--review-provenance','--false-positive-findings','--missed-findings','--next-action-rating','--handoff-rating','--stress-scenario','--stress-expected','--stress-passed','--stress-failed','--limit']"
if old not in t:
    raise SystemExit('CLI positional anchor missing')
t = t.replace(old, new, 1)
t = t.replace(
    '[--protocol observational|controlled-stress] [--repository-class class] [--task-kind kind] [--session latest|none|id]',
    '[--protocol observational|controlled-stress] [--repository-class class] [--task-kind kind] [--session latest|none|id] [--stress-scenario scenario --stress-expected N --stress-passed N --stress-failed N]',
    1,
)
p.write_text(t)


# MCP parity.
p = Path('src/mcp-entry.js')
t = p.read_text()
t = t.replace(
    "['implementation', 'debugging', 'audit', 'review', 'research', 'verification', 'no-code-investigation', 'unknown']",
    "['implementation', 'debugging', 'audit', 'review', 'research', 'verification', 'refactor', 'migration', 'architecture-analysis', 'no-code-investigation', 'unknown']",
    1,
)
anchor = "    handoffRating: { type: 'string', enum: ['useful', 'not-useful', 'unknown'] },\n"
repl = anchor + "    stressScenario: { type: 'string', enum: ['rename-after-scan', 'history-rewrite', 'dirty-worktree', 'clock-skew', 'interrupted-session', 'concurrent-sessions', 'large-monorepo', 'corrupt-durable-record', 'stale-graph'] },\n    stressExpected: { type: 'integer', minimum: 1 },\n    stressPassed: { type: 'integer', minimum: 0 },\n    stressFailed: { type: 'integer', minimum: 0 },\n"
if anchor not in t:
    raise SystemExit('MCP stress schema anchor missing')
p.write_text(t.replace(anchor, repl, 1))


# Adapt and extend evaluation tests.
p = Path('tests/evaluation.test.js')
t = p.read_text()
old = "  await captureEvaluation(root, { sourceKind: 'external-real', protocolKind: 'controlled-stress', repositoryClass: 'library', taskKind: 'verification', session: 'none' });\n"
new = "  await captureEvaluation(root, { sourceKind: 'external-real', protocolKind: 'controlled-stress', repositoryClass: 'library', taskKind: 'verification', session: 'none', stressScenario: 'stale-graph', stressExpected: 2, stressPassed: 2, stressFailed: 0 });\n"
if old not in t:
    raise SystemExit('evaluation controlled stress test anchor missing')
t = t.replace(old, new, 1)
t = t.replace(
    "  assert.equal(report.coverage.state, 'none');\n",
    "  assert.equal(report.coverage.state, 'none');\n  assert.equal(report.controlledStress.records, 1);\n  assert.equal(report.controlledStress.passRate, 1);\n  assert.equal(report.controlledStress.invariantPassRate, 1);\n  assert.equal(report.controlledStress.scenarios['stale-graph'], 1);\n",
    1,
)
p.write_text(t)

Path('tests/evaluation-stress.test.js').write_text("""import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanProject } from '../src/core.js';
import { captureEvaluation, buildEvaluationReport, validateEvaluationRecord } from '../src/evaluation.js';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-eval-stress-'));
  await fs.writeFile(path.join(root, 'package.json'), '{\"type\":\"module\"}');
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'src', 'index.js'), 'export const x = 1;\\n');
  await scanProject(root);
  return root;
}

test('observational evaluations reject controlled-stress assertions', async () => {
  const root = await fixture();
  await assert.rejects(() => captureEvaluation(root, {
    sourceKind: 'external-real', protocolKind: 'observational', repositoryClass: 'library', taskKind: 'audit', session: 'none',
    stressScenario: 'stale-graph', stressExpected: 1, stressPassed: 1, stressFailed: 0,
  }), /observational evaluation cannot assert controlled-stress/i);
});

test('controlled-stress requires explicit scenario and complete invariant counts', async () => {
  const root = await fixture();
  await assert.rejects(() => captureEvaluation(root, {
    sourceKind: 'external-real', protocolKind: 'controlled-stress', repositoryClass: 'library', taskKind: 'verification', session: 'none',
  }), /stress scenario/i);
  await assert.rejects(() => captureEvaluation(root, {
    sourceKind: 'external-real', protocolKind: 'controlled-stress', repositoryClass: 'library', taskKind: 'verification', session: 'none',
    stressScenario: 'history-rewrite', stressExpected: 3, stressPassed: 2, stressFailed: 0,
  }), /must equal expected/i);
});

test('stress outcome is derived from invariant counts and remains outside observational coverage', async () => {
  const root = await fixture();
  const partial = await captureEvaluation(root, {
    sourceKind: 'external-real', protocolKind: 'controlled-stress', repositoryClass: 'library', taskKind: 'verification', session: 'none',
    stressScenario: 'history-rewrite', stressExpected: 3, stressPassed: 2, stressFailed: 1,
  });
  assert.equal(partial.stress.outcome, 'partial');
  assert.equal(validateEvaluationRecord(partial), true);
  const failed = await captureEvaluation(root, {
    sourceKind: 'external-real', protocolKind: 'controlled-stress', repositoryClass: 'library', taskKind: 'verification', session: 'none',
    stressScenario: 'dirty-worktree', stressExpected: 2, stressPassed: 0, stressFailed: 2,
  });
  assert.equal(failed.stress.outcome, 'fail');
  const report = await buildEvaluationReport(root);
  assert.equal(report.coverage.state, 'none');
  assert.equal(report.corpus.externalReal.observationalRecords, 0);
  assert.equal(report.controlledStress.records, 2);
  assert.equal(report.controlledStress.outcomes.partial, 1);
  assert.equal(report.controlledStress.outcomes.fail, 1);
  assert.equal(report.controlledStress.expectedInvariantCount, 5);
  assert.equal(report.controlledStress.passedInvariantCount, 2);
  assert.equal(report.controlledStress.failedInvariantCount, 3);
});

test('expanded task taxonomy accepts refactor, migration, and architecture analysis', async () => {
  for (const taskKind of ['refactor', 'migration', 'architecture-analysis']) {
    const root = await fixture();
    const record = await captureEvaluation(root, { sourceKind: 'synthetic', repositoryClass: 'tooling', taskKind, session: 'none' });
    assert.equal(record.task.kind, taskKind);
    assert.equal(record.review.provenance, 'unreviewed');
    assert.equal(record.stress.outcome, 'not-applicable');
  }
});
""")


# Documentation and roadmap.
p = Path('docs/EVALUATION.md')
t = p.read_text()
insert = """
## Controlled real-repository stress

A `controlled-stress` record must identify one bounded scenario and invariant counts. The record does not retain arbitrary scenario prose. Supported scenarios are `rename-after-scan`, `history-rewrite`, `dirty-worktree`, `clock-skew`, `interrupted-session`, `concurrent-sessions`, `large-monorepo`, `corrupt-durable-record`, and `stale-graph`.

Capture example:

```bash
cmi evaluate capture \\
  --source-kind external-real \\
  --protocol controlled-stress \\
  --repository-class library \\
  --task-kind verification \\
  --session none \\
  --stress-scenario stale-graph \\
  --stress-expected 3 \\
  --stress-passed 3 \\
  --stress-failed 0
```

`pass`, `partial`, or `fail` is derived from the invariant counts; callers cannot supply a more favorable stress outcome. Observational records reject stress fields. Reports aggregate stress scenario coverage and invariant pass rate separately from ordinary field coverage.
"""
marker = '\n## Runtime contract\n'
if marker not in t:
    raise SystemExit('evaluation docs marker missing')
p.write_text(t.replace(marker, insert + marker, 1))

p = Path('ROADMAP.md')
t = p.read_text()
old = '- [ ] Add controlled real-repository stress runs for rename-after-scan, rebases, dirty worktrees, clock skew, and large monorepos.\n'
new = '- [x] Add a controlled-stress evaluation contract with explicit scenario taxonomy, derived pass/partial/fail outcome, and invariant-count aggregation that cannot inflate observational coverage.\n- [ ] Complete controlled external-real stress evidence for rename-after-scan, rebases/history rewrite, dirty worktrees, clock skew, and large monorepos.\n'
if old not in t:
    raise SystemExit('roadmap stress anchor missing')
p.write_text(t.replace(old, new, 1))

p = Path('CHANGELOG.md')
t = p.read_text()
marker = '## [Unreleased]\n'
bullet = '\n- Added controlled real-repository stress evaluation with explicit scenario taxonomy, derived invariant outcomes, separate aggregate stress metrics, and CLI/MCP parity without inflating observational coverage.\n'
if marker not in t:
    raise SystemExit('changelog marker missing')
if bullet.strip() not in t:
    t = t.replace(marker, marker + bullet, 1)
p.write_text(t)
