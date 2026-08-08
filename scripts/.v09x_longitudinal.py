from pathlib import Path
import json


def patch(path, old, new, count=1):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'anchor missing in {path}: {old[:140]!r}')
    p.write_text(text.replace(old, new, count))


def write(path, content):
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content)

# --- Runtime contract: explicit longitudinal human/agent review outcomes + portable bundles.
patch('src/evaluation-contracts.js',
"export const EVALUATION_UTILITY_RATINGS = ['useful', 'not-useful', 'unknown'];\nexport const EVALUATION_STRESS_SCENARIOS",
"export const EVALUATION_UTILITY_RATINGS = ['useful', 'not-useful', 'unknown'];\nexport const EVALUATION_RECONSTRUCTION_RATINGS = ['reduced', 'unchanged', 'increased', 'not-applicable', 'unknown'];\nexport const EVALUATION_FOLLOW_UP_OUTCOMES = ['not-needed', 'needed', 'not-applicable', 'unknown'];\nexport const EVALUATION_VERIFICATION_CHOICE_OUTCOMES = ['improved', 'unchanged', 'worse', 'not-applicable', 'unknown'];\nexport const EVALUATION_HISTORY_RATINGS = ['useful', 'not-useful', 'not-applicable', 'unknown'];\nexport const EVALUATION_BUNDLE_SCHEMA_VERSION = 1;\nexport const EVALUATION_BUNDLE_KIND = 'cmi-evaluation-bundle';\nexport const EVALUATION_STRESS_SCENARIOS")

patch('src/evaluation-contracts.js',
"fail(hasOnlyKeys(review, new Set(['provenance', 'reviewedAt', 'outcome', 'falsePositiveFindings', 'missedFindings', 'nextActionRating', 'handoffRating'])), 'review shape is invalid');",
"fail(hasOnlyKeys(review, new Set(['provenance', 'reviewedAt', 'outcome', 'falsePositiveFindings', 'missedFindings', 'nextActionRating', 'handoffRating', 'reconstructionRating', 'followUpOutcome', 'verificationChoiceOutcome', 'historyRating'])), 'review shape is invalid');")

patch('src/evaluation-contracts.js',
"    fail(validEnum(review.handoffRating, EVALUATION_UTILITY_RATINGS), 'review handoffRating is invalid');\n    if (review.outcome === 'unreviewed') {",
"    fail(validEnum(review.handoffRating, EVALUATION_UTILITY_RATINGS), 'review handoffRating is invalid');\n    const reconstructionRating = review.reconstructionRating ?? 'unknown';\n    const followUpOutcome = review.followUpOutcome ?? 'unknown';\n    const verificationChoiceOutcome = review.verificationChoiceOutcome ?? 'unknown';\n    const historyRating = review.historyRating ?? 'unknown';\n    fail(validEnum(reconstructionRating, EVALUATION_RECONSTRUCTION_RATINGS), 'review reconstructionRating is invalid');\n    fail(validEnum(followUpOutcome, EVALUATION_FOLLOW_UP_OUTCOMES), 'review followUpOutcome is invalid');\n    fail(validEnum(verificationChoiceOutcome, EVALUATION_VERIFICATION_CHOICE_OUTCOMES), 'review verificationChoiceOutcome is invalid');\n    fail(validEnum(historyRating, EVALUATION_HISTORY_RATINGS), 'review historyRating is invalid');\n    if (review.outcome === 'unreviewed') {")

patch('src/evaluation-contracts.js',
"      fail(review.nextActionRating === 'unknown' && review.handoffRating === 'unknown', 'unreviewed records cannot assert usefulness ratings');",
"      fail(review.nextActionRating === 'unknown' && review.handoffRating === 'unknown', 'unreviewed records cannot assert usefulness ratings');\n      fail(reconstructionRating === 'unknown' && followUpOutcome === 'unknown' && verificationChoiceOutcome === 'unknown' && historyRating === 'unknown', 'unreviewed records cannot assert longitudinal outcome judgments');")

patch('src/evaluation-contracts.js',
"  return { valid: errors.length === 0, errors };\n}\n",
"  return { valid: errors.length === 0, errors };\n}\n\nexport function validateEvaluationBundleContract(bundle) {\n  const errors = [];\n  const fail = (condition, message) => { if (!condition) errors.push(message); };\n  fail(hasOnlyKeys(bundle, new Set(['schemaVersion', 'kind', 'exportedAt', 'records'])), 'bundle shape is invalid');\n  if (!isObject(bundle)) return { valid: false, errors };\n  fail(bundle.schemaVersion === EVALUATION_BUNDLE_SCHEMA_VERSION, 'unsupported bundle schemaVersion');\n  fail(bundle.kind === EVALUATION_BUNDLE_KIND, 'bundle kind is invalid');\n  fail(validIso(bundle.exportedAt), 'bundle exportedAt must be an ISO timestamp');\n  fail(Array.isArray(bundle.records) && bundle.records.length <= 1000, 'bundle records must be an array with at most 1000 entries');\n  if (Array.isArray(bundle.records)) {\n    const ids = new Set();\n    for (const record of bundle.records) {\n      const validation = validateEvaluationRecordContract(record);\n      if (!validation.valid) errors.push(`bundle record invalid: ${validation.errors.join(' ')}`);\n      if (record?.id) {\n        if (ids.has(record.id)) errors.push(`bundle contains duplicate evaluation id: ${record.id}`);\n        ids.add(record.id);\n      }\n    }\n  }\n  return { valid: errors.length === 0, errors };\n}\n")

# evaluation.js imports and constants.
patch('src/evaluation.js',
"import crypto from 'node:crypto';\nimport path from 'node:path';",
"import crypto from 'node:crypto';\nimport fs from 'node:fs/promises';\nimport { constants as fsConstants } from 'node:fs';\nimport path from 'node:path';")

patch('src/evaluation.js',
"  EVALUATION_UTILITY_RATINGS,\n  EVALUATION_STRESS_SCENARIOS,\n  validateEvaluationRecordContract,",
"  EVALUATION_UTILITY_RATINGS,\n  EVALUATION_RECONSTRUCTION_RATINGS,\n  EVALUATION_FOLLOW_UP_OUTCOMES,\n  EVALUATION_VERIFICATION_CHOICE_OUTCOMES,\n  EVALUATION_HISTORY_RATINGS,\n  EVALUATION_BUNDLE_SCHEMA_VERSION,\n  EVALUATION_BUNDLE_KIND,\n  EVALUATION_STRESS_SCENARIOS,\n  validateEvaluationRecordContract,\n  validateEvaluationBundleContract,")

