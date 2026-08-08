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
    if text.count(old) != 1:
        raise RuntimeError(f'{rel}: expected exactly one replacement anchor, got {text.count(old)}')
    write(rel, text.replace(old, new, 1))


write('src/evaluation-contracts.js', r'''import { SESSION_OUTCOMES, EVIDENCE_TYPES, RECOMMENDATION_PRIORITIES, CONFIDENCE_LEVELS } from './durable-contracts.js';

export const EVALUATION_SCHEMA_VERSION = 1;
export const EVALUATION_SOURCE_KINDS = ['external-real', 'self-host', 'synthetic'];
export const EVALUATION_REPOSITORY_CLASSES = ['application', 'service', 'library', 'cli-tool', 'tooling', 'monorepo', 'unknown'];
export const EVALUATION_TASK_KINDS = ['implementation', 'debugging', 'audit', 'review', 'research', 'verification', 'no-code-investigation', 'unknown'];
export const EVALUATION_REVIEW_OUTCOMES = ['pass', 'partial', 'fail', 'unreviewed'];
export const EVALUATION_UTILITY_RATINGS = ['useful', 'not-useful', 'unknown'];
export const EVALUATION_EVIDENCE_STATES = ['healthy', 'degraded', 'blocked', 'uninitialized'];
export const EVALUATION_CALIBRATION_CONFIDENCE = ['high', 'medium', 'low', 'insufficient-evidence'];

function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function hasOnlyKeys(value, allowed) { return isObject(value) && Object.keys(value).every((key) => allowed.has(key)); }
function validIso(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
function validUuid(value) { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function validEnum(value, values) { return values.includes(value); }
function nullableBoolean(value) { return value === null || typeof value === 'boolean'; }
function nullableNumber(value) { return value === null || (typeof value === 'number' && Number.isFinite(value)); }
function nullableNonNegativeInteger(value) { return value === null || (Number.isInteger(value) && value >= 0); }
function nullableEnum(value, values) { return value === null || validEnum(value, values); }

export function validateEvaluationRecordContract(record) {
  const errors = [];
  const fail = (condition, message) => { if (!condition) errors.push(message); };
  fail(isObject(record), 'record must be an object');
  if (!isObject(record)) return { valid: false, errors };
  fail(hasOnlyKeys(record, new Set(['schemaVersion', 'id', 'recordedAt', 'source', 'repository', 'task', 'measurements', 'review', 'policy'])), 'record has unsupported top-level fields');
  fail(record.schemaVersion === EVALUATION_SCHEMA_VERSION, 'unsupported schemaVersion');
  fail(validUuid(record.id), 'id must be a canonical UUID');
  fail(validIso(record.recordedAt), 'recordedAt must be an ISO timestamp');

  const source = record.source;
  fail(hasOnlyKeys(source, new Set(['kind', 'independent'])), 'source shape is invalid');
  if (isObject(source)) {
    fail(validEnum(source.kind, EVALUATION_SOURCE_KINDS), 'source.kind is invalid');
    fail(typeof source.independent === 'boolean', 'source.independent must be boolean');
    if (validEnum(source.kind, EVALUATION_SOURCE_KINDS)) fail(source.independent === (source.kind === 'external-real'), 'source.independent must be true only for external-real evidence');
  }

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
      if (!continuation.sessionPresent) {
        fail(continuation.outcome === null && continuation.sessionScopeCount === 0 && !continuation.handoffPresent, 'session-absent continuation metrics must remain empty');
      }
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
  fail(hasOnlyKeys(review, new Set(['outcome', 'falsePositiveFindings', 'missedFindings', 'nextActionRating', 'handoffRating'])), 'review shape is invalid');
  if (isObject(review)) {
    fail(validEnum(review.outcome, EVALUATION_REVIEW_OUTCOMES), 'review outcome is invalid');
    fail(nullableNonNegativeInteger(review.falsePositiveFindings), 'review falsePositiveFindings must be non-negative integer or null');
    fail(nullableNonNegativeInteger(review.missedFindings), 'review missedFindings must be non-negative integer or null');
    fail(validEnum(review.nextActionRating, EVALUATION_UTILITY_RATINGS), 'review nextActionRating is invalid');
    fail(validEnum(review.handoffRating, EVALUATION_UTILITY_RATINGS), 'review handoffRating is invalid');
    if (review.outcome === 'unreviewed') {
      fail(review.falsePositiveFindings === null && review.missedFindings === null, 'unreviewed records cannot assert finding-error counts');
      fail(review.nextActionRating === 'unknown' && review.handoffRating === 'unknown', 'unreviewed records cannot assert usefulness ratings');
    }
  }

  fail(typeof record.policy === 'string' && record.policy.length > 20 && record.policy.length <= 1000, 'policy must be bounded explanatory text');
  return { valid: errors.length === 0, errors };
}
''')

