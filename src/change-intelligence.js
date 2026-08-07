import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { initProject } from './core.js';
import { prepareChangeBrief, getRepositoryBaseline, mapProjectBoundaries } from './advisor.js';
import { tokenize } from './search.js';

const execFileAsync = promisify(execFile);
const MEMORY_DIR = '.codex-memory';
const CHANGE_DIR = 'changes';
const MAX_RECORDS_READ = 500;
const MAX_PATHS = 160;
const MAX_TEXT_ITEMS = 20;
const MAX_TEXT_LENGTH = 500;
const VALID_OUTCOMES = new Set(['succeeded', 'failed', 'partial', 'abandoned', 'unknown']);
const VALID_VERIFICATION = new Set(['passed', 'failed', 'skipped', 'unknown']);

function slash(value) { return String(value || '').replace(/\\/g, '/'); }
function unique(values) { return [...new Set((values || []).filter(Boolean))]; }
function bounded(values, limit) { return (values || []).slice(0, Math.max(0, limit)); }
function round(value) { return Number.isFinite(value) ? Number(value.toFixed(3)) : null; }
function looksSensitive(text) {
  return /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)
    || /\b(?:api[_ -]?key|password|secret|access[_ -]?token|refresh[_ -]?token)\s*[:=]\s*\S{6,}/i.test(text)
    || /\b(?:sk|ghp|github_pat|xox[baprs])-[-A-Za-z0-9_]{12,}\b/.test(text);
}
function cleanText(value, label) {
  const clean = String(value || '').trim();
  if (!clean) throw new Error(`${label} cannot be empty.`);
  if (clean.length > MAX_TEXT_LENGTH) throw new Error(`${label} must be ${MAX_TEXT_LENGTH} characters or fewer.`);
  if (looksSensitive(clean)) throw new Error(`${label} appears to contain a secret. Store a reference, not the credential.`);
  return clean;
}
function cleanOptionalText(value, label) {
  const clean = String(value || '').trim();
  if (!clean) return null;
  return cleanText(clean, label);
}
function normalizeRelativeFile(value) {
  const raw = slash(value).trim().replace(/^\.\//, '');
  if (!raw) throw new Error('Observed file path cannot be empty.');
  if (raw.startsWith('/') || /^[A-Za-z]:\//.test(raw)) throw new Error(`Observed file path must be project-relative: ${value}`);
  const segments = raw.split('/').filter(Boolean);
  if (!segments.length || segments.some((segment) => segment === '..' || segment === '.')) throw new Error(`Observed file path escapes the project: ${value}`);
  return segments.join('/');
}
function normalizeExplicitFiles(files) {
  return bounded(unique((files || []).map(normalizeRelativeFile)), MAX_PATHS);
}
function changesDirectory(root) { return path.join(root, MEMORY_DIR, CHANGE_DIR); }
function recordPath(root, id) { return path.join(changesDirectory(root), `${id}.json`); }
function summaryOf(record) {
  return {
    id: record.id,
    status: record.status,
    goal: record.goal,
    workspace: record.workspace || null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    completedAt: record.completion?.completedAt || null,
    outcome: record.completion?.outcome || null,
    observedChangedFiles: record.completion?.finalObservation?.observedChangedFiles?.length
      ?? record.observations?.at(-1)?.observedChangedFiles?.length
      ?? 0,
  };
}

async function ensureChangeDirectory(root) {
  await initProject(root);
  await fs.mkdir(changesDirectory(root), { recursive: true });
}

async function writeRecord(root, record) {
  await ensureChangeDirectory(root);
  const target = recordPath(root, record.id);
  const temporary = `${target}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  const content = `${JSON.stringify(record, null, 2)}\n`;
  await fs.writeFile(temporary, content, 'utf8');
  try {
    await fs.rename(temporary, target);
  } catch (error) {
    if (!['EEXIST', 'EPERM'].includes(error?.code)) throw error;
    await fs.rm(target, { force: true });
    await fs.rename(temporary, target);
  }
}

async function safeReadRecord(filePath) {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
    if (!parsed || parsed.schemaVersion !== 1 || typeof parsed.id !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

async function readRecords(root) {
  const directory = changesDirectory(root);
  const names = await fs.readdir(directory).catch(() => []);
  const records = [];
  let invalidRecords = 0;
  for (const name of names.filter((name) => /^[0-9a-f-]+\.json$/i.test(name)).slice(0, MAX_RECORDS_READ)) {
    const record = await safeReadRecord(path.join(directory, name));
    if (record) records.push(record);
    else invalidRecords += 1;
  }
  records.sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
  return { records, invalidRecords, truncated: names.length > MAX_RECORDS_READ };
}

async function resolveRecord(root, selector) {
  const raw = String(selector || '').trim().toLowerCase();
  if (!raw || !/^[0-9a-f-]+$/.test(raw)) throw new Error('A valid change-record ID or prefix is required.');
  const { records } = await readRecords(root);
  const matches = records.filter((record) => record.id.toLowerCase() === raw || record.id.toLowerCase().startsWith(raw));
  if (!matches.length) throw new Error(`Change record not found: ${selector}`);
  if (matches.length > 1) throw new Error(`Change-record prefix is ambiguous: ${selector}`);
  return matches[0];
}

async function runGit(root, args) {
  try {
    const result = await execFileAsync('git', args, {
      cwd: root,
      timeout: 4_000,
      maxBuffer: 1_048_576,
      windowsHide: true,
      encoding: 'utf8',
    });
    return String(result.stdout || '').trim();
  } catch {
    return '';
  }
}

function projectRelative(value, projectPath = '.') {
  const normalized = slash(value).replace(/^\.\//, '');
  const prefix = slash(projectPath || '.').replace(/^\.\//, '').replace(/\/$/, '');
  if (!prefix || prefix === '.') return normalized;
  return normalized.startsWith(`${prefix}/`) ? normalized.slice(prefix.length + 1) : normalized;
}

async function committedFilesSince(root, beforeBaseline, currentBaseline) {
  const startHead = beforeBaseline?.fullHead;
  const currentHead = currentBaseline?.fullHead;
  if (!/^[0-9a-f]{40}$/i.test(startHead || '') || !/^[0-9a-f]{40}$/i.test(currentHead || '') || startHead === currentHead) return [];
  const output = await runGit(root, ['diff', '--name-only', '--relative', startHead, currentHead, '--']);
  if (!output) return [];
  return bounded(unique(output.split(/\r?\n/).filter(Boolean).map(normalizeRelativeFile)), MAX_PATHS);
}

function predictedFilesFromBrief(brief) {
  if (!brief?.ready) return [];
  return bounded(unique([
    ...(brief.context?.recommendedFiles || []),
    ...(brief.impact?.matchedFiles || []),
    ...(brief.impact?.seedFiles || []),
    ...(brief.impact?.directDependents || []),
    ...(brief.impact?.affectedFiles || []),
  ]).map(normalizeRelativeFile), MAX_PATHS);
}

function predictedBoundariesFromBrief(brief) {
  return bounded((brief?.boundaries?.relevant || []).map((item) => ({
    id: item.id,
    label: item.label,
    workspace: item.workspace || null,
    confidence: item.confidence,
  })), 30);
}

function compareScopes(predictedFiles, observedFiles) {
  const predicted = new Set(predictedFiles || []);
  const observed = new Set(observedFiles || []);
  const overlap = [...observed].filter((file) => predicted.has(file)).sort();
  const missedByPrediction = [...observed].filter((file) => !predicted.has(file)).sort();
  const predictedButUnchanged = [...predicted].filter((file) => !observed.has(file)).sort();
  return {
    predictedFileCount: predicted.size,
    observedChangedFileCount: observed.size,
    overlapCount: overlap.length,
    overlap: bounded(overlap, MAX_PATHS),
    missedByPrediction: bounded(missedByPrediction, MAX_PATHS),
    predictedButUnchanged: bounded(predictedButUnchanged, MAX_PATHS),
    changedPathCoverage: observed.size ? round(overlap.length / observed.size) : null,
    predictedScopeTouched: predicted.size ? round(overlap.length / predicted.size) : null,
    interpretation: 'These ratios compare predicted scope with observed changed paths only. They do not prove full impact accuracy, causality, or runtime coverage.',
  };
}

function observedBoundaryReport(boundaryMap, files) {
  if (!boundaryMap?.available) return { boundaries: [], unmappedFiles: [...files] };
  const counts = new Map();
  const unmappedFiles = [];
  const byId = new Map((boundaryMap.boundaries || []).map((item) => [item.id, item]));
  for (const file of files) {
    const id = boundaryMap.fileBoundary?.[file];
    if (!id) { unmappedFiles.push(file); continue; }
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  const boundaries = [...counts.entries()].map(([id, changedFiles]) => {
    const item = byId.get(id) || {};
    return { id, label: item.label || id, workspace: item.workspace || null, changedFiles, confidence: item.confidence || 'low' };
  }).sort((a, b) => b.changedFiles - a.changedFiles || a.id.localeCompare(b.id));
  return { boundaries, unmappedFiles: bounded(unmappedFiles, MAX_PATHS) };
}

function normalizeVerification(item) {
  if (typeof item === 'string') {
    const clean = cleanText(item, 'Verification');
    const separator = clean.lastIndexOf('=');
    const name = separator > 0 ? clean.slice(0, separator).trim() : clean;
    const requested = separator > 0 ? clean.slice(separator + 1).trim().toLowerCase() : 'unknown';
    return { name: cleanText(name, 'Verification name'), status: VALID_VERIFICATION.has(requested) ? requested : 'unknown' };
  }
  if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Verification must be a string or object.');
  const name = cleanText(item.name, 'Verification name');
  const status = String(item.status || 'unknown').trim().toLowerCase();
  if (!VALID_VERIFICATION.has(status)) throw new Error(`Verification status must be one of: ${[...VALID_VERIFICATION].join(', ')}.`);
  const evidence = cleanOptionalText(item.evidence, 'Verification evidence');
  return { name, status, ...(evidence ? { evidence } : {}) };
}

function normalizeTextItems(values, label) {
  return bounded((values || []).map((value) => cleanText(value, label)), MAX_TEXT_ITEMS);
}

function actualFilesFromRecord(record) {
  return record.completion?.finalObservation?.observedChangedFiles
    || record.observations?.at(-1)?.observedChangedFiles
    || [];
}

function relevantRecordText(record) {
  const final = record.completion?.finalObservation;
  return [
    record.goal,
    ...(actualFilesFromRecord(record) || []),
    ...(final?.observedBoundaries || []).map((item) => item.label),
    ...(record.completion?.unexpectedImpact || []),
    ...(record.completion?.notes || []),
  ].join('\n');
}

function relevanceScore(record, queryTokens) {
  if (!queryTokens.size) return 1;
  const tokens = new Set(tokenize(relevantRecordText(record)));
  let overlap = 0;
  for (const token of queryTokens) if (tokens.has(token)) overlap += 1;
  return overlap;
}

function pairCounts(records, extractor, perRecordLimit = 30) {
  const counts = new Map();
  let truncatedRecords = 0;
  for (const record of records) {
    const values = unique(extractor(record) || []).sort();
    if (values.length > perRecordLimit) truncatedRecords += 1;
    const selected = values.slice(0, perRecordLimit);
    for (let left = 0; left < selected.length; left += 1) {
      for (let right = left + 1; right < selected.length; right += 1) {
        const key = `${selected[left]}\u0000${selected[right]}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
  }
  const edges = [...counts.entries()].map(([key, count]) => {
    const [from, to] = key.split('\u0000');
    return { from, to, count, confidence: count >= 3 ? 'high' : count === 2 ? 'medium' : 'low' };
  }).sort((a, b) => b.count - a.count || a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  return { edges: edges.slice(0, 40), truncatedRecords };
}

function verificationPatterns(records) {
  const map = new Map();
  for (const record of records) {
    for (const item of record.completion?.verifications || []) {
      const key = item.name.toLowerCase();
      const current = map.get(key) || { name: item.name, total: 0, passed: 0, failed: 0, skipped: 0, unknown: 0 };
      current.total += 1;
      current[item.status] += 1;
      map.set(key, current);
    }
  }
  return [...map.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)).slice(0, 20);
}

function coverageCalibration(records) {
  const samples = records.map((record) => record.completion?.finalObservation?.comparison).filter((item) => item && item.observedChangedFileCount > 0);
  if (!samples.length) return { samples: 0, averageChangedPathCoverage: null, averagePredictedScopeTouched: null };
  const coverage = samples.map((item) => item.changedPathCoverage).filter(Number.isFinite);
  const touched = samples.map((item) => item.predictedScopeTouched).filter(Number.isFinite);
  const average = (values) => values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
  return { samples: samples.length, averageChangedPathCoverage: average(coverage), averagePredictedScopeTouched: average(touched) };
}

export async function listChangeRecords(root, options = {}) {
  const { records, invalidRecords, truncated } = await readRecords(root);
  const status = options.status ? String(options.status).trim().toLowerCase() : null;
  if (status && !['active', 'completed'].includes(status)) throw new Error('Change-record status must be active or completed.');
  const limit = Math.max(1, Math.min(100, Number(options.limit) || 20));
  const selected = records.filter((record) => !status || record.status === status).slice(0, limit);
  return { records: selected.map(summaryOf), invalidRecords, truncated, policy: 'Change records are durable local evidence. They are not automatically converted into project facts, decisions, or lessons.' };
}

export async function getChangeRecord(root, selector) {
  return resolveRecord(root, selector);
}

export async function buildChangeInsights(root, query = '', options = {}) {
  const normalizedQuery = String(query || '').trim();
  const { records, invalidRecords, truncated } = await readRecords(root);
  const completed = records.filter((record) => record.status === 'completed');
  const queryTokens = new Set(tokenize(normalizedQuery));
  const ranked = completed.map((record) => ({ record, score: relevanceScore(record, queryTokens) }))
    .filter((item) => !queryTokens.size || item.score > 0)
    .sort((a, b) => b.score - a.score || String(b.record.completion?.completedAt || '').localeCompare(String(a.record.completion?.completedAt || '')));
  const limit = Math.max(1, Math.min(20, Number(options.limit) || 6));
  const relevant = ranked.slice(0, limit).map((item) => item.record);
  const basis = relevant.length ? relevant : (queryTokens.size ? [] : completed.slice(0, limit));
  const files = pairCounts(basis, actualFilesFromRecord, 30);
  const boundaries = pairCounts(basis, (record) => (record.completion?.finalObservation?.observedBoundaries || []).map((item) => item.id), 20);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    query: normalizedQuery,
    corpus: { completedRecords: completed.length, consideredRecords: basis.length, invalidRecords, truncated },
    matches: relevant.map((record) => ({
      ...summaryOf(record),
      changedFiles: bounded(actualFilesFromRecord(record), 30),
      changedBoundaries: bounded((record.completion?.finalObservation?.observedBoundaries || []).map((item) => item.label), 12),
      missedByPrediction: bounded(record.completion?.finalObservation?.comparison?.missedByPrediction || [], 20),
      verifications: bounded(record.completion?.verifications || [], 12),
    })),
    behavioralEvidence: {
      fileCoChanges: files.edges,
      boundaryCoChanges: boundaries.edges,
      verificationPatterns: verificationPatterns(basis),
      pairwiseTruncation: { fileRecords: files.truncatedRecords, boundaryRecords: boundaries.truncatedRecords },
    },
    calibration: coverageCalibration(basis),
    limitations: [
      'Co-change frequency is historical correlation, not a causal dependency.',
      'Observed changed paths are not the same as every runtime or downstream impact.',
      'Verification results are recorded evidence claims supplied by a human or agent; CMI does not execute those commands itself.',
      'A missing historical match means only that CMI has no matching completed record in this local project history.',
    ],
  };
}

