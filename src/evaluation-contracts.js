import { SESSION_OUTCOMES, EVIDENCE_TYPES, RECOMMENDATION_PRIORITIES, CONFIDENCE_LEVELS } from './durable-contracts.js';

export const EVALUATION_SCHEMA_VERSION = 1;
export const EVALUATION_SOURCE_KINDS = ['external-real', 'self-host', 'synthetic'];
export const EVALUATION_PROTOCOL_KINDS = ['observational', 'controlled-stress'];
export const EVALUATION_REPOSITORY_CLASSES = ['application', 'service', 'library', 'cli-tool', 'tooling', 'monorepo', 'unknown'];
export const EVALUATION_TASK_KINDS = ['implementation', 'debugging', 'audit', 'review', 'research', 'verification', 'refactor', 'migration', 'architecture-analysis', 'no-code-investigation', 'unknown'];
export const EVALUATION_REVIEW_OUTCOMES = ['pass', 'partial', 'fail', 'unreviewed'];
export const EVALUATION_REVIEW_PROVENANCE = ['human', 'agent', 'unreviewed'];
export const EVALUATION_UTILITY_RATINGS = ['useful', 'not-useful', 'unknown'];
export const EVALUATION_STRESS_SCENARIOS = ['rename-after-scan', 'history-rewrite', 'dirty-worktree', 'clock-skew', 'interrupted-session', 'concurrent-sessions', 'large-monorepo', 'corrupt-durable-record', 'stale-graph'];
export const EVALUATION_STRESS_OUTCOMES = ['not-applicable', 'pass', 'partial', 'fail'];
export const EVALUATION_EVIDENCE_STATES = ['healthy', 'degraded', 'blocked', 'uninitialized'];
export const EVALUATION_CALIBRATION_CONFIDENCE = ['high', 'medium', 'low', 'insufficient-evidence'];