patch('src/evaluation.js',
"const MAX_RECORD_BYTES = 1_000_000;\nconst CMI_SOURCE_ROOT",
"const MAX_RECORD_BYTES = 1_000_000;\nconst MAX_BUNDLE_BYTES = 16 * 1024 * 1024;\nconst CMI_SOURCE_ROOT")

old_review = """function normalizeReview(options) {
  const outcome = normalizeEnum(options.reviewOutcome, EVALUATION_REVIEW_OUTCOMES, 'Review outcome', 'unreviewed');
  const provenance = normalizeEnum(options.reviewProvenance, EVALUATION_REVIEW_PROVENANCE, 'Review provenance', 'unreviewed');
  const falsePositiveFindings = normalizeOptionalCount(options.falsePositiveFindings, 'False-positive finding count');
  const missedFindings = normalizeOptionalCount(options.missedFindings, 'Missed finding count');
  const nextActionRating = normalizeEnum(options.nextActionRating, EVALUATION_UTILITY_RATINGS, 'Next-action rating', 'unknown');
  const handoffRating = normalizeEnum(options.handoffRating, EVALUATION_UTILITY_RATINGS, 'Handoff rating', 'unknown');
  const carriesJudgment = falsePositiveFindings !== null || missedFindings !== null || nextActionRating !== 'unknown' || handoffRating !== 'unknown';
  if (outcome === 'unreviewed') {
    if (provenance !== 'unreviewed' || carriesJudgment) throw new Error('Unreviewed evaluation cannot assert reviewer provenance, finding-error counts, or usefulness ratings.');
    return { provenance: 'unreviewed', reviewedAt: null, outcome, falsePositiveFindings: null, missedFindings: null, nextActionRating: 'unknown', handoffRating: 'unknown' };
  }
  if (!['human', 'agent'].includes(provenance)) throw new Error('Reviewed evaluation requires --review-provenance human or agent.');
  return { provenance, reviewedAt: nowIso(), outcome, falsePositiveFindings, missedFindings, nextActionRating, handoffRating };
}
"""
new_review = """function normalizeReview(options) {
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
"""
patch('src/evaluation.js', old_review, new_review)

# Validate direct reviewed capture against captured evidence before persistence.
patch('src/evaluation.js',
"  const validation = validateEvaluationRecordContract(record);\n  if (!validation.valid) throw new Error(`Invalid evaluation record: ${validation.errors.join(' ')}`);",
"  if (review.outcome !== 'unreviewed') assertReviewApplicability(record, review);\n  const validation = validateEvaluationRecordContract(record);\n  if (!validation.valid) throw new Error(`Invalid evaluation record: ${validation.errors.join(' ')}`);")

# One-time review applicability.
patch('src/evaluation.js',
"    if (record.review.outcome !== 'unreviewed') throw new Error('Evaluation record is already reviewed. Capture a new evaluation for a distinct review rather than overwriting provenance.');\n    const updated = { ...record, review };",
"    if (record.review.outcome !== 'unreviewed') throw new Error('Evaluation record is already reviewed. Capture a new evaluation for a distinct review rather than overwriting provenance.');\n    assertReviewApplicability(record, review);\n    const updated = { ...record, review };")

# Filters + portable bundles before listEvaluations.
anchor = """export async function listEvaluations(root, options = {}) {
"""
insert = """function normalizeEvaluationFilters(options = {}) {
  const sourceKind = options.sourceKind ? normalizeEnum(options.sourceKind, EVALUATION_SOURCE_KINDS, 'Evaluation source kind') : null;
  const taskKind = options.taskKind ? normalizeEnum(options.taskKind, EVALUATION_TASK_KINDS, 'Evaluation task kind') : null;
  const subjectVersion = options.subjectVersion ? String(options.subjectVersion).trim() : null;
  if (subjectVersion && !/^\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?$/.test(subjectVersion)) throw new Error('Evaluation subject version must be semantic.');
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
  const serialized = `${JSON.stringify(bundle, null, 2)}\\n`;
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
  for (const record of pending) await safeWriteMemoryFile(root, `${EVALUATION_DIR}/${record.id}.json`, `${JSON.stringify(record, null, 2)}\\n`, { ifMissing: true });
  return { schemaVersion: 1, imported: pending.length, skipped, total: bundle.records.length, sourceKinds: countBy(bundle.records, (record) => record.source.kind) };
}

export async function listEvaluations(root, options = {}) {
"""
patch('src/evaluation.js', anchor, insert)

# list filters.
patch('src/evaluation.js',
"  const sourceKind = options.sourceKind ? normalizeEnum(options.sourceKind, EVALUATION_SOURCE_KINDS, 'Evaluation source kind') : null;\n  const limit = Math.max(1, Math.min(200, Number(options.limit) || 50));\n  const selected = records.filter((record) => !sourceKind || record.source.kind === sourceKind);",
"  const filters = normalizeEvaluationFilters(options);\n  const limit = Math.max(1, Math.min(200, Number(options.limit) || 50));\n  const selected = records.filter((record) => matchesEvaluationFilters(record, filters));")

# New reviewed metrics.
old_metrics = """function reviewedMetrics(records) {
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
"""
new_metrics = """function reviewedMetrics(records) {
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
"""
patch('src/evaluation.js', old_metrics, new_metrics)