export async function startChangeRecord(root, goal, options = {}) {
  const normalizedGoal = cleanText(goal, 'Change goal');
  await ensureChangeDirectory(root);
  const brief = await prepareChangeBrief(root, normalizedGoal, { limit: options.limit || 12, depth: options.depth || 3, workspace: options.workspace });
  if (!brief.ready) throw new Error(brief.reason || 'Pre-change brief is not ready.');
  const history = await buildChangeInsights(root, normalizedGoal, { limit: 5 });
  const now = new Date().toISOString();
  const predictedFiles = predictedFilesFromBrief(brief);
  const record = {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    status: 'active',
    goal: normalizedGoal,
    workspace: options.workspace || null,
    createdAt: now,
    updatedAt: now,
    before: {
      baseline: brief.baseline,
      predicted: {
        files: predictedFiles,
        boundaries: predictedBoundariesFromBrief(brief),
        risks: bounded((brief.risks || []).map((item) => ({ id: item.id, title: item.title, severity: item.severity, confidence: item.confidence })), 20),
        verification: bounded((brief.verification || []).map((item) => ({ id: item.id, title: item.title, guidance: item.guidance })), 20),
      },
      memoryCoverage: brief.memory?.coverage || null,
      provenance: brief.provenance,
      assumptions: brief.assumptions,
      historicalEvidence: {
        matches: history.matches.slice(0, 5),
        calibration: history.calibration,
        fileCoChanges: history.behavioralEvidence.fileCoChanges.slice(0, 10),
        verificationPatterns: history.behavioralEvidence.verificationPatterns.slice(0, 10),
        limitations: history.limitations,
      },
      attribution: brief.baseline?.available ? (brief.baseline.clean ? 'strong' : 'limited-preexisting-worktree') : 'explicit-files-only',
    },
    observations: [],
    completion: null,
    policy: 'This record stores bounded project-change evidence. It does not automatically create durable facts, architecture decisions, or lessons.',
  };
  await writeRecord(root, record);
  return record;
}

