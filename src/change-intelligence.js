import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { initProject } from './core.js';
import { prepareChangeBrief, getRepositoryBaseline, mapProjectBoundaries, inspectGitHistoryContinuity } from './advisor.js';
import { tokenize } from './search.js';
import { looksSensitive } from './sensitive.js';
import { acquireLeaseLock, releaseLeaseLock } from './lease-lock.js';
import { safeEnsureMemoryDir } from './storage.js';
import { assessCompletionEvidence } from './completion-evidence.js';
import { EVIDENCE_KINDS, validateTaskContract } from './task-contract.js';

const execFileAsync = promisify(execFile);
const MEMORY_DIR = '.codex-memory';
const CHANGE_DIR = 'changes';
const MAX_RECORDS_READ = 500;
const MAX_RECORD_BYTES = 1_000_000;
const RECORD_READ_CHUNK_BYTES = 64 * 1024;
const MAX_PATHS = 160;
const MAX_TEXT_ITEMS = 20;
const MAX_TEXT_LENGTH = 500;
const LOCK_STALE_MS = 30_000;
const VALID_OUTCOMES = new Set(['succeeded', 'failed', 'partial', 'abandoned', 'unknown']);
const VALID_VERIFICATION = new Set(['passed', 'failed', 'skipped', 'unknown']);
const VALID_VERIFICATION_PROVENANCE = new Set(['reported', 'observed-command']);