# report filters, longitudinal block, and diagnostics.
patch('src/evaluation.js',
"  const sourceKind = options.sourceKind ? normalizeEnum(options.sourceKind, EVALUATION_SOURCE_KINDS, 'Evaluation source kind') : null;\n  const selected = records.filter((record) => !sourceKind || record.source.kind === sourceKind);",
"  const filters = normalizeEvaluationFilters(options);\n  const selected = records.filter((record) => matchesEvaluationFilters(record, filters));")
patch('src/evaluation.js',
"  const stressMetrics = controlledStressMetrics(controlledStressExternal);\n  return {",
"  const stressMetrics = controlledStressMetrics(controlledStressExternal);\n  const longitudinal = longitudinalMetrics(observationalExternal, humanReviewed, agentReviewed);\n  const diagnostics = evidenceDiagnostics(longitudinal);\n  return {")
patch('src/evaluation.js',
"    filter: { sourceKind },",
"    filter: filters,")
patch('src/evaluation.js',
"    controlledStress: stressMetrics,\n    reviewedUsefulness:",
"    controlledStress: stressMetrics,\n    longitudinal,\n    evidenceDiagnostics: diagnostics,\n    reviewedUsefulness:")
patch('src/evaluation.js',
"      'Human-reviewed and agent-reviewed usefulness metrics remain separate; unreviewed records never contribute to usefulness rates.',",
"      'Human-reviewed and agent-reviewed usefulness metrics remain separate; unreviewed records never contribute to usefulness rates.',\n      'Longitudinal reconstruction, follow-up, history, and verification-choice outcomes are explicit reviewer judgments, not values inferred by CMI.',\n      'Evidence diagnostics report missing evidence dimensions only; structural coverage does not establish statistical sufficiency and never triggers automatic threshold recalibration.',\n      'Portable evaluation bundles contain only validated anonymized evaluation records and preserve original source/protocol/reviewer provenance on import.',")
patch('src/evaluation.js',
"    policy: 'CMI reports what the retained corpus supports and keeps source classes, protocols, and reviewer provenance separate. It does not declare v1.0 readiness, production validity, or empirical calibration complete from a small or unreviewed corpus.',",
"    policy: 'CMI reports what the retained corpus supports and keeps source classes, protocols, reviewer provenance, repeated-repository evidence, and longitudinal outcome judgments separate. Structural evidence diagnostics never declare statistical sufficiency, v1.0 readiness, production validity, or empirical calibration complete.',")

# formatted record/report includes longitudinal judgments and gaps.
patch('src/evaluation.js',
"- Review: ${record.review.outcome} · ${record.review.provenance}\\n\\n${record.policy}`;",
"- Review: ${record.review.outcome} · ${record.review.provenance}\\n- Reconstruction: ${reviewValue(record.review, 'reconstructionRating')}\\n- Follow-up: ${reviewValue(record.review, 'followUpOutcome')}\\n- History: ${reviewValue(record.review, 'historyRating')}\\n- Verification choice: ${reviewValue(record.review, 'verificationChoiceOutcome')}\\n\\n${record.policy}`;")

old_report_fmt = """export function formatEvaluationReport(report) {
  const external = report.corpus.externalReal;
  const usefulness = report.reviewedUsefulness;
  return `# CMI real-repository evaluation\n\nCoverage: ${report.coverage.state}\nRecords: ${report.corpus.totalRecords} · external-real ${external.records} · observational ${external.observationalRecords} · controlled-stress ${external.controlledStressRecords}\nIndependent repositories: ${external.uniqueRepositories} · observational repositories ${external.observationalUniqueRepositories}\nRepository classes: ${Object.keys(external.repositoryClasses).length} · observational task kinds: ${Object.keys(external.observationalTaskKinds).length}\nControlled stress: ${report.controlledStress.records} records · ${Object.keys(report.controlledStress.scenarios).length} scenarios · record pass rate ${report.controlledStress.passRate ?? 'n/a'} · invariant pass rate ${report.controlledStress.invariantPassRate ?? 'n/a'}\nReviewed observational external records: ${usefulness.reviewedExternalRecords} · human ${usefulness.provenance.human} · agent ${usefulness.provenance.agent}\nHuman next-action useful rate: ${usefulness.human.nextActionUsefulRate ?? 'n/a'}\nHuman handoff useful rate: ${usefulness.human.handoffUsefulRate ?? 'n/a'}\nAgent next-action useful rate: ${usefulness.agent.nextActionUsefulRate ?? 'n/a'}\nObservational project healthy rate: ${report.observedMetrics.observationalProjectHealthyRate ?? 'n/a'}\nObservational handoff presence rate: ${report.observedMetrics.observationalHandoffPresenceRate ?? 'n/a'}\n\n## Evidence limits\n${report.limitations.map((item) => `- ${item}`).join('\\n')}\n\n${report.policy}`;
}
"""
new_report_fmt = """export function formatEvaluationReport(report) {
  const external = report.corpus.externalReal;
  const usefulness = report.reviewedUsefulness;
  const longitudinal = report.longitudinal;
  return `# CMI real-repository evaluation\n\nCoverage: ${report.coverage.state}\nRecords: ${report.corpus.totalRecords} · external-real ${external.records} · observational ${external.observationalRecords} · controlled-stress ${external.controlledStressRecords}\nIndependent repositories: ${external.uniqueRepositories} · observational repositories ${external.observationalUniqueRepositories}\nRepository classes: ${Object.keys(external.repositoryClasses).length} · observational task kinds: ${Object.keys(external.observationalTaskKinds).length}\nControlled stress: ${report.controlledStress.records} records · ${Object.keys(report.controlledStress.scenarios).length} scenarios · record pass rate ${report.controlledStress.passRate ?? 'n/a'} · invariant pass rate ${report.controlledStress.invariantPassRate ?? 'n/a'}\nReviewed observational external records: ${usefulness.reviewedExternalRecords} · human ${usefulness.provenance.human} · agent ${usefulness.provenance.agent}\nHuman next-action useful rate: ${usefulness.human.nextActionUsefulRate ?? 'n/a'}\nHuman handoff useful rate: ${usefulness.human.handoffUsefulRate ?? 'n/a'}\nRepeated external repositories: ${longitudinal.repeatedRepositories} · repeated records ${longitudinal.repeatedRecords} · multi-task repeated repositories ${longitudinal.repeatedRepositoriesWithMultipleTaskKinds}\nHuman reconstruction reduced rate: ${longitudinal.human.reconstructionReducedRate ?? 'n/a'}\nHuman follow-up not-needed rate: ${longitudinal.human.followUpNotNeededRate ?? 'n/a'}\nHuman history useful rate: ${longitudinal.human.historyUsefulRate ?? 'n/a'}\nHuman verification-choice improved rate: ${longitudinal.human.verificationChoiceImprovedRate ?? 'n/a'}\nEvidence diagnostics: ${report.evidenceDiagnostics.state}\n${report.evidenceDiagnostics.gaps.length ? report.evidenceDiagnostics.gaps.map((item) => `- GAP: ${item}`).join('\\n') : '- No structural evidence dimension is currently missing; statistical sufficiency still requires human judgment.'}\nAgent next-action useful rate: ${usefulness.agent.nextActionUsefulRate ?? 'n/a'}\nObservational project healthy rate: ${report.observedMetrics.observationalProjectHealthyRate ?? 'n/a'}\nObservational handoff presence rate: ${report.observedMetrics.observationalHandoffPresenceRate ?? 'n/a'}\n\n## Evidence limits\n${report.limitations.map((item) => `- ${item}`).join('\\n')}\n\n${report.policy}`;
}
"""
patch('src/evaluation.js', old_report_fmt, new_report_fmt)