export async function observeChangeRecord(root, selector, options = {}) {
  const record = await resolveRecord(root, selector);
  if (record.status !== 'active') throw new Error('Completed change records are immutable. Start a new record for additional work.');
  const baseline = await getRepositoryBaseline(root);
  const explicitFiles = normalizeExplicitFiles(options.files || []);
  const committed = baseline.available ? await committedFilesSince(root, record.before?.baseline, baseline) : [];
  const initialDirty = new Set((record.before?.baseline?.changes || []).map((item) => projectRelative(item.path, record.before?.baseline?.projectPath)));
  const currentDirty = baseline.available
    ? unique((baseline.changes || []).map((item) => projectRelative(item.path, baseline.projectPath)).map(normalizeRelativeFile))
    : [];
  const attributableDirty = record.before?.baseline?.clean ? currentDirty : currentDirty.filter((file) => !initialDirty.has(file));
  const ambiguousPreExisting = record.before?.baseline?.clean ? [] : currentDirty.filter((file) => initialDirty.has(file));
  const observedChangedFiles = bounded(unique([...committed, ...attributableDirty, ...explicitFiles]).sort(), MAX_PATHS);
  const boundaryMap = await mapProjectBoundaries(root);
  const boundaryReport = observedBoundaryReport(boundaryMap, observedChangedFiles);
  const comparison = compareScopes(record.before?.predicted?.files || [], observedChangedFiles);
  const predictedBoundaryIds = new Set((record.before?.predicted?.boundaries || []).map((item) => item.id));
  const unexpectedBoundaries = boundaryReport.boundaries.filter((item) => !predictedBoundaryIds.has(item.id));
  const observation = {
    observedAt: new Date().toISOString(),
    baseline,
    attribution: baseline.available ? (record.before?.baseline?.clean ? 'strong' : 'limited-preexisting-worktree') : 'explicit-files-only',
    observedChangedFiles,
    committedFilesSinceStart: committed,
    explicitFiles,
    ambiguousPreExistingFiles: bounded(ambiguousPreExisting, MAX_PATHS),
    observedBoundaries: boundaryReport.boundaries,
    unmappedFiles: boundaryReport.unmappedFiles,
    unexpectedBoundaries,
    comparison,
  };
  record.observations = [...(record.observations || []), observation].slice(-100);
  record.updatedAt = observation.observedAt;
  await writeRecord(root, record);
  return observation;
}

