from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(rel):
    return (ROOT / rel).read_text(encoding='utf-8')


def write(rel, text):
    path = ROOT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    if not text.endswith('\n'):
        text += '\n'
    path.write_text(text, encoding='utf-8')


def replace_once(rel, old, new):
    text = read(rel)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{rel}: expected one anchor, got {count}: {old[:80]!r}')
    write(rel, text.replace(old, new, 1))


write('src/evaluation-contracts.js', r'''import { SESSION_OUTCOMES, EVIDENCE_TYPES, RECOMMENDATION_PRIORITIES, CONFIDENCE_LEVELS } from './durable-contracts.js';

export const EVALUATION_SCHEMA_VERSION = 1;
export const EVALUATION_SOURCE_KINDS = ['external-real', 'self-host', 'synthetic'];
export const EVALUATION_PROTOCOL_KINDS = ['observational', 'controlled-stress'];
export const EVALUATION_REPOSITORY_CLASSES = ['application', 'service', 'library', 'cli-tool', 'tooling', 'monorepo', 'unknown'];
export const EVALUATION_TASK_KINDS = ['implementation', 'debugging', 'audit', 'review', 'research', 'verification', 'no-code-investigation', 'unknown'];
export const EVALUATION_REVIEW_OUTCOMES = ['pass', 'partial', 'fail', 'unreviewed'];
export const EVALUATION_REVIEW_PROVENANCE = ['human', 'agent', 'unreviewed'];
export const EVALUATION_UTILITY_RATINGS = ['useful', 'not-useful', 'unknown'];
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
  fail(hasOnlyKeys(record, new Set(['schemaVersion', 'id', 'recordedAt', 'subject', 'source', 'protocol', 'repository', 'task', 'measurements', 'review', 'policy'])), 'record has unsupported top-level fields');
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
''')

write('schemas/evaluation-record.schema.json', r'''{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/lenhonbp/codex-memory-intelligence/schemas/evaluation-record.schema.json",
  "title": "CMI Real-Repository Evaluation Record",
  "type": "object",
  "required": ["schemaVersion", "id", "recordedAt", "subject", "source", "protocol", "repository", "task", "measurements", "review", "policy"],
  "properties": {
    "schemaVersion": { "const": 1 },
    "id": { "type": "string", "format": "uuid" },
    "recordedAt": { "type": "string", "format": "date-time" },
    "subject": {
      "type": "object",
      "required": ["version", "sourceRevision"],
      "properties": {
        "version": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?$" },
        "sourceRevision": { "type": ["string", "null"], "pattern": "^[0-9a-f]{40}$" }
      },
      "additionalProperties": false
    },
    "source": {
      "type": "object",
      "required": ["kind", "independent"],
      "properties": {
        "kind": { "enum": ["external-real", "self-host", "synthetic"] },
        "independent": { "type": "boolean" }
      },
      "additionalProperties": false
    },
    "protocol": {
      "type": "object",
      "required": ["kind"],
      "properties": { "kind": { "enum": ["observational", "controlled-stress"] } },
      "additionalProperties": false
    },
    "repository": {
      "type": "object",
      "required": ["fingerprint", "fingerprintBasis", "class"],
      "properties": {
        "fingerprint": { "type": "string", "pattern": "^sha256:[0-9a-f]{64}$" },
        "fingerprintBasis": { "enum": ["git-origin-hash", "local-root-hash"] },
        "class": { "enum": ["application", "service", "library", "cli-tool", "tooling", "monorepo", "unknown"] }
      },
      "additionalProperties": false
    },
    "task": {
      "type": "object",
      "required": ["kind", "sessionId"],
      "properties": {
        "kind": { "enum": ["implementation", "debugging", "audit", "review", "research", "verification", "no-code-investigation", "unknown"] },
        "sessionId": { "type": ["string", "null"], "format": "uuid" }
      },
      "additionalProperties": false
    },
    "measurements": {
      "type": "object",
      "required": ["project", "continuation", "changeHistory"],
      "properties": {
        "project": {
          "type": "object",
          "required": ["evidenceState", "healthy", "graphCurrent", "graphTruncated", "graphStaleNodes", "graphMissingNodes", "worktreeClean", "sourceFiles", "workspaceCount"],
          "properties": {
            "evidenceState": { "enum": ["healthy", "degraded", "blocked", "uninitialized"] },
            "healthy": { "type": "boolean" },
            "graphCurrent": { "type": "boolean" },
            "graphTruncated": { "type": "boolean" },
            "graphStaleNodes": { "type": "integer", "minimum": 0 },
            "graphMissingNodes": { "type": "integer", "minimum": 0 },
            "worktreeClean": { "type": ["boolean", "null"] },
            "sourceFiles": { "type": ["integer", "null"], "minimum": 0 },
            "workspaceCount": { "type": "integer", "minimum": 0 }
          },
          "additionalProperties": false
        },
        "continuation": {
          "type": "object",
          "required": ["sessionPresent", "outcome", "sessionScopeCount", "openFindingCount", "recommendationCount", "handoffPresent", "nextActionPresent", "nextActionPriority", "nextActionEvidenceType", "nextActionConfidence", "guardrailCount", "planningSignalCount"],
          "properties": {
            "sessionPresent": { "type": "boolean" },
            "outcome": { "type": ["string", "null"], "enum": ["succeeded", "partial", "blocked", "investigated", "abandoned", "unknown", null] },
            "sessionScopeCount": { "type": "integer", "minimum": 0 },
            "openFindingCount": { "type": "integer", "minimum": 0 },
            "recommendationCount": { "type": "integer", "minimum": 0 },
            "handoffPresent": { "type": "boolean" },
            "nextActionPresent": { "type": "boolean" },
            "nextActionPriority": { "type": ["string", "null"], "enum": ["P0", "P1", "P2", "P3", null] },
            "nextActionEvidenceType": { "type": ["string", "null"], "enum": ["observed", "reviewed", "historical-correlation", "inferred", null] },
            "nextActionConfidence": { "type": ["string", "null"], "enum": ["high", "medium", "low", null] },
            "guardrailCount": { "type": "integer", "minimum": 0 },
            "planningSignalCount": { "type": "integer", "minimum": 0 }
          },
          "additionalProperties": false
        },
        "changeHistory": {
          "type": "object",
          "required": ["completedRecords", "consideredRecords", "calibrationSamples", "averagePathRecall", "averagePathPrecision", "averagePathF1", "calibrationConfidence"],
          "properties": {
            "completedRecords": { "type": "integer", "minimum": 0 },
            "consideredRecords": { "type": "integer", "minimum": 0 },
            "calibrationSamples": { "type": "integer", "minimum": 0 },
            "averagePathRecall": { "type": ["number", "null"], "minimum": 0, "maximum": 1 },
            "averagePathPrecision": { "type": ["number", "null"], "minimum": 0, "maximum": 1 },
            "averagePathF1": { "type": ["number", "null"], "minimum": 0, "maximum": 1 },
            "calibrationConfidence": { "enum": ["high", "medium", "low", "insufficient-evidence"] }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    },
    "review": {
      "type": "object",
      "required": ["provenance", "reviewedAt", "outcome", "falsePositiveFindings", "missedFindings", "nextActionRating", "handoffRating"],
      "properties": {
        "provenance": { "enum": ["human", "agent", "unreviewed"] },
        "reviewedAt": { "type": ["string", "null"], "format": "date-time" },
        "outcome": { "enum": ["pass", "partial", "fail", "unreviewed"] },
        "falsePositiveFindings": { "type": ["integer", "null"], "minimum": 0 },
        "missedFindings": { "type": ["integer", "null"], "minimum": 0 },
        "nextActionRating": { "enum": ["useful", "not-useful", "unknown"] },
        "handoffRating": { "enum": ["useful", "not-useful", "unknown"] }
      },
      "additionalProperties": false
    },
    "policy": { "type": "string", "minLength": 20, "maxLength": 1200 }
  },
  "additionalProperties": false
}
''')