# CLI: imports, review inputs, filters, export/import.
patch('src/cli-entry.js',
"  reviewEvaluation,\n  listEvaluations,",
"  reviewEvaluation,\n  exportEvaluations,\n  importEvaluations,\n  listEvaluations,")
patch('src/cli-entry.js',
"    handoffRating: optionValues('--handoff-rating')[0],\n    stressScenario:",
"    handoffRating: optionValues('--handoff-rating')[0],\n    reconstructionRating: optionValues('--reconstruction-rating')[0],\n    followUpOutcome: optionValues('--follow-up-outcome')[0],\n    verificationChoiceOutcome: optionValues('--verification-choice-outcome')[0],\n    historyRating: optionValues('--history-rating')[0],\n    stressScenario:")
patch('src/cli-entry.js',
"return 'Usage: cmi evaluate <capture|review|list|show|report> ...\\n\\nCollect anonymized field evidence while keeping external-real, self-host, and synthetic records separate. Reviews are explicit post-hoc attestations and are not inferred from capture.';",
"return 'Usage: cmi evaluate <capture|review|list|show|report|export|import> ...\\n\\nCollect anonymized field evidence, explicit longitudinal human/agent judgments, and portable local bundles without mixing provenance classes.';")

# Expand evaluate positional value options.
patch('src/cli-entry.js',
"'--review-outcome','--review-provenance','--false-positive-findings','--missed-findings','--next-action-rating','--handoff-rating','--stress-scenario','--stress-expected','--stress-passed','--stress-failed','--limit'",
"'--review-outcome','--review-provenance','--false-positive-findings','--missed-findings','--next-action-rating','--handoff-rating','--reconstruction-rating','--follow-up-outcome','--verification-choice-outcome','--history-rating','--stress-scenario','--stress-expected','--stress-passed','--stress-failed','--subject-version','--since-days','--limit'")

# list/report filters + export/import actions.
patch('src/cli-entry.js',
"      const result = await listEvaluations(process.cwd(), { sourceKind: optionValues('--source-kind')[0], limit: optionNumber('--limit', 50) });",
"      const result = await listEvaluations(process.cwd(), { sourceKind: optionValues('--source-kind')[0], taskKind: optionValues('--task-kind')[0], subjectVersion: optionValues('--subject-version')[0], sinceDays: optionValues('--since-days')[0], limit: optionNumber('--limit', 50) });")
patch('src/cli-entry.js',
"    } else if (action === 'report') {\n      const report = await buildEvaluationReport(process.cwd(), { sourceKind: optionValues('--source-kind')[0] });\n      print(report, formatEvaluationReport(report));\n    } else {\n      throw new Error('Usage: cmi evaluate <capture|review|list|show|report> ...');",
"    } else if (action === 'report') {\n      const report = await buildEvaluationReport(process.cwd(), { sourceKind: optionValues('--source-kind')[0], taskKind: optionValues('--task-kind')[0], subjectVersion: optionValues('--subject-version')[0], sinceDays: optionValues('--since-days')[0] });\n      print(report, formatEvaluationReport(report));\n    } else if (action === 'export') {\n      const filePath = values[0];\n      if (!filePath) throw new Error('Usage: cmi evaluate export <file> [--source-kind kind] [--task-kind kind] [--subject-version version] [--since-days N]');\n      const result = await exportEvaluations(process.cwd(), filePath, { sourceKind: optionValues('--source-kind')[0], taskKind: optionValues('--task-kind')[0], subjectVersion: optionValues('--subject-version')[0], sinceDays: optionValues('--since-days')[0] });\n      print(result, `Exported ${result.records} anonymized evaluation record(s) to ${result.path}.`);\n    } else if (action === 'import') {\n      const filePath = values[0];\n      if (!filePath) throw new Error('Usage: cmi evaluate import <file>');\n      const result = await importEvaluations(process.cwd(), filePath);\n      print(result, `Imported ${result.imported} evaluation record(s); ${result.skipped} already present.`);\n    } else {\n      throw new Error('Usage: cmi evaluate <capture|review|list|show|report|export|import> ...');")

# MCP schemas + filters.
patch('src/mcp-entry.js',
"{ name: 'list_project_evaluations', title: 'List project evaluations', description: 'List bounded anonymized evaluation records with explicit source, protocol, CMI subject revision, repository/task class, and review provenance.', inputSchema: { type: 'object', properties: { sourceKind: { type: 'string', enum: ['external-real', 'self-host', 'synthetic'] }, limit: { type: 'integer', minimum: 1, maximum: 200 } } },",
"{ name: 'list_project_evaluations', title: 'List project evaluations', description: 'List bounded anonymized evaluation records with explicit source, protocol, CMI subject revision, repository/task class, and review provenance.', inputSchema: { type: 'object', properties: { sourceKind: { type: 'string', enum: ['external-real', 'self-host', 'synthetic'] }, taskKind: { type: 'string', enum: ['implementation', 'debugging', 'audit', 'review', 'research', 'verification', 'refactor', 'migration', 'architecture-analysis', 'no-code-investigation', 'unknown'] }, subjectVersion: { type: 'string' }, sinceDays: { type: 'integer', minimum: 1, maximum: 3650 }, limit: { type: 'integer', minimum: 1, maximum: 200 } } },")
patch('src/mcp-entry.js',
"{ name: 'get_project_evaluation_report', title: 'Get project evaluation report', description: 'Aggregate the retained evaluation corpus while keeping external-real/self-host/synthetic, observational/controlled-stress, and human/agent/unreviewed evidence separate.', inputSchema: { type: 'object', properties: { sourceKind: { type: 'string', enum: ['external-real', 'self-host', 'synthetic'] } } },",
"{ name: 'get_project_evaluation_report', title: 'Get project evaluation report', description: 'Aggregate retained evaluation evidence with repeated-repository longitudinal metrics, explicit reviewer outcomes, filters, and structural evidence gaps while preserving provenance separation.', inputSchema: { type: 'object', properties: { sourceKind: { type: 'string', enum: ['external-real', 'self-host', 'synthetic'] }, taskKind: { type: 'string', enum: ['implementation', 'debugging', 'audit', 'review', 'research', 'verification', 'refactor', 'migration', 'architecture-analysis', 'no-code-investigation', 'unknown'] }, subjectVersion: { type: 'string' }, sinceDays: { type: 'integer', minimum: 1, maximum: 3650 } } },")

