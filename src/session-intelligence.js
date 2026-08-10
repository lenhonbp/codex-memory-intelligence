import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { initProject, status as getProjectStatus } from './core.js';
import { getRepositoryBaseline, inspectGitHistoryContinuity } from './advisor.js';
import { buildContextPack } from './search.js';
import { checkStaleMemory } from './stale.js';
import { listChangeRecords, getChangeRecord, buildChangeInsights } from './change-intelligence.js';
import { getPlanningSignals } from './planning-intelligence.js';
import { associateSessionChanges } from './session-change-association.js';
import { looksSensitive } from './sensitive.js';
import { acquireLeaseLock, releaseLeaseLock } from './lease-lock.js';
import { safeEnsureMemoryDir } from './storage.js';
import { SESSION_OUTCOMES, FINDING_STATES, validateSessionRecordContract, validateFindingRegistryContract } from './durable-contracts.js';

const execFileAsync = promisify(execFile);
const MEMORY_DIR = '.codex-memory';
const SESSION_DIR = 'sessions';
const ACTIVE_SESSION_DIR = 'snapshots/active-sessions';
const FINDINGS_FILE = 'findings.json';
const MAX_RECORD_BYTES = 1_000_000;
const MAX_RECORDS = 500;
const MAX_PATHS = 160;
const MAX_TEXT_ITEMS = 40;
const MAX_TEXT_LENGTH = 500;
const LOCK_STALE_MS = 120_000;
const LOCK_RETRIES = 120;
const LOCK_RETRY_MS = 20;
const SEVERITY_ORDER = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };
const PRIORITY_ORDER = { P0: 4, P1: 3, P2: 2, P3: 1 };
const AUTO_RESOLVABLE = new Set(['project-intelligence-missing', 'graph-drift', 'stale-memory', 'memory-review', 'active-change', 'invalid-change-records']);