write('src/evaluation.js', r'''import crypto from 'node:crypto';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { status as getProjectStatus } from './core.js';
import { getRepositoryBaseline } from './advisor.js';
import { buildChangeInsights } from './change-intelligence.js';
import { getSession, getSessionHandoff, listFindings } from './session-intelligence.js';
import { ensureSafeMemoryRoot, safeEnsureMemoryDir, safeListMemoryDir, safeReadMemoryJson, safeWriteMemoryFile } from './storage.js';
import {
  EVALUATION_SCHEMA_VERSION,
  EVALUATION_SOURCE_KINDS,
  EVALUATION_REPOSITORY_CLASSES,
  EVALUATION_TASK_KINDS,
  EVALUATION_REVIEW_OUTCOMES,
  EVALUATION_UTILITY_RATINGS,
  validateEvaluationRecordContract,
} from './evaluation-contracts.js';

const execFileAsync = promisify(execFile);
const EVALUATION_DIR = 'evaluations';
const MAX_RECORDS = 1000;
const MAX_RECORD_BYTES = 1_000_000;

function nowIso() { return new Date().toISOString(); }
function round(value) { return Math.round(value * 1000) / 1000; }
function average(values) { return values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : null; }
function rate(numerator, denominator) { return denominator ? round(numerator / denominator) : null; }
function normalizeEnum(value, values, label, fallback = null) {
  const normalized = String(value ?? fallback ?? '').trim().toLowerCase();
  if (!values.includes(normalized)) throw new Error(`${label} must be one of: ${values.join(', ')}.`);
  return normalized;
}
function normalizeOptionalCount(value, label) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new Error(`${label} must be a non-negative integer.`);
  return number;
}
async function runGit(root, args) {
  try {
    const result = await execFileAsync('git', args, { cwd: root, timeout: 4_000, maxBuffer: 1_048_576, windowsHide: true, encoding: 'utf8' });
    return String(result.stdout || '').trim();
  } catch { return ''; }
}
async function repositoryIdentity(root) {
  const origin = await runGit(root, ['config', '--get', 'remote.origin.url']);
  const basis = origin ? 'git-origin-hash' : 'local-root-hash';
  const secretInput = origin || path.resolve(root);
  const digest = crypto.createHash('sha256').update(`${basis}\0${secretInput}`).digest('hex');
  return { fingerprint: `sha256:${digest}`, fingerprintBasis: basis };
}
async function resolveClosedSession(root, selector) {
  if (selector === 'none') return { session: null, handoff: null };
  if (!selector || selector === 'latest') {
    try {
      const handoff = await getSessionHandoff(root, 'latest');
      return { session: await getSession(root, handoff.sessionId), handoff };
    } catch { return { session: null, handoff: null }; }
  }
  const session = await getSession(root, selector);
  if (session.status !== 'closed') throw new Error('Evaluation capture requires a closed session, or use --session none for project-only evidence.');
  return { session, handoff: await getSessionHandoff(root, session.id) };
}
function normalizeReview(options) {
  const outcome = normalizeEnum(options.reviewOutcome, EVALUATION_REVIEW_OUTCOMES, 'Review outcome', 'unreviewed');
  const falsePositiveFindings = normalizeOptionalCount(options.falsePositiveFindings, 'False-positive finding count');
  const missedFindings = normalizeOptionalCount(options.missedFindings, 'Missed finding count');
  const nextActionRating = normalizeEnum(options.nextActionRating, EVALUATION_UTILITY_RATINGS, 'Next-action rating', 'unknown');
  const handoffRating = normalizeEnum(options.handoffRating, EVALUATION_UTILITY_RATINGS, 'Handoff rating', 'unknown');
  if (outcome === 'unreviewed' && (falsePositiveFindings !== null || missedFindings !== null || nextActionRating !== 'unknown' || handoffRating !== 'unknown')) {
    throw new Error('Use a reviewed outcome before recording finding-error counts or usefulness ratings.');
  }
  return { outcome, falsePositiveFindings, missedFindings, nextActionRating, handoffRating };
}
function sessionMetrics(session, handoff, openFindingCount) {
  if (!session || !handoff) return {
    sessionPresent: false, outcome: null, sessionScopeCount: 0, openFindingCount,
    recommendationCount: 0, handoffPresent: false, nextActionPresent: false,
    nextActionPriority: null, nextActionEvidenceType: null, nextActionConfidence: null,
    guardrailCount: 0, planningSignalCount: 0,
  };
  const close = session.close;
  const nextAction = handoff.nextAction || null;
  return {
    sessionPresent: true,
    outcome: close?.outcome || null,
    sessionScopeCount: close?.scope?.paths?.length || 0,
    openFindingCount: close?.openFindings?.length ?? openFindingCount,
    recommendationCount: close?.recommendations?.length || 0,
    handoffPresent: true,
    nextActionPresent: Boolean(nextAction),
    nextActionPriority: nextAction?.priority || null,
    nextActionEvidenceType: nextAction?.evidenceType || null,
    nextActionConfidence: nextAction?.confidence || null,
    guardrailCount: handoff.guardrails?.length || 0,
    planningSignalCount: handoff.planningSignals?.length || 0,
  };
}

export function validateEvaluationRecord(record) { return validateEvaluationRecordContract(record).valid; }

export async function captureEvaluation(root, options = {}) {
  const sourceKind = normalizeEnum(options.sourceKind, EVALUATION_SOURCE_KINDS, 'Evaluation source kind');
  const repositoryClass = normalizeEnum(options.repositoryClass, EVALUATION_REPOSITORY_CLASSES, 'Repository class', 'unknown');
  const taskKind = normalizeEnum(options.taskKind, EVALUATION_TASK_KINDS, 'Task kind', 'unknown');
  const review = normalizeReview(options);
  const project = await getProjectStatus(root);
  if (!project.initialized || !project.index) throw new Error('Evaluation capture requires initialized, scanned CMI project intelligence. Run cmi scan first.');
  await safeEnsureMemoryDir(root, EVALUATION_DIR);
  const [{ session, handoff }, findings, history, baseline, identity] = await Promise.all([
    resolveClosedSession(root, options.session || 'latest'),
    listFindings(root, { state: 'open', limit: 200 }),
    buildChangeInsights(root, '', { limit: 50 }),
    getRepositoryBaseline(root),
    repositoryIdentity(root),
  ]);
  const graph = project.graphHealth || {};
  const projectClean = session?.close?.current?.repository?.projectClean;
  const worktreeClean = typeof projectClean === 'boolean' ? projectClean : baseline?.available ? Boolean(baseline.clean) : null;
  const record = {
    schemaVersion: EVALUATION_SCHEMA_VERSION,
    id: crypto.randomUUID(),
    recordedAt: nowIso(),
    source: { kind: sourceKind, independent: sourceKind === 'external-real' },
    repository: { ...identity, class: repositoryClass },
    task: { kind: taskKind, sessionId: session?.id || null },
    measurements: {
      project: {
        evidenceState: project.evidenceHealth?.state || 'uninitialized',
        healthy: Boolean(project.healthy),
        graphCurrent: Boolean(graph.current),
        graphTruncated: Boolean(graph.truncated),
        graphStaleNodes: Number(graph.staleNodes) || 0,
        graphMissingNodes: Number(graph.missingNodes) || 0,
        worktreeClean,
        sourceFiles: Number.isInteger(project.graph?.sourceFiles) ? project.graph.sourceFiles : null,
        workspaceCount: Number(project.workspaces?.count) || 0,
      },
      continuation: sessionMetrics(session, handoff, findings.total),
      changeHistory: {
        completedRecords: history.corpus.completedRecords,
        consideredRecords: history.corpus.consideredRecords,
        calibrationSamples: history.calibration.samples,
        averagePathRecall: history.calibration.averagePathRecall,
        averagePathPrecision: history.calibration.averagePathPrecision,
        averagePathF1: history.calibration.averagePathF1,
        calibrationConfidence: history.calibration.confidence,
      },
    },
    review,
    policy: 'Evaluation records are anonymized descriptive evidence. external-real is the only independent-repository class; self-host and synthetic evidence remain separate. CMI does not infer production readiness, causal correctness, or usefulness from an unreviewed or undersized corpus.',
  };
  const validation = validateEvaluationRecordContract(record);
  if (!validation.valid) throw new Error(`Invalid evaluation record: ${validation.errors.join(' ')}`);
  await safeWriteMemoryFile(root, `${EVALUATION_DIR}/${record.id}.json`, `${JSON.stringify(record, null, 2)}\n`, { ifMissing: true });
  return record;
}

async function readEvaluationRecords(root) {
  const memory = await ensureSafeMemoryRoot(root, { create: false });
  if (!memory) return { records: [], invalidRecords: 0, truncated: false };
  await safeEnsureMemoryDir(root, EVALUATION_DIR);
  const names = await safeListMemoryDir(root, EVALUATION_DIR);
  const candidates = names.filter((name) => /^[0-9a-f-]+\.json$/i.test(name));
  const records = [];
  let invalidRecords = 0;
  for (const name of candidates.slice(0, MAX_RECORDS)) {
    try {
      const record = await safeReadMemoryJson(root, `${EVALUATION_DIR}/${name}`, { maxBytes: MAX_RECORD_BYTES });
      const validation = validateEvaluationRecordContract(record);
      if (validation.valid) records.push(record); else invalidRecords += 1;
    } catch { invalidRecords += 1; }
  }
  records.sort((a, b) => String(b.recordedAt).localeCompare(String(a.recordedAt)));
  return { records, invalidRecords, truncated: candidates.length > MAX_RECORDS };
}

function resolveEvaluation(records, selector) {
  const raw = String(selector || '').trim().toLowerCase();
  if (!raw || !/^[0-9a-f-]+$/i.test(raw)) throw new Error('An evaluation ID or unique prefix is required.');
  const matches = records.filter((record) => record.id.toLowerCase() === raw || record.id.toLowerCase().startsWith(raw));
  if (!matches.length) throw new Error(`Evaluation record not found: ${selector}`);
  if (matches.length > 1) throw new Error(`Evaluation-record prefix is ambiguous: ${selector}`);
  return matches[0];
}

export async function getEvaluation(root, selector) {
  const { records } = await readEvaluationRecords(root);
  return resolveEvaluation(records, selector);
}

export async function listEvaluations(root, options = {}) {
  const { records, invalidRecords, truncated } = await readEvaluationRecords(root);
  const sourceKind = options.sourceKind ? normalizeEnum(options.sourceKind, EVALUATION_SOURCE_KINDS, 'Evaluation source kind') : null;
  const limit = Math.max(1, Math.min(200, Number(options.limit) || 50));
  const selected = records.filter((record) => !sourceKind || record.source.kind === sourceKind);
  return {
    schemaVersion: 1,
    records: selected.slice(0, limit).map((record) => ({
      id: record.id, recordedAt: record.recordedAt, sourceKind: record.source.kind,
      repositoryFingerprint: record.repository.fingerprint, repositoryClass: record.repository.class,
      taskKind: record.task.kind, reviewOutcome: record.review.outcome,
      evidenceState: record.measurements.project.evidenceState,
      outcome: record.measurements.continuation.outcome,
    })),
    total: selected.length, invalidRecords, truncated,
  };
}

function countBy(records, selector) {
  const counts = {};
  for (const record of records) {
    const value = selector(record);
    counts[value] = (counts[value] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}
function uniqueCount(records, selector) { return new Set(records.map(selector)).size; }
function coverageState(all, external) {
  if (!external.length) {
    if (all.some((item) => item.source.kind === 'self-host')) return 'self-host-only';
    if (all.some((item) => item.source.kind === 'synthetic')) return 'synthetic-only';
    return 'none';
  }
  const repositories = uniqueCount(external, (item) => item.repository.fingerprint);
  if (repositories === 1) return 'external-single-repository';
  const tasks = uniqueCount(external, (item) => item.task.kind);
  const classes = uniqueCount(external, (item) => item.repository.class);
  return tasks > 1 && classes > 1 ? 'external-multi-repository-multi-context' : 'external-multi-repository';
}

export async function buildEvaluationReport(root, options = {}) {
  const { records, invalidRecords, truncated } = await readEvaluationRecords(root);
  const sourceKind = options.sourceKind ? normalizeEnum(options.sourceKind, EVALUATION_SOURCE_KINDS, 'Evaluation source kind') : null;
  const selected = records.filter((record) => !sourceKind || record.source.kind === sourceKind);
  const external = selected.filter((record) => record.source.kind === 'external-real');
  const reviewedExternal = external.filter((record) => record.review.outcome !== 'unreviewed');
  const nextActionRated = reviewedExternal.filter((record) => record.review.nextActionRating !== 'unknown');
  const handoffRated = reviewedExternal.filter((record) => record.review.handoffRating !== 'unknown');
  const falsePositiveCounts = reviewedExternal.map((record) => record.review.falsePositiveFindings).filter(Number.isInteger);
  const missedCounts = reviewedExternal.map((record) => record.review.missedFindings).filter(Number.isInteger);
  const externalWithSession = external.filter((record) => record.measurements.continuation.sessionPresent);
  return {
    schemaVersion: 1,
    generatedAt: nowIso(),
    filter: { sourceKind },
    corpus: {
      totalRecords: selected.length,
      invalidRecords,
      truncated,
      sourceKinds: countBy(selected, (record) => record.source.kind),
      uniqueRepositories: uniqueCount(selected, (record) => record.repository.fingerprint),
      externalReal: {
        records: external.length,
        uniqueRepositories: uniqueCount(external, (record) => record.repository.fingerprint),
        repositoryClasses: countBy(external, (record) => record.repository.class),
        taskKinds: countBy(external, (record) => record.task.kind),
      },
    },
    coverage: {
      state: coverageState(selected, external),
      hasExternalRealEvidence: external.length > 0,
      hasMultipleExternalRepositories: uniqueCount(external, (record) => record.repository.fingerprint) >= 2,
      hasMultipleExternalTaskKinds: uniqueCount(external, (record) => record.task.kind) >= 2,
      hasReviewedExternalEvidence: reviewedExternal.length > 0,
    },
    observedMetrics: {
      externalProjectHealthyRate: rate(external.filter((record) => record.measurements.project.healthy).length, external.length),
      externalHandoffPresenceRate: rate(externalWithSession.filter((record) => record.measurements.continuation.handoffPresent).length, externalWithSession.length),
      externalNextActionPresenceRate: rate(externalWithSession.filter((record) => record.measurements.continuation.nextActionPresent).length, externalWithSession.length),
      externalAverageOpenFindings: average(external.map((record) => record.measurements.continuation.openFindingCount)),
      externalAverageCalibrationSamples: average(external.map((record) => record.measurements.changeHistory.calibrationSamples)),
    },
    reviewedUsefulness: {
      reviewedExternalRecords: reviewedExternal.length,
      nextActionRatedRecords: nextActionRated.length,
      nextActionUsefulRate: rate(nextActionRated.filter((record) => record.review.nextActionRating === 'useful').length, nextActionRated.length),
      handoffRatedRecords: handoffRated.length,
      handoffUsefulRate: rate(handoffRated.filter((record) => record.review.handoffRating === 'useful').length, handoffRated.length),
      falsePositiveFindingsObserved: falsePositiveCounts.length ? falsePositiveCounts.reduce((sum, value) => sum + value, 0) : null,
      missedFindingsObserved: missedCounts.length ? missedCounts.reduce((sum, value) => sum + value, 0) : null,
    },
    limitations: [
      'external-real records are descriptive independent-repository evidence; self-host and synthetic records never contribute to independent-repository counts.',
      'A multi-repository corpus is coverage evidence, not automatic proof of production readiness or causal correctness.',
      'Usefulness rates require explicit human/agent review metadata and remain undefined when records are unreviewed.',
      'Repository fingerprints are one-way hashes for grouping runs; raw repository names, remotes, absolute paths, session goals, findings text, and recommendation text are not stored in evaluation records.',
      'Evaluation aggregation does not recalibrate Behavioral Change Intelligence thresholds automatically.',
    ],
    policy: 'CMI reports what the retained corpus supports and keeps source classes separate. It does not declare v1.0 readiness, production validity, or empirical calibration complete from a small or unreviewed corpus.',
  };
}

export function formatEvaluationRecord(record) {
  return `# CMI evaluation ${record.id.slice(0, 12)}\n\n- Source: ${record.source.kind}${record.source.independent ? ' · independent repository evidence' : ''}\n- Repository class: ${record.repository.class}\n- Task kind: ${record.task.kind}\n- Evidence health: ${record.measurements.project.evidenceState}\n- Session outcome: ${record.measurements.continuation.outcome || 'none'}\n- Open findings: ${record.measurements.continuation.openFindingCount}\n- Next action: ${record.measurements.continuation.nextActionPresent ? record.measurements.continuation.nextActionPriority : 'none'}\n- Review: ${record.review.outcome}\n\n${record.policy}`;
}
export function formatEvaluationList(result) {
  if (!result.records.length) return 'No matching CMI evaluation records.';
  return result.records.map((item) => `- ${item.id.slice(0, 12)} · ${item.sourceKind} · ${item.repositoryClass}/${item.taskKind} · ${item.evidenceState} · review ${item.reviewOutcome}`).join('\n');
}
export function formatEvaluationReport(report) {
  const external = report.corpus.externalReal;
  const usefulness = report.reviewedUsefulness;
  return `# CMI real-repository evaluation\n\nCoverage: ${report.coverage.state}\nRecords: ${report.corpus.totalRecords} · external-real ${external.records} · independent repositories ${external.uniqueRepositories}\nRepository classes: ${Object.keys(external.repositoryClasses).length} · task kinds: ${Object.keys(external.taskKinds).length}\nReviewed external records: ${usefulness.reviewedExternalRecords}\nNext-action useful rate: ${usefulness.nextActionUsefulRate ?? 'n/a'}\nHandoff useful rate: ${usefulness.handoffUsefulRate ?? 'n/a'}\nExternal project healthy rate: ${report.observedMetrics.externalProjectHealthyRate ?? 'n/a'}\nExternal handoff presence rate: ${report.observedMetrics.externalHandoffPresenceRate ?? 'n/a'}\n\n## Evidence limits\n${report.limitations.map((item) => `- ${item}`).join('\n')}\n\n${report.policy}`;
}
''')

