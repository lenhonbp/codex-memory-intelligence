import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { initProject, status as getProjectStatus } from './core.js';
import { getRepositoryBaseline } from './advisor.js';
import { buildContextPack } from './search.js';
import { checkStaleMemory } from './stale.js';
import { listChangeRecords, getChangeRecord, buildChangeInsights } from './change-intelligence.js';

const execFileAsync = promisify(execFile);
const MEMORY_DIR = '.codex-memory';
const SESSION_DIR = 'sessions';
const FINDINGS_FILE = 'findings.json';
const MAX_RECORD_BYTES = 1_000_000;
const MAX_RECORDS = 500;
const MAX_PATHS = 160;
const MAX_TEXT_ITEMS = 40;
const MAX_TEXT_LENGTH = 500;
const LOCK_STALE_MS = 30_000;
const SESSION_OUTCOMES = new Set(['succeeded', 'partial', 'blocked', 'investigated', 'abandoned', 'unknown']);
const FINDING_STATES = new Set(['open', 'resolved', 'accepted', 'dismissed', 'superseded']);
const SEVERITY_ORDER = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };
const PRIORITY_ORDER = { P0: 4, P1: 3, P2: 2, P3: 1 };
const AUTO_RESOLVABLE = new Set(['project-intelligence-missing', 'graph-drift', 'stale-memory', 'memory-review', 'active-change', 'invalid-change-records']);

function slash(value) { return String(value || '').replace(/\\/g, '/'); }
function unique(values) { return [...new Set((values || []).filter(Boolean))]; }
function bounded(values, limit) { return (values || []).slice(0, Math.max(0, limit)); }
function nowIso() { return new Date().toISOString(); }
function validIso(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
function isCmiInternalPath(value) {
  const normalized = slash(value).trim().replace(/^\.\//, '');
  return normalized === MEMORY_DIR || normalized.startsWith(`${MEMORY_DIR}/`);
}
function looksSensitive(text) {
  return /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)
    || /\b(?:api[_ -]?key|password|secret|access[_ -]?token|refresh[_ -]?token)\s*[:=]\s*\S{6,}/i.test(text)
    || /\b(?:sk|ghp|github_pat|xox[baprs])-[-A-Za-z0-9_]{12,}\b/.test(text);
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
function sessionLockPath(root, id) { return path.join(sessionsDirectory(root), `${id}.lock`); }
function findingsPath(root) { return path.join(root, MEMORY_DIR, FINDINGS_FILE); }
function findingsLockPath(root) { return path.join(root, MEMORY_DIR, 'snapshots', 'findings.lock'); }
function intelligenceLockPath(root) { return path.join(root, MEMORY_DIR, 'snapshots', 'session-intelligence.lock'); }

async function ensureStorage(root) {
  await initProject(root);
  await fs.mkdir(sessionsDirectory(root), { recursive: true });
  await fs.mkdir(path.join(root, MEMORY_DIR, 'snapshots'), { recursive: true });
}
async function acquireLock(target) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  try {
    const handle = await fs.open(target, 'wx');
    await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: nowIso() }));
    return handle;
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    const stat = await fs.stat(target).catch(() => null);
    if (stat && Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
      await fs.rm(target, { force: true });
      const handle = await fs.open(target, 'wx');
      await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: nowIso(), reclaimed: true }));
      return handle;
    }
    throw new Error(`CMI intelligence record is locked by another writer: ${path.basename(target)}`);
  }
}
async function releaseLock(target, handle) {
  await handle?.close().catch(() => {});
  await fs.rm(target, { force: true }).catch(() => {});
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
async function safeReadJson(target, validator) {
  let handle;
  try {
    const noFollow = typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0;
    handle = await fs.open(target, fsConstants.O_RDONLY | noFollow);
    const opened = await handle.stat();
    if (!opened.isFile() || opened.size > MAX_RECORD_BYTES) return null;
    if (!noFollow) {
      const stat = await fs.lstat(target);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.dev !== opened.dev || stat.ino !== opened.ino) return null;
    }
    const value = JSON.parse(await handle.readFile('utf8'));
    return validator(value) ? value : null;
  } catch { return null; }
  finally { await handle?.close().catch(() => {}); }
}