function slash(value) { return String(value || '').replace(/\\/g, '/'); }
function unique(values) { return [...new Set((values || []).filter(Boolean))]; }
function bounded(values, limit) { return (values || []).slice(0, Math.max(0, limit)); }
function round(value) { return Number.isFinite(value) ? Number(value.toFixed(3)) : null; }
function isCmiInternalPath(value) {
  const normalized = slash(value).trim().replace(/^\.\//, '');
  return normalized === MEMORY_DIR || normalized.startsWith(`${MEMORY_DIR}/`);
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
function normalizeObservedFile(value) {
  const file = normalizeRelativeFile(value);
  if (isCmiInternalPath(file)) throw new Error('Observed file paths must not point inside .codex-memory/. CMI internal evidence is excluded from product-change scope.');
  return file;
}
function normalizeExplicitFiles(files) {
  return bounded(unique((files || []).map(normalizeObservedFile)), MAX_PATHS);
}
function changesDirectory(root) { return path.join(root, MEMORY_DIR, CHANGE_DIR); }
function recordPath(root, id) { return path.join(changesDirectory(root), `${id}.json`); }
function lockPath(root, id) { return path.join(changesDirectory(root), `${id}.lock`); }
function summaryOf(record) {
  const evidence = record.completion || record.progress || null;
  const completionEvidence = assessCompletionEvidence(record);
  const latestObservation = record.observations?.at(-1);
  return {
    id: record.id,
    status: record.status,
    goal: record.goal,
    workspace: record.workspace || null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    completedAt: record.completion?.completedAt || null,
    outcome: evidence?.outcome || null,
    revision: record.revision || 1,
    observedChangedFiles: latestObservation?.observedChangedFiles?.length
      ?? evidence?.finalObservation?.observedChangedFiles?.length
      ?? 0,
    completionEvidence,
  };
}

function validIsoDate(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function validateVerificationRecord(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  if (typeof item.name !== 'string' || !item.name.trim()) return false;
  if (!VALID_VERIFICATION.has(item.status)) return false;
  const provenance = item.provenance || 'reported';
  if (!VALID_VERIFICATION_PROVENANCE.has(provenance)) return false;
  if (item.kind !== undefined && !EVIDENCE_KINDS.includes(item.kind)) return false;
  if (provenance === 'observed-command') {
    if (typeof item.command !== 'string' || !item.command.trim()) return false;
    if (!Number.isInteger(item.exitCode)) return false;
    if (!validIsoDate(item.observedAt)) return false;
  }
  return true;
}

export function validateChangeRecord(record) {
  const errors = [];
  if (!record || typeof record !== 'object' || Array.isArray(record)) return { valid: false, errors: ['Record must be an object.'] };
  if (record.schemaVersion !== 1) errors.push('schemaVersion must be 1.');
  if (typeof record.id !== 'string' || !/^[0-9a-f-]{8,}$/i.test(record.id)) errors.push('id must be a UUID-like string.');
  if (!['active', 'completed'].includes(record.status)) errors.push('status must be active or completed.');
  if (typeof record.goal !== 'string' || !record.goal.trim()) errors.push('goal is required.');
  if (!validIsoDate(record.createdAt) || !validIsoDate(record.updatedAt)) errors.push('createdAt and updatedAt must be ISO date-time strings.');
  if (!record.before || typeof record.before !== 'object' || Array.isArray(record.before)) errors.push('before evidence is required.');
  if (record.before?.taskContract !== undefined && !validateTaskContract(record.before.taskContract).valid) errors.push('before.taskContract is invalid.');
  if (!Array.isArray(record.observations)) errors.push('observations must be an array.');
  if (record.status === 'active' && record.completion !== null) errors.push('active records must not contain completion.');
  if (record.progress !== undefined && record.progress !== null) {
    if (record.status !== 'active') errors.push('progress is only valid on active records.');
    if (!validIsoDate(record.progress.pausedAt)) errors.push('progress.pausedAt must be an ISO date-time string.');
    if (record.progress.outcome !== 'partial') errors.push('progress.outcome must be partial.');
    if (!record.progress.finalObservation || typeof record.progress.finalObservation !== 'object' || Array.isArray(record.progress.finalObservation)) errors.push('active progress requires final observation evidence.');
    if (!Array.isArray(record.progress.verifications) || !record.progress.verifications.every(validateVerificationRecord)) errors.push('progress.verifications contains invalid evidence.');
    if (!Array.isArray(record.progress.unexpectedImpact) || !Array.isArray(record.progress.notes) || !Array.isArray(record.progress.learningCandidates)) errors.push('progress evidence arrays are invalid.');
  }
  if (record.status === 'completed') {
    if (!record.completion || typeof record.completion !== 'object' || Array.isArray(record.completion)) errors.push('completed records require completion evidence.');
    else {
      if (!VALID_OUTCOMES.has(record.completion.outcome)) errors.push('completion.outcome is invalid.');
      if (!validIsoDate(record.completion.completedAt)) errors.push('completion.completedAt must be an ISO date-time string.');
      if (!Array.isArray(record.completion.verifications) || !record.completion.verifications.every(validateVerificationRecord)) errors.push('completion.verifications contains invalid evidence.');
      if (!Array.isArray(record.completion.learningCandidates)) errors.push('completion.learningCandidates must be an array.');
    }
  }
  return { valid: errors.length === 0, errors };
}

async function ensureChangeDirectory(root) {
  await initProject(root);
  await safeEnsureMemoryDir(root, CHANGE_DIR);
}

async function acquireRecordLock(root, id) {
  await ensureChangeDirectory(root);
  return acquireLeaseLock(lockPath(root, id), { staleMs: LOCK_STALE_MS, retries: 40, retryMs: 15 });
}

async function releaseRecordLock(root, id, lock) {
  await releaseLeaseLock(lock);
}

async function writeRecord(root, record) {
  const validation = validateChangeRecord(record);
  if (!validation.valid) throw new Error(`Invalid change record: ${validation.errors.join(' ')}`);
  const lock = await acquireRecordLock(root, record.id);
  try {
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
  } finally {
    await releaseRecordLock(root, record.id, lock);
  }
}

async function readBoundedHandle(handle) {
  const chunks = [];
  let position = 0;
  while (position <= MAX_RECORD_BYTES) {
    const length = Math.min(RECORD_READ_CHUNK_BYTES, MAX_RECORD_BYTES + 1 - position);
    const buffer = Buffer.allocUnsafe(length);
    const { bytesRead } = await handle.read(buffer, 0, length, position);
    if (!bytesRead) break;
    chunks.push(buffer.subarray(0, bytesRead));
    position += bytesRead;
  }
  if (position > MAX_RECORD_BYTES) return null;
  return Buffer.concat(chunks, position).toString('utf8');
}

async function safeReadRecord(filePath) {
  let handle;
  try {
    const noFollow = typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0;
    handle = await fs.open(filePath, fsConstants.O_RDONLY | noFollow);
    const openedStat = await handle.stat();
    if (!openedStat.isFile() || openedStat.size > MAX_RECORD_BYTES) return null;
    if (!noFollow) {
      const pathStat = await fs.lstat(filePath);
      if (!pathStat.isFile() || pathStat.isSymbolicLink()) return null;
      if (pathStat.dev !== openedStat.dev || pathStat.ino !== openedStat.ino) return null;
    }
    const text = await readBoundedHandle(handle);
    if (text === null) return null;
    const parsed = JSON.parse(text);
    const validation = validateChangeRecord(parsed);
    return validation.valid ? parsed : null;
  } catch {
    return null;
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function readRecords(root) {
  const directory = changesDirectory(root);
  const names = await fs.readdir(directory).catch(() => []);
  const recordNames = names.filter((name) => /^[0-9a-f-]+\.json$/i.test(name));
  const records = [];
  let invalidRecords = 0;
  for (const name of recordNames.slice(0, MAX_RECORDS_READ)) {
    const record = await safeReadRecord(path.join(directory, name));
    if (record) records.push(record);
    else invalidRecords += 1;
  }
  records.sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
  return { records, invalidRecords, truncated: recordNames.length > MAX_RECORDS_READ };
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

function sanitizeChangeBaseline(baseline) {
  if (!baseline?.available) return baseline;
  const changes = [];
  let cmiInternalChangesOmitted = 0;
  for (const item of baseline.changes || []) {
    const relative = normalizeRelativeFile(projectRelative(item.path, baseline.projectPath));
    if (isCmiInternalPath(relative)) {
      cmiInternalChangesOmitted += 1;
      continue;
    }
    changes.push({ ...item, path: relative });
  }
  return {
    ...baseline,
    clean: changes.length === 0,
    changes: bounded(changes, 200),
    cmiInternalChangesOmitted,
  };
}

async function committedFilesSince(root, beforeBaseline, currentBaseline) {
  const startHead = beforeBaseline?.fullHead;
  const currentHead = currentBaseline?.fullHead;
  const continuity = await inspectGitHistoryContinuity(root, startHead, currentHead);
  if (!continuity.safeForCommittedAttribution || continuity.state === 'same-head') return { files: [], continuity };
  const output = await runGit(root, ['diff', '--name-only', '--relative', startHead, currentHead, '--']);
  if (!output) return { files: [], continuity };
  const files = output.split(/\r?\n/)
    .filter(Boolean)
    .map(normalizeRelativeFile)
    .filter((file) => !isCmiInternalPath(file));
  return { files: bounded(unique(files), MAX_PATHS), continuity };
}

function predictedFilesFromBrief(brief) {
  if (!brief?.ready) return [];
  return bounded(unique([
    ...(brief.context?.recommendedFiles || []),
    ...(brief.impact?.matchedFiles || []),
    ...(brief.impact?.seedFiles || []),
    ...(brief.impact?.directDependents || []),
    ...(brief.impact?.affectedFiles || []),
  ]).map(normalizeRelativeFile).filter((file) => !isCmiInternalPath(file)), MAX_PATHS);
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
  const recall = observed.size ? round(overlap.length / observed.size) : null;
  const precision = predicted.size ? round(overlap.length / predicted.size) : null;
  const f1 = Number.isFinite(recall) && Number.isFinite(precision) && recall + precision > 0 ? round((2 * recall * precision) / (recall + precision)) : null;
  return {
    predictedFileCount: predicted.size,
    observedChangedFileCount: observed.size,
    overlapCount: overlap.length,
    overlap: bounded(overlap, MAX_PATHS),
    missedByPrediction: bounded(missedByPrediction, MAX_PATHS),
    predictedButUnchanged: bounded(predictedButUnchanged, MAX_PATHS),
    changedPathCoverage: recall,
    predictedScopeTouched: precision,
    pathRecall: recall,
    pathPrecision: precision,
    pathF1: f1,
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
    return { name: cleanText(name, 'Verification name'), status: VALID_VERIFICATION.has(requested) ? requested : 'unknown', provenance: 'reported' };
  }
  if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Verification must be a string or object.');
  const name = cleanText(item.name, 'Verification name');
  const status = String(item.status || 'unknown').trim().toLowerCase();
  if (!VALID_VERIFICATION.has(status)) throw new Error(`Verification status must be one of: ${[...VALID_VERIFICATION].join(', ')}.`);
  const evidence = cleanOptionalText(item.evidence, 'Verification evidence');
  const command = cleanOptionalText(item.command, 'Verification command');
  const outputDigest = cleanOptionalText(item.outputDigest, 'Verification output digest');
  const kind = item.kind === undefined ? null : cleanText(item.kind, 'Verification kind');
  if (kind && !EVIDENCE_KINDS.includes(kind)) throw new Error(`Verification kind must be one of: ${EVIDENCE_KINDS.join(', ')}.`);
  const hasObservedCommand = command && Number.isInteger(item.exitCode) && validIsoDate(item.observedAt);
  const provenance = hasObservedCommand ? 'observed-command' : 'reported';
  return {
    name,
    status,
    provenance,
    ...(kind ? { kind } : {}),
    ...(evidence ? { evidence } : {}),
    ...(hasObservedCommand ? { command, exitCode: item.exitCode, observedAt: item.observedAt, ...(outputDigest ? { outputDigest } : {}) } : {}),
  };
}

function normalizeTextItems(values, label) {
  return bounded((values || []).map((value) => cleanText(value, label)), MAX_TEXT_ITEMS);
}

function actualFilesFromRecord(record) {
  if (record.observations?.length) return record.observations.at(-1)?.observedChangedFiles || [];
  return record.completion?.finalObservation?.observedChangedFiles
    || record.progress?.finalObservation?.observedChangedFiles
    || [];
}

function relevantRecordText(record) {
  const evidence = record.completion || record.progress || {};
  const final = record.observations?.at(-1) || evidence.finalObservation;
  return [
    record.goal,
    ...(actualFilesFromRecord(record) || []),
    ...(final?.observedBoundaries || []).map((item) => item.label),
    ...(evidence.unexpectedImpact || []),
    ...(evidence.notes || []),
  ].join('\n');
}

function relevanceScore(record, queryTokens) {
  if (!queryTokens.size) return 1;
  const tokens = new Set(tokenize(relevantRecordText(record)));
  let overlap = 0;
  for (const token of queryTokens) if (tokens.has(token)) overlap += 1;
  return overlap;
}

function calibratedConfidence(count, sampleSize, support) {
  if (sampleSize >= 5 && count >= 3 && support >= 0.6) return 'high';
  if (sampleSize >= 3 && count >= 2 && support >= 0.35) return 'medium';
  return 'low';
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
  const sampleSize = records.length;
  const edges = [...counts.entries()].map(([key, count]) => {
    const [from, to] = key.split('\u0000');
    const support = sampleSize ? round(count / sampleSize) : 0;
    return { from, to, count, sampleSize, support, confidence: calibratedConfidence(count, sampleSize, support), evidenceType: 'historical-correlation' };
  }).sort((a, b) => b.support - a.support || b.count - a.count || a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  return { edges: edges.slice(0, 40), truncatedRecords };
}

function verificationPatterns(records) {
  const map = new Map();
  for (const record of records) {
    for (const item of record.completion?.verifications || []) {
      const key = item.name.toLowerCase();
      const current = map.get(key) || { name: item.name, total: 0, passed: 0, failed: 0, skipped: 0, unknown: 0, reported: 0, observedCommand: 0 };
      current.total += 1;
      current[item.status] += 1;
      if (item.provenance === 'observed-command') current.observedCommand += 1;
      else current.reported += 1;
      map.set(key, current);
    }
  }
  return [...map.values()].map((item) => ({
    ...item,
    passRate: item.total ? round(item.passed / item.total) : null,
    observedEvidenceRate: item.total ? round(item.observedCommand / item.total) : null,
    confidence: item.total >= 5 && item.observedCommand >= 3 ? 'high' : item.total >= 3 ? 'medium' : 'low',
  })).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)).slice(0, 20);
}

function coverageCalibration(records) {
  const samples = records.map((record) => record.completion?.finalObservation?.comparison).filter((item) => item && item.observedChangedFileCount > 0);
  if (!samples.length) return { samples: 0, averageChangedPathCoverage: null, averagePredictedScopeTouched: null, averagePathRecall: null, averagePathPrecision: null, averagePathF1: null, confidence: 'insufficient-evidence' };
  const coverage = samples.map((item) => item.pathRecall ?? item.changedPathCoverage).filter(Number.isFinite);
  const touched = samples.map((item) => item.pathPrecision ?? item.predictedScopeTouched).filter(Number.isFinite);
  const f1Values = samples.map((item) => item.pathF1).filter(Number.isFinite);
  const average = (values) => values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
  return {
    samples: samples.length,
    averageChangedPathCoverage: average(coverage),
    averagePredictedScopeTouched: average(touched),
    averagePathRecall: average(coverage),
    averagePathPrecision: average(touched),
    averagePathF1: average(f1Values),
    confidence: samples.length >= 10 ? 'high' : samples.length >= 4 ? 'medium' : 'low',
  };
}

export async function listChangeRecords(root, options = {}) {
  const { records, invalidRecords, truncated } = await readRecords(root);
  const status = options.status ? String(options.status).trim().toLowerCase() : null;
  if (status && !['active', 'completed'].includes(status)) throw new Error('Change-record status must be active or completed.');
  const limit = Math.max(1, Math.min(100, Number(options.limit) || 20));
  const selected = records.filter((record) => !status || record.status === status).slice(0, limit);
  return { records: selected.map(summaryOf), invalidRecords, truncated, policy: 'Change records are durable local evidence. They are not automatically converted into project facts, decisions, or lessons.' };
}

function withCompletionEvidence(record) {
  return { ...record, completionEvidence: assessCompletionEvidence(record) };
}

export async function getChangeRecord(root, selector) {
  return withCompletionEvidence(await resolveRecord(root, selector));
}

export async function buildChangeInsights(root, query = '', options = {}) {
  const normalizedQuery = String(query || '').trim();
  const { records, invalidRecords, truncated } = await readRecords(root);
  const completed = records.filter((record) => record.status === 'completed');
  const queryTokens = new Set(tokenize(normalizedQuery));
  const ranked = completed.map((record) => ({ record, score: relevanceScore(record, queryTokens) }))
    .filter((item) => !queryTokens.size || item.score > 0)
    .sort((a, b) => b.score - a.score || String(b.record.completion?.completedAt || '').localeCompare(String(a.record.completion?.completedAt || '')));
  const limit = Math.max(1, Math.min(50, Number(options.limit) || 12));
  const relevant = ranked.slice(0, limit).map((item) => item.record);
  const basis = relevant.length ? relevant : (queryTokens.size ? [] : completed.slice(0, limit));
  const files = pairCounts(basis, actualFilesFromRecord, 30);
  const boundaries = pairCounts(basis, (record) => (record.completion?.finalObservation?.observedBoundaries || []).map((item) => item.id), 20);
  return {
    schemaVersion: 2,
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
      evidenceType: 'historical-correlation',
      fileCoChanges: files.edges,
      boundaryCoChanges: boundaries.edges,
      verificationPatterns: verificationPatterns(basis),
      pairwiseTruncation: { fileRecords: files.truncatedRecords, boundaryRecords: boundaries.truncatedRecords },
    },
    calibration: coverageCalibration(basis),
    limitations: [
      'Co-change frequency is historical correlation, not a causal dependency.',
      'Confidence is calibrated from local sample count and support; it is not semantic certainty.',
      'Observed changed paths are not the same as every runtime or downstream impact.',
      'Reported verification is a human/agent claim. observed-command provenance only means command metadata was supplied; CMI still does not execute the command itself.',
      'A missing historical match means only that CMI has no matching completed record in this local project history.',
    ],
  };
}

export async function startChangeRecord(root, goal, options = {}) {
  const normalizedGoal = cleanText(goal, 'Change goal');
  await ensureChangeDirectory(root);
  const brief = await prepareChangeBrief(root, normalizedGoal, { limit: options.limit || 12, depth: options.depth || 3, workspace: options.workspace });
  if (!brief.ready) throw new Error(brief.reason || 'Pre-change brief is not ready.');
  const history = await buildChangeInsights(root, normalizedGoal, { limit: 12 });
  const now = new Date().toISOString();
  const predictedFiles = predictedFilesFromBrief(brief);
  const baseline = sanitizeChangeBaseline(brief.baseline);
  const storedRisks = bounded((brief.risks || [])
    .filter((item) => !(item.id === 'dirty-worktree' && baseline?.available && baseline.clean))
    .map((item) => ({ id: item.id, title: item.title, severity: item.severity, confidence: item.confidence })), 20);
  const record = {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    revision: 1,
    status: 'active',
    goal: normalizedGoal,
    workspace: options.workspace || null,
    createdAt: now,
    updatedAt: now,
    before: {
      baseline,
      predicted: {
        files: predictedFiles,
        boundaries: predictedBoundariesFromBrief(brief),
        risks: storedRisks,
        verification: bounded((brief.verification || []).map((item) => ({ id: item.id, title: item.title, guidance: item.guidance })), 20),
      },
      memoryCoverage: brief.memory?.coverage || null,
      provenance: brief.provenance,
      assumptions: brief.assumptions,
      taskContract: brief.taskContract,
      historicalEvidence: {
        matches: history.matches.slice(0, 5),
        calibration: history.calibration,
        fileCoChanges: history.behavioralEvidence.fileCoChanges.slice(0, 10),
        verificationPatterns: history.behavioralEvidence.verificationPatterns.slice(0, 10),
        limitations: history.limitations,
      },
      attribution: baseline?.available ? (baseline.clean ? 'strong' : 'limited-preexisting-worktree') : 'explicit-files-only',
    },
    observations: [],
    completion: null,
    policy: 'This record stores bounded project-change evidence. CMI-internal paths are excluded from product-change scope, and the record does not automatically create durable facts, architecture decisions, or lessons.',
  };
  await writeRecord(root, record);
  return record;
}

export async function observeChangeRecord(root, selector, options = {}) {
  const record = await resolveRecord(root, selector);
  if (record.status !== 'active') throw new Error('Completed change records are immutable. Start a new record for additional work.');
  const baseline = sanitizeChangeBaseline(await getRepositoryBaseline(root));
  const explicitFiles = normalizeExplicitFiles(options.files || []);
  const committedEvidence = baseline?.available
    ? await committedFilesSince(root, record.before?.baseline, baseline)
    : { files: [], continuity: { available: false, state: 'unavailable', safeForCommittedAttribution: false, reason: 'Git baseline unavailable.' } };
  const committed = committedEvidence.files;
  const initialDirty = new Set((record.before?.baseline?.changes || [])
    .map((item) => normalizeRelativeFile(item.path))
    .filter((file) => !isCmiInternalPath(file)));
  const currentDirty = baseline?.available
    ? unique((baseline.changes || []).map((item) => normalizeRelativeFile(item.path)).filter((file) => !isCmiInternalPath(file)))
    : [];
  const attributableDirty = record.before?.baseline?.clean ? currentDirty : currentDirty.filter((file) => !initialDirty.has(file));
  const ambiguousPreExisting = record.before?.baseline?.clean ? [] : currentDirty.filter((file) => initialDirty.has(file));
  const observedChangedFiles = bounded(unique([...committed, ...attributableDirty, ...explicitFiles]).filter((file) => !isCmiInternalPath(file)).sort(), MAX_PATHS);
  const boundaryMap = await mapProjectBoundaries(root);
  const boundaryReport = observedBoundaryReport(boundaryMap, observedChangedFiles);
  const comparison = compareScopes(record.before?.predicted?.files || [], observedChangedFiles);
  const predictedBoundaryIds = new Set((record.before?.predicted?.boundaries || []).map((item) => item.id));
  const unexpectedBoundaries = boundaryReport.boundaries.filter((item) => !predictedBoundaryIds.has(item.id));
  const continuityLimited = baseline?.available && !committedEvidence.continuity?.safeForCommittedAttribution;
  const attribution = !baseline?.available
    ? 'explicit-files-only'
    : continuityLimited
      ? (['rewritten', 'unrelated'].includes(committedEvidence.continuity?.state) ? 'limited-history-rewrite' : 'limited-git-history')
      : (record.before?.baseline?.clean ? 'strong' : 'limited-preexisting-worktree');
  const observation = {
    observedAt: new Date().toISOString(),
    baseline,
    attribution,
    gitContinuity: committedEvidence.continuity,
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
  if (record.progress) {
    record.progress.pausedAt = observation.observedAt;
    record.progress.finalObservation = observation;
  }
  record.revision = (record.revision || 1) + 1;
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
  const requestedVerifications = bounded((options.verifications || []).map(normalizeVerification), MAX_TEXT_ITEMS);
  const previousProgress = record.progress || {};
  const verificationsByName = new Map((previousProgress.verifications || []).map((item) => [item.name.toLowerCase(), item]));
  for (const item of requestedVerifications) verificationsByName.set(item.name.toLowerCase(), item);
  const verifications = bounded([...verificationsByName.values()], MAX_TEXT_ITEMS);
  const unexpectedImpact = normalizeTextItems(unique([...(previousProgress.unexpectedImpact || []), ...(options.unexpectedImpact || [])]), 'Unexpected impact');
  const notes = normalizeTextItems(unique([...(previousProgress.notes || []), ...(options.notes || [])]), 'Completion note');
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
  if (['rewritten', 'unrelated'].includes(finalObservation?.gitContinuity?.state)) {
    learningCandidates.push({
      type: 'git-history-rewrite',
      status: 'proposal',
      evidence: [finalObservation.gitContinuity],
      proposal: 'Review committed-path attribution manually because the change-start HEAD is no longer an ancestor of current HEAD. Do not convert the start-to-current diff into causal change history.',
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
  if (outcome === 'partial') {
    record.status = 'active';
    record.revision = (record.revision || 1) + 1;
    record.updatedAt = completedAt;
    record.completion = null;
    record.progress = {
      pausedAt: completedAt,
      outcome,
      finalObservation,
      verifications,
      unexpectedImpact,
      notes,
      learningCandidates,
      policy: 'Partial progress is preserved on the active Change. Complete it only after the requested work is actually finished; progress does not write project memory automatically.',
    };
    await writeRecord(root, record);
    return withCompletionEvidence(record);
  }
  record.status = 'completed';
  record.progress = null;
  record.revision = (record.revision || 1) + 1;
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
  return withCompletionEvidence(record);
}
export function formatChangeRecord(record) {
  const evidence = record.completion || record.progress || null;
  const latest = record.observations?.at(-1) || evidence?.finalObservation;
  const changed = latest?.observedChangedFiles || [];
  const missed = latest?.comparison?.missedByPrediction || [];
  const verification = evidence?.verifications || [];
  const outcome = record.status === 'active' && record.progress ? `${evidence.outcome} (paused; Change remains active)` : evidence?.outcome || 'not completed';
  const completionEvidence = assessCompletionEvidence(record);
  const reasons = completionEvidence.reasons.join(' ') || 'None recorded.';
  const gaps = completionEvidence.gaps.join(' ') || 'None recorded.';
  const requiredEvidence = completionEvidence.requiredEvidence;
  const requiredEvidenceRows = requiredEvidence.requirements
    .map((item) => `- [${item.state}] ${item.kind}: ${item.title}${item.matchedVerifications.length ? ` · ${item.matchedVerifications.join(', ')}` : ''}`)
    .join('\n') || `- ${requiredEvidence.state === 'not-assessed' ? 'Not assessed (legacy Change has no Task Contract)' : 'None required'}`;
  return `# Change record ${record.id.slice(0, 12)}\n\n- Status: ${record.status}\n- Goal: ${record.goal}\n- Workspace: ${record.workspace || 'project'}\n- Created: ${record.createdAt}\n- Outcome: ${outcome}\n- Attribution: ${latest?.attribution || record.before?.attribution || 'unknown'}\n- Git continuity: ${latest?.gitContinuity?.state || 'unknown'}\n- Revision: ${record.revision || 1}\n\n## Completion evidence assessment\n- Completion claim: ${completionEvidence.claimState}\n- Implementation evidence: ${completionEvidence.implementation.state}\n- Verification evidence: ${completionEvidence.verification.state}\n- Required task evidence: ${requiredEvidence.state}\n- Reasons: ${reasons}\n- Gaps: ${gaps}\n\n## Predicted scope\n- Files: ${record.before?.predicted?.files?.length || 0}\n- Boundaries: ${(record.before?.predicted?.boundaries || []).map((item) => item.label).join(', ') || 'none'}\n\n## Observed changed paths\n${changed.map((file) => `- \`${file}\``).join('\n') || '- None observed yet'}\n\n## Prediction gaps\n${missed.map((file) => `- \`${file}\``).join('\n') || '- None observed'}\n\n## Required task evidence\n${requiredEvidenceRows}\n\n## Verification evidence\n${verification.map((item) => `- [${item.status}]${item.kind ? ` [${item.kind}]` : ''} ${item.name} · ${item.provenance || 'reported'}`).join('\n') || '- Not completed yet'}\n\n${record.policy}`;
}

export function formatChangeInsights(result) {
  const matches = result.matches.map((item) => `- ${item.id.slice(0, 12)} · ${item.goal} · ${item.outcome || 'unknown'} · ${item.changedFiles.length} changed paths`).join('\n') || '- No matching completed changes';
  const coChanges = result.behavioralEvidence.fileCoChanges.slice(0, 12).map((item) => `- ${item.from} ↔ ${item.to}: ${item.count}/${item.sampleSize} records · support ${item.support} · confidence ${item.confidence}`).join('\n') || '- Not enough relevant history';
  const checks = result.behavioralEvidence.verificationPatterns.slice(0, 12).map((item) => `- ${item.name}: ${item.total} records, pass rate ${item.passRate ?? 'n/a'}, observed-command ${item.observedCommand}`).join('\n') || '- No verification history';
  return `# Change intelligence${result.query ? `: ${result.query}` : ''}\n\nCompleted records: ${result.corpus.completedRecords} · considered: ${result.corpus.consideredRecords}\n\n## Relevant history\n${matches}\n\n## Historical co-change evidence\n${coChanges}\n\n## Verification patterns\n${checks}\n\n## Coverage calibration\n- Samples: ${result.calibration.samples}\n- Average path recall: ${result.calibration.averagePathRecall ?? 'n/a'}\n- Average path precision: ${result.calibration.averagePathPrecision ?? 'n/a'}\n- Average path F1: ${result.calibration.averagePathF1 ?? 'n/a'}\n- Confidence: ${result.calibration.confidence}\n\n## Limitations\n${result.limitations.map((item) => `- ${item}`).join('\n')}`;
}

export function formatChangeList(result) {
  const rows = result.records.map((item) => `- ${item.id.slice(0, 12)} · ${item.status} · ${item.goal}${item.outcome ? ` · ${item.outcome}` : ''}`).join('\n') || '- No change records';
  return `# Change records\n\n${rows}\n\n${result.policy}`;
}