replace_once('src/evaluation.js',
"import path from 'node:path';\n",
"import path from 'node:path';\nimport { fileURLToPath } from 'node:url';\n")
replace_once('src/evaluation.js',
"import { status as getProjectStatus } from './core.js';\n",
"import { status as getProjectStatus } from './core.js';\nimport { VERSION } from './version.js';\n")
replace_once('src/evaluation.js',
"  EVALUATION_SOURCE_KINDS,\n  EVALUATION_REPOSITORY_CLASSES,\n",
"  EVALUATION_SOURCE_KINDS,\n  EVALUATION_PROTOCOL_KINDS,\n  EVALUATION_REPOSITORY_CLASSES,\n")
replace_once('src/evaluation.js',
"  EVALUATION_REVIEW_OUTCOMES,\n  EVALUATION_UTILITY_RATINGS,\n",
"  EVALUATION_REVIEW_OUTCOMES,\n  EVALUATION_REVIEW_PROVENANCE,\n  EVALUATION_UTILITY_RATINGS,\n")
replace_once('src/evaluation.js',
"const MAX_RECORD_BYTES = 1_000_000;\n",
"const MAX_RECORD_BYTES = 1_000_000;\nconst CMI_SOURCE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');\n")
replace_once('src/evaluation.js',
"async function repositoryIdentity(root) {\n  const origin = await runGit(root, ['config', '--get', 'remote.origin.url']);\n  const basis = origin ? 'git-origin-hash' : 'local-root-hash';\n  const secretInput = origin || path.resolve(root);\n  const digest = crypto.createHash('sha256').update(`${basis}\\0${secretInput}`).digest('hex');\n  return { fingerprint: `sha256:${digest}`, fingerprintBasis: basis };\n}\n",
"async function repositoryIdentity(root) {\n  const origin = await runGit(root, ['config', '--get', 'remote.origin.url']);\n  const basis = origin ? 'git-origin-hash' : 'local-root-hash';\n  const secretInput = origin || path.resolve(root);\n  const digest = crypto.createHash('sha256').update(`${basis}\\0${secretInput}`).digest('hex');\n  return { fingerprint: `sha256:${digest}`, fingerprintBasis: basis };\n}\nasync function evaluationSubject() {\n  const revision = await runGit(CMI_SOURCE_ROOT, ['rev-parse', 'HEAD']);\n  return { version: VERSION, sourceRevision: /^[0-9a-f]{40}$/i.test(revision) ? revision.toLowerCase() : null };\n}\n")