function slash(value) { return String(value || '').replace(/\\/g, '/'); }
function unique(values) { return [...new Set((values || []).filter(Boolean))]; }
function bounded(values, limit) { return (values || []).slice(0, Math.max(0, limit)); }
function nowIso() { return new Date().toISOString(); }
function validIso(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function isCmiInternalPath(value) {
  const normalized = slash(value).trim().replace(/^\.\//, '');
  return normalized === MEMORY_DIR || normalized.startsWith(`${MEMORY_DIR}/`);
}
function cleanText(value, label, optional = false) {
  const clean = String(value || '').trim();
  if (!clean && optional) return null;
  if (!clean) throw new Error(`${label} cannot be empty.`);
  if (clean.length > MAX_TEXT_LENGTH) throw new Error(`${label} must be ${MAX_TEXT_LENGTH} characters or fewer.`);
  if (looksSensitive(clean)) throw new Error(`${label} appears to contain a secret. Store a reference, not the credential.`);
  return clean;
}
function cleanItems(values, label) { return bounded((values || []).map((value) => cleanText(value, label)), MAX_TEXT_ITEMS); }
function normalizePath(value) {
  const raw = slash(value).trim().replace(/^\.\//, '');
  if (!raw) throw new Error('Session file path cannot be empty.');
  if (raw.startsWith('/') || /^[A-Za-z]:\//.test(raw)) throw new Error(`Session file path must be project-relative: ${value}`);
  const parts = raw.split('/').filter(Boolean);
  if (!parts.length || parts.some((part) => part === '.' || part === '..')) throw new Error(`Session file path escapes the project: ${value}`);
  const normalized = parts.join('/');
  if (isCmiInternalPath(normalized)) throw new Error('Session file paths must not point inside .codex-memory/.');
  return normalized;
}
function normalizePaths(values) { return bounded(unique((values || []).map(normalizePath)), MAX_PATHS); }
function sessionsDirectory(root) { return path.join(root, MEMORY_DIR, SESSION_DIR); }
function sessionPath(root, id) { return path.join(sessionsDirectory(root), `${id}.json`); }
function activeSessionsDirectory(root) { return path.join(root, MEMORY_DIR, ACTIVE_SESSION_DIR); }
function activeSessionPath(root, id) { return path.join(activeSessionsDirectory(root), `${id}.json`); }
function sessionLockPath(root, id) { return path.join(root, MEMORY_DIR, 'snapshots', `session-${id}.lock`); }
function findingsPath(root) { return path.join(root, MEMORY_DIR, FINDINGS_FILE); }
function findingsLockPath(root) { return path.join(root, MEMORY_DIR, 'snapshots', 'findings.lock'); }
function intelligenceLockPath(root) { return path.join(root, MEMORY_DIR, 'snapshots', 'session-intelligence.lock'); }

async function ensureStorage(root) {
  await initProject(root);
  await safeEnsureMemoryDir(root, SESSION_DIR);
  await safeEnsureMemoryDir(root, 'snapshots');
  await safeEnsureMemoryDir(root, ACTIVE_SESSION_DIR);
}
async function acquireLock(target) {
  return acquireLeaseLock(target, { staleMs: LOCK_STALE_MS, retries: LOCK_RETRIES, retryMs: LOCK_RETRY_MS });
}
async function releaseLock(target, lock) {
  await releaseLeaseLock(lock);
}
async function withMutationLock(root, operation) {
  await ensureStorage(root);
  const target = intelligenceLockPath(root);
  const lock = await acquireLock(target);
  try { return await operation(); }
  finally { await releaseLock(target, lock); }
}
async function atomicJsonWrite(target, value) {
  const temporary = `${target}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  try { await fs.rename(temporary, target); }
  catch (error) {
    if (!['EEXIST', 'EPERM'].includes(error?.code)) throw error;
    await fs.rm(target, { force: true });
    await fs.rename(temporary, target);
  }
}
function durableReadError(target, options = {}, cause = null) {
  const label = options.label || path.basename(target);
  const error = new Error(`${label} exists but could not be safely read or validated. Repair or recover it before continuing.`);
  error.code = options.code || 'CMI_DURABLE_RECORD_INVALID';
  if (cause?.code) error.causeCode = cause.code;
  return error;
}
async function safeReadJson(target, validator, options = {}) {
  let handle;
  try {
    const noFollow = typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0;
    handle = await fs.open(target, fsConstants.O_RDONLY | noFollow);
    const opened = await handle.stat();
    if (!opened.isFile() || opened.size > MAX_RECORD_BYTES) {
      if (options.strict) throw durableReadError(target, options);
      return null;
    }
    if (!noFollow) {
      const stat = await fs.lstat(target);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.dev !== opened.dev || stat.ino !== opened.ino) {
        if (options.strict) throw durableReadError(target, options);
        return null;
      }
    }
    const value = JSON.parse(await handle.readFile('utf8'));
    if (!validator(value)) {
      if (options.strict) throw durableReadError(target, options);
      return null;
    }
    return value;
  } catch (error) {
    if (error?.code === 'ENOENT' && options.optional) return null;
    if (options.strict) {
      if (error?.code === options.code) throw error;
      throw durableReadError(target, options, error);
    }
    return null;
  }
  finally { await handle?.close().catch(() => {}); }
}

export function validateSessionRecord(record) { return validateSessionRecordContract(record).valid; }
function validateFindingRegistry(value) { return validateFindingRegistryContract(value).valid; }
async function writeSession(root, record) {
  if (!validateSessionRecord(record)) throw new Error('Invalid session record.');
  const lockTarget = sessionLockPath(root, record.id);
  const lock = await acquireLock(lockTarget);
  try {
    const target = record.status === 'active' ? activeSessionPath(root, record.id) : sessionPath(root, record.id);
    await atomicJsonWrite(target, record);
    if (record.status === 'active') await fs.rm(sessionPath(root, record.id), { force: true }).catch(() => {});
    else await fs.rm(activeSessionPath(root, record.id), { force: true }).catch(() => {});
  } finally { await releaseLock(lockTarget, lock); }
}
async function readSessionRecords(root) {
  await ensureStorage(root);
  const sources = [sessionsDirectory(root), activeSessionsDirectory(root)];
  const candidates = [];
  for (const directory of sources) {
    const names = await fs.readdir(directory).catch(() => []);
    for (const name of names.filter((item) => /^[0-9a-f-]+\.json$/i.test(item))) candidates.push({ directory, name });
  }
  const byId = new Map();
  let invalidRecords = 0;
  for (const item of candidates.slice(0, MAX_RECORDS)) {
    const record = await safeReadJson(path.join(item.directory, item.name), validateSessionRecord);
    if (!record) { invalidRecords += 1; continue; }
    const previous = byId.get(record.id);
    if (!previous || String(record.updatedAt).localeCompare(String(previous.updatedAt)) >= 0) byId.set(record.id, record);
  }
  const records = [...byId.values()].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return { records, invalidRecords, truncated: candidates.length > MAX_RECORDS };
}
async function resolveSession(root, selector, options = {}) {
  const { records } = await readSessionRecords(root);
  if ((!selector || selector === 'latest') && options.allowLatest !== false) {
    const matches = options.status ? records.filter((item) => item.status === options.status) : records;
    if (!matches.length) throw new Error('No matching session record exists.');
    if (options.status === 'active' && matches.length > 1 && options.allowAmbiguousLatest !== true) throw new Error('Multiple active sessions exist. Provide an explicit session ID or unique prefix instead of latest.');
    return matches[0];
  }
  const raw = String(selector || '').trim().toLowerCase();
  if (!raw || !/^[0-9a-f-]+$/i.test(raw)) throw new Error('A valid session ID, unique prefix, or latest is required.');
  const matches = records.filter((record) => record.id.toLowerCase() === raw || record.id.toLowerCase().startsWith(raw));
  if (!matches.length) throw new Error(`Session record not found: ${selector}`);
  if (matches.length > 1) throw new Error(`Session-record prefix is ambiguous: ${selector}`);
  return matches[0];
}

async function readFindingsRegistry(root) {
  await ensureStorage(root);
  const registry = await safeReadJson(findingsPath(root), validateFindingRegistry, {
    optional: true,
    strict: true,
    code: 'CMI_FINDINGS_BLOCKED',
    label: 'Findings registry',
  });
  return registry || { schemaVersion: 1, updatedAt: nowIso(), findings: [] };
}
async function writeFindingsRegistry(root, registry) {
  const validation = validateFindingRegistryContract(registry);
  if (!validation.valid) throw new Error(`Invalid findings registry: ${validation.errors.join(' ')}`);
  const lockTarget = findingsLockPath(root);
  const lock = await acquireLock(lockTarget);
  try { registry.updatedAt = nowIso(); await atomicJsonWrite(findingsPath(root), registry); }
  finally { await releaseLock(lockTarget, lock); }
}
function findingSummary(item) {
  return {
    id: item.id, key: item.key, state: item.state, category: item.category, severity: item.severity,
    title: item.title, detail: item.detail, firstSeen: item.firstSeen, lastSeen: item.lastSeen,
    occurrences: item.occurrences, confidence: item.confidence, evidenceType: item.evidenceType,
    sessionRelevance: item.sessionRelevance || null,
    evidence: bounded(item.evidence || [], 12), relatedFiles: bounded(item.relatedFiles || [], 12),
  };
}
function selectFinding(registry, selector) {
  const raw = String(selector || '').trim().toLowerCase();
  if (!raw) throw new Error('A finding ID or unique prefix is required.');
  const matches = registry.findings.filter((item) => item.id.toLowerCase() === raw || item.id.toLowerCase().startsWith(raw));
  if (!matches.length) throw new Error(`Finding not found: ${selector}`);
  if (matches.length > 1) throw new Error(`Finding prefix is ambiguous: ${selector}`);
  return matches[0];
}
export async function listFindings(root, options = {}) {
  const registry = await readFindingsRegistry(root);
  const state = options.state ? String(options.state).trim().toLowerCase() : null;
  if (state && !FINDING_STATES.has(state)) throw new Error(`Finding state must be one of: ${[...FINDING_STATES].join(', ')}.`);
  const limit = Math.max(1, Math.min(200, Number(options.limit) || 50));
  const matching = registry.findings.filter((item) => !state || item.state === state)
    .sort((a, b) => (SEVERITY_ORDER[b.severity] || 0) - (SEVERITY_ORDER[a.severity] || 0) || String(b.lastSeen).localeCompare(String(a.lastSeen)));
  return { schemaVersion: 1, findings: matching.slice(0, limit).map(findingSummary), total: matching.length };
}
export async function getFinding(root, selector) { return selectFinding(await readFindingsRegistry(root), selector); }
export async function setFindingState(root, selector, state, options = {}) {
  return withMutationLock(root, async () => {
    const nextState = String(state || '').trim().toLowerCase();
    if (!FINDING_STATES.has(nextState)) throw new Error(`Finding state must be one of: ${[...FINDING_STATES].join(', ')}.`);
    const reason = cleanText(options.reason, 'Finding state reason');
    const registry = await readFindingsRegistry(root);
    const finding = selectFinding(registry, selector);
    let replacement = null;
    if (nextState === 'superseded') {
      if (!options.supersededBy) throw new Error('Superseded finding state requires a replacement finding ID.');
      replacement = selectFinding(registry, options.supersededBy);
      if (replacement.id === finding.id) throw new Error('A finding cannot supersede itself.');
      if (!['open', 'accepted'].includes(replacement.state)) throw new Error('A superseding finding must be open or accepted.');
    }
    finding.state = nextState;
    finding.stateChangedAt = nowIso();
    finding.stateChangedBy = cleanText(options.changedBy || 'reviewer', 'Finding reviewer');
    finding.stateReason = reason;
    if (replacement) finding.supersededBy = replacement.id; else delete finding.supersededBy;
    await writeFindingsRegistry(root, registry);
    return finding;
  });
}

async function runGit(root, args) {
  try {
    const result = await execFileAsync('git', args, { cwd: root, timeout: 4_000, maxBuffer: 1_048_576, windowsHide: true, encoding: 'utf8' });
    return String(result.stdout || '').trim();
  } catch { return ''; }
}
async function committedPathsSince(root, startHead, currentHead) {
  const continuity = await inspectGitHistoryContinuity(root, startHead, currentHead);
  if (!continuity.safeForCommittedAttribution || continuity.state === 'same-head') return { paths: [], continuity };
  const output = await runGit(root, ['diff', '--name-only', '--relative', startHead, currentHead, '--']);
  return { paths: bounded(unique(output.split(/\r?\n/).filter(Boolean).map(slash).filter((item) => !isCmiInternalPath(item))), MAX_PATHS), continuity };
}
function sessionRepositoryBaseline(repository) {
  if (!repository?.available) return repository;
  if (repository.rawClean !== undefined) return { ...repository, projectClean: repository.clean, projectChanges: bounded(repository.changes || [], 200), cmiInternalChangesOmitted: repository.cmiInternalChangesOmitted || 0 };
  const projectChanges = [];
  let cmiInternalChangesOmitted = 0;
  for (const item of repository.changes || []) {
    if (isCmiInternalPath(item.path)) cmiInternalChangesOmitted += 1;
    else projectChanges.push(item);
  }
  return { ...repository, projectClean: projectChanges.length === 0, projectChanges: bounded(projectChanges, 200), cmiInternalChangesOmitted };
}
function baselinePaths(baseline) {
  const changes = baseline?.projectChanges || baseline?.changes || [];
  return unique(changes.map((item) => slash(item.path)).filter((item) => item && !isCmiInternalPath(item)));
}
function summarizeHealth(project) { return { initialized: Boolean(project?.initialized), healthy: Boolean(project?.healthy), graph: project?.graphHealth || null, memory: project?.memoryHealth || null }; }
async function captureState(root) {
  const [rawRepository, project, active, completed] = await Promise.all([
    getRepositoryBaseline(root), getProjectStatus(root),
    listChangeRecords(root, { status: 'active', limit: 100 }), listChangeRecords(root, { status: 'completed', limit: 100 }),
  ]);
  return {
    capturedAt: nowIso(), repository: sessionRepositoryBaseline(rawRepository), project: summarizeHealth(project),
    activeChanges: active.records, completedChangeCount: completed.records.length,
    invalidChangeRecords: Math.max(active.invalidRecords || 0, completed.invalidRecords || 0),
  };
}
async function captureContext(root, goal) {
  let context = null;
  let history = null;
  let planning = { schemaVersion: 1, signals: [], totalDetected: 0, truncated: false, policy: 'Planning evidence unavailable.' };
  try {
    const pack = await buildContextPack(root, goal, 8, { stalePolicy: 'demote' });
    context = { summary: pack.summary || null, recommendedFiles: bounded(pack.recommendedFiles || [], 20), affectedWorkspaces: bounded(pack.affectedWorkspaces || [], 20), evidenceHealth: pack.health || null };
  } catch {}
  try {
    const result = await buildChangeInsights(root, goal, { limit: 8 });
    history = { corpus: result.corpus, verificationPatterns: bounded(result.behavioralEvidence?.verificationPatterns || [], 12), calibration: result.calibration, matches: bounded(result.matches || [], 8) };
  } catch {}
  try { planning = await getPlanningSignals(root, { limit: 8 }); } catch {}
  return { context, history, planning };
}
function normalizeObservation(options = {}) {
  return {
    observedAt: nowIso(), files: normalizePaths(options.files || []), notes: cleanItems(options.notes || [], 'Session note'),
    accomplished: cleanItems(options.accomplished || [], 'Accomplishment'), blockers: cleanItems(options.blockers || [], 'Blocker'),
    decisions: cleanItems(options.decisions || [], 'Decision'), questions: cleanItems(options.questions || [], 'Open question'),
  };
}
function hasObservationSignal(observation) {
  return observation.files.length || observation.notes.length || observation.accomplished.length || observation.blockers.length || observation.decisions.length || observation.questions.length;
}

export async function startSession(root, goal, options = {}) {
  return withMutationLock(root, async () => {
    const normalizedGoal = cleanText(goal, 'Session goal');
    const [start, intelligence] = await Promise.all([captureState(root), captureContext(root, normalizedGoal)]);
    const now = nowIso();
    const record = {
      schemaVersion: 1, id: crypto.randomUUID(), revision: 1, status: 'active', goal: normalizedGoal,
      createdAt: now, updatedAt: now, start: { ...start, intelligence }, observations: [], close: null,
    };
    const initial = normalizeObservation({ ...options, notes: [...(options.notes || []), ...(options.note ? [options.note] : [])] });
    if (hasObservationSignal(initial)) record.observations.push(initial);
    await writeSession(root, record);
    return record;
  });
}
export async function observeSession(root, selector, options = {}) {
  return withMutationLock(root, async () => {
    const record = await resolveSession(root, selector || 'latest', { status: 'active' });
    const observation = normalizeObservation(options);
    const state = await captureState(root);
    record.observations.push({ ...observation, state });
    record.updatedAt = nowIso();
    record.revision = (record.revision || 1) + 1;
    await writeSession(root, record);
    return record;
  });
}

function completedSince(summaries, startedAt) {
  const threshold = Date.parse(startedAt);
  return (summaries || []).filter((item) => item.completedAt && Date.parse(item.completedAt) >= threshold);
}
async function loadCompletedDetails(root, summaries) {
  const records = [];
  for (const item of summaries.slice(0, 40)) { try { records.push(await getChangeRecord(root, item.id)); } catch {} }
  return records;
}
function keyFor(category, target = '') { return `${category}:${String(target || '').trim().toLowerCase()}`; }
function makeFinding(category, severity, title, detail, options = {}) {
  return {
    key: keyFor(category, options.target), category, severity, title, detail,
    confidence: options.confidence || 'high', evidenceType: options.evidenceType || 'observed',
    sessionRelevance: options.sessionRelevance || null,
    evidence: bounded(options.evidence || [], 30), relatedFiles: bounded(options.relatedFiles || [], 30),
    autoResolvable: AUTO_RESOLVABLE.has(category),
  };
}
function verificationNames(records) {
  return new Set(records.flatMap((record) => record.completion?.verifications || []).map((item) => String(item.name || '').trim().toLowerCase()));
}
export function classifySessionGraphEvidence(project = {}) {
  if (!project.initialized) return 'uninitialized';
  const graph = project.graph;
  if (!graph || graph.state === 'missing') return 'missing';
  if (graph.available === false) return 'unavailable';
  if (graph.current !== true) return 'drifted';
  return 'current';
}

function detectFindings({ record, current, relatedActive, concurrentActive, completedDetails, scopePaths, mutationPaths, staleReport, gitContinuity }) {
  const findings = [];
  const graph = current.project.graph;
  const graphEvidence = classifySessionGraphEvidence(current.project);
  if (graphEvidence === 'uninitialized') {
    findings.push(makeFinding('project-intelligence-missing', 'high', 'Project intelligence is incomplete', 'CMI does not have a current project graph/index, so context and impact guidance are incomplete.', { target: 'graph-index', evidence: ['project-status'] }));
  } else if (graphEvidence === 'drifted') {
    findings.push(makeFinding('graph-drift', graph.missingNodes > 0 ? 'high' : 'medium', 'Project graph has drifted from source', `Stored graph evidence no longer matches current source (${graph.staleNodes || 0} stale, ${graph.missingNodes || 0} missing node(s)).`, { target: 'graph', evidence: ['source-fingerprint-mismatch'] }));
  }
  if ((staleReport.counts?.stale || 0) > 0) findings.push(makeFinding('stale-memory', 'medium', 'Reviewed project memory is stale', `${staleReport.counts.stale} tracked memory entr${staleReport.counts.stale === 1 ? 'y is' : 'ies are'} stale against current source evidence.`, { target: 'memory', evidence: ['source-linked-memory'] }));
  const reviewCount = (staleReport.counts?.review || 0) + (staleReport.counts?.untracked || 0);
  if (reviewCount > 0) findings.push(makeFinding('memory-review', 'low', 'Project memory needs review', `${reviewCount} memory entr${reviewCount === 1 ? 'y needs' : 'ies need'} review or tracking.`, { target: 'memory', evidence: ['memory-health'] }));
  if ((current.invalidChangeRecords || 0) > 0) findings.push(makeFinding('invalid-change-records', 'high', 'Invalid durable change records were ignored', `${current.invalidChangeRecords} change record(s) failed runtime validation and were excluded from evidence.`, { target: 'change-history', evidence: ['runtime-validation'] }));
  const preexisting = baselinePaths(record.start.repository);
  if (preexisting.length) findings.push(makeFinding('preexisting-worktree', 'medium', 'Session attribution started from a dirty worktree', `${preexisting.length} project path(s) were already dirty when the session started. CMI cannot attribute later edits to those same paths from path status alone.`, { target: record.id, evidence: ['session-start-git-baseline'], relatedFiles: preexisting }));
  if (['rewritten', 'unrelated'].includes(gitContinuity?.state)) findings.push(makeFinding('git-history-rewrite', 'medium', 'Git history changed across the session baseline', gitContinuity.reason || 'The session-start HEAD is no longer an ancestor of current HEAD, so automatic committed-path attribution is ambiguous.', { target: record.id, evidence: [`git-continuity:${gitContinuity.state}`], confidence: 'high' }));

  for (const relation of relatedActive) {
    const active = relation.change;
    findings.push(makeFinding('active-change', 'high', 'Related change record remains active', `Change "${active.goal}" appears related to this session and has not been completed or explicitly abandoned.`, {
      target: active.id, evidence: [`change:${active.id}`, `association:${relation.relation}`],
      evidenceType: relation.evidenceType === 'inferred' ? 'inferred' : 'observed', sessionRelevance: 'related',
    }));
  }
  for (const relation of concurrentActive) {
    const active = relation.change;
    findings.push(makeFinding('active-change', 'info', 'Concurrent active change exists', `Change "${active.goal}" remains active but CMI lacks enough evidence to attribute it to this session.`, {
      target: active.id, evidence: [`change:${active.id}`, 'association:concurrent-unattributed'],
      evidenceType: 'inferred', confidence: 'low', sessionRelevance: 'concurrent-unattributed',
    }));
  }

  for (const blocker of record.observations.flatMap((item) => item.blockers || [])) findings.push(makeFinding('session-blocker', 'high', 'Session blocker remains unresolved', blocker, { target: crypto.createHash('sha1').update(blocker).digest('hex').slice(0, 12), evidence: ['session-observation'], sessionRelevance: 'related' }));
  for (const question of record.observations.flatMap((item) => item.questions || [])) findings.push(makeFinding('open-question', 'low', 'Open project question remains', question, { target: crypto.createHash('sha1').update(question).digest('hex').slice(0, 12), evidence: ['session-observation'], confidence: 'medium', sessionRelevance: 'related' }));

  for (const change of completedDetails) {
    const completion = change.completion || {};
    const verifications = completion.verifications || [];
    if (['succeeded', 'partial'].includes(completion.outcome) && verifications.length === 0) findings.push(makeFinding('verification-missing', 'high', 'Related completed change has no verification evidence', `Change "${change.goal}" was associated with this session and completed as ${completion.outcome} without recorded verification evidence.`, { target: change.id, evidence: [`change:${change.id}`], sessionRelevance: 'related' }));
    for (const verification of verifications) {
      if (verification.status === 'failed') findings.push(makeFinding('verification-failed', 'critical', `Verification failed: ${verification.name}`, `Related change "${change.goal}" records a failed verification.`, { target: `${change.id}:${verification.name}`, evidence: [`change:${change.id}`, `verification:${verification.name}`], sessionRelevance: 'related' }));
      else if (['skipped', 'unknown'].includes(verification.status)) findings.push(makeFinding('verification-incomplete', 'medium', `Verification incomplete: ${verification.name}`, `Verification is recorded as ${verification.status} for related change "${change.goal}".`, { target: `${change.id}:${verification.name}`, evidence: [`change:${change.id}`, `verification:${verification.name}`], sessionRelevance: 'related' }));
    }
    const comparison = completion.finalObservation?.comparison;
    if ((comparison?.missedByPrediction || []).length) findings.push(makeFinding('prediction-gap', 'medium', 'Observed related work escaped predicted scope', `${comparison.missedByPrediction.length} changed path(s) were not predicted for related change "${change.goal}".`, { target: change.id, evidence: [`change:${change.id}`, 'expected-vs-actual'], relatedFiles: comparison.missedByPrediction, sessionRelevance: 'related' }));
    if ((completion.unexpectedImpact || []).length) findings.push(makeFinding('unexpected-impact', 'medium', 'Unexpected impact was recorded for related work', completion.unexpectedImpact.join(' '), { target: change.id, evidence: [`change:${change.id}`], sessionRelevance: 'related' }));
  }

  if (mutationPaths.length && !completedDetails.length && !relatedActive.length) findings.push(makeFinding('uncaptured-session-change', 'medium', 'Session changed project scope without a related change record', `${mutationPaths.length} project path(s) changed during the session but no associated active/completed CMI change record was identified.`, { target: record.id, evidence: ['git-session-mutation-scope'], relatedFiles: mutationPaths, sessionRelevance: 'related' }));
  if (current.repository?.available && current.repository.projectClean === false && mutationPaths.length) findings.push(makeFinding('uncommitted-session-work', 'low', 'Session ends with uncommitted project work', `${mutationPaths.length} session-mutated path(s) remain in the Git worktree. Preserve or explicitly hand off this state before switching tasks.`, { target: record.id, evidence: ['git-worktree'], relatedFiles: mutationPaths, sessionRelevance: 'related' }));
  return findings;
}
function priorityFor(finding) {
  if (finding.category === 'active-change' && finding.sessionRelevance === 'concurrent-unattributed') return 'P3';
  if (finding.category === 'verification-failed' || finding.category === 'session-blocker') return 'P0';
  if (['verification-missing', 'active-change', 'project-intelligence-missing', 'graph-drift', 'uncaptured-session-change', 'invalid-change-records'].includes(finding.category)) return 'P1';
  if (['verification-incomplete', 'prediction-gap', 'unexpected-impact', 'stale-memory', 'preexisting-worktree', 'git-history-rewrite'].includes(finding.category)) return 'P2';
  return 'P3';
}
function actionFor(finding) {
  if (finding.category === 'active-change' && finding.sessionRelevance === 'concurrent-unattributed') return 'Coordinate the concurrent active change only if it becomes relevant to this session; do not block current work on it by default.';
  const actions = {
    'verification-failed': `Fix the failing verification "${finding.title.replace(/^Verification failed:\s*/, '')}" and rerun it before expanding scope.`,
    'session-blocker': `Resolve or explicitly defer the blocker: ${finding.detail}`,
    'verification-missing': 'Run and record the verification required for the related completed change before treating it as fully validated.',
    'verification-incomplete': `Complete the pending verification: ${finding.title.replace(/^Verification incomplete:\s*/, '')}.`,
    'active-change': 'Complete or explicitly abandon the related active change record before starting unrelated work.',
    'project-intelligence-missing': 'Run `cmi scan` before relying on project context or impact guidance.',
    'graph-drift': 'Run `cmi scan`, then refresh task context/impact before making further dependent changes.',
    'stale-memory': 'Run `cmi stale` and review stale entries; refresh, deprecate, reject, or supersede them based on current evidence.',
    'memory-review': 'Review untracked/review-state memory before relying on it as durable project knowledge.',
    'preexisting-worktree': 'Separate, stash, commit, or explicitly annotate pre-existing dirty paths before relying on session-level change attribution.',
    'git-history-rewrite': 'Review session scope manually after rebase/reset/history rewrite; use explicit observed paths or a new clean session baseline instead of start-to-current Git diff attribution.',
    'prediction-gap': `Review the missed changed paths (${finding.relatedFiles?.join(', ') || 'see evidence'}) and decide whether future scope/boundary expectations should be updated.`,
    'unexpected-impact': 'Investigate the unexpected impact and add a reviewed lesson only if the evidence supports it.',
    'uncaptured-session-change': 'Create/complete a CMI change record for the mutated session scope so expected-vs-actual and verification evidence are not lost.',
    'uncommitted-session-work': 'Commit, stash, revert, or explicitly preserve the dirty session scope before switching to unrelated work.',
    'open-question': `Answer or explicitly defer the open question: ${finding.detail}`,
    'invalid-change-records': 'Repair or quarantine invalid durable change records before relying on historical intelligence.',
  };
  return actions[finding.category] || `Review unresolved finding: ${finding.title}`;
}
function historicalRecommendations(history, completedDetails) {
  if (!history?.verificationPatterns?.length || !completedDetails.length) return [];
  const current = verificationNames(completedDetails);
  const recommendations = [];
  for (const pattern of history.verificationPatterns) {
    const name = String(pattern.name || '').trim();
    if (!name || current.has(name.toLowerCase()) || pattern.total < 3) continue;
    recommendations.push({
      id: `historical-verification:${crypto.createHash('sha1').update(name.toLowerCase()).digest('hex').slice(0, 12)}`,
      priority: pattern.confidence === 'high' ? 'P1' : 'P2',
      action: `Consider running the historically repeated verification "${name}" for this related work.`,
      reason: `This verification appears in ${pattern.total} relevant completed change(s) with pass rate ${pattern.passRate ?? 'unknown'} and observed-command evidence rate ${pattern.observedEvidenceRate ?? 'unknown'}.`,
      evidenceType: 'historical-correlation', evidence: [`historical-verification:${name}`], confidence: pattern.confidence || 'low', relatedFindingIds: [],
    });
  }
  return recommendations;
}
function planningRecommendations(signals) {
  return bounded((signals || []).map((signal) => {
    const label = signal.type === 'unchecked-markdown-task'
      ? 'unchecked planning task'
      : signal.type === 'explicit-planning-marker'
        ? 'explicit planning marker'
        : 'planning item';
    return {
      id: signal.id, priority: 'P3',
      action: `Review whether the ${label} "${signal.text}" should be the next project task.`,
      reason: `Observed ${label} in ${signal.path}:${signal.line}${signal.section ? ` under "${signal.section}"` : ''}.`,
      evidenceType: 'observed', evidenceSubtype: 'planning-task', evidence: [`${signal.path}:${signal.line}`],
      confidence: signal.confidence || 'medium', relatedFindingIds: [],
    };
  }), 3);
}
function buildRecommendations(findings, history, completedDetails, planningSignals = []) {
  const items = findings.map((finding) => ({
    id: `finding-action:${finding.key}`, priority: priorityFor(finding), action: actionFor(finding), reason: finding.detail,
    evidenceType: finding.evidenceType, evidence: finding.evidence || [], confidence: finding.confidence || 'low',
    relatedFindingIds: finding.id ? [finding.id] : [],
  }));
  items.push(...historicalRecommendations(history, completedDetails));
  items.push(...planningRecommendations(planningSignals));
  const seen = new Set();
  return bounded(items.filter((item) => {
    const key = `${item.priority}:${item.action.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => (PRIORITY_ORDER[b.priority] || 0) - (PRIORITY_ORDER[a.priority] || 0) || a.action.localeCompare(b.action)), 20);
}
function buildGuardrails(findings, recommendations) {
  const categories = new Set(findings.map((item) => item.category));
  const items = [];
  if (categories.has('verification-failed')) items.push({ id: 'do-not-claim-verified', rule: 'Do not treat the current work as verified or expand dependent scope while a recorded verification is failing.', reason: 'Failed verification is blocking evidence.' });
  if (categories.has('verification-missing') || categories.has('verification-incomplete')) items.push({ id: 'do-not-claim-complete', rule: 'Do not represent the affected related change as fully validated while verification evidence is missing, skipped, or unknown.', reason: 'Completion claims exceed recorded verification evidence.' });
  if (categories.has('graph-drift') || categories.has('project-intelligence-missing')) items.push({ id: 'do-not-trust-stale-graph', rule: 'Do not rely on graph/impact output as current evidence until project intelligence is refreshed.', reason: 'Graph evidence is unavailable or stale.' });
  if (categories.has('stale-memory')) items.push({ id: 'do-not-promote-stale-memory', rule: 'Do not treat stale reviewed memory as current project truth without source review.', reason: 'Source-linked knowledge no longer matches current evidence.' });
  if (categories.has('git-history-rewrite')) items.push({ id: 'do-not-overattribute-rewritten-history', rule: 'Do not attribute commits from a rewritten start-to-current Git diff to this session automatically.', reason: 'The session-start HEAD is not an ancestor of current HEAD.' });
  if (findings.some((item) => item.category === 'active-change' && item.sessionRelevance === 'related')) items.push({ id: 'do-not-orphan-active-change', rule: 'Do not silently abandon a related active Change Intelligence record when switching tasks.', reason: 'Expected-vs-actual and verification history would become incomplete.' });
  if (findings.some((item) => item.category === 'active-change' && item.sessionRelevance === 'concurrent-unattributed')) items.push({ id: 'do-not-hijack-concurrent-change', rule: 'Do not let a concurrent/unattributed change record determine this session next action unless new evidence links it.', reason: 'CMI lacks sufficient association evidence.' });
  if (categories.has('preexisting-worktree')) items.push({ id: 'do-not-overattribute-dirty-worktree', rule: 'Do not attribute all dirty paths to this session when the session started from a dirty worktree.', reason: 'Path status alone cannot separate pre-existing edits from later edits to the same path.' });
  if (categories.has('prediction-gap')) items.push({ id: 'do-not-call-prediction-complete', rule: 'Do not treat pre-change predicted scope as complete impact evidence when observed paths escaped it.', reason: 'Expected-vs-actual evidence contains a prediction gap.' });
  if (recommendations.some((item) => item.evidenceType === 'historical-correlation')) items.push({ id: 'do-not-treat-history-as-causal', rule: 'Do not treat historical verification or co-change correlation as a causal dependency or mandatory command.', reason: 'Historical patterns are correlation-only evidence.' });
  if (recommendations.some((item) => item.evidenceSubtype === 'planning-task')) items.push({ id: 'do-not-treat-planning-as-command', rule: 'Do not treat planning text as proven current business priority; review it after stronger unresolved evidence.', reason: 'Planning files are observed planning evidence, not execution authority.' });
  items.push({ id: 'no-auto-command-or-truth', rule: 'Do not execute a project command or promote a knowledge candidate solely because CMI recommended it.', reason: 'CMI recommendations are advisory and durable knowledge remains review-controlled.' });
  return bounded(items, 12);
}
function buildKnowledgeCandidates(record, findings) {
  const candidates = [];
  for (const decision of record.observations.flatMap((item) => item.decisions || [])) candidates.push({ type: 'decision', status: 'review-required', proposal: decision, reason: 'The session explicitly recorded this as a decision. Persist only after review.' });
  for (const blocker of record.observations.flatMap((item) => item.blockers || [])) candidates.push({ type: 'mistake', status: 'review-required', proposal: blocker, reason: 'A blocker may represent a reusable failure mode if its cause and prevention are verified.' });
  for (const finding of findings.filter((item) => ['prediction-gap', 'unexpected-impact', 'verification-failed'].includes(item.category))) candidates.push({ type: 'mistake', status: 'review-required', proposal: `${finding.title}: ${finding.detail}`, reason: 'Repeated or well-understood evidence may justify a durable lesson after review.' });
  return bounded(candidates, 20);
}
function inferOutcome(explicit, record, current, relatedActive, completedDetails, currentFindings, mutationPaths) {
  if (explicit) {
    const normalized = String(explicit).trim().toLowerCase();
    if (!SESSION_OUTCOMES.has(normalized)) throw new Error(`Session outcome must be one of: ${[...SESSION_OUTCOMES].join(', ')}.`);
    return normalized;
  }
  if (currentFindings.some((item) => item.severity === 'critical' || item.category === 'session-blocker')) return 'blocked';
  if (relatedActive.length || currentFindings.some((item) => ['verification-missing', 'verification-incomplete'].includes(item.category)) || (current.repository?.available && current.repository.projectClean === false && mutationPaths.length)) return 'partial';
  if (completedDetails.length && completedDetails.every((item) => item.completion?.outcome === 'succeeded')) return 'succeeded';
  if (!mutationPaths.length && record.observations.some((item) => item.notes?.length || item.decisions?.length || item.questions?.length || item.accomplished?.length || item.files?.length)) return 'investigated';
  return 'unknown';
}
function summaryText(outcome, scopePaths, completedDetails, openFindings, recommendations) {
  const blocking = openFindings.filter((item) => ['critical', 'high'].includes(item.severity) && item.sessionRelevance !== 'concurrent-unattributed').length;
  const next = recommendations[0]?.action || 'No evidence-based follow-up is currently required; the project is ready for a new user-prioritized goal.';
  return `Session outcome: ${outcome}. ${scopePaths.length} project path(s) were associated with the session and ${completedDetails.length} related change record(s) completed during it. ${blocking} high/critical relevant open finding(s) remain. Next: ${next}`;
}
function canAutoResolveFinding(finding, state) {
  if (['graph-drift', 'project-intelligence-missing'].includes(finding.category)) {
    return classifySessionGraphEvidence(state?.project) === 'current';
  }
  return true;
}

async function persistDetectedFindings(root, sessionId, detected, state) {
  const registry = await readFindingsRegistry(root);
  const timestamp = nowIso();
  const seenKeys = new Set();
  const observed = [];
  let changed = false;
  for (const item of detected) {
    seenKeys.add(item.key);
    let existing = registry.findings.find((finding) => finding.key === item.key && finding.state === 'open');
    if (existing) {
      existing.lastSeen = timestamp;
      existing.occurrences = (existing.occurrences || 1) + 1;
      existing.sessions = bounded(unique([...(existing.sessions || []), sessionId]), 50);
      existing.evidence = bounded(unique([...(existing.evidence || []), ...(item.evidence || [])]), 50);
      existing.relatedFiles = bounded(unique([...(existing.relatedFiles || []), ...(item.relatedFiles || [])]), 50);
      existing.detail = item.detail;
      existing.severity = item.severity;
      existing.confidence = item.confidence;
      existing.evidenceType = item.evidenceType;
      existing.sessionRelevance = item.sessionRelevance;
      observed.push(existing);
      changed = true;
    } else {
      existing = { schemaVersion: 1, id: crypto.randomUUID(), state: 'open', ...item, firstSeen: timestamp, lastSeen: timestamp, occurrences: 1, sessions: [sessionId] };
      registry.findings.push(existing);
      observed.push(existing);
      changed = true;
    }
  }
  for (const finding of registry.findings) {
    if (finding.state !== 'open' || !finding.autoResolvable || seenKeys.has(finding.key) || !canAutoResolveFinding(finding, state)) continue;
    finding.state = 'resolved';
    finding.stateChangedAt = timestamp;
    finding.stateChangedBy = 'cmi-auto-evidence';
    finding.stateReason = 'The deterministic condition was not present in the latest closed session assessment.';
    changed = true;
  }
  if (registry.findings.length > 1000) changed = true;
  registry.findings = registry.findings.slice(-1000);
  if (changed) await writeFindingsRegistry(root, registry);
  return observed;
}
async function loadOpenFindings(root) {
  const registry = await readFindingsRegistry(root);
  return registry.findings.filter((item) => item.state === 'open')
    .sort((a, b) => (SEVERITY_ORDER[b.severity] || 0) - (SEVERITY_ORDER[a.severity] || 0) || String(b.lastSeen).localeCompare(String(a.lastSeen))).slice(0, 100);
}
function mergeLiveFindings(open, detected) {
  const map = new Map(open.map((item) => [item.key, item]));
  for (const item of detected) map.set(item.key, { ...(map.get(item.key) || {}), ...item });
  return [...map.values()].sort((a, b) => (SEVERITY_ORDER[b.severity] || 0) - (SEVERITY_ORDER[a.severity] || 0) || a.title.localeCompare(b.title));
}
function relationSummary(item) {
  return {
    id: item.change.id, goal: item.change.goal, status: item.change.status,
    relation: item.relation, evidenceType: item.evidenceType,
    sharedTerms: item.sharedTerms || [], overlapPaths: item.overlapPaths || [],
  };
}
function buildHandoff(record, current, scopePaths, association, completedDetails, openFindings, recommendations, guardrails, knowledgeCandidates, planningSignals, outcome) {
  const observations = record.observations;
  const fallback = { id: 'no-follow-up', priority: 'P3', action: 'No evidence-based follow-up is currently required; begin the next user-prioritized project goal.', reason: 'CMI found no unresolved evidence requiring a more specific action.', evidenceType: 'observed', evidence: [], confidence: 'high', relatedFindingIds: [] };
  return {
    schemaVersion: 1, sessionId: record.id, generatedAt: nowIso(), objective: record.goal, outcome,
    repository: current.repository?.available ? {
      branch: current.repository.branch, head: current.repository.head, clean: current.repository.projectClean,
      changes: bounded(current.repository.projectChanges || [], 40), cmiInternalChangesOmitted: current.repository.cmiInternalChangesOmitted || 0,
    } : { available: false, reason: current.repository?.reason || 'Git baseline unavailable.' },
    sessionScope: bounded(scopePaths, 80),
    accomplished: bounded(observations.flatMap((item) => item.accomplished || []), 30),
    decisions: bounded(observations.flatMap((item) => item.decisions || []), 20),
    openQuestions: bounded(observations.flatMap((item) => item.questions || []), 20),
    completedChanges: bounded(completedDetails.map((item) => ({ id: item.id, goal: item.goal, outcome: item.completion?.outcome, verifications: bounded(item.completion?.verifications || [], 12) })), 20),
    activeChanges: bounded(association.relatedActive.map(relationSummary), 20),
    concurrentChanges: {
      active: bounded(association.concurrentActive.map(relationSummary), 20),
      completed: bounded(association.concurrentCompleted.map(relationSummary), 20),
      policy: association.policy,
    },
    openFindings: bounded(openFindings.map(findingSummary), 20), planningSignals: bounded(planningSignals || [], 8),
    nextActions: bounded(recommendations, 10), nextAction: recommendations[0] || fallback,
    guardrails, knowledgeCandidates,
    agentInstruction: 'Continue from this handoff instead of reconstructing project state from scratch. Re-check current evidence, address P0/P1 relevant actions before unrelated work unless the user changes priority, do not let concurrent/unattributed changes hijack this session, treat planning items as review candidates, obey guardrails, and do not turn advisory candidates into durable truth without review.',
  };
}

async function buildAssessment(root, record) {
  const [current, staleReport, intelligence, completedSummaries, existingOpen] = await Promise.all([
    captureState(root), checkStaleMemory(root), captureContext(root, record.goal),
    listChangeRecords(root, { status: 'completed', limit: 100 }), loadOpenFindings(root),
  ]);
  const completedCandidates = await loadCompletedDetails(root, completedSince(completedSummaries.records, record.createdAt));
  const startPaths = new Set(baselinePaths(record.start.repository));
  const currentPaths = baselinePaths(current.repository);
  const newDirtyPaths = currentPaths.filter((item) => !startPaths.has(item));
  const committedEvidence = await committedPathsSince(root, record.start.repository?.fullHead, current.repository?.fullHead);
  const committedPaths = committedEvidence.paths;
  const observedPaths = record.observations.flatMap((item) => item.files || []);
  const mutationPaths = bounded(unique([...newDirtyPaths, ...committedPaths]), MAX_PATHS);
  const scopePaths = bounded(unique([...mutationPaths, ...observedPaths]), MAX_PATHS);
  const association = associateSessionChanges({
    sessionGoal: record.goal,
    startActiveChanges: record.start.activeChanges || [],
    currentActiveChanges: current.activeChanges || [],
    completedDetails: completedCandidates,
    scopePaths,
  });
  const completedDetails = association.relatedCompleted.map((item) => item.change);
  const detected = detectFindings({
    record, current, relatedActive: association.relatedActive, concurrentActive: association.concurrentActive,
    completedDetails, scopePaths, mutationPaths, staleReport, gitContinuity: committedEvidence.continuity,
  });
  const findings = mergeLiveFindings(existingOpen, detected);
  const planningSignals = intelligence.planning?.signals || [];
  const recommendations = buildRecommendations(findings, intelligence.history, completedDetails, planningSignals);
  const guardrails = buildGuardrails(findings, recommendations);
  return {
    schemaVersion: 1, generatedAt: nowIso(),
    session: { id: record.id, goal: record.goal, status: record.status, createdAt: record.createdAt },
    current,
    scope: { paths: scopePaths, mutationPaths, newDirtyPaths, committedPaths, explicitlyObservedPaths: unique(observedPaths), preexistingDirtyPaths: [...startPaths], gitContinuity: committedEvidence.continuity },
    association: {
      relatedActive: association.relatedActive.map(relationSummary),
      concurrentActive: association.concurrentActive.map(relationSummary),
      relatedCompleted: association.relatedCompleted.map(relationSummary),
      concurrentCompleted: association.concurrentCompleted.map(relationSummary),
      policy: association.policy,
    },
    completedChanges: completedDetails, detectedFindings: detected, findings, recommendations, guardrails, intelligence,
  };
}
export async function assessSession(root, selector = 'latest') {
  return buildAssessment(root, await resolveSession(root, selector, { status: 'active' }));
}

export async function closeSession(root, selector, options = {}) {
  return withMutationLock(root, async () => {
    let record = await resolveSession(root, selector || 'latest', { status: 'active' });
    const finalObservation = normalizeObservation(options);
    if (hasObservationSignal(finalObservation)) {
      record.observations.push(finalObservation);
      record.updatedAt = nowIso();
      record.revision = (record.revision || 1) + 1;
      await writeSession(root, record);
      record = await resolveSession(root, record.id, { status: 'active' });
    }
    const assessment = await buildAssessment(root, record);
    const currentFindings = await persistDetectedFindings(root, record.id, assessment.detectedFindings, assessment.current);
    const openFindings = await loadOpenFindings(root);
    const planningSignals = assessment.intelligence.planning?.signals || [];
    const recommendations = buildRecommendations(openFindings, assessment.intelligence.history, assessment.completedChanges, planningSignals);
    const guardrails = buildGuardrails(openFindings, recommendations);
    const relatedActive = assessment.association.relatedActive;
    const outcome = inferOutcome(options.outcome, record, assessment.current, relatedActive, assessment.completedChanges, currentFindings, assessment.scope.mutationPaths || []);
    const knowledgeCandidates = buildKnowledgeCandidates(record, currentFindings);
    const associationForHandoff = {
      relatedActive: assessment.association.relatedActive.map((item) => ({ ...item, change: { id: item.id, goal: item.goal, status: item.status } })),
      concurrentActive: assessment.association.concurrentActive.map((item) => ({ ...item, change: { id: item.id, goal: item.goal, status: item.status } })),
      concurrentCompleted: assessment.association.concurrentCompleted.map((item) => ({ ...item, change: { id: item.id, goal: item.goal, status: item.status } })),
      policy: assessment.association.policy,
    };
    const handoff = buildHandoff(record, assessment.current, assessment.scope.paths, associationForHandoff, assessment.completedChanges, openFindings, recommendations, guardrails, knowledgeCandidates, planningSignals, outcome);
    const closedAt = nowIso();
    record.status = 'closed';
    record.updatedAt = closedAt;
    record.revision = (record.revision || 1) + 1;
    record.close = {
      closedAt, outcome,
      summary: summaryText(outcome, assessment.scope.paths, assessment.completedChanges, openFindings, recommendations),
      scope: assessment.scope, current: assessment.current, association: assessment.association,
      findings: currentFindings, openFindings, recommendations, guardrails, knowledgeCandidates, handoff,
      policy: 'Findings and next actions are evidence-linked advisory output. Session scope may include explicitly observed/read paths; mutation scope is derived only from Git-observed dirty or committed project paths. Session/change association is conservative; concurrent/unattributed changes do not block the session by default. CMI does not execute project commands or promote knowledge candidates into durable truth automatically.',
    };
    await writeSession(root, record);
    return record;
  });
}
export async function getSession(root, selector = 'latest') { return resolveSession(root, selector); }
export async function listSessions(root, options = {}) {
  const { records, invalidRecords, truncated } = await readSessionRecords(root);
  const status = options.status ? String(options.status).trim().toLowerCase() : null;
  if (status && !['active', 'closed'].includes(status)) throw new Error('Session status must be active or closed.');
  const limit = Math.max(1, Math.min(100, Number(options.limit) || 20));
  return {
    schemaVersion: 1,
    records: records.filter((item) => !status || item.status === status).slice(0, limit)
      .map((item) => ({ id: item.id, status: item.status, goal: item.goal, createdAt: item.createdAt, updatedAt: item.updatedAt, outcome: item.close?.outcome || null, nextAction: item.close?.handoff?.nextAction || null })),
    invalidRecords, truncated,
  };
}
export async function getSessionHandoff(root, selector = 'latest') {
  const record = selector === 'latest' || !selector ? await resolveSession(root, 'latest', { status: 'closed' }) : await resolveSession(root, selector);
  if (record.status !== 'closed' || !record.close?.handoff) throw new Error('Session handoff is available only after the session is closed.');
  return record.close.handoff;
}

export function formatSessionReport(record) {
  if (record.status === 'active') return `# Active CMI session\n\nGoal: ${record.goal}\nStarted: ${record.createdAt}\nObservations: ${record.observations.length}\n\nRun \`cmi session status ${record.id.slice(0, 8)}\` for live findings and recommendations.`;
  const close = record.close;
  const findings = (close.openFindings || close.findings).map((item) => `- [${item.severity}] ${item.title}: ${item.detail}`).join('\n') || '- None';
  const actions = close.recommendations.map((item) => `- ${item.priority} ${item.action}\n  Why: ${item.reason} · ${item.evidenceType}${item.evidenceSubtype ? `/${item.evidenceSubtype}` : ''} · confidence ${item.confidence}`).join('\n') || '- No evidence-based follow-up required.';
  const guardrails = (close.guardrails || []).map((item) => `- ${item.rule}\n  Why: ${item.reason}`).join('\n') || '- Preserve evidence distinctions and do not auto-promote advisory output.';
  return `# Session outcome: ${close.outcome}\n\n${close.summary}\n\n## Problems / unresolved findings\n${findings}\n\n## Recommended next actions\n${actions}\n\n## Guardrails / do not assume\n${guardrails}\n\n## Next action\n${close.handoff.nextAction.priority} ${close.handoff.nextAction.action}`;
}
export function formatSessionAssessment(result) {
  const findings = result.findings.map((item) => `- [${item.severity}] ${item.title}: ${item.detail}`).join('\n') || '- None';
  const actions = result.recommendations.map((item) => `- ${item.priority} ${item.action}`).join('\n') || '- No evidence-based follow-up required.';
  const guardrails = result.guardrails.map((item) => `- ${item.rule}`).join('\n') || '- Preserve evidence distinctions.';
  return `# Session status\n\nGoal: ${result.session.goal}\nScope observed: ${result.scope.paths.length} path(s) · mutation evidence: ${(result.scope.mutationPaths || []).length} path(s)\nRelated active changes: ${result.association.relatedActive.length} · concurrent/unattributed active changes: ${result.association.concurrentActive.length}\n\n## Current findings\n${findings}\n\n## What to do next\n${actions}\n\n## Guardrails\n${guardrails}`;
}
export function formatHandoff(handoff) {
  const findings = handoff.openFindings.map((item) => `- [${item.severity}] ${item.title}: ${item.detail}`).join('\n') || '- None';
  const actions = handoff.nextActions.map((item) => `- ${item.priority} ${item.action}`).join('\n') || `- ${handoff.nextAction.priority} ${handoff.nextAction.action}`;
  const guardrails = (handoff.guardrails || []).map((item) => `- ${item.rule}`).join('\n') || '- Preserve evidence distinctions.';
  return `# CMI handoff\n\nObjective: ${handoff.objective}\nOutcome: ${handoff.outcome}\nBranch: ${handoff.repository.branch || 'unknown'}\nHEAD: ${handoff.repository.head || 'unknown'}\nSession scope: ${handoff.sessionScope.length} path(s)\nRelated active changes: ${handoff.activeChanges.length} · concurrent active changes: ${handoff.concurrentChanges?.active?.length || 0}\n\n## Open findings\n${findings}\n\n## Next actions\n${actions}\n\n## Guardrails\n${guardrails}\n\n${handoff.agentInstruction}`;
}
export function formatFindingList(result) {
  return result.findings.length ? result.findings.map((item) => `- ${item.id.slice(0, 8)} [${item.state}/${item.severity}] ${item.title} · seen ${item.occurrences} time(s)`).join('\n') : 'No matching project findings.';
}