export function validateSessionRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
  if (record.schemaVersion !== 1 || !record.id || !Number.isInteger(record.revision) || record.revision < 1) return false;
  if (!['active', 'closed'].includes(record.status) || typeof record.goal !== 'string' || !record.goal.trim()) return false;
  if (!validIso(record.createdAt) || !validIso(record.updatedAt) || !record.start || typeof record.start !== 'object') return false;
  if (!Array.isArray(record.observations)) return false;
  if (record.status === 'active') return record.close === null;
  return Boolean(record.close && validIso(record.close.closedAt) && SESSION_OUTCOMES.has(record.close.outcome) && Array.isArray(record.close.findings) && Array.isArray(record.close.recommendations));
}
function validateFindingRegistry(value) { return Boolean(value && typeof value === 'object' && value.schemaVersion === 1 && Array.isArray(value.findings)); }
async function writeSession(root, record) {
  if (!validateSessionRecord(record)) throw new Error('Invalid session record.');
  const targetLock = sessionLockPath(root, record.id);
  const lock = await acquireLock(targetLock);
  try { await atomicJsonWrite(sessionPath(root, record.id), record); }
  finally { await releaseLock(targetLock, lock); }
}
async function readSessionRecords(root) {
  await ensureStorage(root);
  const names = await fs.readdir(sessionsDirectory(root)).catch(() => []);
  const candidates = names.filter((name) => /^[0-9a-f-]+\.json$/i.test(name));
  const records = [];
  let invalidRecords = 0;
  for (const name of candidates.slice(0, MAX_RECORDS)) {
    const record = await safeReadJson(path.join(sessionsDirectory(root), name), validateSessionRecord);
    if (record) records.push(record); else invalidRecords += 1;
  }
  records.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return { records, invalidRecords, truncated: candidates.length > MAX_RECORDS };
}
async function resolveSession(root, selector, options = {}) {
  const { records } = await readSessionRecords(root);
  if ((!selector || selector === 'latest') && options.allowLatest !== false) {
    const selected = options.status ? records.find((item) => item.status === options.status) : records[0];
    if (!selected) throw new Error('No matching session record exists.');
    return selected;
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
  return await safeReadJson(findingsPath(root), validateFindingRegistry) || { schemaVersion: 1, updatedAt: nowIso(), findings: [] };
}
async function writeFindingsRegistry(root, registry) {
  const targetLock = findingsLockPath(root);
  const lock = await acquireLock(targetLock);
  try { registry.updatedAt = nowIso(); await atomicJsonWrite(findingsPath(root), registry); }
  finally { await releaseLock(targetLock, lock); }
}
function findingSummary(item) {
  return {
    id: item.id,
    key: item.key,
    state: item.state,
    category: item.category,
    severity: item.severity,
    title: item.title,
    detail: item.detail,
    firstSeen: item.firstSeen,
    lastSeen: item.lastSeen,
    occurrences: item.occurrences,
    confidence: item.confidence,
    evidenceType: item.evidenceType,
    evidence: bounded(item.evidence || [], 12),
    relatedFiles: bounded(item.relatedFiles || [], 12),
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
  const matching = registry.findings
    .filter((item) => !state || item.state === state)
    .sort((a, b) => (SEVERITY_ORDER[b.severity] || 0) - (SEVERITY_ORDER[a.severity] || 0) || String(b.lastSeen).localeCompare(String(a.lastSeen)));
  return { schemaVersion: 1, findings: matching.slice(0, limit).map(findingSummary), total: matching.length };
}
export async function getFinding(root, selector) {
  const registry = await readFindingsRegistry(root);
  return selectFinding(registry, selector);
}
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
  if (!/^[0-9a-f]{40}$/i.test(startHead || '') || !/^[0-9a-f]{40}$/i.test(currentHead || '') || startHead === currentHead) return [];
  const output = await runGit(root, ['diff', '--name-only', '--relative', startHead, currentHead, '--']);
  return bounded(unique(output.split(/\r?\n/).filter(Boolean).map(slash).filter((item) => !isCmiInternalPath(item))), MAX_PATHS);
}
function baselinePaths(baseline) { return unique((baseline?.changes || []).map((item) => slash(item.path)).filter((item) => item && !isCmiInternalPath(item))); }
function summarizeHealth(project) { return { initialized: Boolean(project?.initialized), healthy: Boolean(project?.healthy), graph: project?.graphHealth || null, memory: project?.memoryHealth || null }; }
async function captureState(root) {
  const [repository, project, active, completed] = await Promise.all([
    getRepositoryBaseline(root),
    getProjectStatus(root),
    listChangeRecords(root, { status: 'active', limit: 100 }),
    listChangeRecords(root, { status: 'completed', limit: 100 }),
  ]);
  return {
    capturedAt: nowIso(),
    repository,
    project: summarizeHealth(project),
    activeChanges: active.records,
    completedChangeCount: completed.records.length,
    invalidChangeRecords: Math.max(active.invalidRecords || 0, completed.invalidRecords || 0),
  };
}
async function captureContext(root, goal) {
  let context = null;
  let history = null;
  try {
    const pack = await buildContextPack(root, goal, 8, { stalePolicy: 'demote' });
    context = { summary: pack.summary || null, recommendedFiles: bounded(pack.recommendedFiles || [], 20), affectedWorkspaces: bounded(pack.affectedWorkspaces || [], 20), evidenceHealth: pack.health || null };
  } catch {}
  try {
    const result = await buildChangeInsights(root, goal, { limit: 8 });
    history = { corpus: result.corpus, verificationPatterns: bounded(result.behavioralEvidence?.verificationPatterns || [], 12), calibration: result.calibration, matches: bounded(result.matches || [], 8) };
  } catch {}
  return { context, history };
}
function normalizeObservation(options = {}) {
  return {
    observedAt: nowIso(),
    files: normalizePaths(options.files || []),
    notes: cleanItems(options.notes || [], 'Session note'),
    accomplished: cleanItems(options.accomplished || [], 'Accomplishment'),
    blockers: cleanItems(options.blockers || [], 'Blocker'),
    decisions: cleanItems(options.decisions || [], 'Decision'),
    questions: cleanItems(options.questions || [], 'Open question'),
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
    const record = { schemaVersion: 1, id: crypto.randomUUID(), revision: 1, status: 'active', goal: normalizedGoal, createdAt: now, updatedAt: now, start: { ...start, intelligence }, observations: [], close: null };
    const initial = normalizeObservation({ ...options, notes: [...(options.notes || []), ...(options.note ? [options.note] : [])] });
    if (hasObservationSignal(initial)) record.observations.push(initial);
    await writeSession(root, record);
    return record;
  });
}
export async function observeSession(root, selector, options = {}) {
  return withMutationLock(root, async () => {
    const record = await resolveSession(root, selector || 'latest', { status: 'active' });
    if (record.status !== 'active') throw new Error('Only active sessions can be observed.');
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
  for (const item of summaries.slice(0, 40)) {
    try { records.push(await getChangeRecord(root, item.id)); } catch {}
  }
  return records;
}
function keyFor(category, target = '') { return `${category}:${String(target || '').trim().toLowerCase()}`; }
function makeFinding(category, severity, title, detail, options = {}) {
  return {
    key: keyFor(category, options.target),
    category,
    severity,
    title,
    detail,
    confidence: options.confidence || 'high',
    evidenceType: options.evidenceType || 'observed',
    evidence: bounded(options.evidence || [], 30),
    relatedFiles: bounded(options.relatedFiles || [], 30),
    autoResolvable: AUTO_RESOLVABLE.has(category),
  };
}
function verificationNames(records) { return new Set(records.flatMap((record) => record.completion?.verifications || []).map((item) => String(item.name || '').trim().toLowerCase())); }
function detectFindings({ record, current, completedDetails, scopePaths, staleReport }) {
  const findings = [];
  const graph = current.project.graph;
  if (!current.project.initialized || !graph) findings.push(makeFinding('project-intelligence-missing', 'high', 'Project intelligence is incomplete', 'CMI does not have a current project graph/index, so context and impact guidance are incomplete.', { target: 'graph-index', evidence: ['project-status'] }));
  else if (!graph.current) findings.push(makeFinding('graph-drift', graph.missingNodes > 0 ? 'high' : 'medium', 'Project graph has drifted from source', `Graph evidence is stale or missing (${graph.staleNodes || 0} stale, ${graph.missingNodes || 0} missing node(s)).`, { target: 'graph', evidence: ['source-fingerprint-mismatch'] }));
  if ((staleReport.counts?.stale || 0) > 0) findings.push(makeFinding('stale-memory', 'medium', 'Reviewed project memory is stale', `${staleReport.counts.stale} tracked memory entr${staleReport.counts.stale === 1 ? 'y is' : 'ies are'} stale against current source evidence.`, { target: 'memory', evidence: ['source-linked-memory'] }));
  const memoryReviewCount = (staleReport.counts?.review || 0) + (staleReport.counts?.untracked || 0);
  if (memoryReviewCount > 0) findings.push(makeFinding('memory-review', 'low', 'Project memory needs review', `${memoryReviewCount} memory entr${memoryReviewCount === 1 ? 'y needs' : 'ies need'} review or tracking.`, { target: 'memory', evidence: ['memory-health'] }));
  if ((current.invalidChangeRecords || 0) > 0) findings.push(makeFinding('invalid-change-records', 'high', 'Invalid durable change records were ignored', `${current.invalidChangeRecords} change record(s) failed runtime validation and were excluded from evidence.`, { target: 'change-history', evidence: ['runtime-validation'] }));
  const preexisting = baselinePaths(record.start.repository);
  if (preexisting.length) findings.push(makeFinding('preexisting-worktree', 'medium', 'Session attribution started from a dirty worktree', `${preexisting.length} project path(s) were already dirty when the session started. CMI cannot attribute later edits to those same paths from path status alone.`, { target: record.id, evidence: ['session-start-git-baseline'], relatedFiles: preexisting }));
  for (const active of current.activeChanges || []) findings.push(makeFinding('active-change', 'high', 'Change record remains active', `Change "${active.goal}" has not been completed or explicitly abandoned.`, { target: active.id, evidence: [`change:${active.id}`] }));
  for (const blocker of record.observations.flatMap((item) => item.blockers || [])) findings.push(makeFinding('session-blocker', 'high', 'Session blocker remains unresolved', blocker, { target: crypto.createHash('sha1').update(blocker).digest('hex').slice(0, 12), evidence: ['session-observation'] }));
  for (const question of record.observations.flatMap((item) => item.questions || [])) findings.push(makeFinding('open-question', 'low', 'Open project question remains', question, { target: crypto.createHash('sha1').update(question).digest('hex').slice(0, 12), evidence: ['session-observation'], confidence: 'medium' }));
  for (const change of completedDetails) {
    const completion = change.completion || {};
    const verifications = completion.verifications || [];
    if (['succeeded', 'partial'].includes(completion.outcome) && verifications.length === 0) findings.push(makeFinding('verification-missing', 'high', 'Completed change has no verification evidence', `Change "${change.goal}" was completed as ${completion.outcome} without recorded verification evidence.`, { target: change.id, evidence: [`change:${change.id}`] }));
    for (const verification of verifications) {
      if (verification.status === 'failed') findings.push(makeFinding('verification-failed', 'critical', `Verification failed: ${verification.name}`, `Change "${change.goal}" records a failed verification.`, { target: `${change.id}:${verification.name}`, evidence: [`change:${change.id}`, `verification:${verification.name}`] }));
      else if (['skipped', 'unknown'].includes(verification.status)) findings.push(makeFinding('verification-incomplete', 'medium', `Verification incomplete: ${verification.name}`, `Verification is recorded as ${verification.status} for change "${change.goal}".`, { target: `${change.id}:${verification.name}`, evidence: [`change:${change.id}`, `verification:${verification.name}`] }));
    }
    const comparison = completion.finalObservation?.comparison;
    if ((comparison?.missedByPrediction || []).length) findings.push(makeFinding('prediction-gap', 'medium', 'Observed work escaped predicted scope', `${comparison.missedByPrediction.length} changed path(s) were not predicted for change "${change.goal}".`, { target: change.id, evidence: [`change:${change.id}`, 'expected-vs-actual'], relatedFiles: comparison.missedByPrediction }));
    if ((completion.unexpectedImpact || []).length) findings.push(makeFinding('unexpected-impact', 'medium', 'Unexpected impact was recorded', completion.unexpectedImpact.join(' '), { target: change.id, evidence: [`change:${change.id}`] }));
  }
  if (scopePaths.length && !completedDetails.length && !(current.activeChanges || []).length) findings.push(makeFinding('uncaptured-session-change', 'medium', 'Session changed project scope without a change record', `${scopePaths.length} project path(s) changed during the session but no active or completed CMI change record is associated with the session window.`, { target: record.id, evidence: ['git-session-scope'], relatedFiles: scopePaths }));
  if (current.repository?.available && !current.repository.clean && scopePaths.length) findings.push(makeFinding('uncommitted-session-work', 'low', 'Session ends with uncommitted project work', `${scopePaths.length} session-related path(s) remain in the Git worktree. Preserve or explicitly hand off this state before switching tasks.`, { target: record.id, evidence: ['git-worktree'], relatedFiles: scopePaths }));
  return findings;
}
function priorityFor(finding) {
  if (finding.category === 'verification-failed' || finding.category === 'session-blocker') return 'P0';
  if (['verification-missing', 'active-change', 'project-intelligence-missing', 'graph-drift', 'uncaptured-session-change', 'invalid-change-records'].includes(finding.category)) return 'P1';
  if (['verification-incomplete', 'prediction-gap', 'unexpected-impact', 'stale-memory', 'preexisting-worktree'].includes(finding.category)) return 'P2';
  return 'P3';
}
function actionFor(finding) {
  const actions = {
    'verification-failed': `Fix the failing verification "${finding.title.replace(/^Verification failed:\s*/, '')}" and rerun it before expanding scope.`,
    'session-blocker': `Resolve or explicitly defer the blocker: ${finding.detail}`,
    'verification-missing': 'Run and record the verification required for the completed change before treating it as fully validated.',
    'verification-incomplete': `Complete the pending verification: ${finding.title.replace(/^Verification incomplete:\s*/, '')}.`,
    'active-change': 'Complete or explicitly abandon the active change record before starting unrelated work.',
    'project-intelligence-missing': 'Run `cmi scan` before relying on project context or impact guidance.',
    'graph-drift': 'Run `cmi scan`, then refresh task context/impact before making further dependent changes.',
    'stale-memory': 'Run `cmi stale` and review stale entries; refresh, deprecate, reject, or supersede them based on current evidence.',
    'memory-review': 'Review untracked/review-state memory before relying on it as durable project knowledge.',
    'preexisting-worktree': 'Separate, stash, commit, or explicitly annotate pre-existing dirty paths before relying on session-level change attribution.',
    'prediction-gap': `Review the missed changed paths (${finding.relatedFiles?.join(', ') || 'see evidence'}) and decide whether future scope/boundary expectations should be updated.`,
    'unexpected-impact': 'Investigate the unexpected impact and add a reviewed lesson only if the evidence supports it.',
    'uncaptured-session-change': 'Create/complete a CMI change record for the session scope so expected-vs-actual and verification evidence are not lost.',
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
      action: `Consider running the historically repeated verification "${name}" for this work.`,
      reason: `This verification appears in ${pattern.total} relevant completed change(s) with pass rate ${pattern.passRate ?? 'unknown'} and observed-command evidence rate ${pattern.observedEvidenceRate ?? 'unknown'}.`,
      evidenceType: 'historical-correlation',
      evidence: [`historical-verification:${name}`],
      confidence: pattern.confidence || 'low',
      relatedFindingIds: [],
    });
  }
  return recommendations;
}
function buildRecommendations(findings, history, completedDetails) {
  const items = findings.map((finding) => ({
    id: `finding-action:${finding.key}`,
    priority: priorityFor(finding),
    action: actionFor(finding),
    reason: finding.detail,
    evidenceType: finding.evidenceType,
    evidence: finding.evidence || [],
    confidence: finding.confidence || 'low',
    relatedFindingIds: finding.id ? [finding.id] : [],
  }));
  items.push(...historicalRecommendations(history, completedDetails));
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
  if (categories.has('verification-missing') || categories.has('verification-incomplete')) items.push({ id: 'do-not-claim-complete', rule: 'Do not represent the affected change as fully validated while verification evidence is missing, skipped, or unknown.', reason: 'Completion claims exceed recorded verification evidence.' });
  if (categories.has('graph-drift') || categories.has('project-intelligence-missing')) items.push({ id: 'do-not-trust-stale-graph', rule: 'Do not rely on graph/impact output as current evidence until project intelligence is refreshed.', reason: 'Graph evidence is unavailable or stale.' });
  if (categories.has('stale-memory')) items.push({ id: 'do-not-promote-stale-memory', rule: 'Do not treat stale reviewed memory as current project truth without source review.', reason: 'Source-linked knowledge no longer matches current evidence.' });
  if (categories.has('active-change')) items.push({ id: 'do-not-orphan-active-change', rule: 'Do not silently abandon an active Change Intelligence record when switching tasks.', reason: 'Expected-vs-actual and verification history would become incomplete.' });
  if (categories.has('preexisting-worktree')) items.push({ id: 'do-not-overattribute-dirty-worktree', rule: 'Do not attribute all dirty paths to this session when the session started from a dirty worktree.', reason: 'Path status alone cannot separate pre-existing edits from later edits to the same path.' });
  if (categories.has('prediction-gap')) items.push({ id: 'do-not-call-prediction-complete', rule: 'Do not treat pre-change predicted scope as complete impact evidence when observed paths escaped it.', reason: 'Expected-vs-actual evidence contains a prediction gap.' });
  if (recommendations.some((item) => item.evidenceType === 'historical-correlation')) items.push({ id: 'do-not-treat-history-as-causal', rule: 'Do not treat historical verification or co-change correlation as a causal dependency or mandatory command.', reason: 'Historical patterns are correlation-only evidence.' });
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
function inferOutcome(explicit, record, current, completedDetails, currentFindings, scopePaths) {
  if (explicit) {
    const normalized = String(explicit).trim().toLowerCase();
    if (!SESSION_OUTCOMES.has(normalized)) throw new Error(`Session outcome must be one of: ${[...SESSION_OUTCOMES].join(', ')}.`);
    return normalized;
  }
  if (currentFindings.some((item) => item.severity === 'critical' || item.category === 'session-blocker')) return 'blocked';
  if ((current.activeChanges || []).length || currentFindings.some((item) => ['verification-missing', 'verification-incomplete'].includes(item.category)) || (current.repository?.available && !current.repository.clean && scopePaths.length)) return 'partial';
  if (completedDetails.length && completedDetails.every((item) => item.completion?.outcome === 'succeeded')) return 'succeeded';
  if (!scopePaths.length && record.observations.some((item) => item.notes?.length || item.decisions?.length || item.questions?.length || item.accomplished?.length)) return 'investigated';
  return 'unknown';
}
function summaryText(outcome, scopePaths, completedDetails, openFindings, recommendations) {
  const blocking = openFindings.filter((item) => ['critical', 'high'].includes(item.severity)).length;
  const next = recommendations[0]?.action || 'No evidence-based follow-up is currently required; the project is ready for a new user-prioritized goal.';
  return `Session outcome: ${outcome}. ${scopePaths.length} project path(s) were associated with the session and ${completedDetails.length} change record(s) completed during it. ${blocking} high/critical open project finding(s) remain. Next: ${next}`;
}
async function persistDetectedFindings(root, sessionId, detected) {
  const registry = await readFindingsRegistry(root);
  const timestamp = nowIso();
  const seenKeys = new Set();
  const current = [];
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
      current.push(existing);
    } else {
      existing = { schemaVersion: 1, id: crypto.randomUUID(), state: 'open', ...item, firstSeen: timestamp, lastSeen: timestamp, occurrences: 1, sessions: [sessionId] };
      registry.findings.push(existing);
      current.push(existing);
    }
  }
  for (const finding of registry.findings) {
    if (finding.state !== 'open' || !finding.autoResolvable || seenKeys.has(finding.key)) continue;
    finding.state = 'resolved';
    finding.stateChangedAt = timestamp;
    finding.stateChangedBy = 'cmi-auto-evidence';
    finding.stateReason = 'The deterministic condition was not present in the latest closed session assessment.';
  }
  registry.findings = registry.findings.slice(-1000);
  await writeFindingsRegistry(root, registry);
  return current;
}
async function loadOpenFindings(root) {
  const registry = await readFindingsRegistry(root);
  return registry.findings.filter((item) => item.state === 'open').sort((a, b) => (SEVERITY_ORDER[b.severity] || 0) - (SEVERITY_ORDER[a.severity] || 0) || String(b.lastSeen).localeCompare(String(a.lastSeen))).slice(0, 100);
}
function mergeLiveFindings(open, detected) {
  const map = new Map(open.map((item) => [item.key, item]));
  for (const item of detected) map.set(item.key, { ...(map.get(item.key) || {}), ...item });
  return [...map.values()].sort((a, b) => (SEVERITY_ORDER[b.severity] || 0) - (SEVERITY_ORDER[a.severity] || 0) || a.title.localeCompare(b.title));
}
function buildHandoff(record, current, scopePaths, completedDetails, openFindings, recommendations, guardrails, knowledgeCandidates, outcome) {
  const observations = record.observations;
  const fallback = { priority: 'P3', action: 'No evidence-based follow-up is currently required; begin the next user-prioritized project goal.', reason: 'CMI found no unresolved evidence requiring a more specific action.', evidenceType: 'observed', evidence: [], confidence: 'high' };
  return {
    schemaVersion: 1,
    sessionId: record.id,
    generatedAt: nowIso(),
    objective: record.goal,
    outcome,
    repository: current.repository?.available ? { branch: current.repository.branch, head: current.repository.head, clean: current.repository.clean, changes: bounded(current.repository.changes || [], 40) } : { available: false, reason: current.repository?.reason || 'Git baseline unavailable.' },
    sessionScope: bounded(scopePaths, 80),
    accomplished: bounded(observations.flatMap((item) => item.accomplished || []), 30),
    decisions: bounded(observations.flatMap((item) => item.decisions || []), 20),
    openQuestions: bounded(observations.flatMap((item) => item.questions || []), 20),
    completedChanges: bounded(completedDetails.map((item) => ({ id: item.id, goal: item.goal, outcome: item.completion?.outcome, verifications: bounded(item.completion?.verifications || [], 12) })), 20),
    activeChanges: bounded(current.activeChanges || [], 20),
    openFindings: bounded(openFindings.map(findingSummary), 20),
    nextActions: bounded(recommendations, 10),
    nextAction: recommendations[0] || fallback,
    guardrails,
    knowledgeCandidates,
    agentInstruction: 'Continue from this handoff instead of reconstructing project state from scratch. Re-check current evidence, address P0/P1 actions before unrelated work unless the user changes priority, obey guardrails, and do not turn advisory candidates into durable truth without review.',
  };
}