old_review = """function normalizeReview(options) {\n  const outcome = normalizeEnum(options.reviewOutcome, EVALUATION_REVIEW_OUTCOMES, 'Review outcome', 'unreviewed');\n  const falsePositiveFindings = normalizeOptionalCount(options.falsePositiveFindings, 'False-positive finding count');\n  const missedFindings = normalizeOptionalCount(options.missedFindings, 'Missed finding count');\n  const nextActionRating = normalizeEnum(options.nextActionRating, EVALUATION_UTILITY_RATINGS, 'Next-action rating', 'unknown');\n  const handoffRating = normalizeEnum(options.handoffRating, EVALUATION_UTILITY_RATINGS, 'Handoff rating', 'unknown');\n  if (outcome === 'unreviewed' && (falsePositiveFindings !== null || missedFindings !== null || nextActionRating !== 'unknown' || handoffRating !== 'unknown')) {\n    throw new Error('Use a reviewed outcome before recording finding-error counts or usefulness ratings.');\n  }\n  return { outcome, falsePositiveFindings, missedFindings, nextActionRating, handoffRating };\n}\n"""
new_review = """function normalizeReview(options) {\n  const outcome = normalizeEnum(options.reviewOutcome, EVALUATION_REVIEW_OUTCOMES, 'Review outcome', 'unreviewed');\n  const provenance = normalizeEnum(options.reviewProvenance, EVALUATION_REVIEW_PROVENANCE, 'Review provenance', 'unreviewed');\n  const falsePositiveFindings = normalizeOptionalCount(options.falsePositiveFindings, 'False-positive finding count');\n  const missedFindings = normalizeOptionalCount(options.missedFindings, 'Missed finding count');\n  const nextActionRating = normalizeEnum(options.nextActionRating, EVALUATION_UTILITY_RATINGS, 'Next-action rating', 'unknown');\n  const handoffRating = normalizeEnum(options.handoffRating, EVALUATION_UTILITY_RATINGS, 'Handoff rating', 'unknown');\n  const carriesJudgment = falsePositiveFindings !== null || missedFindings !== null || nextActionRating !== 'unknown' || handoffRating !== 'unknown';\n  if (outcome === 'unreviewed') {\n    if (provenance !== 'unreviewed' || carriesJudgment) throw new Error('Unreviewed evaluation cannot assert reviewer provenance, finding-error counts, or usefulness ratings.');\n    return { provenance: 'unreviewed', reviewedAt: null, outcome, falsePositiveFindings: null, missedFindings: null, nextActionRating: 'unknown', handoffRating: 'unknown' };\n  }\n  if (!['human', 'agent'].includes(provenance)) throw new Error('Reviewed evaluation requires --review-provenance human or agent.');\n  return { provenance, reviewedAt: nowIso(), outcome, falsePositiveFindings, missedFindings, nextActionRating, handoffRating };\n}\n"""
replace_once('src/evaluation.js', old_review, new_review)
replace_once('src/evaluation.js',
"  const sourceKind = normalizeEnum(options.sourceKind, EVALUATION_SOURCE_KINDS, 'Evaluation source kind');\n  const repositoryClass = normalizeEnum(options.repositoryClass, EVALUATION_REPOSITORY_CLASSES, 'Repository class', 'unknown');\n",
"  const sourceKind = normalizeEnum(options.sourceKind, EVALUATION_SOURCE_KINDS, 'Evaluation source kind');\n  const protocolKind = normalizeEnum(options.protocolKind, EVALUATION_PROTOCOL_KINDS, 'Evaluation protocol', 'observational');\n  const repositoryClass = normalizeEnum(options.repositoryClass, EVALUATION_REPOSITORY_CLASSES, 'Repository class', 'unknown');\n")
replace_once('src/evaluation.js',
"  const [{ session, handoff }, findings, history, baseline, identity] = await Promise.all([\n",
"  const [{ session, handoff }, findings, history, baseline, identity, subject] = await Promise.all([\n")
replace_once('src/evaluation.js',
"    repositoryIdentity(root),\n  ]);\n",
"    repositoryIdentity(root),\n    evaluationSubject(),\n  ]);\n")
replace_once('src/evaluation.js',
"    recordedAt: nowIso(),\n    source: { kind: sourceKind, independent: sourceKind === 'external-real' },\n    repository: { ...identity, class: repositoryClass },\n",
"    recordedAt: nowIso(),\n    subject,\n    source: { kind: sourceKind, independent: sourceKind === 'external-real' },\n    protocol: { kind: protocolKind },\n    repository: { ...identity, class: repositoryClass },\n")
replace_once('src/evaluation.js',
"    policy: 'Evaluation records are anonymized descriptive evidence. external-real is the only independent-repository class; self-host and synthetic evidence remain separate. CMI does not infer production readiness, causal correctness, or usefulness from an unreviewed or undersized corpus.',\n",
"    policy: 'Evaluation records are anonymized descriptive evidence tied to a CMI version/source revision when available. external-real is the only independent-repository class; observational and controlled-stress protocols remain distinguishable; human and agent reviews remain separate. CMI does not infer production readiness, causal correctness, or usefulness from an unreviewed or undersized corpus.',\n")
replace_once('src/evaluation.js',
"      id: record.id, recordedAt: record.recordedAt, sourceKind: record.source.kind,\n      repositoryFingerprint: record.repository.fingerprint, repositoryClass: record.repository.class,\n      taskKind: record.task.kind, reviewOutcome: record.review.outcome,\n",
"      id: record.id, recordedAt: record.recordedAt, subjectVersion: record.subject.version, sourceRevision: record.subject.sourceRevision,\n      sourceKind: record.source.kind, protocolKind: record.protocol.kind,\n      repositoryFingerprint: record.repository.fingerprint, repositoryClass: record.repository.class,\n      taskKind: record.task.kind, reviewOutcome: record.review.outcome, reviewProvenance: record.review.provenance,\n")