export async function completeChangeRecord(root, selector, options = {}) {
  let record = await resolveRecord(root, selector);
  if (record.status !== 'active') throw new Error('Change record is already completed.');
  await observeChangeRecord(root, record.id, { files: options.files || [] });
  record = await resolveRecord(root, record.id);
  const outcome = String(options.outcome || 'unknown').trim().toLowerCase();
  if (!VALID_OUTCOMES.has(outcome)) throw new Error(`Outcome must be one of: ${[...VALID_OUTCOMES].join(', ')}.`);
  const verifications = bounded((options.verifications || []).map(normalizeVerification), MAX_TEXT_ITEMS);
  const unexpectedImpact = normalizeTextItems(options.unexpectedImpact || [], 'Unexpected impact');
  const notes = normalizeTextItems(options.notes || [], 'Completion note');
  const finalObservation = record.observations.at(-1);
  const learningCandidates = [];
  if (finalObservation?.comparison?.missedByPrediction?.length) {
    learningCandidates.push({
      type: 'prediction-gap',
      status: 'proposal',
      evidence: finalObservation.comparison.missedByPrediction,
      proposal: 'Review why these changed paths were outside the predicted scope and whether a durable dependency or architecture rule should be recorded.',
    });
  }
  const failedChecks = verifications.filter((item) => item.status === 'failed').map((item) => item.name);
  if (failedChecks.length) {
    learningCandidates.push({
      type: 'failure-mode',
      status: 'proposal',
      evidence: failedChecks,
      proposal: 'Review failed verification evidence and record a durable mistake only when the cause and prevention rule are confirmed.',
    });
  }
  if (unexpectedImpact.length) {
    learningCandidates.push({
      type: 'unexpected-impact',
      status: 'proposal',
      evidence: unexpectedImpact,
      proposal: 'Review unexpected impact and decide whether it represents a stable dependency, invariant, or failure mode worth preserving as durable memory.',
    });
  }
  const completedAt = new Date().toISOString();
  record.status = 'completed';
  record.updatedAt = completedAt;
  record.completion = {
    completedAt,
    outcome,
    finalObservation,
    verifications,
    unexpectedImpact,
    notes,
    learningCandidates,
    policy: 'Learning candidates require review. Completion never writes project memory automatically.',
  };
  await writeRecord(root, record);
  return record;
}