# Add new review properties to both capture and review schemas by patching both handoffRating occurrences.
mcp = Path('src/mcp-entry.js').read_text()
needle = "    handoffRating: { type: 'string', enum: ['useful', 'not-useful', 'unknown'] },\n"
replacement = needle + "    reconstructionRating: { type: 'string', enum: ['reduced', 'unchanged', 'increased', 'not-applicable', 'unknown'] },\n    followUpOutcome: { type: 'string', enum: ['not-needed', 'needed', 'not-applicable', 'unknown'] },\n    verificationChoiceOutcome: { type: 'string', enum: ['improved', 'unchanged', 'worse', 'not-applicable', 'unknown'] },\n    historyRating: { type: 'string', enum: ['useful', 'not-useful', 'not-applicable', 'unknown'] },\n"
if mcp.count(needle) != 2:
    raise SystemExit(f'expected two MCP handoffRating anchors, found {mcp.count(needle)}')
Path('src/mcp-entry.js').write_text(mcp.replace(needle, replacement))

patch('src/mcp-entry.js',
"const result = await listEvaluations(root, { sourceKind: args.sourceKind, limit: args.limit || 50 });",
"const result = await listEvaluations(root, { sourceKind: args.sourceKind, taskKind: args.taskKind, subjectVersion: args.subjectVersion, sinceDays: args.sinceDays, limit: args.limit || 50 });")
patch('src/mcp-entry.js',
"const result = await buildEvaluationReport(root, { sourceKind: args.sourceKind });",
"const result = await buildEvaluationReport(root, { sourceKind: args.sourceKind, taskKind: args.taskKind, subjectVersion: args.subjectVersion, sinceDays: args.sinceDays });")
patch('src/mcp-entry.js',
"and never treat unreviewed or agent-reviewed evidence as human-reviewed usefulness.`.trim();",
"and never treat unreviewed or agent-reviewed evidence as human-reviewed usefulness. Longitudinal reconstruction, follow-up, history-usefulness, and verification-choice outcomes require explicit review; structural evidence diagnostics never imply statistical sufficiency or automatic threshold recalibration.`.trim();")

# JSON Schema: optional additive v1 review fields preserve old main-checkout evaluation records.
schema_path = Path('schemas/evaluation-record.schema.json')
schema = json.loads(schema_path.read_text())
review_props = schema['properties']['review']['properties']
review_props['reconstructionRating'] = {'enum': ['reduced', 'unchanged', 'increased', 'not-applicable', 'unknown']}
review_props['followUpOutcome'] = {'enum': ['not-needed', 'needed', 'not-applicable', 'unknown']}
review_props['verificationChoiceOutcome'] = {'enum': ['improved', 'unchanged', 'worse', 'not-applicable', 'unknown']}
review_props['historyRating'] = {'enum': ['useful', 'not-useful', 'not-applicable', 'unknown']}
schema_path.write_text(json.dumps(schema, indent=2) + '\n')

bundle_schema = {
  '$schema': 'https://json-schema.org/draft/2020-12/schema',
  '$id': 'https://github.com/lenhonbp/codex-memory-intelligence/schemas/evaluation-bundle.schema.json',
  'title': 'CMI Portable Evaluation Bundle',
  'type': 'object',
  'required': ['schemaVersion', 'kind', 'exportedAt', 'records'],
  'properties': {
    'schemaVersion': {'const': 1},
    'kind': {'const': 'cmi-evaluation-bundle'},
    'exportedAt': {'type': 'string', 'format': 'date-time'},
    'records': {'type': 'array', 'maxItems': 1000, 'items': {'$ref': './evaluation-record.schema.json'}},
  },
  'additionalProperties': False,
}
write('schemas/evaluation-bundle.schema.json', json.dumps(bundle_schema, indent=2) + '\n')

# Quality checks schema/runtime parity for new enums + bundle identity.
patch('scripts/quality.js',
"EVALUATION_UTILITY_RATINGS, EVALUATION_STRESS_SCENARIOS, EVALUATION_STRESS_OUTCOMES } from '../src/evaluation-contracts.js';",
"EVALUATION_UTILITY_RATINGS, EVALUATION_RECONSTRUCTION_RATINGS, EVALUATION_FOLLOW_UP_OUTCOMES, EVALUATION_VERIFICATION_CHOICE_OUTCOMES, EVALUATION_HISTORY_RATINGS, EVALUATION_BUNDLE_SCHEMA_VERSION, EVALUATION_BUNDLE_KIND, EVALUATION_STRESS_SCENARIOS, EVALUATION_STRESS_OUTCOMES } from '../src/evaluation-contracts.js';")
patch('scripts/quality.js',
"  const evaluation = JSON.parse(fs.readFileSync('schemas/evaluation-record.schema.json', 'utf8'));",
"  const evaluation = JSON.parse(fs.readFileSync('schemas/evaluation-record.schema.json', 'utf8'));\n  const evaluationBundle = JSON.parse(fs.readFileSync('schemas/evaluation-bundle.schema.json', 'utf8'));")
patch('scripts/quality.js',
"  if (!sameValues(evaluation.properties?.review?.properties?.handoffRating?.enum, EVALUATION_UTILITY_RATINGS)) errors.push('evaluation handoff ratings differ from runtime contract');",
"  if (!sameValues(evaluation.properties?.review?.properties?.handoffRating?.enum, EVALUATION_UTILITY_RATINGS)) errors.push('evaluation handoff ratings differ from runtime contract');\n  if (!sameValues(evaluation.properties?.review?.properties?.reconstructionRating?.enum, EVALUATION_RECONSTRUCTION_RATINGS)) errors.push('evaluation reconstruction ratings differ from runtime contract');\n  if (!sameValues(evaluation.properties?.review?.properties?.followUpOutcome?.enum, EVALUATION_FOLLOW_UP_OUTCOMES)) errors.push('evaluation follow-up outcomes differ from runtime contract');\n  if (!sameValues(evaluation.properties?.review?.properties?.verificationChoiceOutcome?.enum, EVALUATION_VERIFICATION_CHOICE_OUTCOMES)) errors.push('evaluation verification-choice outcomes differ from runtime contract');\n  if (!sameValues(evaluation.properties?.review?.properties?.historyRating?.enum, EVALUATION_HISTORY_RATINGS)) errors.push('evaluation history ratings differ from runtime contract');\n  if (evaluationBundle.properties?.schemaVersion?.const !== EVALUATION_BUNDLE_SCHEMA_VERSION) errors.push('evaluation bundle schemaVersion differs from runtime contract');\n  if (evaluationBundle.properties?.kind?.const !== EVALUATION_BUNDLE_KIND) errors.push('evaluation bundle kind differs from runtime contract');")