text = read('src/evaluation.js')
start = text.index('export async function buildEvaluationReport')
end = text.index('export function formatEvaluationRecord')
new_report = r'''function reviewedMetrics(records) {
  const nextActionRated = records.filter((record) => record.review.nextActionRating !== 'unknown');
  const handoffRated = records.filter((record) => record.review.handoffRating !== 'unknown');
  const falsePositiveCounts = records.map((record) => record.review.falsePositiveFindings).filter(Number.isInteger);
  const missedCounts = records.map((record) => record.review.missedFindings).filter(Number.isInteger);
  return {
    records: records.length,
    nextActionRatedRecords: nextActionRated.length,
    nextActionUsefulRate: rate(nextActionRated.filter((record) => record.review.nextActionRating === 'useful').length, nextActionRated.length),
    handoffRatedRecords: handoffRated.length,
    handoffUsefulRate: rate(handoffRated.filter((record) => record.review.handoffRating === 'useful').length, handoffRated.length),
    falsePositiveFindingsObserved: falsePositiveCounts.length ? falsePositiveCounts.reduce((sum, value) => sum + value, 0) : null,
    missedFindingsObserved: missedCounts.length ? missedCounts.reduce((sum, value) => sum + value, 0) : null,
  };
}

export async function buildEvaluationReport(root, options = {}) {
  const { records, invalidRecords, truncated } = await readEvaluationRecords(root);
  const sourceKind = options.sourceKind ? normalizeEnum(options.sourceKind, EVALUATION_SOURCE_KINDS, 'Evaluation source kind') : null;
  const selected = records.filter((record) => !sourceKind || record.source.kind === sourceKind);
  const external = selected.filter((record) => record.source.kind === 'external-real');
  const observationalExternal = external.filter((record) => record.protocol.kind === 'observational');
  const controlledStressExternal = external.filter((record) => record.protocol.kind === 'controlled-stress');
  const reviewedExternal = observationalExternal.filter((record) => record.review.outcome !== 'unreviewed');
  const humanReviewed = reviewedExternal.filter((record) => record.review.provenance === 'human');
  const agentReviewed = reviewedExternal.filter((record) => record.review.provenance === 'agent');
  const externalWithSession = observationalExternal.filter((record) => record.measurements.continuation.sessionPresent);
  return {
    schemaVersion: 1,
    generatedAt: nowIso(),
    filter: { sourceKind },
    corpus: {
      totalRecords: selected.length,
      invalidRecords,
      truncated,
      sourceKinds: countBy(selected, (record) => record.source.kind),
      subjectVersions: countBy(selected, (record) => record.subject.version),
      sourceRevisionsPresent: selected.filter((record) => Boolean(record.subject.sourceRevision)).length,
      uniqueRepositories: uniqueCount(selected, (record) => record.repository.fingerprint),
      externalReal: {
        records: external.length,
        observationalRecords: observationalExternal.length,
        controlledStressRecords: controlledStressExternal.length,
        uniqueRepositories: uniqueCount(external, (record) => record.repository.fingerprint),
        observationalUniqueRepositories: uniqueCount(observationalExternal, (record) => record.repository.fingerprint),
        repositoryClasses: countBy(external, (record) => record.repository.class),
        taskKinds: countBy(external, (record) => record.task.kind),
        protocols: countBy(external, (record) => record.protocol.kind),
      },
    },
    coverage: {
      state: coverageState(selected, observationalExternal),
      hasExternalRealEvidence: external.length > 0,
      hasObservationalExternalEvidence: observationalExternal.length > 0,
      hasControlledStressEvidence: controlledStressExternal.length > 0,
      hasMultipleExternalRepositories: uniqueCount(observationalExternal, (record) => record.repository.fingerprint) >= 2,
      hasMultipleExternalTaskKinds: uniqueCount(observationalExternal, (record) => record.task.kind) >= 2,
      hasReviewedExternalEvidence: reviewedExternal.length > 0,
      hasHumanReviewedExternalEvidence: humanReviewed.length > 0,
    },
    observedMetrics: {
      observationalProjectHealthyRate: rate(observationalExternal.filter((record) => record.measurements.project.healthy).length, observationalExternal.length),
      observationalHandoffPresenceRate: rate(externalWithSession.filter((record) => record.measurements.continuation.handoffPresent).length, externalWithSession.length),
      observationalNextActionPresenceRate: rate(externalWithSession.filter((record) => record.measurements.continuation.nextActionPresent).length, externalWithSession.length),
      observationalAverageOpenFindings: average(observationalExternal.map((record) => record.measurements.continuation.openFindingCount)),
      observationalAverageCalibrationSamples: average(observationalExternal.map((record) => record.measurements.changeHistory.calibrationSamples)),
    },
    reviewedUsefulness: {
      reviewedExternalRecords: reviewedExternal.length,
      provenance: { human: humanReviewed.length, agent: agentReviewed.length },
      human: reviewedMetrics(humanReviewed),
      agent: reviewedMetrics(agentReviewed),
    },
    limitations: [
      'external-real records are descriptive independent-repository evidence; self-host and synthetic records never contribute to independent-repository counts.',
      'Coverage state is based on observational external-real runs; controlled-stress runs are reported separately and cannot inflate ordinary field-coverage state.',
      'A multi-repository corpus is coverage evidence, not automatic proof of production readiness or causal correctness.',
      'Human-reviewed and agent-reviewed usefulness metrics remain separate; unreviewed records never contribute to usefulness rates.',
      'Repository fingerprints are one-way hashes for grouping runs; raw repository names, remotes, absolute paths, session goals, findings text, and recommendation text are not stored in evaluation records.',
      'Subject sourceRevision is recorded when CMI runs from a Git checkout; packaged installations may report only the semantic version.',
      'Evaluation aggregation does not recalibrate Behavioral Change Intelligence thresholds automatically.',
    ],
    policy: 'CMI reports what the retained corpus supports and keeps source classes, protocols, and reviewer provenance separate. It does not declare v1.0 readiness, production validity, or empirical calibration complete from a small or unreviewed corpus.',
  };
}

'''
write('src/evaluation.js', text[:start] + new_report + text[end:])