async function buildAssessment(root, record) {
  const [current, staleReport, intelligence, completedSummaries, existingOpen] = await Promise.all([
    captureState(root),
    checkStaleMemory(root),
    captureContext(root, record.goal),
    listChangeRecords(root, { status: 'completed', limit: 100 }),
    loadOpenFindings(root),
  ]);
  const completedWindow = completedSince(completedSummaries.records, record.createdAt);
  const completedDetails = await loadCompletedDetails(root, completedWindow);
  const startPaths = new Set(baselinePaths(record.start.repository));
  const currentPaths = baselinePaths(current.repository);
  const newDirtyPaths = currentPaths.filter((item) => !startPaths.has(item));
  const committedPaths = await committedPathsSince(root, record.start.repository?.fullHead, current.repository?.fullHead);
  const observedPaths = record.observations.flatMap((item) => item.files || []);
  const scopePaths = bounded(unique([...newDirtyPaths, ...committedPaths, ...observedPaths]), MAX_PATHS);
  const detected = detectFindings({ record, current, completedDetails, scopePaths, staleReport });
  const findings = mergeLiveFindings(existingOpen, detected);
  const recommendations = buildRecommendations(findings, intelligence.history, completedDetails);
  const guardrails = buildGuardrails(findings, recommendations);
  return {
    schemaVersion: 1,
    generatedAt: nowIso(),
    session: { id: record.id, goal: record.goal, status: record.status, createdAt: record.createdAt },
    current,
    scope: { paths: scopePaths, newDirtyPaths, committedPaths, explicitlyObservedPaths: unique(observedPaths), preexistingDirtyPaths: [...startPaths] },
    completedChanges: completedDetails,
    detectedFindings: detected,
    findings,
    recommendations,
    guardrails,
    intelligence,
  };
}
export async function assessSession(root, selector = 'latest') {
  const record = await resolveSession(root, selector, { status: 'active' });
  return buildAssessment(root, record);
}