write('schemas/evaluation-record.schema.json', r'''{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/lenhonbp/codex-memory-intelligence/schemas/evaluation-record.schema.json",
  "title": "CMI Real-Repository Evaluation Record",
  "type": "object",
  "required": ["schemaVersion", "id", "recordedAt", "source", "repository", "task", "measurements", "review", "policy"],
  "properties": {
    "schemaVersion": { "const": 1 },
    "id": { "type": "string", "format": "uuid" },
    "recordedAt": { "type": "string", "format": "date-time" },
    "source": {
      "type": "object",
      "required": ["kind", "independent"],
      "properties": {
        "kind": { "enum": ["external-real", "self-host", "synthetic"] },
        "independent": { "type": "boolean" }
      },
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
      "required": ["outcome", "falsePositiveFindings", "missedFindings", "nextActionRating", "handoffRating"],
      "properties": {
        "outcome": { "enum": ["pass", "partial", "fail", "unreviewed"] },
        "falsePositiveFindings": { "type": ["integer", "null"], "minimum": 0 },
        "missedFindings": { "type": ["integer", "null"], "minimum": 0 },
        "nextActionRating": { "enum": ["useful", "not-useful", "unknown"] },
        "handoffRating": { "enum": ["useful", "not-useful", "unknown"] }
      },
      "additionalProperties": false
    },
    "policy": { "type": "string", "minLength": 20, "maxLength": 1000 }
  },
  "additionalProperties": false
}
''')