replace_once('src/evaluation.js',
"  return `# CMI evaluation ${record.id.slice(0, 12)}\\n\\n- Source: ${record.source.kind}${record.source.independent ? ' · independent repository evidence' : ''}\\n- Repository class: ${record.repository.class}\\n- Task kind: ${record.task.kind}\\n- Evidence health: ${record.measurements.project.evidenceState}\\n- Session outcome: ${record.measurements.continuation.outcome || 'none'}\\n- Open findings: ${record.measurements.continuation.openFindingCount}\\n- Next action: ${record.measurements.continuation.nextActionPresent ? record.measurements.continuation.nextActionPriority : 'none'}\\n- Review: ${record.review.outcome}\\n\\n${record.policy}`;\n",
"  return `# CMI evaluation ${record.id.slice(0, 12)}\\n\\n- CMI: ${record.subject.version}${record.subject.sourceRevision ? ` · ${record.subject.sourceRevision.slice(0, 12)}` : ''}\\n- Source: ${record.source.kind}${record.source.independent ? ' · independent repository evidence' : ''}\\n- Protocol: ${record.protocol.kind}\\n- Repository class: ${record.repository.class}\\n- Task kind: ${record.task.kind}\\n- Evidence health: ${record.measurements.project.evidenceState}\\n- Session outcome: ${record.measurements.continuation.outcome || 'none'}\\n- Open findings: ${record.measurements.continuation.openFindingCount}\\n- Next action: ${record.measurements.continuation.nextActionPresent ? record.measurements.continuation.nextActionPriority : 'none'}\\n- Review: ${record.review.outcome} · ${record.review.provenance}\\n\\n${record.policy}`;\n")
replace_once('src/evaluation.js',
"  return result.records.map((item) => `- ${item.id.slice(0, 12)} · ${item.sourceKind} · ${item.repositoryClass}/${item.taskKind} · ${item.evidenceState} · review ${item.reviewOutcome}`).join('\\n');\n",
"  return result.records.map((item) => `- ${item.id.slice(0, 12)} · CMI ${item.subjectVersion} · ${item.sourceKind}/${item.protocolKind} · ${item.repositoryClass}/${item.taskKind} · ${item.evidenceState} · review ${item.reviewOutcome}/${item.reviewProvenance}`).join('\\n');\n")
text = read('src/evaluation.js')
old_fmt = """export function formatEvaluationReport(report) {\n  const external = report.corpus.externalReal;\n  const usefulness = report.reviewedUsefulness;\n  return `# CMI real-repository evaluation\\n\\nCoverage: ${report.coverage.state}\\nRecords: ${report.corpus.totalRecords} · external-real ${external.records} · independent repositories ${external.uniqueRepositories}\\nRepository classes: ${Object.keys(external.repositoryClasses).length} · task kinds: ${Object.keys(external.taskKinds).length}\\nReviewed external records: ${usefulness.reviewedExternalRecords}\\nNext-action useful rate: ${usefulness.nextActionUsefulRate ?? 'n/a'}\\nHandoff useful rate: ${usefulness.handoffUsefulRate ?? 'n/a'}\\nExternal project healthy rate: ${report.observedMetrics.externalProjectHealthyRate ?? 'n/a'}\\nExternal handoff presence rate: ${report.observedMetrics.externalHandoffPresenceRate ?? 'n/a'}\\n\\n## Evidence limits\\n${report.limitations.map((item) => `- ${item}`).join('\\n')}\\n\\n${report.policy}`;\n}\n"""
new_fmt = """export function formatEvaluationReport(report) {\n  const external = report.corpus.externalReal;\n  const usefulness = report.reviewedUsefulness;\n  return `# CMI real-repository evaluation\\n\\nCoverage: ${report.coverage.state}\\nRecords: ${report.corpus.totalRecords} · external-real ${external.records} · observational ${external.observationalRecords} · controlled-stress ${external.controlledStressRecords}\\nIndependent repositories: ${external.uniqueRepositories} · observational repositories ${external.observationalUniqueRepositories}\\nRepository classes: ${Object.keys(external.repositoryClasses).length} · task kinds: ${Object.keys(external.taskKinds).length}\\nReviewed observational external records: ${usefulness.reviewedExternalRecords} · human ${usefulness.provenance.human} · agent ${usefulness.provenance.agent}\\nHuman next-action useful rate: ${usefulness.human.nextActionUsefulRate ?? 'n/a'}\\nHuman handoff useful rate: ${usefulness.human.handoffUsefulRate ?? 'n/a'}\\nAgent next-action useful rate: ${usefulness.agent.nextActionUsefulRate ?? 'n/a'}\\nObservational project healthy rate: ${report.observedMetrics.observationalProjectHealthyRate ?? 'n/a'}\\nObservational handoff presence rate: ${report.observedMetrics.observationalHandoffPresenceRate ?? 'n/a'}\\n\\n## Evidence limits\\n${report.limitations.map((item) => `- ${item}`).join('\\n')}\\n\\n${report.policy}`;\n}\n"""
replace_once('src/evaluation.js', old_fmt, new_fmt)