export async function closeSession(root, selector, options = {}) {
  return withMutationLock(root, async () => {
    let record = await resolveSession(root, selector || 'latest', { status: 'active' });
    if (record.status !== 'active') throw new Error('Only active sessions can be closed.');
    const finalObservation = normalizeObservation(options);
    if (hasObservationSignal(finalObservation)) {
      record.observations.push(finalObservation);
      record.updatedAt = nowIso();
      record.revision = (record.revision || 1) + 1;
      await writeSession(root, record);
      record = await resolveSession(root, record.id, { status: 'active' });
    }
    const assessment = await buildAssessment(root, record);
    const currentFindings = await persistDetectedFindings(root, record.id, assessment.detectedFindings);
    const openFindings = await loadOpenFindings(root);
    const recommendations = buildRecommendations(openFindings, assessment.intelligence.history, assessment.completedChanges);
    const guardrails = buildGuardrails(openFindings, recommendations);
    const outcome = inferOutcome(options.outcome, record, assessment.current, assessment.completedChanges, currentFindings, assessment.scope.paths);
    const knowledgeCandidates = buildKnowledgeCandidates(record, currentFindings);
    const handoff = buildHandoff(record, assessment.current, assessment.scope.paths, assessment.completedChanges, openFindings, recommendations, guardrails, knowledgeCandidates, outcome);
    const closedAt = nowIso();
    record.status = 'closed';
    record.updatedAt = closedAt;
    record.revision = (record.revision || 1) + 1;
    record.close = {
      closedAt,
      outcome,
      summary: summaryText(outcome, assessment.scope.paths, assessment.completedChanges, openFindings, recommendations),
      scope: assessment.scope,
      current: assessment.current,
      findings: currentFindings,
      openFindings,
      recommendations,
      guardrails,
      knowledgeCandidates,
      handoff,
      policy: 'Findings and next actions are evidence-linked advisory output. CMI does not execute project commands or promote knowledge candidates into durable truth automatically.',
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
  return { schemaVersion: 1, records: records.filter((item) => !status || item.status === status).slice(0, limit).map((item) => ({ id: item.id, status: item.status, goal: item.goal, createdAt: item.createdAt, updatedAt: item.updatedAt, outcome: item.close?.outcome || null, nextAction: item.close?.handoff?.nextAction || null })), invalidRecords, truncated };
}
export async function getSessionHandoff(root, selector = 'latest') {
  const record = selector === 'latest' || !selector
    ? await resolveSession(root, 'latest', { status: 'closed' })
    : await resolveSession(root, selector);
  if (record.status !== 'closed' || !record.close?.handoff) throw new Error('Session handoff is available only after the session is closed.');
  return record.close.handoff;
}

export function formatSessionReport(record) {
  if (record.status === 'active') return `# Active CMI session\n\nGoal: ${record.goal}\nStarted: ${record.createdAt}\nObservations: ${record.observations.length}\n\nRun \`cmi session status ${record.id.slice(0, 8)}\` for live findings and recommendations.`;
  const close = record.close;
  const findings = (close.openFindings || close.findings).map((item) => `- [${item.severity}] ${item.title}: ${item.detail}`).join('\n') || '- None';
  const actions = close.recommendations.map((item) => `- ${item.priority} ${item.action}\n  Why: ${item.reason} · ${item.evidenceType} · confidence ${item.confidence}`).join('\n') || '- No evidence-based follow-up required.';
  const guardrails = (close.guardrails || []).map((item) => `- ${item.rule}\n  Why: ${item.reason}`).join('\n') || '- Preserve evidence distinctions and do not auto-promote advisory output.';
  return `# Session outcome: ${close.outcome}\n\n${close.summary}\n\n## Problems / unresolved findings\n${findings}\n\n## Recommended next actions\n${actions}\n\n## Guardrails / do not assume\n${guardrails}\n\n## Next action\n${close.handoff.nextAction.priority} ${close.handoff.nextAction.action}`;
}
export function formatSessionAssessment(result) {
  const findings = result.findings.map((item) => `- [${item.severity}] ${item.title}: ${item.detail}`).join('\n') || '- None';
  const actions = result.recommendations.map((item) => `- ${item.priority} ${item.action}`).join('\n') || '- No evidence-based follow-up required.';
  const guardrails = result.guardrails.map((item) => `- ${item.rule}`).join('\n') || '- Preserve evidence distinctions.';
  return `# Session status\n\nGoal: ${result.session.goal}\nScope observed: ${result.scope.paths.length} path(s)\n\n## Current findings\n${findings}\n\n## What to do next\n${actions}\n\n## Guardrails\n${guardrails}`;
}
export function formatHandoff(handoff) {
  const findings = handoff.openFindings.map((item) => `- [${item.severity}] ${item.title}: ${item.detail}`).join('\n') || '- None';
  const actions = handoff.nextActions.map((item) => `- ${item.priority} ${item.action}`).join('\n') || `- ${handoff.nextAction.priority} ${handoff.nextAction.action}`;
  const guardrails = (handoff.guardrails || []).map((item) => `- ${item.rule}`).join('\n') || '- Preserve evidence distinctions.';
  return `# CMI handoff\n\nObjective: ${handoff.objective}\nOutcome: ${handoff.outcome}\nBranch: ${handoff.repository.branch || 'unknown'}\nHEAD: ${handoff.repository.head || 'unknown'}\nSession scope: ${handoff.sessionScope.length} path(s)\n\n## Open findings\n${findings}\n\n## Next actions\n${actions}\n\n## Guardrails\n${guardrails}\n\n${handoff.agentInstruction}`;
}
export function formatFindingList(result) {
  return result.findings.length ? result.findings.map((item) => `- ${item.id.slice(0, 8)} [${item.state}/${item.severity}] ${item.title} · seen ${item.occurrences} time(s)`).join('\n') : 'No matching project findings.';
}