# Regression tests.
write('tests/evaluation-longitudinal.test.js', r'''import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { scanProject } from '../src/core.js';
import { startSession, closeSession } from '../src/session-intelligence.js';
import { captureEvaluation, reviewEvaluation, buildEvaluationReport, exportEvaluations, importEvaluations, validateEvaluationRecord } from '../src/evaluation.js';

async function fixture(prefix = 'cmi-longitudinal-') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture', type: 'module' }));
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'src', 'index.js'), 'export const value = 1;\n');
  await fs.writeFile(path.join(root, 'ROADMAP.md'), '# Next\n\n- [ ] Continue the next evidence-backed task.\n');
  await scanProject(root);
  return root;
}
async function captureSession(root, taskKind = 'review') {
  const session = await startSession(root, `fixture ${taskKind}`);
  const closed = await closeSession(root, session.id, { outcome: 'investigated', accomplished: ['Observed fixture state.'] });
  return captureEvaluation(root, { sourceKind: 'external-real', repositoryClass: 'application', taskKind, session: closed.id });
}

test('human longitudinal review records reconstruction and follow-up judgments only when captured evidence supports them', async () => {
  const root = await fixture();
  const first = await captureSession(root, 'review');
  const second = await captureSession(root, 'research');
  const firstReviewed = await reviewEvaluation(root, first.id, {
    reviewOutcome: 'pass', reviewProvenance: 'human', nextActionRating: 'useful', handoffRating: 'useful',
    reconstructionRating: 'reduced', followUpOutcome: 'not-needed', historyRating: 'not-applicable', verificationChoiceOutcome: 'not-applicable',
  });
  assert.equal(firstReviewed.review.reconstructionRating, 'reduced');
  assert.equal(firstReviewed.review.followUpOutcome, 'not-needed');
  await reviewEvaluation(root, second.id, {
    reviewOutcome: 'pass', reviewProvenance: 'human', reconstructionRating: 'reduced', followUpOutcome: 'not-needed', historyRating: 'not-applicable', verificationChoiceOutcome: 'not-applicable',
  });
  const report = await buildEvaluationReport(root);
  assert.equal(report.longitudinal.repeatedRepositories, 1);
  assert.equal(report.longitudinal.repeatedRecords, 2);
  assert.equal(report.longitudinal.repeatedRepositoriesWithMultipleTaskKinds, 1);
  assert.equal(report.longitudinal.human.reconstructionRatedRecords, 2);
  assert.equal(report.longitudinal.human.reconstructionReducedRate, 1);
  assert.equal(report.longitudinal.human.followUpNotNeededRate, 1);
  assert.equal(report.evidenceDiagnostics.state, 'collecting');
  assert.ok(report.evidenceDiagnostics.gaps.some((item) => /at least two independent/i.test(item)));
  assert.equal(report.evidenceDiagnostics.automaticRecalibrationAllowed, false);
});

test('history and verification-choice judgments fail closed without captured history evidence', async () => {
  const root = await fixture();
  const record = await captureSession(root, 'verification');
  await assert.rejects(() => reviewEvaluation(root, record.id, {
    reviewOutcome: 'partial', reviewProvenance: 'human', historyRating: 'useful', verificationChoiceOutcome: 'improved',
  }), /requires at least one completed change-history record/i);
});

test('unreviewed capture cannot smuggle longitudinal outcome judgments', async () => {
  const root = await fixture();
  await assert.rejects(() => captureEvaluation(root, {
    sourceKind: 'external-real', repositoryClass: 'application', taskKind: 'audit', session: 'none', reconstructionRating: 'reduced',
  }), /unreviewed evaluation cannot assert/i);
});

test('portable evaluation bundles round-trip validated anonymized records and dedupe identical ids', async () => {
  const source = await fixture('cmi-longitudinal-source-');
  const target = await fixture('cmi-longitudinal-target-');
  const record = await captureSession(source, 'review');
  const bundle = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-evaluation-bundle-')), 'corpus.json');
  const exported = await exportEvaluations(source, bundle, { sourceKind: 'external-real' });
  assert.equal(exported.records, 1);
  const parsed = JSON.parse(await fs.readFile(bundle, 'utf8'));
  assert.equal(parsed.kind, 'cmi-evaluation-bundle');
  assert.equal(parsed.records[0].id, record.id);
  assert.doesNotMatch(JSON.stringify(parsed), new RegExp(source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const imported = await importEvaluations(target, bundle);
  assert.equal(imported.imported, 1);
  assert.equal(imported.skipped, 0);
  const repeated = await importEvaluations(target, bundle);
  assert.equal(repeated.imported, 0);
  assert.equal(repeated.skipped, 1);
  const report = await buildEvaluationReport(target, { sourceKind: 'external-real' });
  assert.equal(report.corpus.externalReal.records, 1);
});

test('portable import rejects conflicting evidence for an existing evaluation id', async () => {
  const source = await fixture('cmi-longitudinal-conflict-source-');
  const target = await fixture('cmi-longitudinal-conflict-target-');
  const record = await captureSession(source, 'review');
  const bundleDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-evaluation-conflict-'));
  const bundle = path.join(bundleDir, 'corpus.json');
  await exportEvaluations(source, bundle);
  await importEvaluations(target, bundle);
  const parsed = JSON.parse(await fs.readFile(bundle, 'utf8'));
  parsed.records[0].task.kind = 'research';
  const conflict = path.join(bundleDir, 'conflict.json');
  await fs.writeFile(conflict, JSON.stringify(parsed));
  await assert.rejects(() => importEvaluations(target, conflict), new RegExp(`conflict for id ${record.id}`, 'i'));
});

test('report filters bound longitudinal windows without changing stored evidence', async () => {
  const root = await fixture();
  const record = await captureSession(root, 'review');
  const file = path.join(root, '.codex-memory', 'evaluations', `${record.id}.json`);
  const saved = JSON.parse(await fs.readFile(file, 'utf8'));
  saved.recordedAt = '2020-01-01T00:00:00.000Z';
  assert.equal(validateEvaluationRecord(saved), true);
  await fs.writeFile(file, `${JSON.stringify(saved, null, 2)}\n`);
  const recent = await buildEvaluationReport(root, { sinceDays: 7 });
  assert.equal(recent.corpus.totalRecords, 0);
  const all = await buildEvaluationReport(root, { taskKind: 'review' });
  assert.equal(all.corpus.totalRecords, 1);
});

test('CLI exposes explicit longitudinal review and portable corpus commands', async () => {
  const root = await fixture();
  const record = await captureSession(root, 'review');
  const cli = path.resolve('src/cli-entry.js');
  const reviewed = spawnSync(process.execPath, [cli, 'evaluate', 'review', record.id, '--review-outcome', 'pass', '--review-provenance', 'human', '--reconstruction-rating', 'reduced', '--follow-up-outcome', 'not-needed', '--history-rating', 'not-applicable', '--verification-choice-outcome', 'not-applicable', '--json'], { cwd: root, encoding: 'utf8' });
  assert.equal(reviewed.status, 0, reviewed.stderr);
  assert.equal(JSON.parse(reviewed.stdout).review.reconstructionRating, 'reduced');
  const bundle = path.join(root, 'evaluation-export.json');
  const exported = spawnSync(process.execPath, [cli, 'evaluate', 'export', bundle, '--source-kind', 'external-real', '--json'], { cwd: root, encoding: 'utf8' });
  assert.equal(exported.status, 0, exported.stderr);
  assert.equal(JSON.parse(exported.stdout).records, 1);
  const report = spawnSync(process.execPath, [cli, 'evaluate', 'report', '--since-days', '30', '--json'], { cwd: root, encoding: 'utf8' });
  assert.equal(report.status, 0, report.stderr);
  assert.ok(Object.hasOwn(JSON.parse(report.stdout), 'longitudinal'));
});
''')

