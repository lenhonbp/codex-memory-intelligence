import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { status as getProjectStatus } from './core.js';
import { VERSION } from './version.js';
import { getRepositoryBaseline } from './advisor.js';
import { buildChangeInsights } from './change-intelligence.js';
import { getSession, getSessionHandoff, listFindings } from './session-intelligence.js';
import { ensureSafeMemoryRoot, safeEnsureMemoryDir, safeListMemoryDir, safeReadMemoryJson, safeWriteMemoryFile } from './storage.js';
import { withLeaseLock } from './lease-lock.js';
import {
  EVALUATION_SCHEMA_VERSION,
  EVALUATION_SOURCE_KINDS,
  EVALUATION_PROTOCOL_KINDS,
  EVALUATION_REPOSITORY_CLASSES,
  EVALUATION_TASK_KINDS,
  EVALUATION_REVIEW_OUTCOMES,
  EVALUATION_REVIEW_PROVENANCE,
  EVALUATION_UTILITY_RATINGS,
  EVALUATION_RECONSTRUCTION_RATINGS,
  EVALUATION_FOLLOW_UP_OUTCOMES,
  EVALUATION_VERIFICATION_CHOICE_OUTCOMES,
  EVALUATION_HISTORY_RATINGS,
  EVALUATION_BUNDLE_SCHEMA_VERSION,
  EVALUATION_BUNDLE_KIND,
  EVALUATION_STRESS_SCENARIOS,
  validateEvaluationRecordContract,
  validateEvaluationBundleContract,
} from './evaluation-contracts.js';