replace_once('src/cli-entry.js',
"    sourceKind: optionValues('--source-kind')[0],\n    repositoryClass: optionValues('--repository-class')[0],\n",
"    sourceKind: optionValues('--source-kind')[0],\n    protocolKind: optionValues('--protocol')[0],\n    repositoryClass: optionValues('--repository-class')[0],\n")
replace_once('src/cli-entry.js',
"    reviewOutcome: optionValues('--review-outcome')[0],\n    falsePositiveFindings: optionValues('--false-positive-findings')[0],\n",
"    reviewOutcome: optionValues('--review-outcome')[0],\n    reviewProvenance: optionValues('--review-provenance')[0],\n    falsePositiveFindings: optionValues('--false-positive-findings')[0],\n")
replace_once('src/cli-entry.js',
"    const values = positional(['--source-kind','--repository-class','--task-kind','--session','--review-outcome','--false-positive-findings','--missed-findings','--next-action-rating','--handoff-rating','--limit']);\n",
"    const values = positional(['--source-kind','--protocol','--repository-class','--task-kind','--session','--review-outcome','--review-provenance','--false-positive-findings','--missed-findings','--next-action-rating','--handoff-rating','--limit']);\n")
replace_once('src/cli-entry.js',
"      if (!optionValues('--source-kind')[0]) throw new Error('Usage: cmi evaluate capture --source-kind <external-real|self-host|synthetic> [--repository-class class] [--task-kind kind] [--session latest|none|id]');\n",
"      if (!optionValues('--source-kind')[0]) throw new Error('Usage: cmi evaluate capture --source-kind <external-real|self-host|synthetic> [--protocol observational|controlled-stress] [--repository-class class] [--task-kind kind] [--session latest|none|id]');\n")

replace_once('scripts/quality.js',
"import { EVALUATION_SCHEMA_VERSION, EVALUATION_SOURCE_KINDS, EVALUATION_REPOSITORY_CLASSES, EVALUATION_TASK_KINDS, EVALUATION_REVIEW_OUTCOMES, EVALUATION_UTILITY_RATINGS } from '../src/evaluation-contracts.js';\n",
"import { EVALUATION_SCHEMA_VERSION, EVALUATION_SOURCE_KINDS, EVALUATION_PROTOCOL_KINDS, EVALUATION_REPOSITORY_CLASSES, EVALUATION_TASK_KINDS, EVALUATION_REVIEW_OUTCOMES, EVALUATION_REVIEW_PROVENANCE, EVALUATION_UTILITY_RATINGS } from '../src/evaluation-contracts.js';\n")
replace_once('scripts/quality.js',
"  if (!sameValues(evaluation.properties?.source?.properties?.kind?.enum, EVALUATION_SOURCE_KINDS)) errors.push('evaluation source kinds differ from runtime contract');\n",
"  if (!sameValues(evaluation.properties?.source?.properties?.kind?.enum, EVALUATION_SOURCE_KINDS)) errors.push('evaluation source kinds differ from runtime contract');\n  if (!sameValues(evaluation.properties?.protocol?.properties?.kind?.enum, EVALUATION_PROTOCOL_KINDS)) errors.push('evaluation protocol kinds differ from runtime contract');\n  if (evaluation.properties?.subject?.properties?.sourceRevision?.pattern !== '^[0-9a-f]{40}$') errors.push('evaluation subject revision schema differs from runtime contract');\n")
replace_once('scripts/quality.js',
"  if (!sameValues(evaluation.properties?.review?.properties?.outcome?.enum, EVALUATION_REVIEW_OUTCOMES)) errors.push('evaluation review outcomes differ from runtime contract');\n",
"  if (!sameValues(evaluation.properties?.review?.properties?.outcome?.enum, EVALUATION_REVIEW_OUTCOMES)) errors.push('evaluation review outcomes differ from runtime contract');\n  if (!sameValues(evaluation.properties?.review?.properties?.provenance?.enum, EVALUATION_REVIEW_PROVENANCE)) errors.push('evaluation review provenance differs from runtime contract');\n")

