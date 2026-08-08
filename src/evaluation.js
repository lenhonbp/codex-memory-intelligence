import crypto from 'node:crypto';
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