# MCP tests enforce new longitudinal schema/filter surface.
patch('tests/evaluation-mcp.test.js',
"    assert.ok(tools.some((tool) => tool.name === 'get_project_evaluation_report'));\n    assert.ok(!tools.some((tool) => tool.name === 'capture_project_evaluation'));",
"    assert.ok(tools.some((tool) => tool.name === 'get_project_evaluation_report'));\n    const reportTool = tools.find((tool) => tool.name === 'get_project_evaluation_report');\n    assert.ok(reportTool.inputSchema.properties.sinceDays);\n    assert.ok(reportTool.inputSchema.properties.taskKind);\n    assert.ok(!tools.some((tool) => tool.name === 'capture_project_evaluation'));")
patch('tests/evaluation-mcp.test.js',
"    assert.ok(tools.some((tool) => tool.name === 'capture_project_evaluation'));",
"    assert.ok(tools.some((tool) => tool.name === 'capture_project_evaluation'));\n    const reviewTool = tools.find((tool) => tool.name === 'review_project_evaluation');\n    assert.ok(reviewTool);\n    assert.ok(reviewTool.inputSchema.properties.reconstructionRating);\n    assert.ok(reviewTool.inputSchema.properties.followUpOutcome);\n    assert.ok(reviewTool.inputSchema.properties.verificationChoiceOutcome);\n    assert.ok(reviewTool.inputSchema.properties.historyRating);")

# Docs and roadmap.
patch('CHANGELOG.md',
"## [Unreleased]\n\n",
"## [Unreleased]\n\n- Added longitudinal evaluation outcomes for reconstruction effort, user follow-up need, historical-evidence usefulness, and verification-choice influence with explicit human/agent provenance and applicability checks.\n- Added repeated-repository longitudinal aggregation, bounded time/task/version report filters, and structural evidence-gap diagnostics that never claim statistical sufficiency or auto-recalibrate thresholds.\n- Added portable, anonymized, bounded evaluation bundle export/import with runtime validation, no-overwrite export, dedupe, and conflict fail-closed semantics for local multi-repository corpus aggregation.\n\n")

patch('ROADMAP.md',
"- [ ] Stress incremental correctness for renames after scan, clock skew, rebases, dirty worktrees, and large monorepos beyond deterministic fixtures already covered.",
"- [x] Stress incremental correctness for renames after scan, clock skew, rebases/history rewrites, dirty worktrees, and large monorepos with controlled external-real field evidence beyond deterministic fixtures.")
patch('ROADMAP.md',
"- [ ] Complete controlled external-real stress evidence for rename-after-scan, rebases/history rewrite, dirty worktrees, clock skew, and large monorepos.\n- [ ] Measure repeated-task verification-choice improvement and session-handoff/next-action usefulness with explicit review data.",
"- [x] Complete controlled external-real stress evidence for rename-after-scan, rebases/history rewrite, dirty worktrees, clock skew, and large monorepos.\n- [x] Add longitudinal human/agent review outcomes, repeated-repository aggregation, portable local corpus export/import, bounded report windows, and structural evidence-gap diagnostics without automatic recalibration.\n- [ ] Measure repeated-task verification-choice improvement and session-handoff/next-action usefulness with enough explicit human review data to support an empirical claim.")