write('docs/EVALUATION.md', r'''# Real-Repository Evidence and Evaluation

CMI's evaluation layer exists to answer a narrower question than ordinary tests:

> What has actually been observed across real repositories and repeated project work, and what remains unproven?

It is intentionally not a benchmark leaderboard and does not convert a small field corpus into a production-readiness claim.

## Evidence classes

Every retained evaluation record must be explicitly classified:

- `external-real` — a real repository outside the CMI self-host repository. This is the only class counted as independent-repository evidence.
- `self-host` — the CMI repository evaluating itself. Useful for regression and dogfooding, but never counted as independent evidence.
- `synthetic` — deterministic fixtures or generated repositories. Useful for regression, never counted as real-repository validation.

There is no automatic promotion between these classes.

## Capture

Run normal CMI project/session workflows first, then capture only bounded measurements:

```bash
cmi scan
cmi session start "review the current project state"
# inspect / work / verify
cmi session close latest --outcome investigated
cmi evaluate capture \
  --source-kind external-real \
  --repository-class application \
  --task-kind audit
```

Use `--session none` for project-only evidence when no closed work session should be associated.

Review metadata is explicit and optional. An unreviewed record cannot assert usefulness or false-positive/missed-finding counts:

```bash
cmi evaluate capture \
  --source-kind external-real \
  --repository-class service \
  --task-kind debugging \
  --review-outcome partial \
  --false-positive-findings 0 \
  --missed-findings 1 \
  --next-action-rating useful \
  --handoff-rating useful
```

## Privacy and retained shape

Evaluation records live under `.codex-memory/evaluations/` and intentionally omit:

- repository names;
- raw Git remotes;
- absolute local paths;
- session goals and notes;
- finding text;
- recommendation text;
- source contents and diffs.

Runs are grouped using a one-way SHA-256 repository fingerprint derived from the Git origin when available, otherwise from the local root. The digest is useful for grouping repeated runs but is not a security boundary or an anonymization guarantee against an attacker who already knows the candidate repository identity.

## Reporting

```bash
cmi evaluate list
cmi evaluate report
cmi evaluate report --source-kind external-real
cmi evaluate show <id>
```

The report keeps source classes separate and exposes descriptive coverage states:

- `none`
- `synthetic-only`
- `self-host-only`
- `external-single-repository`
- `external-multi-repository`
- `external-multi-repository-multi-context`

These states describe corpus coverage only. They do not mean "validated", "production ready", or "v1.0 ready".

Usefulness rates are reported only from explicitly reviewed `external-real` records. Behavioral confidence thresholds are not recalibrated automatically from evaluation data.

## Runtime contract

`schemas/evaluation-record.schema.json` documents the durable format and repository quality checks keep trust-critical enums/version fields aligned with the runtime validator.

The current schema version is `1`.

## What remains empirical

The evaluation harness creates a disciplined place to collect evidence. It does not itself prove:

- that historical verification recommendations improve agent choices;
- that session handoffs reduce reconstruction effort;
- that next-action intelligence reduces user follow-up questions;
- that current confidence or priority thresholds are well calibrated;
- that CMI behaves well across large, rename-heavy, rebased, clock-skewed, or long-lived repositories;
- that CMI is production-ready across clients, languages, architectures, and operating systems.

Those claims require enough independent real-repository/task observations and explicit review data.
''')