write('tests/evaluation.test.js', r'''import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { scanProject } from '../src/core.js';
import { startSession, closeSession } from '../src/session-intelligence.js';
import { captureEvaluation, listEvaluations, buildEvaluationReport, validateEvaluationRecord } from '../src/evaluation.js';

async function projectFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-evaluation-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'anonymous-evaluation-fixture', type: 'module' }));
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'src', 'index.js'), 'export const value = 1;\n');
  await fs.writeFile(path.join(root, 'ROADMAP.md'), '# Next\n\n- [ ] Review the next evidence-backed task.\n');
  await scanProject(root);
  return root;
}
async function closeAuditSession(root) {
  const session = await startSession(root, 'private evaluation goal that must not enter the retained evaluation record');
  return closeSession(root, session.id, { outcome: 'investigated', accomplished: ['Reviewed project state without product edits.'] });
}

test('evaluation capture stores bounded anonymized evidence tied to the CMI subject revision', async () => {
  const root = await projectFixture();
  const closed = await closeAuditSession(root);
  const record = await captureEvaluation(root, { sourceKind: 'self-host', repositoryClass: 'cli-tool', taskKind: 'audit', session: closed.id });
  assert.equal(record.schemaVersion, 1);
  assert.match(record.subject.version, /^\d+\.\d+\.\d+/);
  assert.ok(record.subject.sourceRevision === null || /^[0-9a-f]{40}$/.test(record.subject.sourceRevision));
  assert.equal(record.source.kind, 'self-host');
  assert.equal(record.source.independent, false);
  assert.equal(record.protocol.kind, 'observational');
  assert.equal(record.review.provenance, 'unreviewed');
  assert.equal(record.review.reviewedAt, null);
  assert.equal(record.task.sessionId, closed.id);
  assert.match(record.repository.fingerprint, /^sha256:[0-9a-f]{64}$/);
  assert.equal(validateEvaluationRecord(record), true);
  const serialized = JSON.stringify(record);
  assert.doesNotMatch(serialized, /private evaluation goal/i);
  assert.doesNotMatch(serialized, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(serialized, /anonymous-evaluation-fixture/);
});

test('evaluation report never counts self-host or synthetic records as external-real evidence', async () => {
  const root = await projectFixture();
  await captureEvaluation(root, { sourceKind: 'self-host', repositoryClass: 'tooling', taskKind: 'audit', session: 'none' });
  await captureEvaluation(root, { sourceKind: 'synthetic', repositoryClass: 'application', taskKind: 'verification', session: 'none' });
  const report = await buildEvaluationReport(root);
  assert.equal(report.corpus.totalRecords, 2);
  assert.equal(report.corpus.externalReal.records, 0);
  assert.equal(report.coverage.hasExternalRealEvidence, false);
  assert.equal(report.coverage.state, 'self-host-only');
  assert.equal(Object.hasOwn(report, 'productionValidated'), false);
});

test('review usefulness requires explicit reviewer provenance and keeps human and agent metrics separate', async () => {
  const root = await projectFixture();
  await closeAuditSession(root);
  await assert.rejects(() => captureEvaluation(root, {
    sourceKind: 'external-real', repositoryClass: 'application', taskKind: 'audit', reviewOutcome: 'pass', nextActionRating: 'useful',
  }), /review-provenance human or agent/i);
  await captureEvaluation(root, {
    sourceKind: 'external-real', repositoryClass: 'application', taskKind: 'audit',
    reviewOutcome: 'pass', reviewProvenance: 'human', falsePositiveFindings: 0, missedFindings: 0,
    nextActionRating: 'useful', handoffRating: 'useful',
  });
  await captureEvaluation(root, {
    sourceKind: 'external-real', repositoryClass: 'application', taskKind: 'audit', session: 'none',
    reviewOutcome: 'partial', reviewProvenance: 'agent', falsePositiveFindings: 1, missedFindings: 0,
    nextActionRating: 'not-useful', handoffRating: 'unknown',
  });
  const report = await buildEvaluationReport(root);
  assert.equal(report.coverage.state, 'external-single-repository');
  assert.equal(report.reviewedUsefulness.reviewedExternalRecords, 2);
  assert.equal(report.reviewedUsefulness.provenance.human, 1);
  assert.equal(report.reviewedUsefulness.provenance.agent, 1);
  assert.equal(report.reviewedUsefulness.human.nextActionUsefulRate, 1);
  assert.equal(report.reviewedUsefulness.agent.nextActionUsefulRate, 0);
  assert.match(report.policy, /reviewer provenance separate/i);
});

test('controlled stress on an external repository does not inflate observational field coverage', async () => {
  const root = await projectFixture();
  await captureEvaluation(root, { sourceKind: 'external-real', protocolKind: 'controlled-stress', repositoryClass: 'library', taskKind: 'verification', session: 'none' });
  const report = await buildEvaluationReport(root);
  assert.equal(report.corpus.externalReal.records, 1);
  assert.equal(report.corpus.externalReal.controlledStressRecords, 1);
  assert.equal(report.corpus.externalReal.observationalRecords, 0);
  assert.equal(report.coverage.hasExternalRealEvidence, true);
  assert.equal(report.coverage.hasControlledStressEvidence, true);
  assert.equal(report.coverage.hasObservationalExternalEvidence, false);
  assert.equal(report.coverage.state, 'none');
});

test('invalid durable evaluation records are ignored and counted', async () => {
  const root = await projectFixture();
  const valid = await captureEvaluation(root, { sourceKind: 'synthetic', repositoryClass: 'unknown', taskKind: 'unknown', session: 'none' });
  await fs.writeFile(path.join(root, '.codex-memory', 'evaluations', '00000000-0000-4000-8000-000000000000.json'), '{"schemaVersion":1,"id":"bad"}\n');
  const listed = await listEvaluations(root);
  assert.equal(listed.records.length, 1);
  assert.equal(listed.records[0].id, valid.id);
  assert.equal(listed.invalidRecords, 1);
});

test('CLI exposes evaluation protocol and reviewer provenance contracts', async () => {
  const cli = path.resolve('src/cli-entry.js');
  const help = spawnSync(process.execPath, [cli, 'evaluate', '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /evaluate <capture\|list\|show\|report>/i);
  assert.match(help.stdout, /external-real/i);
  const top = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8' });
  assert.equal(top.status, 0, top.stderr);
  assert.match(top.stdout, /cmi evaluate/);
});
''')