const execFileAsync = promisify(execFile);
const EVALUATION_DIR = 'evaluations';
const MAX_RECORDS = 1000;
const MAX_RECORD_BYTES = 1_000_000;
const MAX_BUNDLE_BYTES = 16 * 1024 * 1024;
const CMI_SOURCE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
async function evaluationSubject() {
  const revision = await runGit(CMI_SOURCE_ROOT, ['rev-parse', 'HEAD']);
  return { version: VERSION, sourceRevision: /^[0-9a-f]{40}$/i.test(revision) ? revision.toLowerCase() : null };
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
  const provenance = normalizeEnum(options.reviewProvenance, EVALUATION_REVIEW_PROVENANCE, 'Review provenance', 'unreviewed');
  const falsePositiveFindings = normalizeOptionalCount(options.falsePositiveFindings, 'False-positive finding count');
  const missedFindings = normalizeOptionalCount(options.missedFindings, 'Missed finding count');
  const nextActionRating = normalizeEnum(options.nextActionRating, EVALUATION_UTILITY_RATINGS, 'Next-action rating', 'unknown');
  const handoffRating = normalizeEnum(options.handoffRating, EVALUATION_UTILITY_RATINGS, 'Handoff rating', 'unknown');
  const reconstructionRating = normalizeEnum(options.reconstructionRating, EVALUATION_RECONSTRUCTION_RATINGS, 'Reconstruction rating', 'unknown');
  const followUpOutcome = normalizeEnum(options.followUpOutcome, EVALUATION_FOLLOW_UP_OUTCOMES, 'Follow-up outcome', 'unknown');
  const verificationChoiceOutcome = normalizeEnum(options.verificationChoiceOutcome, EVALUATION_VERIFICATION_CHOICE_OUTCOMES, 'Verification-choice outcome', 'unknown');
  const historyRating = normalizeEnum(options.historyRating, EVALUATION_HISTORY_RATINGS, 'History rating', 'unknown');
  const carriesJudgment = falsePositiveFindings !== null || missedFindings !== null || nextActionRating !== 'unknown' || handoffRating !== 'unknown'
    || reconstructionRating !== 'unknown' || followUpOutcome !== 'unknown' || verificationChoiceOutcome !== 'unknown' || historyRating !== 'unknown';
  if (outcome === 'unreviewed') {
    if (provenance !== 'unreviewed' || carriesJudgment) throw new Error('Unreviewed evaluation cannot assert reviewer provenance, finding-error counts, usefulness ratings, or longitudinal outcomes.');
    return { provenance: 'unreviewed', reviewedAt: null, outcome, falsePositiveFindings: null, missedFindings: null, nextActionRating: 'unknown', handoffRating: 'unknown', reconstructionRating: 'unknown', followUpOutcome: 'unknown', verificationChoiceOutcome: 'unknown', historyRating: 'unknown' };
  }
  if (!['human', 'agent'].includes(provenance)) throw new Error('Reviewed evaluation requires --review-provenance human or agent.');
  return { provenance, reviewedAt: nowIso(), outcome, falsePositiveFindings, missedFindings, nextActionRating, handoffRating, reconstructionRating, followUpOutcome, verificationChoiceOutcome, historyRating };
}
function reviewValue(review, key) { return review?.[key] ?? 'unknown'; }
function assertReviewApplicability(record, review) {
  if (review.outcome === 'unreviewed') return;
  const continuation = record.measurements.continuation;
  const history = record.measurements.changeHistory;
  const longitudinal = [review.reconstructionRating, review.followUpOutcome, review.verificationChoiceOutcome, review.historyRating];
  if (record.protocol.kind === 'controlled-stress' && longitudinal.some((value) => !['unknown', 'not-applicable'].includes(value))) {
    throw new Error('Controlled-stress review cannot assert ordinary longitudinal usefulness outcomes.');
  }
  if (!['unknown', 'not-applicable'].includes(review.reconstructionRating) && (!continuation.sessionPresent || !continuation.handoffPresent)) {
    throw new Error('Reconstruction rating requires a captured session handoff.');
  }
  if (!['unknown', 'not-applicable'].includes(review.followUpOutcome) && (!continuation.sessionPresent || !continuation.nextActionPresent)) {
    throw new Error('Follow-up outcome requires a captured session next action.');
  }
  if (!['unknown', 'not-applicable'].includes(review.historyRating) && history.completedRecords < 1) {
    throw new Error('History rating requires at least one completed change-history record in the captured evidence.');
  }
  if (!['unknown', 'not-applicable'].includes(review.verificationChoiceOutcome) && history.completedRecords < 1) {
    throw new Error('Verification-choice outcome requires at least one completed change-history record in the captured evidence.');
  }
}
function normalizeStress(options, protocolKind) {
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
  const protocolKind = normalizeEnum(options.protocolKind, EVALUATION_PROTOCOL_KINDS, 'Evaluation protocol', 'observational');
  const repositoryClass = normalizeEnum(options.repositoryClass, EVALUATION_REPOSITORY_CLASSES, 'Repository class', 'unknown');
  const taskKind = normalizeEnum(options.taskKind, EVALUATION_TASK_KINDS, 'Task kind', 'unknown');
  const review = normalizeReview(options);
  const stress = normalizeStress(options, protocolKind);
  const project = await getProjectStatus(root);
  if (!project.initialized || !project.index) throw new Error('Evaluation capture requires initialized, scanned CMI project intelligence. Run cmi scan first.');
  await safeEnsureMemoryDir(root, EVALUATION_DIR);
  const [{ session, handoff }, findings, history, baseline, identity, subject] = await Promise.all([
    resolveClosedSession(root, options.session || 'latest'),
    listFindings(root, { state: 'open', limit: 200 }),
    buildChangeInsights(root, '', { limit: 50 }),
    getRepositoryBaseline(root),
    repositoryIdentity(root),
    evaluationSubject(),
  ]);
  const graph = project.graphHealth || {};
  const projectClean = session?.close?.current?.repository?.projectClean;
  const worktreeClean = typeof projectClean === 'boolean' ? projectClean : baseline?.available ? Boolean(baseline.clean) : null;
  const record = {
    schemaVersion: EVALUATION_SCHEMA_VERSION,
    id: crypto.randomUUID(),
    recordedAt: nowIso(),
    subject,
    source: { kind: sourceKind, independent: sourceKind === 'external-real' },
    protocol: { kind: protocolKind },
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
    stress,
    review,
    policy: 'Evaluation records are anonymized descriptive evidence tied to a CMI version/source revision when available. external-real is the only independent-repository class; observational and controlled-stress protocols remain distinguishable; human and agent reviews remain separate. CMI does not infer production readiness, causal correctness, or usefulness from an unreviewed or undersized corpus.',
  };
  if (review.outcome !== 'unreviewed') assertReviewApplicability(record, review);
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

export async function reviewEvaluation(root, selector, options = {}) {
  const review = normalizeReview(options);
  if (review.outcome === 'unreviewed') throw new Error('Evaluation review requires --review-outcome pass, partial, or fail with --review-provenance human or agent.');
  const snapshots = await safeEnsureMemoryDir(root, 'snapshots');
  return withLeaseLock(path.join(snapshots, 'evaluation-review.lock'), async () => {
    const { records } = await readEvaluationRecords(root);
    const record = resolveEvaluation(records, selector);
    if (record.review.outcome !== 'unreviewed') throw new Error('Evaluation record is already reviewed. Capture a new evaluation for a distinct review rather than overwriting provenance.');
    assertReviewApplicability(record, review);
    const updated = { ...record, review };
    const validation = validateEvaluationRecordContract(updated);
    if (!validation.valid) throw new Error(`Invalid reviewed evaluation record: ${validation.errors.join(' ')}`);
    await safeWriteMemoryFile(root, `${EVALUATION_DIR}/${record.id}.json`, `${JSON.stringify(updated, null, 2)}
`);
    return updated;
  });
}

function normalizeEvaluationFilters(options = {}) {
  const sourceKind = options.sourceKind ? normalizeEnum(options.sourceKind, EVALUATION_SOURCE_KINDS, 'Evaluation source kind') : null;
  const taskKind = options.taskKind ? normalizeEnum(options.taskKind, EVALUATION_TASK_KINDS, 'Evaluation task kind') : null;
  const subjectVersion = options.subjectVersion ? String(options.subjectVersion).trim() : null;
  if (subjectVersion && !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(subjectVersion)) throw new Error('Evaluation subject version must be semantic.');
  let sinceDays = null;
  if (options.sinceDays !== undefined && options.sinceDays !== null && options.sinceDays !== '') {
    sinceDays = Number(options.sinceDays);
    if (!Number.isInteger(sinceDays) || sinceDays < 1 || sinceDays > 3650) throw new Error('Evaluation since-days must be an integer from 1 to 3650.');
  }
  const cutoff = sinceDays ? new Date(Date.now() - sinceDays * 86_400_000).toISOString() : null;
  return { sourceKind, taskKind, subjectVersion, sinceDays, cutoff };
}
function matchesEvaluationFilters(record, filters) {
  return (!filters.sourceKind || record.source.kind === filters.sourceKind)
    && (!filters.taskKind || record.task.kind === filters.taskKind)
    && (!filters.subjectVersion || record.subject.version === filters.subjectVersion)
    && (!filters.cutoff || record.recordedAt >= filters.cutoff);
}
async function readPortableBundle(filePath) {
  const target = path.resolve(String(filePath || '').trim());
  if (!String(filePath || '').trim()) throw new Error('Evaluation bundle path is required.');
  const before = await fs.lstat(target);
  if (before.isSymbolicLink() || !before.isFile()) throw new Error('Evaluation bundle must be a regular non-symlink file.');
  if (before.size > MAX_BUNDLE_BYTES) throw new Error(`Evaluation bundle exceeds ${MAX_BUNDLE_BYTES} bytes.`);
  const noFollow = typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0;
  let handle;
  try { handle = await fs.open(target, fsConstants.O_RDONLY | noFollow); }
  catch (error) {
    if (!noFollow || !['EINVAL', 'ENOTSUP'].includes(error?.code)) throw error;
    handle = await fs.open(target, fsConstants.O_RDONLY);
  }
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.size > MAX_BUNDLE_BYTES || before.dev !== opened.dev || before.ino !== opened.ino) throw new Error('Evaluation bundle changed or is unsafe while opening.');
    return JSON.parse(await handle.readFile('utf8'));
  } finally { await handle?.close().catch(() => {}); }
}
export async function exportEvaluations(root, filePath, options = {}) {
  const { records } = await readEvaluationRecords(root);
  const filters = normalizeEvaluationFilters(options);
  const selected = records.filter((record) => matchesEvaluationFilters(record, filters));
  const bundle = { schemaVersion: EVALUATION_BUNDLE_SCHEMA_VERSION, kind: EVALUATION_BUNDLE_KIND, exportedAt: nowIso(), records: selected };
  const validation = validateEvaluationBundleContract(bundle);
  if (!validation.valid) throw new Error(`Invalid evaluation bundle: ${validation.errors.join(' ')}`);
  const serialized = `${JSON.stringify(bundle, null, 2)}\n`;
  if (Buffer.byteLength(serialized) > MAX_BUNDLE_BYTES) throw new Error(`Evaluation bundle exceeds ${MAX_BUNDLE_BYTES} bytes.`);
  const target = path.resolve(String(filePath || '').trim());
  if (!String(filePath || '').trim()) throw new Error('Evaluation export path is required.');
  const memory = path.resolve(root, '.codex-memory');
  if (target === memory || target.startsWith(`${memory}${path.sep}`)) throw new Error('Evaluation bundle export must stay outside .codex-memory.');
  await fs.writeFile(target, serialized, { flag: 'wx', mode: 0o600 });
  return { schemaVersion: 1, path: target, records: selected.length, filter: filters };
}
export async function importEvaluations(root, filePath) {
  const bundle = await readPortableBundle(filePath);
  const validation = validateEvaluationBundleContract(bundle);
  if (!validation.valid) throw new Error(`Invalid evaluation bundle: ${validation.errors.join(' ')}`);
  await safeEnsureMemoryDir(root, EVALUATION_DIR);
  const pending = [];
  let skipped = 0;
  for (const record of bundle.records) {
    const relative = `${EVALUATION_DIR}/${record.id}.json`;
    const existing = await safeReadMemoryJson(root, relative, { optional: true, maxBytes: MAX_RECORD_BYTES });
    if (!existing) { pending.push(record); continue; }
    if (JSON.stringify(existing) !== JSON.stringify(record)) throw new Error(`Evaluation import conflict for id ${record.id}; existing evidence differs.`);
    skipped += 1;
  }
  for (const record of pending) await safeWriteMemoryFile(root, `${EVALUATION_DIR}/${record.id}.json`, `${JSON.stringify(record, null, 2)}\n`, { ifMissing: true });
  return { schemaVersion: 1, imported: pending.length, skipped, total: bundle.records.length, sourceKinds: countBy(bundle.records, (record) => record.source.kind) };
}