function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function hasOnlyKeys(value, allowed) { return isObject(value) && Object.keys(value).every((key) => allowed.has(key)); }
function validIso(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
function validUuid(value) { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function validEnum(value, values) { return typeof values?.has === 'function' ? values.has(value) : values.includes(value); }
function nullableBoolean(value) { return value === null || typeof value === 'boolean'; }
function nullableNumber(value) { return value === null || (typeof value === 'number' && Number.isFinite(value)); }
function nullableNonNegativeInteger(value) { return value === null || (Number.isInteger(value) && value >= 0); }
function nullableEnum(value, values) { return value === null || validEnum(value, values); }

export function validateEvaluationRecordContract(record) {
  const errors = [];
  const fail = (condition, message) => { if (!condition) errors.push(message); };
  fail(isObject(record), 'record must be an object');
  if (!isObject(record)) return { valid: false, errors };
  fail(hasOnlyKeys(record, new Set(['schemaVersion', 'id', 'recordedAt', 'subject', 'source', 'protocol', 'repository', 'task', 'measurements', 'stress', 'review', 'policy'])), 'record has unsupported top-level fields');
  fail(record.schemaVersion === EVALUATION_SCHEMA_VERSION, 'unsupported schemaVersion');
  fail(validUuid(record.id), 'id must be a canonical UUID');
  fail(validIso(record.recordedAt), 'recordedAt must be an ISO timestamp');

  const subject = record.subject;
  fail(hasOnlyKeys(subject, new Set(['version', 'sourceRevision'])), 'subject shape is invalid');
  if (isObject(subject)) {
    fail(typeof subject.version === 'string' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(subject.version), 'subject.version must be semantic');
    fail(subject.sourceRevision === null || (typeof subject.sourceRevision === 'string' && /^[0-9a-f]{40}$/.test(subject.sourceRevision)), 'subject.sourceRevision must be null or a 40-character Git SHA');
  }

  const source = record.source;
  fail(hasOnlyKeys(source, new Set(['kind', 'independent'])), 'source shape is invalid');
  if (isObject(source)) {
    fail(validEnum(source.kind, EVALUATION_SOURCE_KINDS), 'source.kind is invalid');
    fail(typeof source.independent === 'boolean', 'source.independent must be boolean');
    if (validEnum(source.kind, EVALUATION_SOURCE_KINDS)) fail(source.independent === (source.kind === 'external-real'), 'source.independent must be true only for external-real evidence');
  }

  const protocol = record.protocol;
  fail(hasOnlyKeys(protocol, new Set(['kind'])), 'protocol shape is invalid');
  if (isObject(protocol)) fail(validEnum(protocol.kind, EVALUATION_PROTOCOL_KINDS), 'protocol.kind is invalid');

  const repository = record.repository;
  fail(hasOnlyKeys(repository, new Set(['fingerprint', 'fingerprintBasis', 'class'])), 'repository shape is invalid');
  if (isObject(repository)) {
    fail(typeof repository.fingerprint === 'string' && /^sha256:[0-9a-f]{64}$/.test(repository.fingerprint), 'repository.fingerprint must be a sha256 digest');
    fail(['git-origin-hash', 'local-root-hash'].includes(repository.fingerprintBasis), 'repository.fingerprintBasis is invalid');
    fail(validEnum(repository.class, EVALUATION_REPOSITORY_CLASSES), 'repository.class is invalid');
  }

  const task = record.task;
  fail(hasOnlyKeys(task, new Set(['kind', 'sessionId'])), 'task shape is invalid');
  if (isObject(task)) {
    fail(validEnum(task.kind, EVALUATION_TASK_KINDS), 'task.kind is invalid');
    fail(task.sessionId === null || validUuid(task.sessionId), 'task.sessionId must be null or a UUID');
  }

  const measurements = record.measurements;
  fail(hasOnlyKeys(measurements, new Set(['project', 'continuation', 'changeHistory'])), 'measurements shape is invalid');
  if (isObject(measurements)) {
    const project = measurements.project;
    fail(hasOnlyKeys(project, new Set(['evidenceState', 'healthy', 'graphCurrent', 'graphTruncated', 'graphStaleNodes', 'graphMissingNodes', 'worktreeClean', 'sourceFiles', 'workspaceCount'])), 'measurements.project shape is invalid');
    if (isObject(project)) {
      fail(validEnum(project.evidenceState, EVALUATION_EVIDENCE_STATES), 'project evidenceState is invalid');
      fail(typeof project.healthy === 'boolean', 'project healthy must be boolean');
      fail(typeof project.graphCurrent === 'boolean', 'project graphCurrent must be boolean');
      fail(typeof project.graphTruncated === 'boolean', 'project graphTruncated must be boolean');
      fail(Number.isInteger(project.graphStaleNodes) && project.graphStaleNodes >= 0, 'project graphStaleNodes must be non-negative integer');
      fail(Number.isInteger(project.graphMissingNodes) && project.graphMissingNodes >= 0, 'project graphMissingNodes must be non-negative integer');
      fail(nullableBoolean(project.worktreeClean), 'project worktreeClean must be boolean or null');
      fail(nullableNonNegativeInteger(project.sourceFiles), 'project sourceFiles must be non-negative integer or null');
      fail(Number.isInteger(project.workspaceCount) && project.workspaceCount >= 0, 'project workspaceCount must be non-negative integer');
    }

    const continuation = measurements.continuation;
    fail(hasOnlyKeys(continuation, new Set(['sessionPresent', 'outcome', 'sessionScopeCount', 'openFindingCount', 'recommendationCount', 'handoffPresent', 'nextActionPresent', 'nextActionPriority', 'nextActionEvidenceType', 'nextActionConfidence', 'guardrailCount', 'planningSignalCount'])), 'measurements.continuation shape is invalid');
    if (isObject(continuation)) {
      fail(typeof continuation.sessionPresent === 'boolean', 'continuation sessionPresent must be boolean');
      fail(nullableEnum(continuation.outcome, SESSION_OUTCOMES), 'continuation outcome is invalid');
      for (const key of ['sessionScopeCount', 'openFindingCount', 'recommendationCount', 'guardrailCount', 'planningSignalCount']) fail(Number.isInteger(continuation[key]) && continuation[key] >= 0, `continuation ${key} must be non-negative integer`);
      fail(typeof continuation.handoffPresent === 'boolean', 'continuation handoffPresent must be boolean');
      fail(typeof continuation.nextActionPresent === 'boolean', 'continuation nextActionPresent must be boolean');
      fail(nullableEnum(continuation.nextActionPriority, RECOMMENDATION_PRIORITIES), 'continuation nextActionPriority is invalid');
      fail(nullableEnum(continuation.nextActionEvidenceType, EVIDENCE_TYPES), 'continuation nextActionEvidenceType is invalid');
      fail(nullableEnum(continuation.nextActionConfidence, CONFIDENCE_LEVELS), 'continuation nextActionConfidence is invalid');
      if (!continuation.sessionPresent) fail(continuation.outcome === null && continuation.sessionScopeCount === 0 && !continuation.handoffPresent, 'session-absent continuation metrics must remain empty');
    }

    const history = measurements.changeHistory;
    fail(hasOnlyKeys(history, new Set(['completedRecords', 'consideredRecords', 'calibrationSamples', 'averagePathRecall', 'averagePathPrecision', 'averagePathF1', 'calibrationConfidence'])), 'measurements.changeHistory shape is invalid');
    if (isObject(history)) {
      for (const key of ['completedRecords', 'consideredRecords', 'calibrationSamples']) fail(Number.isInteger(history[key]) && history[key] >= 0, `changeHistory ${key} must be non-negative integer`);
      for (const key of ['averagePathRecall', 'averagePathPrecision', 'averagePathF1']) fail(nullableNumber(history[key]) && (history[key] === null || (history[key] >= 0 && history[key] <= 1)), `changeHistory ${key} must be null or 0..1`);
      fail(validEnum(history.calibrationConfidence, EVALUATION_CALIBRATION_CONFIDENCE), 'changeHistory calibrationConfidence is invalid');
    }
  }

  const stress = record.stress;
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
  fail(hasOnlyKeys(review, new Set(['provenance', 'reviewedAt', 'outcome', 'falsePositiveFindings', 'missedFindings', 'nextActionRating', 'handoffRating'])), 'review shape is invalid');
  if (isObject(review)) {
    fail(validEnum(review.provenance, EVALUATION_REVIEW_PROVENANCE), 'review provenance is invalid');
    fail(review.reviewedAt === null || validIso(review.reviewedAt), 'review reviewedAt must be null or ISO timestamp');
    fail(validEnum(review.outcome, EVALUATION_REVIEW_OUTCOMES), 'review outcome is invalid');
    fail(nullableNonNegativeInteger(review.falsePositiveFindings), 'review falsePositiveFindings must be non-negative integer or null');
    fail(nullableNonNegativeInteger(review.missedFindings), 'review missedFindings must be non-negative integer or null');
    fail(validEnum(review.nextActionRating, EVALUATION_UTILITY_RATINGS), 'review nextActionRating is invalid');
    fail(validEnum(review.handoffRating, EVALUATION_UTILITY_RATINGS), 'review handoffRating is invalid');
    if (review.outcome === 'unreviewed') {
      fail(review.provenance === 'unreviewed' && review.reviewedAt === null, 'unreviewed outcome requires unreviewed provenance and null reviewedAt');
      fail(review.falsePositiveFindings === null && review.missedFindings === null, 'unreviewed records cannot assert finding-error counts');
      fail(review.nextActionRating === 'unknown' && review.handoffRating === 'unknown', 'unreviewed records cannot assert usefulness ratings');
    } else {
      fail(['human', 'agent'].includes(review.provenance), 'reviewed outcome requires explicit human or agent provenance');
      fail(validIso(review.reviewedAt), 'reviewed outcome requires reviewedAt');
    }
  }

  fail(typeof record.policy === 'string' && record.policy.length > 20 && record.policy.length <= 1200, 'policy must be bounded explanatory text');
  return { valid: errors.length === 0, errors };
}