# Evaluation documentation append before Runtime contract.
patch('docs/EVALUATION.md',
"## Runtime contract\n",
"## Longitudinal human-reviewed outcomes\n\nPost-hoc review can explicitly record four longitudinal outcomes in addition to next-action/handoff usefulness:\n\n- `--reconstruction-rating reduced|unchanged|increased|not-applicable|unknown` — whether the captured handoff reduced project-state reconstruction effort;\n- `--follow-up-outcome not-needed|needed|not-applicable|unknown` — whether the captured next action avoided a separate \"what next?\" follow-up;\n- `--history-rating useful|not-useful|not-applicable|unknown` — whether captured historical change evidence was useful;\n- `--verification-choice-outcome improved|unchanged|worse|not-applicable|unknown` — whether history-informed evidence improved the verification decision.\n\nThese are explicit reviewer judgments. CMI never infers them from session text. Reconstruction/follow-up judgments require the corresponding captured handoff/next-action evidence. History/verification-choice judgments require at least one completed change-history record in the captured measurements. Controlled-stress records cannot assert ordinary longitudinal outcomes.\n\n```bash\ncmi evaluate review <id> \\\n  --review-outcome pass \\\n  --review-provenance human \\\n  --reconstruction-rating reduced \\\n  --follow-up-outcome not-needed \\\n  --history-rating useful \\\n  --verification-choice-outcome improved\n```\n\nReports aggregate human and agent outcomes separately. Repeated-repository metrics count only observational `external-real` evidence and report the number of repositories with 2+ observations, repeated records, repeated multi-task repositories, and repeated time span.\n\n```bash\ncmi evaluate report --source-kind external-real --since-days 90\ncmi evaluate report --task-kind debugging\ncmi evaluate report --subject-version 0.9.0\n```\n\n`evidenceDiagnostics` is deliberately structural. It reports which evidence dimensions are still missing (multi-repository repetition, human repeated reviews, reconstruction/follow-up/history/verification judgments, multi-task repetition). It never declares statistical sufficiency and never enables automatic confidence/priority recalibration.\n\n## Portable local corpus\n\nLongitudinal evidence often lives in separate repositories. CMI therefore supports a bounded local bundle rather than requiring a database or cloud service:\n\n```bash\ncmi evaluate export ./cmi-evidence.json --source-kind external-real\ncmi evaluate import ./other-project-evidence.json\ncmi evaluate report --source-kind external-real\n```\n\nA bundle contains only validated anonymized evaluation records. Export refuses to overwrite an existing file and refuses to write inside `.codex-memory`. Import validates the entire bundle before writing, skips identical IDs, and fails closed if an existing ID contains different evidence. Original source/protocol/reviewer provenance is preserved; import never upgrades `agent` or `unreviewed` evidence to human evidence. Bundle reads are bounded to 16 MiB and reject symlink/non-regular inputs.\n\n## Runtime contract\n")

# Update older empirical-limit language now that the five stress cases are evidenced, while retaining open longitudinal claims.
patch('docs/EVALUATION.md',
"- that CMI behaves well across large, rename-heavy, rebased, clock-skewed, or long-lived repositories;",
"- that the currently observed controlled stress results generalize to all large, rename-heavy, rebased, clock-skewed, or long-lived repositories;")

# README evaluation section and command list.
patch('README.md',
"cmi evaluate report --source-kind external-real\n```",
"cmi evaluate review <id> --review-outcome pass --review-provenance human --reconstruction-rating reduced --follow-up-outcome not-needed\ncmi evaluate report --source-kind external-real --since-days 90\ncmi evaluate export ./cmi-evidence.json --source-kind external-real\ncmi evaluate import ./other-project-evidence.json\n```")
patch('README.md',
"Human and agent review provenance is explicit and aggregated separately, and the report never declares production or v1.0 readiness automatically.",
"Human and agent review provenance is explicit and aggregated separately. Longitudinal reports can measure repeated-repository reconstruction, follow-up, history-usefulness, and verification-choice judgments, while structural evidence diagnostics never declare statistical sufficiency, production readiness, v1.0 readiness, or automatic threshold recalibration. Portable bundles let separate repositories contribute validated anonymized records without a database or cloud service.")
patch('README.md',
"cmi evaluate list [--source-kind external-real|self-host|synthetic] [--limit N] [--json]\ncmi evaluate show <id> [--json]\ncmi evaluate report [--source-kind external-real|self-host|synthetic] [--json]",
"cmi evaluate review <id> --review-outcome <pass|partial|fail> --review-provenance <human|agent> [--reconstruction-rating reduced|unchanged|increased|not-applicable|unknown] [--follow-up-outcome not-needed|needed|not-applicable|unknown] [--history-rating useful|not-useful|not-applicable|unknown] [--verification-choice-outcome improved|unchanged|worse|not-applicable|unknown] [--json]\ncmi evaluate list [--source-kind external-real|self-host|synthetic] [--task-kind kind] [--subject-version version] [--since-days N] [--limit N] [--json]\ncmi evaluate show <id> [--json]\ncmi evaluate report [--source-kind external-real|self-host|synthetic] [--task-kind kind] [--subject-version version] [--since-days N] [--json]\ncmi evaluate export <file> [--source-kind kind] [--task-kind kind] [--subject-version version] [--since-days N] [--json]\ncmi evaluate import <file> [--json]")

# MCP docs: concise append if marker exists.
try:
    patch('docs/MCP.md',
"## Safety model\n",
"## Longitudinal evaluation\n\nThe session-aware MCP evaluation surface exposes the same explicit longitudinal review fields as CLI: reconstruction rating, follow-up outcome, history usefulness, and verification-choice outcome. `get_project_evaluation_report` and `list_project_evaluations` accept bounded `taskKind`, `subjectVersion`, and `sinceDays` filters. Human and agent review provenance remains separate; unreviewed evidence cannot carry these judgments. Portable evaluation bundle file I/O remains CLI-only so an MCP client does not gain arbitrary host-file import/export authority merely by enabling durable project writes.\n\n## Safety model\n")
except SystemExit:
    # docs/MCP structure may not use that heading; append a bounded section instead.
    p = Path('docs/MCP.md')
    p.write_text(p.read_text().rstrip() + "\n\n## Longitudinal evaluation\n\nThe session-aware MCP evaluation surface exposes explicit reconstruction, follow-up, history-usefulness, and verification-choice review fields plus bounded task/version/time filters on evaluation reads/reports. Human and agent provenance remains separate. Portable evaluation bundle file I/O is CLI-only to avoid granting arbitrary host-file import/export authority through MCP durable-write opt-in.\n")