export async function listEvaluations(root, options = {}) {
  const { records, invalidRecords, truncated } = await readEvaluationRecords(root);
  const filters = normalizeEvaluationFilters(options);
  const limit = Math.max(1, Math.min(200, Number(options.limit) || 50));
  const selected = records.filter((record) => matchesEvaluationFilters(record, filters));
  return {
    schemaVersion: 1,
    records: selected.slice(0, limit).map((record) => ({
      id: record.id, recordedAt: record.recordedAt, subjectVersion: record.subject.version, sourceRevision: record.subject.sourceRevision,
      sourceKind: record.source.kind, protocolKind: record.protocol.kind,
      repositoryFingerprint: record.repository.fingerprint, repositoryClass: record.repository.class,
      taskKind: record.task.kind, stressScenario: record.stress.scenario, stressOutcome: record.stress.outcome, reviewOutcome: record.review.outcome, reviewProvenance: record.review.provenance,
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

function controlledStressMetrics(records) {
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
  const nextActionRated = records.filter((record) => record.review.nextActionRating !== 'unknown');
  const handoffRated = records.filter((record) => record.review.handoffRating !== 'unknown');
  const reconstructionRated = records.filter((record) => ['reduced', 'unchanged', 'increased'].includes(reviewValue(record.review, 'reconstructionRating')));
  const followUpRated = records.filter((record) => ['not-needed', 'needed'].includes(reviewValue(record.review, 'followUpOutcome')));
  const verificationChoiceRated = records.filter((record) => ['improved', 'unchanged', 'worse'].includes(reviewValue(record.review, 'verificationChoiceOutcome')));
  const historyRated = records.filter((record) => ['useful', 'not-useful'].includes(reviewValue(record.review, 'historyRating')));
  const falsePositiveCounts = records.map((record) => record.review.falsePositiveFindings).filter(Number.isInteger);
  const missedCounts = records.map((record) => record.review.missedFindings).filter(Number.isInteger);
  return {
    records: records.length,
    nextActionRatedRecords: nextActionRated.length,
    nextActionUsefulRate: rate(nextActionRated.filter((record) => record.review.nextActionRating === 'useful').length, nextActionRated.length),
    handoffRatedRecords: handoffRated.length,
    handoffUsefulRate: rate(handoffRated.filter((record) => record.review.handoffRating === 'useful').length, handoffRated.length),
    reconstructionRatedRecords: reconstructionRated.length,
    reconstructionReducedRate: rate(reconstructionRated.filter((record) => reviewValue(record.review, 'reconstructionRating') === 'reduced').length, reconstructionRated.length),
    followUpRatedRecords: followUpRated.length,
    followUpNotNeededRate: rate(followUpRated.filter((record) => reviewValue(record.review, 'followUpOutcome') === 'not-needed').length, followUpRated.length),
    verificationChoiceRatedRecords: verificationChoiceRated.length,
    verificationChoiceImprovedRate: rate(verificationChoiceRated.filter((record) => reviewValue(record.review, 'verificationChoiceOutcome') === 'improved').length, verificationChoiceRated.length),
    historyRatedRecords: historyRated.length,
    historyUsefulRate: rate(historyRated.filter((record) => reviewValue(record.review, 'historyRating') === 'useful').length, historyRated.length),
    falsePositiveFindingsObserved: falsePositiveCounts.length ? falsePositiveCounts.reduce((sum, value) => sum + value, 0) : null,
    missedFindingsObserved: missedCounts.length ? missedCounts.reduce((sum, value) => sum + value, 0) : null,
  };
}
function longitudinalMetrics(observationalExternal, humanReviewed, agentReviewed) {
  const groups = new Map();
  for (const record of observationalExternal) {
    const key = record.repository.fingerprint;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  const repeated = [...groups.values()].filter((items) => items.length >= 2);
  const repeatedFingerprints = new Set(repeated.map((items) => items[0].repository.fingerprint));
  const repeatedRecords = observationalExternal.filter((record) => repeatedFingerprints.has(record.repository.fingerprint));
  const times = repeatedRecords.map((record) => Date.parse(record.recordedAt)).filter(Number.isFinite).sort((a, b) => a - b);
  const repeatedTaskRepositories = repeated.filter((items) => uniqueCount(items, (record) => record.task.kind) >= 2).length;
  const humanRepeated = humanReviewed.filter((record) => repeatedFingerprints.has(record.repository.fingerprint));
  const agentRepeated = agentReviewed.filter((record) => repeatedFingerprints.has(record.repository.fingerprint));
  return {
    observationalRecords: observationalExternal.length,
    repeatedRepositories: repeated.length,
    repeatedRecords: repeatedRecords.length,
    repeatedRepositoriesWithMultipleTaskKinds: repeatedTaskRepositories,
    firstRepeatedAt: times.length ? new Date(times[0]).toISOString() : null,
    lastRepeatedAt: times.length ? new Date(times[times.length - 1]).toISOString() : null,
    repeatedSpanDays: times.length >= 2 ? round((times[times.length - 1] - times[0]) / 86_400_000) : null,
    human: reviewedMetrics(humanRepeated),
    agent: reviewedMetrics(agentRepeated),
  };
}
function evidenceDiagnostics(longitudinal) {
  const gaps = [];
  if (longitudinal.repeatedRepositories < 2) gaps.push('Need repeated observational evidence from at least two independent external repositories.');
  if (longitudinal.repeatedRepositoriesWithMultipleTaskKinds < 1) gaps.push('Need at least one repeated external repository covering multiple task kinds.');
  if (longitudinal.human.records < 1) gaps.push('Need explicit human-reviewed repeated external observations.');
  if (longitudinal.human.reconstructionRatedRecords < 1) gaps.push('Need human reconstruction-effort judgments on repeated work.');
  if (longitudinal.human.followUpRatedRecords < 1) gaps.push('Need human follow-up-needed judgments on repeated work.');
  if (longitudinal.human.historyRatedRecords < 1) gaps.push('Need human usefulness judgments for historical change evidence when history exists.');
  if (longitudinal.human.verificationChoiceRatedRecords < 1) gaps.push('Need human verification-choice judgments for history-informed work.');
  return {
    state: gaps.length === 0 ? 'longitudinal-evidence-present' : longitudinal.repeatedRepositories > 0 ? 'collecting' : 'insufficient',
    gaps,
    structuralCoverageOnly: true,
    statisticalSufficiency: 'not-automatically-determined',
    automaticRecalibrationAllowed: false,
  };
}

export async function buildEvaluationReport(root, options = {}) {
  const { records, invalidRecords, truncated } = await readEvaluationRecords(root);
  const filters = normalizeEvaluationFilters(options);
  const selected = records.filter((record) => matchesEvaluationFilters(record, filters));
  const external = selected.filter((record) => record.source.kind === 'external-real');
  const observationalExternal = external.filter((record) => record.protocol.kind === 'observational');
  const controlledStressExternal = external.filter((record) => record.protocol.kind === 'controlled-stress');
  const reviewedExternal = observationalExternal.filter((record) => record.review.outcome !== 'unreviewed');
  const humanReviewed = reviewedExternal.filter((record) => record.review.provenance === 'human');
  const agentReviewed = reviewedExternal.filter((record) => record.review.provenance === 'agent');
  const externalWithSession = observationalExternal.filter((record) => record.measurements.continuation.sessionPresent);
  const stressMetrics = controlledStressMetrics(controlledStressExternal);
  const longitudinal = longitudinalMetrics(observationalExternal, humanReviewed, agentReviewed);
  const diagnostics = evidenceDiagnostics(longitudinal);
  return {
    schemaVersion: 1,
    generatedAt: nowIso(),
    filter: filters,
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
        observationalTaskKinds: countBy(observationalExternal, (record) => record.task.kind),
        stressScenarios: countBy(controlledStressExternal, (record) => record.stress.scenario),
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
    controlledStress: stressMetrics,
    longitudinal,
    evidenceDiagnostics: diagnostics,
    reviewedUsefulness: {
      reviewedExternalRecords: reviewedExternal.length,
      provenance: { human: humanReviewed.length, agent: agentReviewed.length },
      human: reviewedMetrics(humanReviewed),
      agent: reviewedMetrics(agentReviewed),
    },
    limitations: [
      'external-real records are descriptive independent-repository evidence; self-host and synthetic records never contribute to independent-repository counts.',
      'Coverage state is based on observational external-real runs; controlled-stress runs are reported separately with invariant pass/fail counts and cannot inflate ordinary field-coverage state.',
      'A multi-repository corpus is coverage evidence, not automatic proof of production readiness or causal correctness.',
      'Human-reviewed and agent-reviewed usefulness metrics remain separate; unreviewed records never contribute to usefulness rates.',
      'Longitudinal reconstruction, follow-up, history, and verification-choice outcomes are explicit reviewer judgments, not values inferred by CMI.',
      'Evidence diagnostics report missing evidence dimensions only; structural coverage does not establish statistical sufficiency and never triggers automatic threshold recalibration.',
      'Portable evaluation bundles contain only validated anonymized evaluation records and preserve original source/protocol/reviewer provenance on import.',
      'Repository fingerprints are one-way hashes for grouping runs; raw repository names, remotes, absolute paths, session goals, findings text, and recommendation text are not stored in evaluation records.',
      'Subject sourceRevision is recorded when CMI runs from a Git checkout; packaged installations may report only the semantic version.',
      'Evaluation aggregation does not recalibrate Behavioral Change Intelligence thresholds automatically.',
    ],
    policy: 'CMI reports what the retained corpus supports, keeps reviewer provenance separate, and keeps source classes, protocols, repeated-repository evidence, and longitudinal outcome judgments distinct. Structural evidence diagnostics never declare statistical sufficiency, v1.0 readiness, production validity, or empirical calibration complete.',
  };
}

export function formatEvaluationRecord(record) {
  return `# CMI evaluation ${record.id.slice(0, 12)}\n\n- CMI: ${record.subject.version}${record.subject.sourceRevision ? ` · ${record.subject.sourceRevision.slice(0, 12)}` : ''}\n- Source: ${record.source.kind}${record.source.independent ? ' · independent repository evidence' : ''}\n- Protocol: ${record.protocol.kind}\n- Stress: ${record.stress.scenario || 'n/a'} · ${record.stress.outcome} (${record.stress.passedInvariantCount}/${record.stress.expectedInvariantCount} invariants passed)\n- Repository class: ${record.repository.class}\n- Task kind: ${record.task.kind}\n- Evidence health: ${record.measurements.project.evidenceState}\n- Session outcome: ${record.measurements.continuation.outcome || 'none'}\n- Open findings: ${record.measurements.continuation.openFindingCount}\n- Next action: ${record.measurements.continuation.nextActionPresent ? record.measurements.continuation.nextActionPriority : 'none'}\n- Review: ${record.review.outcome} · ${record.review.provenance}\n- Reconstruction: ${reviewValue(record.review, 'reconstructionRating')}\n- Follow-up: ${reviewValue(record.review, 'followUpOutcome')}\n- History: ${reviewValue(record.review, 'historyRating')}\n- Verification choice: ${reviewValue(record.review, 'verificationChoiceOutcome')}\n\n${record.policy}`;
}
export function formatEvaluationList(result) {
  if (!result.records.length) return 'No matching CMI evaluation records.';
  return result.records.map((item) => `- ${item.id.slice(0, 12)} · CMI ${item.subjectVersion} · ${item.sourceKind}/${item.protocolKind} · ${item.repositoryClass}/${item.taskKind} · ${item.evidenceState} · review ${item.reviewOutcome}/${item.reviewProvenance}`).join('\n');
}
export function formatEvaluationReport(report) {
  const external = report.corpus.externalReal;
  const usefulness = report.reviewedUsefulness;
  const longitudinal = report.longitudinal;
  return `# CMI real-repository evaluation\n\nCoverage: ${report.coverage.state}\nRecords: ${report.corpus.totalRecords} · external-real ${external.records} · observational ${external.observationalRecords} · controlled-stress ${external.controlledStressRecords}\nIndependent repositories: ${external.uniqueRepositories} · observational repositories ${external.observationalUniqueRepositories}\nRepository classes: ${Object.keys(external.repositoryClasses).length} · observational task kinds: ${Object.keys(external.observationalTaskKinds).length}\nControlled stress: ${report.controlledStress.records} records · ${Object.keys(report.controlledStress.scenarios).length} scenarios · record pass rate ${report.controlledStress.passRate ?? 'n/a'} · invariant pass rate ${report.controlledStress.invariantPassRate ?? 'n/a'}\nReviewed observational external records: ${usefulness.reviewedExternalRecords} · human ${usefulness.provenance.human} · agent ${usefulness.provenance.agent}\nHuman next-action useful rate: ${usefulness.human.nextActionUsefulRate ?? 'n/a'}\nHuman handoff useful rate: ${usefulness.human.handoffUsefulRate ?? 'n/a'}\nRepeated external repositories: ${longitudinal.repeatedRepositories} · repeated records ${longitudinal.repeatedRecords} · multi-task repeated repositories ${longitudinal.repeatedRepositoriesWithMultipleTaskKinds}\nHuman reconstruction reduced rate: ${longitudinal.human.reconstructionReducedRate ?? 'n/a'}\nHuman follow-up not-needed rate: ${longitudinal.human.followUpNotNeededRate ?? 'n/a'}\nHuman history useful rate: ${longitudinal.human.historyUsefulRate ?? 'n/a'}\nHuman verification-choice improved rate: ${longitudinal.human.verificationChoiceImprovedRate ?? 'n/a'}\nEvidence diagnostics: ${report.evidenceDiagnostics.state}\n${report.evidenceDiagnostics.gaps.length ? report.evidenceDiagnostics.gaps.map((item) => `- GAP: ${item}`).join('\n') : '- No structural evidence dimension is currently missing; statistical sufficiency still requires human judgment.'}\nAgent next-action useful rate: ${usefulness.agent.nextActionUsefulRate ?? 'n/a'}\nObservational project healthy rate: ${report.observedMetrics.observationalProjectHealthyRate ?? 'n/a'}\nObservational handoff presence rate: ${report.observedMetrics.observationalHandoffPresenceRate ?? 'n/a'}\n\n## Evidence limits\n${report.limitations.map((item) => `- ${item}`).join('\n')}\n\n${report.policy}`;
}