export function formatChangeRecord(record) {
  const latest = record.completion?.finalObservation || record.observations?.at(-1);
  const changed = latest?.observedChangedFiles || [];
  const missed = latest?.comparison?.missedByPrediction || [];
  const verification = record.completion?.verifications || [];
  return `# Change record ${record.id.slice(0, 12)}\n\n- Status: ${record.status}\n- Goal: ${record.goal}\n- Workspace: ${record.workspace || 'project'}\n- Created: ${record.createdAt}\n- Outcome: ${record.completion?.outcome || 'not completed'}\n- Attribution: ${latest?.attribution || record.before?.attribution || 'unknown'}\n\n## Predicted scope\n- Files: ${record.before?.predicted?.files?.length || 0}\n- Boundaries: ${(record.before?.predicted?.boundaries || []).map((item) => item.label).join(', ') || 'none'}\n\n## Observed changed paths\n${changed.map((file) => `- \`${file}\``).join('\n') || '- None observed yet'}\n\n## Prediction gaps\n${missed.map((file) => `- \`${file}\``).join('\n') || '- None observed'}\n\n## Verification evidence\n${verification.map((item) => `- [${item.status}] ${item.name}`).join('\n') || '- Not completed yet'}\n\n${record.policy}`;
}

export function formatChangeInsights(result) {
  const matches = result.matches.map((item) => `- ${item.id.slice(0, 12)} · ${item.goal} · ${item.outcome || 'unknown'} · ${item.changedFiles.length} changed paths`).join('\n') || '- No matching completed changes';
  const coChanges = result.behavioralEvidence.fileCoChanges.slice(0, 12).map((item) => `- ${item.from} ↔ ${item.to}: ${item.count} record(s) · confidence ${item.confidence}`).join('\n') || '- Not enough relevant history';
  const checks = result.behavioralEvidence.verificationPatterns.slice(0, 12).map((item) => `- ${item.name}: ${item.total} record(s), ${item.passed} passed, ${item.failed} failed`).join('\n') || '- No verification history';
  return `# Change intelligence${result.query ? `: ${result.query}` : ''}\n\nCompleted records: ${result.corpus.completedRecords} · considered: ${result.corpus.consideredRecords}\n\n## Relevant history\n${matches}\n\n## Historical co-change evidence\n${coChanges}\n\n## Verification patterns\n${checks}\n\n## Coverage calibration\n- Samples: ${result.calibration.samples}\n- Average changed-path coverage: ${result.calibration.averageChangedPathCoverage ?? 'n/a'}\n- Average predicted scope touched: ${result.calibration.averagePredictedScopeTouched ?? 'n/a'}\n\n## Limitations\n${result.limitations.map((item) => `- ${item}`).join('\n')}`;
}

export function formatChangeList(result) {
  const rows = result.records.map((item) => `- ${item.id.slice(0, 12)} · ${item.status} · ${item.goal}${item.outcome ? ` · ${item.outcome}` : ''}`).join('\n') || '- No change records';
  return `# Change records\n\n${rows}\n\n${result.policy}`;
}
