const STUDY_SCHEMA_VERSION = 1;
const STUDY_KIND = 'cmi-empirical-study-ledger';
const STUDY_REPORT_KIND = 'cmi-empirical-study-report';
const STUDY_AGGREGATE_KIND = 'cmi-empirical-study-aggregate';
const CONDITIONS = ['plain', 'cmi'];
const ORDERS = ['plain-first', 'cmi-first'];
const CONDITION_ORDER = {
  'plain-first': { plain: 'first', cmi: 'second' },
  'cmi-first': { cmi: 'first', plain: 'second' },
};
const CROSS_CONDITION_LEAKAGE = ['none', 'known', 'unknown'];
const REVIEWER_KINDS = ['human', 'agent', 'unreviewed'];
const REVIEWER_ASSURANCE = ['declared', 'externally-verified', 'not-applicable'];
const VERIFICATION_OUTCOMES = ['passed', 'failed', 'mixed', 'not-run', 'unknown'];
const TASK_OUTCOMES = ['succeeded', 'failed', 'incomplete', 'unknown'];
const VERIFICATION_CHOICE_OUTCOMES = ['improved', 'unchanged', 'worse', 'not-applicable', 'unknown'];

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function boundedString(value, name, { required = true, max = 240 } = {}) {
  if (value == null && !required) return null;
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} must be a non-empty string`);
  const clean = value.trim();
  if (clean.length > max) throw new Error(`${name} exceeds ${max} characters`);
  if (clean.includes('\0')) throw new Error(`${name} contains a NUL byte`);
  return clean;
}

function oneOf(value, allowed, name) {
  if (!allowed.includes(value)) throw new Error(`${name} must be one of: ${allowed.join(', ')}`);
  return value;
}

function nonNegativeInteger(value, name) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  return value;
}

function nullableScore(value, name) {
  if (value == null) return null;
  if (!Number.isInteger(value) || value < 0 || value > 5) throw new Error(`${name} must be an integer from 0 to 5 or null`);
  return value;
}

function validateRevision(value, name = 'revision') {
  const revision = boundedString(value, name, { max: 40 });
  if (!/^[0-9a-f]{40}$/i.test(revision)) throw new Error(`${name} must be a 40-character Git commit SHA`);
  return revision.toLowerCase();
}

function validateRelativePath(value, name) {
  const clean = boundedString(value, name, { max: 320 });
  const normalized = clean.replaceAll('\\', '/');
  if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) throw new Error(`${name} must be repository-relative`);
  const segments = normalized.split('/');
  if (segments.includes('..')) throw new Error(`${name} must not escape the repository`);
  return normalized;
}

function validateStringList(value, name, { maxItems = 30, itemMax = 240, relativePaths = false } = {}) {
  if (!Array.isArray(value)) throw new Error(`${name} must be an array`);
  if (value.length > maxItems) throw new Error(`${name} exceeds ${maxItems} items`);
  return value.map((item, index) => relativePaths
    ? validateRelativePath(item, `${name}[${index}]`)
    : boundedString(item, `${name}[${index}]`, { max: itemMax }));
}

function validateIsoPair(startedAt, endedAt) {
  if (startedAt == null && endedAt == null) return { startedAt: null, endedAt: null };
  if (typeof startedAt !== 'string' || typeof endedAt !== 'string') throw new Error('startedAt and endedAt must both be supplied when timing is recorded');
  const startMs = Date.parse(startedAt);
  const endMs = Date.parse(endedAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) throw new Error('startedAt and endedAt must be valid ISO timestamps');
  if (endMs < startMs) throw new Error('endedAt must not precede startedAt');
  return { startedAt: new Date(startMs).toISOString(), endedAt: new Date(endMs).toISOString() };
}

function validateConditionResult(result, study, condition) {
  if (!isObject(result)) throw new Error(`${condition} result must be an object`);
  const timing = validateIsoPair(result.startedAt ?? null, result.endedAt ?? null);
  const observedStartRevision = validateRevision(result.observedStartRevision, `${condition}.observedStartRevision`);
  if (observedStartRevision !== study.revision) throw new Error(`${condition}.observedStartRevision does not match preregistered revision`);
  if (typeof result.freshSession !== 'boolean') throw new Error(`${condition}.freshSession must be boolean`);
  if (typeof result.sameStartRevision !== 'boolean') throw new Error(`${condition}.sameStartRevision must be boolean`);
  if (typeof result.cleanStartState !== 'boolean') throw new Error(`${condition}.cleanStartState must be boolean`);
  if (typeof result.reconstructionAdequacyReached !== 'boolean') throw new Error(`${condition}.reconstructionAdequacyReached must be boolean`);

  const reviewerKind = oneOf(result.reviewerKind, REVIEWER_KINDS, `${condition}.reviewerKind`);
  const reviewerAssurance = oneOf(result.reviewerAssurance, REVIEWER_ASSURANCE, `${condition}.reviewerAssurance`);
  if (reviewerKind === 'unreviewed' && reviewerAssurance !== 'not-applicable') throw new Error(`${condition}.reviewerAssurance must be not-applicable when reviewerKind is unreviewed`);
  if (reviewerKind !== 'unreviewed' && reviewerAssurance === 'not-applicable') throw new Error(`${condition}.reviewerAssurance must declare an assurance level for reviewed evidence`);

  return {
    conditionConfiguration: boundedString(result.conditionConfiguration, `${condition}.conditionConfiguration`, { max: 500 }),
    observedStartRevision,
    freshSession: result.freshSession,
    sameStartRevision: result.sameStartRevision,
    cleanStartState: result.cleanStartState,
    crossConditionLeakage: oneOf(result.crossConditionLeakage, CROSS_CONDITION_LEAKAGE, `${condition}.crossConditionLeakage`),
    reconstructionAdequacyReached: result.reconstructionAdequacyReached,
    inspectionCount: nonNegativeInteger(result.inspectionCount, `${condition}.inspectionCount`),
    searchCount: nonNegativeInteger(result.searchCount, `${condition}.searchCount`),
    gitQueryCount: nonNegativeInteger(result.gitQueryCount, `${condition}.gitQueryCount`),
    clarificationCount: nonNegativeInteger(result.clarificationCount, `${condition}.clarificationCount`),
    filesInspected: validateStringList(result.filesInspected, `${condition}.filesInspected`, { maxItems: 200, itemMax: 320, relativePaths: true }),
    materialRisksFoundEarly: nonNegativeInteger(result.materialRisksFoundEarly, `${condition}.materialRisksFoundEarly`),
    materialRisksFoundLate: nonNegativeInteger(result.materialRisksFoundLate, `${condition}.materialRisksFoundLate`),
    materialRisksMissed: nonNegativeInteger(result.materialRisksMissed, `${condition}.materialRisksMissed`),
    falsePositiveFindings: nonNegativeInteger(result.falsePositiveFindings, `${condition}.falsePositiveFindings`),
    verificationPlan: validateStringList(result.verificationPlan, `${condition}.verificationPlan`, { maxItems: 20, itemMax: 300 }),
    verificationOutcome: oneOf(result.verificationOutcome, VERIFICATION_OUTCOMES, `${condition}.verificationOutcome`),
    verificationChoiceOutcome: oneOf(result.verificationChoiceOutcome, VERIFICATION_CHOICE_OUTCOMES, `${condition}.verificationChoiceOutcome`),
    taskOutcome: oneOf(result.taskOutcome, TASK_OUTCOMES, `${condition}.taskOutcome`),
    handoffScore: nullableScore(result.handoffScore, `${condition}.handoffScore`),
    reviewerKind,
    reviewerAssurance,
    notesReference: boundedString(result.notesReference ?? null, `${condition}.notesReference`, { required: false, max: 300 }),
    ...timing,
  };
}

function validateStudyDefinition(study) {
  if (!isObject(study)) throw new Error('study must be an object');
  const order = oneOf(study.order, ORDERS, 'study.order');
  if (typeof study.negativeControl !== 'boolean') throw new Error('study.negativeControl must be boolean');
  return {
    studyId: boundedString(study.studyId, 'study.studyId', { max: 120 }),
    pairId: boundedString(study.pairId, 'study.pairId', { max: 120 }),
    repositoryStudyId: boundedString(study.repositoryStudyId, 'study.repositoryStudyId', { max: 120 }),
    revision: validateRevision(study.revision, 'study.revision'),
    repoClass: boundedString(study.repoClass, 'study.repoClass', { max: 80 }),
    taskClass: boundedString(study.taskClass, 'study.taskClass', { max: 80 }),
    order,
    agentConfiguration: boundedString(study.agentConfiguration, 'study.agentConfiguration', { max: 500 }),
    taskReference: boundedString(study.taskReference ?? null, 'study.taskReference', { required: false, max: 300 }),
    acceptanceReference: boundedString(study.acceptanceReference ?? null, 'study.acceptanceReference', { required: false, max: 300 }),
    negativeControl: study.negativeControl,
  };
}

function validateConditionEntry(entry, study) {
  if (!isObject(entry)) throw new Error('condition entry must be an object');
  const condition = oneOf(entry.condition, CONDITIONS, 'condition');
  const expectedOrder = CONDITION_ORDER[study.order][condition];
  if (entry.order !== expectedOrder) throw new Error(`${condition}.order must be ${expectedOrder}`);
  const status = oneOf(entry.status, ['pending', 'completed'], `${condition}.status`);
  if (status === 'pending') {
    if (entry.result != null) throw new Error(`${condition}.result must be null while pending`);
    return { condition, order: expectedOrder, status, result: null };
  }
  return { condition, order: expectedOrder, status, result: validateConditionResult(entry.result, study, condition) };
}

export function createStudyLedger(input, now = new Date()) {
  const study = validateStudyDefinition(input);
  return {
    schemaVersion: STUDY_SCHEMA_VERSION,
    kind: STUDY_KIND,
    createdAt: new Date(now).toISOString(),
    study,
    conditions: CONDITIONS.map((condition) => ({
      condition,
      order: CONDITION_ORDER[study.order][condition],
      status: 'pending',
      result: null,
    })),
    policy: {
      storage: 'external-ledger',
      cmiDurableWrite: false,
      claimDiscipline: 'descriptive-only',
      identityAssurance: 'caller-attested unless an external harness provides stronger assurance',
    },
  };
}

export function validateStudyLedger(ledger) {
  if (!isObject(ledger)) throw new Error('ledger must be an object');
  if (ledger.schemaVersion !== STUDY_SCHEMA_VERSION) throw new Error(`Unsupported empirical study schemaVersion: ${ledger.schemaVersion}`);
  if (ledger.kind !== STUDY_KIND) throw new Error(`Invalid empirical study kind: ${ledger.kind}`);
  if (!Number.isFinite(Date.parse(ledger.createdAt))) throw new Error('createdAt must be a valid timestamp');
  const study = validateStudyDefinition(ledger.study);
  if (!Array.isArray(ledger.conditions) || ledger.conditions.length !== 2) throw new Error('conditions must contain exactly plain and cmi entries');
  const conditions = ledger.conditions.map((entry) => validateConditionEntry(entry, study));
  const names = conditions.map((entry) => entry.condition).sort();
  if (JSON.stringify(names) !== JSON.stringify([...CONDITIONS].sort())) throw new Error('conditions must contain one plain and one cmi entry');
  if (!isObject(ledger.policy)) throw new Error('policy must be an object');
  if (ledger.policy.storage !== 'external-ledger' || ledger.policy.cmiDurableWrite !== false || ledger.policy.claimDiscipline !== 'descriptive-only') {
    throw new Error('ledger policy must preserve external descriptive-only evidence boundaries');
  }
  return { ...ledger, study, conditions };
}

export function recordStudyCondition(ledger, condition, result) {
  const validated = validateStudyLedger(ledger);
  oneOf(condition, CONDITIONS, 'condition');
  const target = validated.conditions.find((entry) => entry.condition === condition);
  if (target.status === 'completed') throw new Error(`${condition} condition is already recorded and cannot be overwritten`);
  const recorded = validateConditionResult(result, validated.study, condition);
  return {
    ...validated,
    conditions: validated.conditions.map((entry) => entry.condition === condition
      ? { ...entry, status: 'completed', result: recorded }
      : entry),
  };
}

function protocolEligibility(condition) {
  if (condition.status !== 'completed') return false;
  const result = condition.result;
  return Boolean(result.freshSession
    && result.sameStartRevision
    && result.cleanStartState
    && result.crossConditionLeakage === 'none'
    && result.observedStartRevision);
}

function reviewerLabel(result) {
  if (!result || result.reviewerKind === 'unreviewed') return 'unreviewed';
  return `${result.reviewerAssurance === 'externally-verified' ? 'externally-verified' : 'declared'}-${result.reviewerKind}`;
}

function conditionSummary(entry) {
  if (entry.status !== 'completed') return { condition: entry.condition, order: entry.order, status: 'pending' };
  const result = entry.result;
  return {
    condition: entry.condition,
    order: entry.order,
    status: 'completed',
    protocolEligible: protocolEligibility(entry),
    reconstructionAdequacyReached: result.reconstructionAdequacyReached,
    reconstruction: {
      inspectionCount: result.inspectionCount,
      searchCount: result.searchCount,
      gitQueryCount: result.gitQueryCount,
      clarificationCount: result.clarificationCount,
      filesInspected: result.filesInspected.length,
    },
    risks: {
      foundEarly: result.materialRisksFoundEarly,
      foundLate: result.materialRisksFoundLate,
      missed: result.materialRisksMissed,
      falsePositiveFindings: result.falsePositiveFindings,
    },
    verificationPlan: result.verificationPlan,
    verificationOutcome: result.verificationOutcome,
    verificationChoiceOutcome: result.verificationChoiceOutcome,
    taskOutcome: result.taskOutcome,
    handoffScore: result.handoffScore,
    reviewer: reviewerLabel(result),
    timingRecorded: Boolean(result.startedAt && result.endedAt),
  };
}

function studyLimitations(validated, summaries) {
  const limitations = [];
  const completed = summaries.filter((entry) => entry.status === 'completed');
  if (completed.length !== 2) limitations.push('The pair is incomplete; no paired effect should be inferred.');
  for (const entry of validated.conditions) {
    if (entry.status !== 'completed') continue;
    const result = entry.result;
    if (!result.freshSession) limitations.push(`${entry.condition}: agent/session isolation was not fresh.`);
    if (!result.sameStartRevision || result.observedStartRevision !== validated.study.revision) limitations.push(`${entry.condition}: the starting revision was not equivalent to the preregistered revision.`);
    if (!result.cleanStartState) limitations.push(`${entry.condition}: the starting worktree/state was not recorded as clean/equivalent.`);
    if (result.crossConditionLeakage !== 'none') limitations.push(`${entry.condition}: cross-condition leakage is ${result.crossConditionLeakage}.`);
    if (!result.reconstructionAdequacyReached) limitations.push(`${entry.condition}: adequate reconstruction was not reached, so reconstruction counts are censored.`);
    if (result.reviewerKind !== 'human') limitations.push(`${entry.condition}: outcome review is ${reviewerLabel(result)}, not human-reviewed evidence.`);
    else if (result.reviewerAssurance !== 'externally-verified') limitations.push(`${entry.condition}: human reviewer identity is declared rather than externally authenticated.`);
  }
  limitations.push('A single pair is descriptive evidence only and cannot establish general productivity improvement.');
  limitations.push('The harness validates structure and declared isolation metadata; it does not authenticate repository ownership, reviewer identity, or hidden agent reasoning.');
  return [...new Set(limitations)];
}

export function reportStudyLedger(ledger) {
  const validated = validateStudyLedger(ledger);
  const summaries = validated.conditions.map(conditionSummary);
  const plain = validated.conditions.find((entry) => entry.condition === 'plain');
  const cmi = validated.conditions.find((entry) => entry.condition === 'cmi');
  const complete = plain.status === 'completed' && cmi.status === 'completed';
  const eligible = complete && protocolEligibility(plain) && protocolEligibility(cmi);
  const deltas = complete ? {
    inspectionCount: plain.result.inspectionCount - cmi.result.inspectionCount,
    searchCount: plain.result.searchCount - cmi.result.searchCount,
    gitQueryCount: plain.result.gitQueryCount - cmi.result.gitQueryCount,
    clarificationCount: plain.result.clarificationCount - cmi.result.clarificationCount,
    filesInspected: plain.result.filesInspected.length - cmi.result.filesInspected.length,
    materialRisksMissed: plain.result.materialRisksMissed - cmi.result.materialRisksMissed,
    falsePositiveFindings: plain.result.falsePositiveFindings - cmi.result.falsePositiveFindings,
    handoffScore: plain.result.handoffScore == null || cmi.result.handoffScore == null ? null : cmi.result.handoffScore - plain.result.handoffScore,
  } : null;
  return {
    schemaVersion: 1,
    kind: STUDY_REPORT_KIND,
    studyId: validated.study.studyId,
    pairId: validated.study.pairId,
    repositoryStudyId: validated.study.repositoryStudyId,
    revision: validated.study.revision,
    taskClass: validated.study.taskClass,
    negativeControl: validated.study.negativeControl,
    order: validated.study.order,
    status: complete ? 'complete' : 'partial',
    protocolEligible: eligible,
    claimDiscipline: 'descriptive-only',
    conditions: summaries,
    deltas,
    verificationChoiceOutcome: complete ? cmi.result.verificationChoiceOutcome : 'unknown',
    limitations: studyLimitations(validated, summaries),
  };
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function range(values) {
  if (!values.length) return null;
  return { min: Math.min(...values), max: Math.max(...values) };
}

function numericSummary(values) {
  return { count: values.length, median: median(values), range: range(values) };
}

function countBy(values) {
  const output = {};
  for (const value of values) output[value] = (output[value] || 0) + 1;
  return output;
}

function sumByCondition(entries, field) {
  return CONDITIONS.reduce((output, condition) => {
    output[condition] = entries
      .filter((entry) => entry.condition === condition)
      .reduce((sum, entry) => sum + entry.result[field], 0);
    return output;
  }, {});
}

export function aggregateStudyLedgers(ledgers) {
  if (!Array.isArray(ledgers) || !ledgers.length) throw new Error('At least one empirical study ledger is required');
  const validated = ledgers.map(validateStudyLedger);
  const reports = validated.map(reportStudyLedger);
  const completedReports = reports.filter((report) => report.status === 'complete');
  const eligibleReports = completedReports.filter((report) => report.protocolEligible);

  const reconstruction = {};
  for (const condition of CONDITIONS) {
    const rows = eligibleReports.map((report) => report.conditions.find((entry) => entry.condition === condition));
    reconstruction[condition] = {
      inspectionCount: numericSummary(rows.map((row) => row.reconstruction.inspectionCount)),
      searchCount: numericSummary(rows.map((row) => row.reconstruction.searchCount)),
      gitQueryCount: numericSummary(rows.map((row) => row.reconstruction.gitQueryCount)),
      clarificationCount: numericSummary(rows.map((row) => row.reconstruction.clarificationCount)),
      filesInspected: numericSummary(rows.map((row) => row.reconstruction.filesInspected)),
      handoffScore: numericSummary(rows.map((row) => row.handoffScore).filter((value) => value != null)),
    };
  }

  const allCompletedConditions = validated.flatMap((ledger) => ledger.conditions).filter((entry) => entry.status === 'completed');
  const limitations = [
    'Aggregate results are descriptive and must be interpreted by represented workflow class before any product claim.',
    'Human and agent review are reported separately and must not be averaged into one usefulness rate.',
    'The harness does not independently authenticate external-real repository or reviewer identity claims.',
  ];
  if (eligibleReports.length < completedReports.length) limitations.push('Some complete pairs were excluded from pooled reconstruction summaries because isolation/equivalent-start requirements were not satisfied.');
  if (!allCompletedConditions.some((entry) => entry.result.reviewerKind === 'human')) limitations.push('No human-reviewed condition outcomes are present.');

  return {
    schemaVersion: 1,
    kind: STUDY_AGGREGATE_KIND,
    claimDiscipline: 'descriptive-only',
    repositories: new Set(validated.map((ledger) => ledger.study.repositoryStudyId)).size,
    pairs: {
      total: reports.length,
      complete: completedReports.length,
      protocolEligible: eligibleReports.length,
      negativeControls: reports.filter((report) => report.negativeControl).length,
    },
    repeatedTasksPerRepository: countBy(validated.map((ledger) => ledger.study.repositoryStudyId)),
    taskClassDistribution: countBy(validated.map((ledger) => ledger.study.taskClass)),
    orderDistribution: countBy(validated.map((ledger) => ledger.study.order)),
    reviewerDistribution: countBy(allCompletedConditions.map((entry) => reviewerLabel(entry.result))),
    verificationChoiceOutcomes: countBy(completedReports.map((report) => report.verificationChoiceOutcome)),
    reconstruction,
    materialRisks: {
      foundEarly: sumByCondition(allCompletedConditions, 'materialRisksFoundEarly'),
      foundLate: sumByCondition(allCompletedConditions, 'materialRisksFoundLate'),
      missed: sumByCondition(allCompletedConditions, 'materialRisksMissed'),
      falsePositiveFindings: sumByCondition(allCompletedConditions, 'falsePositiveFindings'),
    },
    pairedResults: reports,
    limitations,
  };
}

export const EMPIRICAL_STUDY_CONTRACT = Object.freeze({
  schemaVersion: STUDY_SCHEMA_VERSION,
  kind: STUDY_KIND,
  conditions: [...CONDITIONS],
  orders: [...ORDERS],
  reviewerKinds: [...REVIEWER_KINDS],
  reviewerAssurance: [...REVIEWER_ASSURANCE],
  verificationChoiceOutcomes: [...VERIFICATION_CHOICE_OUTCOMES],
});