write('src/cli-entry.js', r'''#!/usr/bin/env node
import {
  startSession,
  observeSession,
  assessSession,
  closeSession,
  getSession,
  listSessions,
  getSessionHandoff,
  listFindings,
  getFinding,
  setFindingState,
  formatSessionReport,
  formatSessionAssessment,
  formatHandoff,
  formatFindingList,
} from './session-intelligence.js';
import {
  captureEvaluation,
  getEvaluation,
  listEvaluations,
  buildEvaluationReport,
  formatEvaluationRecord,
  formatEvaluationList,
  formatEvaluationReport,
} from './evaluation.js';

const [command, ...args] = process.argv.slice(2);
if (!['session', 'finding', 'evaluate'].includes(command)) {
  await import('./cli.js');
  process.exit();
}

const json = args.includes('--json');
function hasFlag(name) { return args.includes(name); }
function optionValues(name) {
  const output = [];
  for (let index = 0; index < args.length; index += 1) if (args[index] === name && args[index + 1]) output.push(args[index + 1]);
  return output;
}
function optionNumber(name, fallback) { const value = Number(optionValues(name)[0]); return Number.isFinite(value) ? value : fallback; }
function positional(valueOptions = []) {
  const withValue = new Set(valueOptions);
  const output = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (['--json'].includes(value)) continue;
    if (withValue.has(value)) { index += 1; continue; }
    if (value.startsWith('--')) continue;
    output.push(value);
  }
  return output;
}
function sessionOptions() {
  return {
    files: optionValues('--file'),
    notes: optionValues('--note'),
    accomplished: optionValues('--accomplished'),
    blockers: optionValues('--blocker'),
    decisions: optionValues('--decision'),
    questions: optionValues('--question'),
    outcome: optionValues('--outcome')[0],
  };
}
function evaluationOptions() {
  return {
    sourceKind: optionValues('--source-kind')[0],
    repositoryClass: optionValues('--repository-class')[0],
    taskKind: optionValues('--task-kind')[0],
    session: optionValues('--session')[0],
    reviewOutcome: optionValues('--review-outcome')[0],
    falsePositiveFindings: optionValues('--false-positive-findings')[0],
    missedFindings: optionValues('--missed-findings')[0],
    nextActionRating: optionValues('--next-action-rating')[0],
    handoffRating: optionValues('--handoff-rating')[0],
  };
}
function print(value, formatted) { console.log(json ? JSON.stringify(value, null, 2) : formatted); }
function groupHelp(name) {
  if (name === 'session') return 'Usage: cmi session <start|observe|status|close|show|list|handoff> ...\n\nTrack project work, persist findings, and produce an evidence-based handoff/next action.';
  if (name === 'finding') return 'Usage: cmi finding <list|show|state> ...\n\nInspect and explicitly review persistent project findings.';
  return 'Usage: cmi evaluate <capture|list|show|report> ...\n\nCollect anonymized field evidence while keeping external-real, self-host, and synthetic records separate.';
}

try {
  if (hasFlag('--help') || hasFlag('-h') || args[0] === 'help') {
    console.log(groupHelp(command));
  } else if (command === 'session') {
    const values = positional(['--file','--note','--accomplished','--blocker','--decision','--question','--outcome','--status','--limit']);
    const action = values.shift();
    if (action === 'start') {
      const goal = values.join(' ').trim();
      if (!goal) throw new Error('Usage: cmi session start <goal> [--note text] [--json]');
      const record = await startSession(process.cwd(), goal, sessionOptions());
      print(record, `Started CMI session ${record.id.slice(0, 8)}\nGoal: ${record.goal}\n\nCMI will preserve findings and propose evidence-based next actions when this session is closed.`);
    } else if (action === 'observe') {
      const selector = values[0] || 'latest';
      const record = await observeSession(process.cwd(), selector, sessionOptions());
      print(record, `Observed session ${record.id.slice(0, 8)} · ${record.observations.length} observation(s) recorded.`);
    } else if (action === 'status') {
      const result = await assessSession(process.cwd(), values[0] || 'latest');
      print(result, formatSessionAssessment(result));
    } else if (action === 'close') {
      const record = await closeSession(process.cwd(), values[0] || 'latest', sessionOptions());
      print(record, formatSessionReport(record));
    } else if (action === 'show') {
      const record = await getSession(process.cwd(), values[0] || 'latest');
      print(record, formatSessionReport(record));
    } else if (action === 'list') {
      const result = await listSessions(process.cwd(), { status: optionValues('--status')[0], limit: optionNumber('--limit', 20) });
      const text = result.records.length ? result.records.map((item) => `- ${item.id.slice(0, 8)} [${item.status}${item.outcome ? `/${item.outcome}` : ''}] ${item.goal}${item.nextAction ? `\n  Next: ${item.nextAction.priority} ${item.nextAction.action}` : ''}`).join('\n') : 'No CMI sessions found.';
      print(result, text);
    } else if (action === 'handoff') {
      const handoff = await getSessionHandoff(process.cwd(), values[0] || 'latest');
      print(handoff, formatHandoff(handoff));
    } else {
      throw new Error('Usage: cmi session <start|observe|status|close|show|list|handoff> ...');
    }
  } else if (command === 'finding') {
    const values = positional(['--status','--limit','--reason','--changed-by','--superseded-by']);
    const action = values.shift();
    if (action === 'list') {
      const result = await listFindings(process.cwd(), { state: optionValues('--status')[0], limit: optionNumber('--limit', 50) });
      print(result, formatFindingList(result));
    } else if (action === 'show') {
      const item = await getFinding(process.cwd(), values[0]);
      print(item, `# Project finding\n\n${item.title}\nState: ${item.state}\nSeverity: ${item.severity}\nConfidence: ${item.confidence}\nEvidence type: ${item.evidenceType}\n\n${item.detail}`);
    } else if (action === 'state') {
      const [selector, state] = values;
      if (!selector || !state) throw new Error('Usage: cmi finding state <id> <open|resolved|accepted|dismissed|superseded> --reason text');
      const item = await setFindingState(process.cwd(), selector, state, { reason: optionValues('--reason')[0], changedBy: optionValues('--changed-by')[0], supersededBy: optionValues('--superseded-by')[0] });
      print(item, `Finding ${item.id.slice(0, 8)} is now ${item.state}.`);
    } else {
      throw new Error('Usage: cmi finding <list|show|state> ...');
    }
  } else {
    const values = positional(['--source-kind','--repository-class','--task-kind','--session','--review-outcome','--false-positive-findings','--missed-findings','--next-action-rating','--handoff-rating','--limit']);
    const action = values.shift();
    if (action === 'capture') {
      if (!optionValues('--source-kind')[0]) throw new Error('Usage: cmi evaluate capture --source-kind <external-real|self-host|synthetic> [--repository-class class] [--task-kind kind] [--session latest|none|id]');
      const record = await captureEvaluation(process.cwd(), evaluationOptions());
      print(record, formatEvaluationRecord(record));
    } else if (action === 'list') {
      const result = await listEvaluations(process.cwd(), { sourceKind: optionValues('--source-kind')[0], limit: optionNumber('--limit', 50) });
      print(result, formatEvaluationList(result));
    } else if (action === 'show') {
      const record = await getEvaluation(process.cwd(), values[0]);
      print(record, formatEvaluationRecord(record));
    } else if (action === 'report') {
      const report = await buildEvaluationReport(process.cwd(), { sourceKind: optionValues('--source-kind')[0] });
      print(report, formatEvaluationReport(report));
    } else {
      throw new Error('Usage: cmi evaluate <capture|list|show|report> ...');
    }
  }
} catch (error) {
  console.error(`CMI error: ${error.message}`);
  if (hasFlag('--json')) console.error(JSON.stringify({ error: error.message }));
  process.exitCode = 1;
}
''')

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