replace_once('README.md',
"cmi evaluate capture --source-kind <external-real|self-host|synthetic> [--repository-class class] [--task-kind kind] [--session latest|none|id] [--review-outcome pass|partial|fail|unreviewed] [--false-positive-findings N] [--missed-findings N] [--next-action-rating useful|not-useful|unknown] [--handoff-rating useful|not-useful|unknown] [--json]\n",
"cmi evaluate capture --source-kind <external-real|self-host|synthetic> [--protocol observational|controlled-stress] [--repository-class class] [--task-kind kind] [--session latest|none|id] [--review-outcome pass|partial|fail|unreviewed] [--review-provenance human|agent|unreviewed] [--false-positive-findings N] [--missed-findings N] [--next-action-rating useful|not-useful|unknown] [--handoff-rating useful|not-useful|unknown] [--json]\n")
replace_once('README.md',
"Only `external-real` contributes to independent-repository counts. `self-host` and `synthetic` remain useful evidence classes but cannot silently inflate real-world coverage. Evaluation records store a one-way repository fingerprint and bounded measurements, not repository names, remotes, absolute paths, session/finding/recommendation text, source contents, or diffs. Reviewed usefulness metrics require explicit review metadata and the report never declares production or v1.0 readiness automatically. See [Real-Repository Evaluation](docs/EVALUATION.md).\n",
"Only `external-real` contributes to independent-repository counts. Observational runs drive ordinary field-coverage state, while `controlled-stress` remains visible but cannot inflate that state. `self-host` and `synthetic` cannot silently inflate real-world coverage. Evaluation records bind measurements to the CMI semantic version and, when available, exact source revision; they store a one-way repository fingerprint rather than repository names, remotes, absolute paths, session/finding/recommendation text, source contents, or diffs. Human and agent review provenance is explicit and aggregated separately, and the report never declares production or v1.0 readiness automatically. See [Real-Repository Evaluation](docs/EVALUATION.md).\n")

replace_once('docs/EVALUATION.md',
"There is no automatic promotion between these classes.\n",
"There is no automatic promotion between these classes. Each record also carries a protocol: `observational` for ordinary field use or `controlled-stress` for deliberately induced edge cases. Controlled-stress records are visible in reports but do not inflate ordinary observational coverage.\n")
replace_once('docs/EVALUATION.md',
"Review metadata is explicit and optional. An unreviewed record cannot assert usefulness or false-positive/missed-finding counts:\n",
"Review metadata is explicit and optional. An unreviewed record cannot assert usefulness or false-positive/missed-finding counts. A reviewed record must also declare whether the reviewer was a `human` or an `agent`; those metrics are aggregated separately:\n")
replace_once('docs/EVALUATION.md',
"  --review-outcome partial \\\n  --false-positive-findings 0 \\\n",
"  --review-outcome partial \\\n  --review-provenance human \\\n  --false-positive-findings 0 \\\n")
replace_once('docs/EVALUATION.md',
"Runs are grouped using a one-way SHA-256 repository fingerprint derived from the Git origin when available, otherwise from the local root. The digest is useful for grouping repeated runs but is not a security boundary or an anonymization guarantee against an attacker who already knows the candidate repository identity.\n",
"Runs are grouped using a one-way SHA-256 repository fingerprint derived from the Git origin when available, otherwise from the local root. The digest is useful for grouping repeated runs but is not a security boundary or an anonymization guarantee against an attacker who already knows the candidate repository identity. Every record also stores the CMI semantic version and, when CMI is running from a Git checkout, its exact source revision so evidence from different candidates is not silently mixed.\n")
replace_once('docs/EVALUATION.md',
"Usefulness rates are reported only from explicitly reviewed `external-real` records. Behavioral confidence thresholds are not recalibrated automatically from evaluation data.\n",
"Usefulness rates are reported only from explicitly reviewed observational `external-real` records. Human-reviewed and agent-reviewed rates remain separate. Behavioral confidence thresholds are not recalibrated automatically from evaluation data.\n")

replace_once('CHANGELOG.md',
"- Descriptive corpus coverage states and reviewed usefulness metrics that never count self-host/synthetic runs as independent real-repository evidence or automatically declare production/v1.0 readiness.\n",
"- Descriptive corpus coverage states and reviewed usefulness metrics that never count self-host/synthetic runs as independent real-repository evidence or automatically declare production/v1.0 readiness.\n- Evaluation subject provenance (CMI version + source revision when available), observational vs controlled-stress protocol classification, and explicit human vs agent review provenance so field coverage and usefulness evidence cannot be silently mixed.\n")

replace_once('ROADMAP.md',
"- [x] Add CLI capture/list/show/report workflows with descriptive corpus coverage and reviewed usefulness metrics.\n",
"- [x] Add CLI capture/list/show/report workflows with descriptive corpus coverage and reviewed usefulness metrics.\n- [x] Bind evaluation records to CMI version/source revision and keep observational vs controlled-stress plus human vs agent review provenance separate.\n")

print('evaluation provenance hardening patch applied')