test('evaluation capture stores bounded anonymized evidence without raw repository/session text', async () => {
  const root = await projectFixture();
  const closed = await closeAuditSession(root);
  const record = await captureEvaluation(root, { sourceKind: 'self-host', repositoryClass: 'cli-tool', taskKind: 'audit', session: closed.id });
  assert.equal(record.schemaVersion, 1);
  assert.equal(record.source.kind, 'self-host');
  assert.equal(record.source.independent, false);
  assert.equal(record.task.sessionId, closed.id);
  assert.match(record.repository.fingerprint, /^sha256:[0-9a-f]{64}$/);
  assert.equal(validateEvaluationRecord(record), true);
  const serialized = JSON.stringify(record);
  assert.doesNotMatch(serialized, /private evaluation goal/i);
  assert.doesNotMatch(serialized, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(serialized, /anonymous-evaluation-fixture/);
});

test('evaluation report never counts self-host or synthetic records as independent real-repository evidence', async () => {
  const root = await projectFixture();
  await captureEvaluation(root, { sourceKind: 'self-host', repositoryClass: 'tooling', taskKind: 'audit', session: 'none' });
  await captureEvaluation(root, { sourceKind: 'synthetic', repositoryClass: 'application', taskKind: 'verification', session: 'none' });
  const report = await buildEvaluationReport(root);
  assert.equal(report.corpus.totalRecords, 2);
  assert.equal(report.corpus.externalReal.records, 0);
  assert.equal(report.corpus.externalReal.uniqueRepositories, 0);
  assert.equal(report.coverage.hasExternalRealEvidence, false);
  assert.equal(report.coverage.hasMultipleExternalRepositories, false);
  assert.equal(report.coverage.state, 'self-host-only');
  assert.equal(Object.hasOwn(report, 'productionValidated'), false);
});

test('external-real review metrics remain descriptive and require explicit reviewed evidence', async () => {
  const root = await projectFixture();
  await closeAuditSession(root);
  await assert.rejects(() => captureEvaluation(root, {
    sourceKind: 'external-real', repositoryClass: 'application', taskKind: 'audit',
    nextActionRating: 'useful',
  }), /reviewed outcome/i);
  await captureEvaluation(root, {
    sourceKind: 'external-real', repositoryClass: 'application', taskKind: 'audit',
    reviewOutcome: 'pass', falsePositiveFindings: 0, missedFindings: 0,
    nextActionRating: 'useful', handoffRating: 'useful',
  });
  const report = await buildEvaluationReport(root);
  assert.equal(report.coverage.state, 'external-single-repository');
  assert.equal(report.corpus.externalReal.uniqueRepositories, 1);
  assert.equal(report.reviewedUsefulness.reviewedExternalRecords, 1);
  assert.equal(report.reviewedUsefulness.nextActionUsefulRate, 1);
  assert.match(report.policy, /does not declare v1\.0 readiness/i);
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

test('CLI exposes the evaluation group and source classification contract', async () => {
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

replace_once('src/cli.js',
"  cmi finding <list|show|state> ...\\n  cmi remember <fact|decision|mistake> <text> [--source path ...]\\n",
"  cmi finding <list|show|state> ...\\n  cmi evaluate <capture|list|show|report> ...\\n  cmi remember <fact|decision|mistake> <text> [--source path ...]\\n")

replace_once('scripts/quality.js',
"import { MEMORY_SCHEMA_VERSION, SESSION_SCHEMA_VERSION, FINDINGS_SCHEMA_VERSION, MEMORY_LIFECYCLE_STATES, SESSION_OUTCOMES, FINDING_STATES, FINDING_SEVERITIES, EVIDENCE_TYPES, RECOMMENDATION_PRIORITIES, CONFIDENCE_LEVELS } from '../src/durable-contracts.js';\n",
"import { MEMORY_SCHEMA_VERSION, SESSION_SCHEMA_VERSION, FINDINGS_SCHEMA_VERSION, MEMORY_LIFECYCLE_STATES, SESSION_OUTCOMES, FINDING_STATES, FINDING_SEVERITIES, EVIDENCE_TYPES, RECOMMENDATION_PRIORITIES, CONFIDENCE_LEVELS } from '../src/durable-contracts.js';\nimport { EVALUATION_SCHEMA_VERSION, EVALUATION_SOURCE_KINDS, EVALUATION_REPOSITORY_CLASSES, EVALUATION_TASK_KINDS, EVALUATION_REVIEW_OUTCOMES, EVALUATION_UTILITY_RATINGS } from '../src/evaluation-contracts.js';\n")

replace_once('scripts/quality.js',
"  const findings = JSON.parse(fs.readFileSync('schemas/findings-registry.schema.json', 'utf8'));\n",
"  const findings = JSON.parse(fs.readFileSync('schemas/findings-registry.schema.json', 'utf8'));\n  const evaluation = JSON.parse(fs.readFileSync('schemas/evaluation-record.schema.json', 'utf8'));\n")

replace_once('scripts/quality.js',
"  if (!sameValues(findings.properties?.findings?.items?.properties?.evidenceType?.enum, EVIDENCE_TYPES)) errors.push('findings registry evidence types differ from runtime contract');\n",
"  if (!sameValues(findings.properties?.findings?.items?.properties?.evidenceType?.enum, EVIDENCE_TYPES)) errors.push('findings registry evidence types differ from runtime contract');\n  if (evaluation.properties?.schemaVersion?.const !== EVALUATION_SCHEMA_VERSION) errors.push('evaluation schemaVersion differs from runtime contract');\n  if (evaluation.properties?.id?.format !== 'uuid') errors.push('evaluation id schema must use canonical UUID format');\n  if (!sameValues(evaluation.properties?.source?.properties?.kind?.enum, EVALUATION_SOURCE_KINDS)) errors.push('evaluation source kinds differ from runtime contract');\n  if (!sameValues(evaluation.properties?.repository?.properties?.class?.enum, EVALUATION_REPOSITORY_CLASSES)) errors.push('evaluation repository classes differ from runtime contract');\n  if (!sameValues(evaluation.properties?.task?.properties?.kind?.enum, EVALUATION_TASK_KINDS)) errors.push('evaluation task kinds differ from runtime contract');\n  if (!sameValues(evaluation.properties?.review?.properties?.outcome?.enum, EVALUATION_REVIEW_OUTCOMES)) errors.push('evaluation review outcomes differ from runtime contract');\n  if (!sameValues(evaluation.properties?.review?.properties?.nextActionRating?.enum, EVALUATION_UTILITY_RATINGS)) errors.push('evaluation next-action ratings differ from runtime contract');\n  if (!sameValues(evaluation.properties?.review?.properties?.handoffRating?.enum, EVALUATION_UTILITY_RATINGS)) errors.push('evaluation handoff ratings differ from runtime contract');\n")

replace_once('CHANGELOG.md',
"## [Unreleased]\n\nNo unreleased changes yet.\n",
"## [Unreleased]\n\n### Added\n\n- Real-repository evaluation records under `.codex-memory/evaluations/` with an explicit `external-real`, `self-host`, or `synthetic` source class.\n- `cmi evaluate capture|list|show|report` for collecting and aggregating anonymized project/session/change-history measurements without storing repository names, raw remotes, absolute paths, session text, finding text, recommendation text, or source content.\n- Runtime + JSON Schema validation for evaluation records and repository quality checks that keep trust-critical evaluation enums/version fields aligned.\n- Descriptive corpus coverage states and reviewed usefulness metrics that never count self-host/synthetic runs as independent real-repository evidence or automatically declare production/v1.0 readiness.\n")

replace_once('ROADMAP.md',
"## Precision and interoperability track\n",
"## v0.9.x — Real-repository evidence and evaluation\n\nThe v0.9.x evaluation foundation records what CMI has actually observed without allowing synthetic/self-host evidence to masquerade as independent validation.\n\n- [x] Add a versioned, bounded, local evaluation-record contract under `.codex-memory/evaluations/`.\n- [x] Require explicit evidence classes (`external-real`, `self-host`, `synthetic`) and count only `external-real` as independent repository evidence.\n- [x] Retain one-way repository fingerprints plus bounded project/session/change-history measurements instead of raw repository names, remotes, absolute paths, source text, findings text, or recommendation text.\n- [x] Add CLI capture/list/show/report workflows with descriptive corpus coverage and reviewed usefulness metrics.\n- [x] Keep runtime validation and JSON Schema enums/version fields aligned through repository quality checks.\n- [x] Keep production-readiness and empirical threshold recalibration outside the automatic report contract.\n- [ ] Accumulate enough independent external-real repositories and repeated tasks to move the existing v0.8 field-validation questions from anecdotal evidence to measured evidence.\n- [ ] Add controlled real-repository stress runs for rename-after-scan, rebases, dirty worktrees, clock skew, and large monorepos.\n- [ ] Measure repeated-task verification-choice improvement and session-handoff/next-action usefulness with explicit review data.\n\n## Precision and interoperability track\n")

replace_once('README.md',
"8. **What happened in the current work session, what remains unresolved, and what should happen next?**\n",
"8. **What happened in the current work session, what remains unresolved, and what should happen next?**\n9. **What has CMI actually demonstrated across real repositories, and which claims are still unsupported?**\n")

replace_once('README.md',
"See [Evidence Integrity](docs/EVIDENCE_INTEGRITY.md), [Change Intelligence](docs/CHANGE_INTELLIGENCE.md), [Session Continuation Intelligence](docs/SESSION_INTELLIGENCE.md), [Durable Memory Lifecycle](docs/MEMORY_LIFECYCLE.md), [Roadmap](ROADMAP.md), and [Changelog](CHANGELOG.md) for storage contracts, evidence limits, and release status.\n",
"See [Evidence Integrity](docs/EVIDENCE_INTEGRITY.md), [Real-Repository Evaluation](docs/EVALUATION.md), [Change Intelligence](docs/CHANGE_INTELLIGENCE.md), [Session Continuation Intelligence](docs/SESSION_INTELLIGENCE.md), [Durable Memory Lifecycle](docs/MEMORY_LIFECYCLE.md), [Roadmap](ROADMAP.md), and [Changelog](CHANGELOG.md) for storage contracts, evidence limits, and release status.\n")

replace_once('README.md',
"CMI can auto-resolve deterministic health findings when their measured condition disappears, but explicit blockers/questions remain review-controlled. Historical verification suggestions are labeled correlation rather than fact. See [Session Continuation Intelligence](docs/SESSION_INTELLIGENCE.md).\n\n## Monorepos and workspaces\n",
"CMI can auto-resolve deterministic health findings when their measured condition disappears, but explicit blockers/questions remain review-controlled. Historical verification suggestions are labeled correlation rather than fact. See [Session Continuation Intelligence](docs/SESSION_INTELLIGENCE.md).\n\n## Real-repository evaluation\n\nThe unreleased v0.9.x evaluation foundation keeps field evidence separate from ordinary regression tests. Capture explicitly classified runs after scanning and, when relevant, closing a work session:\n\n```bash\ncmi evaluate capture --source-kind self-host --repository-class cli-tool --task-kind audit\ncmi evaluate capture --source-kind external-real --repository-class application --task-kind debugging\ncmi evaluate report\ncmi evaluate report --source-kind external-real\n```\n\nOnly `external-real` contributes to independent-repository counts. `self-host` and `synthetic` remain useful evidence classes but cannot silently inflate real-world coverage. Evaluation records store a one-way repository fingerprint and bounded measurements, not repository names, remotes, absolute paths, session/finding/recommendation text, source contents, or diffs. Reviewed usefulness metrics require explicit review metadata and the report never declares production or v1.0 readiness automatically. See [Real-Repository Evaluation](docs/EVALUATION.md).\n\n## Monorepos and workspaces\n")

replace_once('README.md',
"cmi finding state <id> <open|resolved|accepted|dismissed|superseded> --reason text [--changed-by name] [--superseded-by id] [--json]\ncmi remember <fact|decision|mistake> <text> [--source path ...]\n",
"cmi finding state <id> <open|resolved|accepted|dismissed|superseded> --reason text [--changed-by name] [--superseded-by id] [--json]\ncmi evaluate capture --source-kind <external-real|self-host|synthetic> [--repository-class class] [--task-kind kind] [--session latest|none|id] [--review-outcome pass|partial|fail|unreviewed] [--false-positive-findings N] [--missed-findings N] [--next-action-rating useful|not-useful|unknown] [--handoff-rating useful|not-useful|unknown] [--json]\ncmi evaluate list [--source-kind external-real|self-host|synthetic] [--limit N] [--json]\ncmi evaluate show <id> [--json]\ncmi evaluate report [--source-kind external-real|self-host|synthetic] [--json]\ncmi remember <fact|decision|mistake> <text> [--source path ...]\n")

replace_once('README.md',
"Community documents: [Contributing](CONTRIBUTING.md), [Code of Conduct](CODE_OF_CONDUCT.md), [Governance](GOVERNANCE.md), [Support](SUPPORT.md), [Security](SECURITY.md), [Maintainers](MAINTAINERS.md), [Architecture](docs/ARCHITECTURE.md), [Change Intelligence](docs/CHANGE_INTELLIGENCE.md), [Session Continuation Intelligence](docs/SESSION_INTELLIGENCE.md), [Durable Memory Lifecycle](docs/MEMORY_LIFECYCLE.md), and [Releasing](docs/RELEASING.md).\n",
"Community documents: [Contributing](CONTRIBUTING.md), [Code of Conduct](CODE_OF_CONDUCT.md), [Governance](GOVERNANCE.md), [Support](SUPPORT.md), [Security](SECURITY.md), [Maintainers](MAINTAINERS.md), [Architecture](docs/ARCHITECTURE.md), [Evidence Integrity](docs/EVIDENCE_INTEGRITY.md), [Real-Repository Evaluation](docs/EVALUATION.md), [Change Intelligence](docs/CHANGE_INTELLIGENCE.md), [Session Continuation Intelligence](docs/SESSION_INTELLIGENCE.md), [Durable Memory Lifecycle](docs/MEMORY_LIFECYCLE.md), and [Releasing](docs/RELEASING.md).\n")

print('v0.9.x evaluation patch applied')
