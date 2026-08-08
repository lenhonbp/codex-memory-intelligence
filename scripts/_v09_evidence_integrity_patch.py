from pathlib import Path
import json
import re

ROOT = Path('.')

def read(path):
    return (ROOT / path).read_text()

def write(path, content):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content if content.endswith('\n') else content + '\n')

def replace_once(path, old, new):
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one anchor, found {count}: {old[:120]!r}')
    write(path, text.replace(old, new, 1))

def regex_once(path, pattern, replacement, flags=0):
    text = read(path)
    next_text, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'{path}: regex anchor mismatch: {pattern[:120]!r}')
    write(path, next_text)

# 1) Unified evidence-health model.
write('src/evidence-health.js', r'''function finiteCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : 0;
}

function memoryDomain(counts = {}) {
  const stale = finiteCount(counts.stale);
  const review = finiteCount(counts.review);
  const untracked = finiteCount(counts.untracked);
  const inactive = finiteCount(counts.inactive);
  const attention = stale + review + untracked;
  const state = stale > 0 ? 'stale' : (review + untracked) > 0 ? 'review-required' : 'healthy';
  return {
    state,
    healthy: attention === 0,
    usable: true,
    counts: { stale, review, untracked, inactive },
    attention,
  };
}

function graphDomain(graphHealth) {
  if (!graphHealth?.available) return { state: 'missing', healthy: false, usable: false, current: false, complete: false };
  const current = Boolean(graphHealth.current);
  const complete = Boolean(graphHealth.complete);
  const state = !current ? 'stale' : !complete ? 'incomplete' : 'healthy';
  return {
    state,
    healthy: current && complete,
    usable: current,
    current,
    complete,
    staleNodes: finiteCount(graphHealth.staleNodes),
    missingNodes: finiteCount(graphHealth.missingNodes),
    truncated: Boolean(graphHealth.truncated),
  };
}

export function buildEvidenceHealth(input = {}) {
  const initialized = input.initialized !== false;
  const storageSafe = input.storageSafe !== false;
  const indexAvailable = Boolean(input.indexAvailable);
  const graph = graphDomain(input.graphHealth);
  const memory = memoryDomain(input.memoryHealth);
  const reasons = [];
  const recommendations = [];

  if (!initialized) {
    reasons.push('Project memory is not initialized.');
    recommendations.push({ id: 'initialize', command: 'cmi init', reason: 'Initialize local durable project evidence before relying on CMI state.' });
  }
  if (!storageSafe) {
    reasons.push('Durable CMI storage failed integrity checks.');
    recommendations.push({ id: 'storage-integrity', command: null, reason: 'Repair the .codex-memory storage boundary before reading or writing durable evidence.' });
  }
  if (initialized && !indexAvailable) {
    reasons.push('Project index is missing.');
    recommendations.push({ id: 'scan-index', command: 'cmi scan', reason: 'Build the project index before relying on structural intelligence.' });
  }
  if (initialized && graph.state === 'missing') {
    reasons.push('Project graph is missing.');
    if (!recommendations.some((item) => item.command === 'cmi scan')) recommendations.push({ id: 'scan-graph', command: 'cmi scan', reason: 'Build the project graph before relying on graph or impact evidence.' });
  } else if (graph.state === 'stale') {
    reasons.push(`Project graph is stale (${graph.staleNodes} stale, ${graph.missingNodes} missing node(s)).`);
    recommendations.push({ id: 'refresh-graph', command: 'cmi scan', reason: 'Refresh source fingerprints before relying on graph or impact evidence.' });
  } else if (graph.state === 'incomplete') {
    reasons.push('Project graph is current but incomplete because configured graph coverage was truncated.');
    recommendations.push({ id: 'expand-graph', command: 'cmi scan', reason: 'Raise graph coverage limits or narrow scope before treating impact evidence as complete.' });
  }
  if (memory.state === 'stale') {
    reasons.push(`${memory.counts.stale} durable memory entr${memory.counts.stale === 1 ? 'y is' : 'ies are'} stale.`);
    recommendations.push({ id: 'review-stale-memory', command: 'cmi stale', reason: 'Review source-linked memory before treating it as current project truth.' });
  } else if (memory.state === 'review-required') {
    reasons.push(`${memory.counts.review + memory.counts.untracked} durable memory entr${memory.counts.review + memory.counts.untracked === 1 ? 'y needs' : 'ies need'} review or tracking.`);
    recommendations.push({ id: 'review-memory', command: 'cmi stale', reason: 'Review untracked/review-state memory before relying on it as durable truth.' });
  }

  let state = 'healthy';
  if (!initialized) state = 'uninitialized';
  else if (!storageSafe || !indexAvailable || graph.state === 'missing' || graph.state === 'stale') state = 'blocked';
  else if (graph.state === 'incomplete' || !memory.healthy) state = 'degraded';

  const capabilities = {
    durableMemory: !initialized || !storageSafe ? 'unavailable' : memory.healthy ? 'current' : 'degraded',
    graphContext: !graph.usable ? 'blocked' : graph.complete ? 'current' : 'partial',
    impactAnalysis: !graph.usable ? 'blocked' : graph.complete ? 'current' : 'partial',
    historicalRecords: initialized && storageSafe ? 'available' : 'unavailable',
  };

  return {
    schemaVersion: 1,
    state,
    healthy: state === 'healthy',
    degraded: state === 'degraded',
    blocked: state === 'blocked' || state === 'uninitialized',
    domains: {
      storage: { state: storageSafe ? 'safe' : 'unsafe', healthy: storageSafe },
      index: { state: indexAvailable ? 'available' : 'missing', healthy: indexAvailable },
      graph,
      memory,
    },
    capabilities,
    reasons,
    recommendations,
    policy: 'Evidence health describes whether each evidence class is current and usable. Degraded evidence may remain inspectable when explicitly labeled; blocked evidence must not be represented as current.',
  };
}
''')

# 2) Durable contract definitions and runtime validators.
write('src/durable-contracts.js', r'''export const MEMORY_SCHEMA_VERSION = 1;
export const SESSION_SCHEMA_VERSION = 1;
export const FINDINGS_SCHEMA_VERSION = 1;
export const MEMORY_LIFECYCLE_STATES = new Set(['active', 'deprecated', 'rejected', 'superseded']);
export const SESSION_OUTCOMES = new Set(['succeeded', 'partial', 'blocked', 'investigated', 'abandoned', 'unknown']);
export const FINDING_STATES = new Set(['open', 'resolved', 'accepted', 'dismissed', 'superseded']);
export const FINDING_SEVERITIES = new Set(['critical', 'high', 'medium', 'low', 'info']);
export const EVIDENCE_TYPES = new Set(['observed', 'reviewed', 'historical-correlation', 'inferred']);
export const RECOMMENDATION_PRIORITIES = new Set(['P0', 'P1', 'P2', 'P3']);
export const CONFIDENCE_LEVELS = new Set(['high', 'medium', 'low']);

function object(value) { return Boolean(value && typeof value === 'object' && !Array.isArray(value)); }
function text(value, max = Infinity) { return typeof value === 'string' && value.trim().length > 0 && value.length <= max; }
function iso(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
function uuidLike(value) { return typeof value === 'string' && /^[0-9a-f]{8,}(?:-[0-9a-f-]+)?$/i.test(value); }
function arrayOfText(value, maxItems, maxLength = Infinity) { return Array.isArray(value) && value.length <= maxItems && value.every((item) => typeof item === 'string' && item.length <= maxLength); }
function add(errors, condition, message) { if (!condition) errors.push(message); }

export function validateMemoryMetadataContract(metadata, options = {}) {
  const errors = [];
  if (!object(metadata)) return { valid: false, errors: ['metadata must be an object.'] };
  const legacy = metadata.schemaVersion === undefined && options.allowLegacy !== false;
  add(errors, legacy || metadata.schemaVersion === MEMORY_SCHEMA_VERSION, `schemaVersion must be ${MEMORY_SCHEMA_VERSION}.`);
  add(errors, uuidLike(metadata.id), 'id must be UUID-like.');
  add(errors, ['fact', 'decision', 'mistake'].includes(metadata.type), 'type must be fact, decision, or mistake.');
  add(errors, iso(metadata.createdAt), 'createdAt must be an ISO date-time string.');
  add(errors, Array.isArray(metadata.sources) && metadata.sources.every((item) => typeof item === 'string') && new Set(metadata.sources).size === metadata.sources.length, 'sources must be a unique string array.');
  add(errors, object(metadata.sourceHashes), 'sourceHashes must be an object.');
  add(errors, metadata.projectHash === null || typeof metadata.projectHash === 'string', 'projectHash must be string or null.');
  if (!legacy) {
    add(errors, object(metadata.lifecycle), 'versioned metadata requires lifecycle.');
    if (object(metadata.lifecycle)) {
      add(errors, MEMORY_LIFECYCLE_STATES.has(metadata.lifecycle.state), 'lifecycle.state is invalid.');
      if (metadata.lifecycle.state !== 'active') {
        add(errors, iso(metadata.lifecycle.changedAt), 'inactive lifecycle requires changedAt.');
        add(errors, text(metadata.lifecycle.changedBy, 100), 'inactive lifecycle requires changedBy.');
        add(errors, text(metadata.lifecycle.reason, 500), 'inactive lifecycle requires reason.');
      }
      if (metadata.lifecycle.state === 'superseded') add(errors, uuidLike(metadata.lifecycle.supersededBy), 'superseded lifecycle requires supersededBy.');
    }
  }
  const reviewFields = ['reviewedAt', 'reviewedBy', 'reviewReason'].filter((key) => metadata[key] !== undefined);
  if (reviewFields.length) {
    add(errors, iso(metadata.reviewedAt), 'reviewedAt must be an ISO date-time string when review provenance exists.');
    add(errors, text(metadata.reviewedBy, 100), 'reviewedBy is required with review provenance.');
    add(errors, text(metadata.reviewReason, 500), 'reviewReason is required with review provenance.');
  }
  const refreshFields = ['sourceRefreshedAt', 'sourceRefreshedBy', 'sourceRefreshReason'].filter((key) => metadata[key] !== undefined);
  if (refreshFields.length) {
    add(errors, iso(metadata.sourceRefreshedAt), 'sourceRefreshedAt must be an ISO date-time string when refresh provenance exists.');
    add(errors, text(metadata.sourceRefreshedBy, 100), 'sourceRefreshedBy is required with source refresh provenance.');
    add(errors, text(metadata.sourceRefreshReason, 500), 'sourceRefreshReason is required with source refresh provenance.');
  }
  return { valid: errors.length === 0, errors };
}

export function validateFindingContract(item) {
  const errors = [];
  if (!object(item)) return { valid: false, errors: ['finding must be an object.'] };
  if (item.schemaVersion !== undefined) add(errors, item.schemaVersion === FINDINGS_SCHEMA_VERSION, `finding.schemaVersion must be ${FINDINGS_SCHEMA_VERSION}.`);
  add(errors, uuidLike(item.id), 'finding.id must be UUID-like.');
  add(errors, text(item.key, 500), 'finding.key is required.');
  add(errors, FINDING_STATES.has(item.state), 'finding.state is invalid.');
  add(errors, text(item.category, 120), 'finding.category is required.');
  add(errors, FINDING_SEVERITIES.has(item.severity), 'finding.severity is invalid.');
  add(errors, text(item.title, 500), 'finding.title is required.');
  add(errors, text(item.detail, 2000), 'finding.detail is required.');
  add(errors, CONFIDENCE_LEVELS.has(item.confidence), 'finding.confidence is invalid.');
  add(errors, EVIDENCE_TYPES.has(item.evidenceType), 'finding.evidenceType is invalid.');
  if (item.evidence !== undefined) add(errors, arrayOfText(item.evidence, 50, 500), 'finding.evidence is invalid.');
  if (item.relatedFiles !== undefined) add(errors, arrayOfText(item.relatedFiles, 50, 500), 'finding.relatedFiles is invalid.');
  if (item.sessions !== undefined) add(errors, arrayOfText(item.sessions, 50, 100), 'finding.sessions is invalid.');
  add(errors, Number.isInteger(item.occurrences) && item.occurrences >= 1, 'finding.occurrences must be a positive integer.');
  return { valid: errors.length === 0, errors };
}

export function validateRecommendationContract(item) {
  const errors = [];
  if (!object(item)) return { valid: false, errors: ['recommendation must be an object.'] };
  add(errors, text(item.id, 500), 'recommendation.id is required.');
  add(errors, RECOMMENDATION_PRIORITIES.has(item.priority), 'recommendation.priority is invalid.');
  add(errors, text(item.action, 2000), 'recommendation.action is required.');
  add(errors, text(item.reason, 2000), 'recommendation.reason is required.');
  add(errors, EVIDENCE_TYPES.has(item.evidenceType), 'recommendation.evidenceType is invalid.');
  add(errors, arrayOfText(item.evidence, 50, 500), 'recommendation.evidence is invalid.');
  add(errors, CONFIDENCE_LEVELS.has(item.confidence), 'recommendation.confidence is invalid.');
  if (item.relatedFindingIds !== undefined) add(errors, arrayOfText(item.relatedFindingIds, 50, 100), 'recommendation.relatedFindingIds is invalid.');
  return { valid: errors.length === 0, errors };
}

export function validateGuardrailContract(item) {
  const errors = [];
  if (!object(item)) return { valid: false, errors: ['guardrail must be an object.'] };
  add(errors, text(item.id, 500), 'guardrail.id is required.');
  add(errors, text(item.rule, 2000), 'guardrail.rule is required.');
  add(errors, text(item.reason, 2000), 'guardrail.reason is required.');
  return { valid: errors.length === 0, errors };
}

export function validateHandoffContract(handoff) {
  const errors = [];
  if (!object(handoff)) return { valid: false, errors: ['handoff must be an object.'] };
  add(errors, handoff.schemaVersion === SESSION_SCHEMA_VERSION, `handoff.schemaVersion must be ${SESSION_SCHEMA_VERSION}.`);
  add(errors, uuidLike(handoff.sessionId), 'handoff.sessionId must be UUID-like.');
  add(errors, iso(handoff.generatedAt), 'handoff.generatedAt must be ISO date-time.');
  add(errors, text(handoff.objective, 500), 'handoff.objective is required.');
  add(errors, SESSION_OUTCOMES.has(handoff.outcome), 'handoff.outcome is invalid.');
  add(errors, object(handoff.repository), 'handoff.repository is required.');
  add(errors, arrayOfText(handoff.sessionScope, 80, 500), 'handoff.sessionScope is invalid.');
  add(errors, arrayOfText(handoff.accomplished, 30, 500), 'handoff.accomplished is invalid.');
  add(errors, arrayOfText(handoff.decisions, 20, 500), 'handoff.decisions is invalid.');
  add(errors, arrayOfText(handoff.openQuestions, 20, 500), 'handoff.openQuestions is invalid.');
  add(errors, Array.isArray(handoff.completedChanges) && handoff.completedChanges.length <= 20, 'handoff.completedChanges is invalid.');
  add(errors, Array.isArray(handoff.activeChanges) && handoff.activeChanges.length <= 20, 'handoff.activeChanges is invalid.');
  add(errors, Array.isArray(handoff.openFindings) && handoff.openFindings.length <= 20 && handoff.openFindings.every((item) => validateFindingContract(item).valid), 'handoff.openFindings contains invalid findings.');
  add(errors, Array.isArray(handoff.nextActions) && handoff.nextActions.length <= 10 && handoff.nextActions.every((item) => validateRecommendationContract(item).valid), 'handoff.nextActions contains invalid recommendations.');
  add(errors, validateRecommendationContract(handoff.nextAction).valid, 'handoff.nextAction is invalid.');
  add(errors, Array.isArray(handoff.guardrails) && handoff.guardrails.length <= 12 && handoff.guardrails.every((item) => validateGuardrailContract(item).valid), 'handoff.guardrails contains invalid guardrails.');
  add(errors, Array.isArray(handoff.knowledgeCandidates) && handoff.knowledgeCandidates.length <= 20, 'handoff.knowledgeCandidates is invalid.');
  add(errors, text(handoff.agentInstruction, 4000), 'handoff.agentInstruction is required.');
  return { valid: errors.length === 0, errors };
}

function validateObservation(item) {
  if (!object(item) || !iso(item.observedAt)) return false;
  return arrayOfText(item.files, 160, 500)
    && arrayOfText(item.notes, 40, 500)
    && arrayOfText(item.accomplished, 40, 500)
    && arrayOfText(item.blockers, 40, 500)
    && arrayOfText(item.decisions, 40, 500)
    && arrayOfText(item.questions, 40, 500)
    && (item.state === undefined || object(item.state));
}

export function validateSessionRecordContract(record) {
  const errors = [];
  if (!object(record)) return { valid: false, errors: ['record must be an object.'] };
  add(errors, record.schemaVersion === SESSION_SCHEMA_VERSION, `schemaVersion must be ${SESSION_SCHEMA_VERSION}.`);
  add(errors, uuidLike(record.id), 'id must be UUID-like.');
  add(errors, Number.isInteger(record.revision) && record.revision >= 1, 'revision must be a positive integer.');
  add(errors, ['active', 'closed'].includes(record.status), 'status must be active or closed.');
  add(errors, text(record.goal, 500), 'goal is required.');
  add(errors, iso(record.createdAt) && iso(record.updatedAt), 'createdAt and updatedAt must be ISO date-time strings.');
  add(errors, object(record.start), 'start evidence is required.');
  add(errors, Array.isArray(record.observations) && record.observations.every(validateObservation), 'observations contain invalid evidence.');
  if (record.status === 'active') add(errors, record.close === null, 'active sessions must have close=null.');
  if (record.status === 'closed') {
    add(errors, object(record.close), 'closed sessions require close evidence.');
    if (object(record.close)) {
      add(errors, iso(record.close.closedAt), 'close.closedAt must be ISO date-time.');
      add(errors, SESSION_OUTCOMES.has(record.close.outcome), 'close.outcome is invalid.');
      add(errors, typeof record.close.summary === 'string', 'close.summary is required.');
      add(errors, object(record.close.scope), 'close.scope is required.');
      add(errors, object(record.close.current), 'close.current is required.');
      add(errors, Array.isArray(record.close.findings) && record.close.findings.every((item) => validateFindingContract(item).valid), 'close.findings contains invalid findings.');
      add(errors, Array.isArray(record.close.openFindings) && record.close.openFindings.every((item) => validateFindingContract(item).valid), 'close.openFindings contains invalid findings.');
      add(errors, Array.isArray(record.close.recommendations) && record.close.recommendations.every((item) => validateRecommendationContract(item).valid), 'close.recommendations contains invalid recommendations.');
      add(errors, Array.isArray(record.close.guardrails) && record.close.guardrails.every((item) => validateGuardrailContract(item).valid), 'close.guardrails contains invalid guardrails.');
      add(errors, Array.isArray(record.close.knowledgeCandidates), 'close.knowledgeCandidates must be an array.');
      add(errors, validateHandoffContract(record.close.handoff).valid, 'close.handoff is invalid.');
      add(errors, typeof record.close.policy === 'string', 'close.policy is required.');
    }
  }
  return { valid: errors.length === 0, errors };
}

export function validateFindingRegistryContract(value) {
  const errors = [];
  if (!object(value)) return { valid: false, errors: ['registry must be an object.'] };
  add(errors, value.schemaVersion === FINDINGS_SCHEMA_VERSION, `registry.schemaVersion must be ${FINDINGS_SCHEMA_VERSION}.`);
  add(errors, iso(value.updatedAt), 'registry.updatedAt must be ISO date-time.');
  add(errors, Array.isArray(value.findings) && value.findings.length <= 1000 && value.findings.every((item) => validateFindingContract(item).valid), 'registry.findings contains invalid findings.');
  return { valid: errors.length === 0, errors };
}
''')

# 3) Core/status + context integration.
replace_once('src/core.js', "import { VERSION } from './version.js';\n", "import { VERSION } from './version.js';\nimport { buildEvidenceHealth } from './evidence-health.js';\n")
replace_once('src/core.js', "    return { initialized: true, healthy: false, storageHealth: { safe: false, reason: error.message }, index: null, graph: null, graphHealth: null, workspaces: null, entries: null, memoryHealth: null, snapshots: 0 };\n", "    const evidenceHealth = buildEvidenceHealth({ initialized: true, storageSafe: false, indexAvailable: false, graphHealth: null, memoryHealth: null });\n    return { initialized: true, healthy: false, evidenceHealth, storageHealth: { safe: false, reason: error.message }, index: null, graph: null, graphHealth: null, workspaces: null, entries: null, memoryHealth: null, snapshots: 0 };\n")
replace_once('src/core.js', "  if (!directory) return { initialized: false };\n", "  if (!directory) return { initialized: false, healthy: false, evidenceHealth: buildEvidenceHealth({ initialized: false, storageSafe: true, indexAvailable: false, graphHealth: null, memoryHealth: null }) };\n")
replace_once('src/core.js', "  const graphHealth = loaded.graphHealth;\n  return {\n    initialized: true,\n    healthy: Boolean(index && graph && graphHealth.healthy && memoryHealth.counts.stale === 0 && memoryHealth.counts.review === 0 && memoryHealth.counts.untracked === 0),\n", "  const graphHealth = loaded.graphHealth;\n  const evidenceHealth = buildEvidenceHealth({ initialized: true, storageSafe: true, indexAvailable: Boolean(index), graphHealth, memoryHealth: memoryHealth.counts });\n  return {\n    initialized: true,\n    healthy: evidenceHealth.healthy,\n    evidenceHealth,\n")
replace_once('src/core.js', "    add('graph-health', projectStatus.graphHealth?.healthy ? 'pass' : 'warn', projectStatus.graphHealth?.healthy ? 'Project graph is current and complete within configured coverage.' : `Project graph is degraded (${projectStatus.graphHealth?.staleNodes || 0} stale, ${projectStatus.graphHealth?.missingNodes || 0} missing, truncated=${Boolean(projectStatus.graphHealth?.truncated)}). Run cmi scan or raise graph limits.`);\n", "    add('graph-health', projectStatus.graphHealth?.healthy ? 'pass' : 'warn', projectStatus.graphHealth?.healthy ? 'Project graph is current and complete within configured coverage.' : `Project graph is degraded (${projectStatus.graphHealth?.staleNodes || 0} stale, ${projectStatus.graphHealth?.missingNodes || 0} missing, truncated=${Boolean(projectStatus.graphHealth?.truncated)}). Run cmi scan or raise graph limits.`);\n    add('evidence-health', projectStatus.evidenceHealth?.healthy ? 'pass' : 'warn', projectStatus.evidenceHealth?.healthy ? 'Current project evidence is healthy.' : `Evidence state is ${projectStatus.evidenceHealth?.state || 'unknown'}; inspect status --json before relying on degraded evidence.`);\n")

replace_once('src/search.js', "import { safeReadMemoryFile, safeReadMemoryJson } from './storage.js';\n", "import { safeReadMemoryFile, safeReadMemoryJson } from './storage.js';\nimport { buildEvidenceHealth } from './evidence-health.js';\n")
replace_once('src/search.js', "export async function buildContextPack(root, query, limit = 8, options = {}) {\n  const loaded = await loadMemory(root, { withHealth: true });\n  const results = await searchMemory(root, query, limit, options);\n", "export async function buildContextPack(root, query, limit = 8, options = {}) {\n  const loaded = await loadMemory(root, { withHealth: true });\n  const index = await safeReadMemoryJson(root, 'project-index.json', { optional: true }).catch(() => null);\n  const results = await searchMemory(root, query, limit, options);\n")
replace_once('src/search.js', "    health: { memory: loaded.memoryHealth?.counts || null, graph: loaded.graphHealth },\n", "    health: {\n      memory: loaded.memoryHealth?.counts || null,\n      graph: loaded.graphHealth,\n      overall: buildEvidenceHealth({ initialized: true, storageSafe: true, indexAvailable: Boolean(index), graphHealth: loaded.graphHealth, memoryHealth: loaded.memoryHealth?.counts || null }),\n    },\n")

replace_once('src/cli.js', "    console.log(json ? JSON.stringify(result, null, 2) : result.initialized ? `Memory ${result.healthy ? 'healthy' : 'needs attention'} · ${result.entries.facts} facts · ${result.entries.decisions} decisions · ${result.entries.mistakes} lessons · ${result.memoryHealth.stale} stale · ${result.memoryHealth.review} review · ${result.memoryHealth.inactive || 0} inactive · ${result.graph?.symbols || 0} symbols · ${result.graph?.reusedFiles || 0} reused · ${result.workspaces?.count || 0} workspaces · ${result.snapshots} snapshots` : 'Memory is not initialized. Run cmi init.');\n", "    console.log(json ? JSON.stringify(result, null, 2) : result.initialized ? `Evidence ${result.evidenceHealth?.state || (result.healthy ? 'healthy' : 'needs-attention')} · ${result.entries.facts} facts · ${result.entries.decisions} decisions · ${result.entries.mistakes} lessons · ${result.memoryHealth.stale} stale · ${result.memoryHealth.review} review · ${result.memoryHealth.inactive || 0} inactive · graph ${result.evidenceHealth?.capabilities?.graphContext || 'unknown'} · impact ${result.evidenceHealth?.capabilities?.impactAnalysis || 'unknown'} · ${result.graph?.symbols || 0} symbols · ${result.graph?.reusedFiles || 0} reused · ${result.workspaces?.count || 0} workspaces · ${result.snapshots} snapshots` : 'Memory is not initialized. Run cmi init.');\n")

# 4) Git-history continuity guardrails.
advisor_anchor = "export async function mapProjectBoundaries(root) {\n"
advisor_insert = r'''function compactSha(value) {
  return /^[0-9a-f]{40}$/i.test(String(value || '')) ? String(value).slice(0, 12) : null;
}

export async function inspectGitHistoryContinuity(root, startHead, currentHead) {
  const start = String(startHead || '').trim();
  const current = String(currentHead || '').trim();
  if (!/^[0-9a-f]{40}$/i.test(start) || !/^[0-9a-f]{40}$/i.test(current)) {
    return { available: false, state: 'unavailable', safeForCommittedAttribution: false, startHead: compactSha(start), currentHead: compactSha(current), mergeBase: null, reason: 'A full start and current Git HEAD are required for committed-path attribution.' };
  }
  if (start === current) return { available: true, state: 'same-head', safeForCommittedAttribution: true, startHead: compactSha(start), currentHead: compactSha(current), mergeBase: compactSha(start) };
  try {
    await runGit(root, ['merge-base', '--is-ancestor', start, current]);
    return { available: true, state: 'descendant', safeForCommittedAttribution: true, startHead: compactSha(start), currentHead: compactSha(current), mergeBase: compactSha(start) };
  } catch {}
  let mergeBase = null;
  try { mergeBase = await runGit(root, ['merge-base', start, current]); } catch {}
  if (mergeBase) return { available: true, state: 'rewritten', safeForCommittedAttribution: false, startHead: compactSha(start), currentHead: compactSha(current), mergeBase: compactSha(mergeBase), reason: 'The recorded start HEAD is no longer an ancestor of current HEAD. Rebase/reset/history rewrite makes automatic committed-path attribution ambiguous.' };
  return { available: true, state: 'unrelated', safeForCommittedAttribution: false, startHead: compactSha(start), currentHead: compactSha(current), mergeBase: null, reason: 'The recorded start and current HEAD do not share a usable merge base for automatic committed-path attribution.' };
}

'''
replace_once('src/advisor.js', advisor_anchor, advisor_insert + advisor_anchor)

replace_once('src/change-intelligence.js', "import { prepareChangeBrief, getRepositoryBaseline, mapProjectBoundaries } from './advisor.js';\n", "import { prepareChangeBrief, getRepositoryBaseline, mapProjectBoundaries, inspectGitHistoryContinuity } from './advisor.js';\n")
old_committed = r'''async function committedFilesSince(root, beforeBaseline, currentBaseline) {
  const startHead = beforeBaseline?.fullHead;
  const currentHead = currentBaseline?.fullHead;
  if (!/^[0-9a-f]{40}$/i.test(startHead || '') || !/^[0-9a-f]{40}$/i.test(currentHead || '') || startHead === currentHead) return [];
  const output = await runGit(root, ['diff', '--name-only', '--relative', startHead, currentHead, '--']);
  if (!output) return [];
  const files = output.split(/\r?\n/)
    .filter(Boolean)
    .map(normalizeRelativeFile)
    .filter((file) => !isCmiInternalPath(file));
  return bounded(unique(files), MAX_PATHS);
}
'''
new_committed = r'''async function committedFilesSince(root, beforeBaseline, currentBaseline) {
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
'''
replace_once('src/change-intelligence.js', old_committed, new_committed)
replace_once('src/change-intelligence.js', "  const committed = baseline?.available ? await committedFilesSince(root, record.before?.baseline, baseline) : [];\n", "  const committedEvidence = baseline?.available\n    ? await committedFilesSince(root, record.before?.baseline, baseline)\n    : { files: [], continuity: { available: false, state: 'unavailable', safeForCommittedAttribution: false, reason: 'Git baseline unavailable.' } };\n  const committed = committedEvidence.files;\n")
replace_once('src/change-intelligence.js', "  const observation = {\n    observedAt: new Date().toISOString(),\n    baseline,\n    attribution: baseline?.available ? (record.before?.baseline?.clean ? 'strong' : 'limited-preexisting-worktree') : 'explicit-files-only',\n", "  const continuityLimited = baseline?.available && !committedEvidence.continuity?.safeForCommittedAttribution;\n  const attribution = !baseline?.available\n    ? 'explicit-files-only'\n    : continuityLimited\n      ? (['rewritten', 'unrelated'].includes(committedEvidence.continuity?.state) ? 'limited-history-rewrite' : 'limited-git-history')\n      : (record.before?.baseline?.clean ? 'strong' : 'limited-preexisting-worktree');\n  const observation = {\n    observedAt: new Date().toISOString(),\n    baseline,\n    attribution,\n    gitContinuity: committedEvidence.continuity,\n")
replace_once('src/change-intelligence.js', "  const failedChecks = verifications.filter((item) => item.status === 'failed').map((item) => item.name);\n", "  if (['rewritten', 'unrelated'].includes(finalObservation?.gitContinuity?.state)) {\n    learningCandidates.push({\n      type: 'git-history-rewrite',\n      status: 'proposal',\n      evidence: [finalObservation.gitContinuity],\n      proposal: 'Review committed-path attribution manually because the change-start HEAD is no longer an ancestor of current HEAD. Do not convert the start-to-current diff into causal change history.',\n    });\n  }\n  const failedChecks = verifications.filter((item) => item.status === 'failed').map((item) => item.name);\n")
replace_once('src/change-intelligence.js', "- Attribution: ${latest?.attribution || record.before?.attribution || 'unknown'}\\n- Revision: ${record.revision || 1}", "- Attribution: ${latest?.attribution || record.before?.attribution || 'unknown'}\\n- Git continuity: ${latest?.gitContinuity?.state || 'unknown'}\\n- Revision: ${record.revision || 1}")

# 5) Session continuity + deeper runtime contracts.
replace_once('src/session-intelligence.js', "import { getRepositoryBaseline } from './advisor.js';\n", "import { getRepositoryBaseline, inspectGitHistoryContinuity } from './advisor.js';\n")
replace_once('src/session-intelligence.js', "import { safeEnsureMemoryDir } from './storage.js';\n", "import { safeEnsureMemoryDir } from './storage.js';\nimport { SESSION_OUTCOMES, FINDING_STATES, validateSessionRecordContract, validateFindingRegistryContract } from './durable-contracts.js';\n")
replace_once('src/session-intelligence.js', "const SESSION_OUTCOMES = new Set(['succeeded', 'partial', 'blocked', 'investigated', 'abandoned', 'unknown']);\nconst FINDING_STATES = new Set(['open', 'resolved', 'accepted', 'dismissed', 'superseded']);\n", "")
old_session_validator = r'''export function validateSessionRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
  if (record.schemaVersion !== 1 || !record.id || !Number.isInteger(record.revision) || record.revision < 1) return false;
  if (!['active', 'closed'].includes(record.status) || typeof record.goal !== 'string' || !record.goal.trim()) return false;
  if (!validIso(record.createdAt) || !validIso(record.updatedAt) || !record.start || typeof record.start !== 'object') return false;
  if (!Array.isArray(record.observations)) return false;
  if (record.status === 'active') return record.close === null;
  return Boolean(record.close && validIso(record.close.closedAt) && SESSION_OUTCOMES.has(record.close.outcome) && Array.isArray(record.close.findings) && Array.isArray(record.close.recommendations));
}
function validateFindingRegistry(value) { return Boolean(value && typeof value === 'object' && value.schemaVersion === 1 && Array.isArray(value.findings)); }
'''
new_session_validator = r'''export function validateSessionRecord(record) { return validateSessionRecordContract(record).valid; }
function validateFindingRegistry(value) { return validateFindingRegistryContract(value).valid; }
'''
replace_once('src/session-intelligence.js', old_session_validator, new_session_validator)
replace_once('src/session-intelligence.js', "async function writeFindingsRegistry(root, registry) {\n  const lockTarget = findingsLockPath(root);\n", "async function writeFindingsRegistry(root, registry) {\n  const validation = validateFindingRegistryContract(registry);\n  if (!validation.valid) throw new Error(`Invalid findings registry: ${validation.errors.join(' ')}`);\n  const lockTarget = findingsLockPath(root);\n")
old_session_committed = r'''async function committedPathsSince(root, startHead, currentHead) {
  if (!/^[0-9a-f]{40}$/i.test(startHead || '') || !/^[0-9a-f]{40}$/i.test(currentHead || '') || startHead === currentHead) return [];
  const output = await runGit(root, ['diff', '--name-only', '--relative', startHead, currentHead, '--']);
  return bounded(unique(output.split(/\r?\n/).filter(Boolean).map(slash).filter((item) => !isCmiInternalPath(item))), MAX_PATHS);
}
'''
new_session_committed = r'''async function committedPathsSince(root, startHead, currentHead) {
  const continuity = await inspectGitHistoryContinuity(root, startHead, currentHead);
  if (!continuity.safeForCommittedAttribution || continuity.state === 'same-head') return { paths: [], continuity };
  const output = await runGit(root, ['diff', '--name-only', '--relative', startHead, currentHead, '--']);
  return { paths: bounded(unique(output.split(/\r?\n/).filter(Boolean).map(slash).filter((item) => !isCmiInternalPath(item))), MAX_PATHS), continuity };
}
'''
replace_once('src/session-intelligence.js', old_session_committed, new_session_committed)
replace_once('src/session-intelligence.js', "function detectFindings({ record, current, relatedActive, concurrentActive, completedDetails, scopePaths, staleReport }) {\n", "function detectFindings({ record, current, relatedActive, concurrentActive, completedDetails, scopePaths, staleReport, gitContinuity }) {\n")
replace_once('src/session-intelligence.js', "  if (preexisting.length) findings.push(makeFinding('preexisting-worktree', 'medium', 'Session attribution started from a dirty worktree', `${preexisting.length} project path(s) were already dirty when the session started. CMI cannot attribute later edits to those same paths from path status alone.`, { target: record.id, evidence: ['session-start-git-baseline'], relatedFiles: preexisting }));\n", "  if (preexisting.length) findings.push(makeFinding('preexisting-worktree', 'medium', 'Session attribution started from a dirty worktree', `${preexisting.length} project path(s) were already dirty when the session started. CMI cannot attribute later edits to those same paths from path status alone.`, { target: record.id, evidence: ['session-start-git-baseline'], relatedFiles: preexisting }));\n  if (['rewritten', 'unrelated'].includes(gitContinuity?.state)) findings.push(makeFinding('git-history-rewrite', 'medium', 'Git history changed across the session baseline', gitContinuity.reason || 'The session-start HEAD is no longer an ancestor of current HEAD, so automatic committed-path attribution is ambiguous.', { target: record.id, evidence: [`git-continuity:${gitContinuity.state}`], confidence: 'high' }));\n")
replace_once('src/session-intelligence.js', "  if (['verification-incomplete', 'prediction-gap', 'unexpected-impact', 'stale-memory', 'preexisting-worktree'].includes(finding.category)) return 'P2';\n", "  if (['verification-incomplete', 'prediction-gap', 'unexpected-impact', 'stale-memory', 'preexisting-worktree', 'git-history-rewrite'].includes(finding.category)) return 'P2';\n")
replace_once('src/session-intelligence.js', "    'preexisting-worktree': 'Separate, stash, commit, or explicitly annotate pre-existing dirty paths before relying on session-level change attribution.',\n", "    'preexisting-worktree': 'Separate, stash, commit, or explicitly annotate pre-existing dirty paths before relying on session-level change attribution.',\n    'git-history-rewrite': 'Review session scope manually after rebase/reset/history rewrite; use explicit observed paths or a new clean session baseline instead of start-to-current Git diff attribution.',\n")
replace_once('src/session-intelligence.js', "  if (categories.has('stale-memory')) items.push({ id: 'do-not-promote-stale-memory', rule: 'Do not treat stale reviewed memory as current project truth without source review.', reason: 'Source-linked knowledge no longer matches current evidence.' });\n", "  if (categories.has('stale-memory')) items.push({ id: 'do-not-promote-stale-memory', rule: 'Do not treat stale reviewed memory as current project truth without source review.', reason: 'Source-linked knowledge no longer matches current evidence.' });\n  if (categories.has('git-history-rewrite')) items.push({ id: 'do-not-overattribute-rewritten-history', rule: 'Do not attribute commits from a rewritten start-to-current Git diff to this session automatically.', reason: 'The session-start HEAD is not an ancestor of current HEAD.' });\n")
replace_once('src/session-intelligence.js', "  const fallback = { priority: 'P3', action: 'No evidence-based follow-up is currently required; begin the next user-prioritized project goal.', reason: 'CMI found no unresolved evidence requiring a more specific action.', evidenceType: 'observed', evidence: [], confidence: 'high' };\n", "  const fallback = { id: 'no-follow-up', priority: 'P3', action: 'No evidence-based follow-up is currently required; begin the next user-prioritized project goal.', reason: 'CMI found no unresolved evidence requiring a more specific action.', evidenceType: 'observed', evidence: [], confidence: 'high', relatedFindingIds: [] };\n")
replace_once('src/session-intelligence.js', "  const committedPaths = await committedPathsSince(root, record.start.repository?.fullHead, current.repository?.fullHead);\n  const observedPaths = record.observations.flatMap((item) => item.files || []);\n  const scopePaths = bounded(unique([...newDirtyPaths, ...committedPaths, ...observedPaths]), MAX_PATHS);\n", "  const committedEvidence = await committedPathsSince(root, record.start.repository?.fullHead, current.repository?.fullHead);\n  const committedPaths = committedEvidence.paths;\n  const observedPaths = record.observations.flatMap((item) => item.files || []);\n  const scopePaths = bounded(unique([...newDirtyPaths, ...committedPaths, ...observedPaths]), MAX_PATHS);\n")
replace_once('src/session-intelligence.js', "    completedDetails, scopePaths, staleReport,\n", "    completedDetails, scopePaths, staleReport, gitContinuity: committedEvidence.continuity,\n")
replace_once('src/session-intelligence.js', "    scope: { paths: scopePaths, newDirtyPaths, committedPaths, explicitlyObservedPaths: unique(observedPaths), preexistingDirtyPaths: [...startPaths] },\n", "    scope: { paths: scopePaths, newDirtyPaths, committedPaths, explicitlyObservedPaths: unique(observedPaths), preexistingDirtyPaths: [...startPaths], gitContinuity: committedEvidence.continuity },\n")

# 6) Memory runtime validation and schema parity.
replace_once('src/stale.js', "import { safeReadMemoryFile, safeReadMemoryJson, safeWriteMemoryFile } from './storage.js';\n", "import { safeReadMemoryFile, safeReadMemoryJson, safeWriteMemoryFile } from './storage.js';\nimport { validateMemoryMetadataContract } from './durable-contracts.js';\n")
old_parse = r'''    const metaMatch = section.match(META_PATTERN);
    let metadata = null;
    try { metadata = metaMatch ? JSON.parse(metaMatch[1]) : null; } catch {}
    const text = section.replace(/^##[^\n]*\n?/, '').replace(META_PATTERN, '').trim();
    return { file, heading: heading[1], text, metadata, start, end };
'''
new_parse = r'''    const metaMatch = section.match(META_PATTERN);
    let metadata = null;
    let metadataValidation = null;
    try {
      const parsed = metaMatch ? JSON.parse(metaMatch[1]) : null;
      if (parsed) {
        const validation = validateMemoryMetadataContract(parsed, { allowLegacy: true });
        if (validation.valid) metadata = parsed;
        else metadataValidation = validation.errors;
      }
    } catch { metadataValidation = ['Metadata JSON could not be parsed.']; }
    const text = section.replace(/^##[^\n]*\n?/, '').replace(META_PATTERN, '').trim();
    return { file, heading: heading[1], text, metadata, metadataValidation, start, end };
'''
replace_once('src/stale.js', old_parse, new_parse)
replace_once('src/stale.js', "    if (!meta) { results.push({ id: null, file: entry.file, heading: entry.heading, text: entry.text, status: 'untracked', lifecycleState: 'active', reasons: ['Entry predates metadata tracking. Refresh it to establish a baseline.'] }); continue; }\n", "    if (!meta) {\n      const reasons = entry.metadataValidation?.length\n        ? [`Memory metadata failed runtime validation: ${entry.metadataValidation.join(' ')}`]\n        : ['Entry predates metadata tracking. Refresh it to establish a baseline.'];\n      results.push({ id: null, file: entry.file, heading: entry.heading, text: entry.text, status: 'untracked', lifecycleState: 'active', reasons });\n      continue;\n    }\n")

memory_schema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/lenhonbp/codex-memory-intelligence/schemas/memory-metadata.schema.json",
  "title": "CMI memory metadata",
  "type": "object",
  "required": ["id", "type", "createdAt", "sources", "sourceHashes", "projectHash"],
  "properties": {
    "schemaVersion": {"const": 1},
    "id": {"type": "string", "format": "uuid"},
    "type": {"enum": ["fact", "decision", "mistake"]},
    "createdAt": {"type": "string", "format": "date-time"},
    "sources": {"type": "array", "items": {"type": "string"}, "uniqueItems": True},
    "sourceHashes": {"type": "object", "additionalProperties": {"type": ["string", "null"]}},
    "projectHash": {"type": ["string", "null"]},
    "reviewedAt": {"type": "string", "format": "date-time"},
    "reviewedBy": {"type": "string", "maxLength": 100},
    "reviewReason": {"type": "string", "maxLength": 500},
    "sourceRefreshedAt": {"type": "string", "format": "date-time"},
    "sourceRefreshedBy": {"type": "string", "maxLength": 100},
    "sourceRefreshReason": {"type": "string", "maxLength": 500},
    "lifecycle": {
      "type": "object",
      "required": ["state"],
      "properties": {
        "state": {"enum": ["active", "deprecated", "rejected", "superseded"]},
        "changedAt": {"type": "string", "format": "date-time"},
        "changedBy": {"type": "string", "maxLength": 100},
        "reason": {"type": "string", "maxLength": 500},
        "supersededBy": {"type": "string", "format": "uuid"}
      },
      "additionalProperties": False
    }
  },
  "allOf": [
    {"if": {"required": ["schemaVersion"]}, "then": {"required": ["lifecycle"]}},
    {"if": {"properties": {"lifecycle": {"properties": {"state": {"const": "superseded"}}, "required": ["state"]}}, "required": ["lifecycle"]}, "then": {"properties": {"lifecycle": {"required": ["supersededBy"]}}}}
  ],
  "additionalProperties": True
}
write('schemas/memory-metadata.schema.json', json.dumps(memory_schema, indent=2))

findings_schema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/lenhonbp/codex-memory-intelligence/schemas/findings-registry.schema.json",
  "title": "CMI persistent findings registry",
  "type": "object",
  "required": ["schemaVersion", "updatedAt", "findings"],
  "properties": {
    "schemaVersion": {"const": 1},
    "updatedAt": {"type": "string", "format": "date-time"},
    "findings": {
      "type": "array", "maxItems": 1000,
      "items": {
        "type": "object",
        "required": ["id", "key", "state", "category", "severity", "title", "detail", "confidence", "evidenceType", "occurrences"],
        "properties": {
          "schemaVersion": {"const": 1},
          "id": {"type": "string", "format": "uuid"},
          "key": {"type": "string", "minLength": 1, "maxLength": 500},
          "state": {"enum": ["open", "resolved", "accepted", "dismissed", "superseded"]},
          "category": {"type": "string", "minLength": 1, "maxLength": 120},
          "severity": {"enum": ["critical", "high", "medium", "low", "info"]},
          "title": {"type": "string", "minLength": 1, "maxLength": 500},
          "detail": {"type": "string", "minLength": 1, "maxLength": 2000},
          "confidence": {"enum": ["high", "medium", "low"]},
          "evidenceType": {"enum": ["observed", "reviewed", "historical-correlation", "inferred"]},
          "evidence": {"type": "array", "items": {"type": "string", "maxLength": 500}, "maxItems": 50},
          "relatedFiles": {"type": "array", "items": {"type": "string", "maxLength": 500}, "maxItems": 50},
          "sessions": {"type": "array", "items": {"type": "string", "maxLength": 100}, "maxItems": 50},
          "occurrences": {"type": "integer", "minimum": 1}
        },
        "additionalProperties": True
      }
    }
  },
  "additionalProperties": False
}
write('schemas/findings-registry.schema.json', json.dumps(findings_schema, indent=2))

# 7) Make schema/runtime drift CI-blocking.
replace_once('scripts/quality.js', "import path from 'node:path';\n", "import path from 'node:path';\nimport { MEMORY_SCHEMA_VERSION, SESSION_SCHEMA_VERSION, FINDINGS_SCHEMA_VERSION, MEMORY_LIFECYCLE_STATES, SESSION_OUTCOMES, FINDING_STATES, FINDING_SEVERITIES, EVIDENCE_TYPES, RECOMMENDATION_PRIORITIES, CONFIDENCE_LEVELS } from '../src/durable-contracts.js';\n")
quality_insert = r'''
function sorted(values) { return [...values].sort(); }
function sameValues(actual, expected) { return JSON.stringify(sorted(actual || [])) === JSON.stringify(sorted(expected || [])); }
function validateSchemaContracts() {
  const memory = JSON.parse(fs.readFileSync('schemas/memory-metadata.schema.json', 'utf8'));
  const session = JSON.parse(fs.readFileSync('schemas/session-record.schema.json', 'utf8'));
  const findings = JSON.parse(fs.readFileSync('schemas/findings-registry.schema.json', 'utf8'));
  if (memory.properties?.schemaVersion?.const !== MEMORY_SCHEMA_VERSION) errors.push('memory schemaVersion differs from runtime contract');
  if (!sameValues(memory.properties?.lifecycle?.properties?.state?.enum, MEMORY_LIFECYCLE_STATES)) errors.push('memory lifecycle enum differs from runtime contract');
  if (session.properties?.schemaVersion?.const !== SESSION_SCHEMA_VERSION) errors.push('session schemaVersion differs from runtime contract');
  if (!sameValues(session.properties?.close?.anyOf?.[1]?.properties?.outcome?.enum, SESSION_OUTCOMES)) errors.push('session outcome enum differs from runtime contract');
  if (!sameValues(session.$defs?.finding?.properties?.state?.enum, FINDING_STATES)) errors.push('session finding states differ from runtime contract');
  if (!sameValues(session.$defs?.finding?.properties?.severity?.enum, FINDING_SEVERITIES)) errors.push('session finding severities differ from runtime contract');
  if (!sameValues(session.$defs?.finding?.properties?.evidenceType?.enum, EVIDENCE_TYPES)) errors.push('session finding evidence types differ from runtime contract');
  if (!sameValues(session.$defs?.recommendation?.properties?.priority?.enum, RECOMMENDATION_PRIORITIES)) errors.push('session recommendation priorities differ from runtime contract');
  if (!sameValues(session.$defs?.recommendation?.properties?.confidence?.enum, CONFIDENCE_LEVELS)) errors.push('session recommendation confidence differs from runtime contract');
  if (findings.properties?.schemaVersion?.const !== FINDINGS_SCHEMA_VERSION) errors.push('findings schemaVersion differs from runtime contract');
  if (!sameValues(findings.properties?.findings?.items?.properties?.state?.enum, FINDING_STATES)) errors.push('findings registry states differ from runtime contract');
  if (!sameValues(findings.properties?.findings?.items?.properties?.severity?.enum, FINDING_SEVERITIES)) errors.push('findings registry severities differ from runtime contract');
  if (!sameValues(findings.properties?.findings?.items?.properties?.evidenceType?.enum, EVIDENCE_TYPES)) errors.push('findings registry evidence types differ from runtime contract');
}
'''
replace_once('scripts/quality.js', "\nwalk('.');\nvalidatePackageBins();\n", quality_insert + "\nwalk('.');\nvalidatePackageBins();\nvalidateSchemaContracts();\n")

# 8) Docs / roadmap for the unreleased v0.9 line.
replace_once('CHANGELOG.md', "## [Unreleased]\n\nNo unreleased changes yet.\n", "## [Unreleased]\n\n### Added\n\n- Unified Evidence Health Model with explicit healthy/degraded/blocked states, per-domain usability, capability status, reasons, and deterministic recovery actions.\n- Git-history continuity evidence for change/session attribution so rebase/reset/history rewrites are detected before committed paths are attributed.\n- Runtime durable contracts for versioned memory metadata, session records, findings, recommendations, guardrails, handoffs, and the persistent findings registry.\n- `schemas/findings-registry.schema.json` plus CI-enforced schema/runtime enum and version parity.\n\n### Changed\n\n- `status --json` and context packs expose the shared evidence-health model; human status output reports graph/impact capability state.\n- Change and session intelligence fail closed on automatic committed-path attribution when the recorded baseline HEAD is no longer an ancestor of current HEAD.\n- Versioned memory metadata with invalid lifecycle/review/refresh provenance is treated as untracked evidence instead of reviewed current truth.\n- Session-record runtime validation now enforces the nested evidence contract rather than validating only the top-level close shape.\n")
roadmap_anchor = "## Precision and interoperability track\n"
roadmap_section = "## v0.9 — Evidence Integrity\n\nThe v0.9 line unifies trust state across evidence classes and closes repository-internal contract/attribution gaps that can be verified without pretending synthetic fixtures are real-world calibration.\n\n- [x] Add one Evidence Health Model with explicit healthy/degraded/blocked state, per-domain usability, capability status, reasons, and recovery actions.\n- [x] Expose shared evidence health through `status`, `doctor`, CLI status text, and context packs.\n- [x] Detect Git ancestry continuity before using start-to-current committed-path diffs for change/session attribution.\n- [x] Fail closed after rebase/reset/unrelated-history transitions and preserve explicit Git-continuity evidence in change/session records.\n- [x] Add runtime durable contracts for memory metadata, nested session evidence, findings, recommendations, guardrails, handoffs, and the findings registry.\n- [x] Bring memory lifecycle/source-refresh JSON Schema in line with current runtime semantics and add a persistent findings-registry Schema.\n- [x] Make critical schema/runtime version and enum drift fail repository quality checks.\n- [x] Add adversarial regression coverage for rewritten Git history, invalid nested session evidence, invalid memory lifecycle metadata, and evidence-health state transitions.\n\nThe existing real-repository field-validation items remain open until enough independent repository/task evidence exists. v0.9 does not convert those empirical questions into synthetic completion claims.\n\n"
replace_once('ROADMAP.md', roadmap_anchor, roadmap_section + roadmap_anchor)

write('docs/EVIDENCE_INTEGRITY.md', r'''# Evidence Integrity

CMI v0.9 introduces a shared evidence-integrity layer. The goal is not to make CMI appear more certain; it is to make every current-evidence claim carry the same explicit health and attribution rules.

## Evidence health

`status --json` and context packs expose a versioned Evidence Health Model with:

- overall state: `healthy`, `degraded`, `blocked`, or `uninitialized`;
- storage, index, graph, and durable-memory domains;
- capability state for durable memory, graph context, impact analysis, and historical records;
- evidence-linked reasons and deterministic recovery actions.

A current but truncated graph is `degraded` and graph/impact capability is `partial`. A stale/missing graph is `blocked` for graph/impact current-evidence claims. Stale or review-required memory degrades durable-memory trust without pretending all local historical evidence is unusable.

## Git-history continuity

Change/session attribution now checks whether the recorded start HEAD is an ancestor of the current HEAD before using a start-to-current Git diff as committed-path evidence.

States are:

- `same-head` — no committed history movement;
- `descendant` — start HEAD is an ancestor, so bounded committed-path attribution is allowed;
- `rewritten` — a merge base exists but start HEAD is no longer an ancestor, as after many rebase/reset workflows;
- `unrelated` — no usable merge base;
- `unavailable` — a full Git baseline is not available.

For `rewritten`, `unrelated`, or `unavailable` continuity, CMI does not automatically turn `git diff start current` paths into session/change attribution. Explicit observed paths and worktree evidence remain available and are labeled separately.

## Durable runtime contracts

CMI keeps JSON Schemas human/tool-readable, but v0.9 also validates trust-critical durable structures at runtime:

- versioned memory metadata and lifecycle/refresh/review provenance;
- session observations and close evidence;
- findings, recommendations, guardrails, and handoffs;
- persistent findings registry.

Critical schema versions and enums are checked during repository quality validation, so a runtime/schema mismatch is a CI failure rather than documentation drift.

Legacy memory metadata remains readable for compatibility. New/versioned metadata is held to the current contract. Invalid versioned metadata is treated as untracked evidence instead of reviewed-current knowledge.

## Non-goals

Evidence Integrity does not make CMI a compiler, LSP, runtime analyzer, DLP system, or causal attribution engine. Git ancestry only establishes whether a start-to-current diff is structurally safe to use as bounded path evidence; it does not prove that every changed path belongs causally to the recorded task.
''')

# 9) Regression tests.
write('tests/v09-evidence-integrity.test.js', r'''import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildEvidenceHealth } from '../src/evidence-health.js';
import { initProject, scanProject, status, remember } from '../src/core.js';
import { buildContextPack } from '../src/search.js';
import { checkStaleMemory } from '../src/stale.js';
import { startChangeRecord, observeChangeRecord } from '../src/change-intelligence.js';
import { startSession, assessSession, validateSessionRecord } from '../src/session-intelligence.js';
import { validateMemoryMetadataContract } from '../src/durable-contracts.js';

const exec = promisify(execFile);
async function project(prefix = 'cmi-v09-') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ type: 'module' }));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  return root;
}
async function git(root, ...args) {
  const result = await exec('git', args, { cwd: root, encoding: 'utf8' });
  return String(result.stdout || '').trim();
}
async function initGit(root) {
  await git(root, 'init');
  await git(root, 'config', 'user.email', 'cmi-test@example.invalid');
  await git(root, 'config', 'user.name', 'CMI Test');
  await git(root, 'add', 'package.json', 'src');
  await git(root, 'commit', '-m', 'base');
}
async function commitFile(root, relative, content, message) {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content);
  await git(root, 'add', relative);
  await git(root, 'commit', '-m', message);
  return git(root, 'rev-parse', 'HEAD');
}

 test('evidence health distinguishes degraded incomplete graph from blocked stale graph', () => {
  const degraded = buildEvidenceHealth({ initialized: true, storageSafe: true, indexAvailable: true, graphHealth: { available: true, current: true, complete: false, truncated: true }, memoryHealth: { stale: 0, review: 0, untracked: 0 } });
  assert.equal(degraded.state, 'degraded');
  assert.equal(degraded.capabilities.graphContext, 'partial');
  assert.equal(degraded.capabilities.impactAnalysis, 'partial');
  const blocked = buildEvidenceHealth({ initialized: true, storageSafe: true, indexAvailable: true, graphHealth: { available: true, current: false, complete: true, staleNodes: 1, missingNodes: 0 }, memoryHealth: { stale: 0, review: 0, untracked: 0 } });
  assert.equal(blocked.state, 'blocked');
  assert.equal(blocked.capabilities.graphContext, 'blocked');
  assert.equal(blocked.capabilities.durableMemory, 'current');
});

test('status and context pack expose the same evidence-health state', async () => {
  const root = await project('cmi-v09-health-');
  await fs.writeFile(path.join(root, 'src', 'a.js'), 'export const a = 1;\n');
  await scanProject(root);
  const projectStatus = await status(root);
  const context = await buildContextPack(root, 'a');
  assert.equal(projectStatus.evidenceHealth.state, 'healthy');
  assert.equal(context.health.overall.state, projectStatus.evidenceHealth.state);
  assert.equal(context.health.overall.capabilities.impactAnalysis, 'current');
});

test('change attribution fails closed when Git history is rewritten after the baseline', async () => {
  const root = await project('cmi-v09-change-rewrite-');
  await fs.writeFile(path.join(root, 'src', 'base.js'), 'export const base = 1;\n');
  await initGit(root);
  const base = await git(root, 'rev-parse', 'HEAD');
  await commitFile(root, 'src/old.js', 'export const old = 1;\n', 'old-line');
  await scanProject(root);
  const record = await startChangeRecord(root, 'replace old line with new line');
  await git(root, 'reset', '--hard', base);
  await commitFile(root, 'src/new.js', 'export const next = 1;\n', 'new-line');
  const observation = await observeChangeRecord(root, record.id);
  assert.equal(observation.gitContinuity.state, 'rewritten');
  assert.equal(observation.gitContinuity.safeForCommittedAttribution, false);
  assert.equal(observation.attribution, 'limited-history-rewrite');
  assert.deepEqual(observation.committedFilesSinceStart, []);
  assert.ok(!observation.observedChangedFiles.includes('src/new.js'));
});

test('session assessment surfaces history rewrite instead of auto-attributing rewritten commits', async () => {
  const root = await project('cmi-v09-session-rewrite-');
  await fs.writeFile(path.join(root, 'src', 'base.js'), 'export const base = 1;\n');
  await initGit(root);
  const base = await git(root, 'rev-parse', 'HEAD');
  await commitFile(root, 'src/old.js', 'export const old = 1;\n', 'old-line');
  await scanProject(root);
  const session = await startSession(root, 'investigate replacement');
  await git(root, 'reset', '--hard', base);
  await commitFile(root, 'src/new.js', 'export const next = 1;\n', 'new-line');
  const assessment = await assessSession(root, session.id);
  assert.equal(assessment.scope.gitContinuity.state, 'rewritten');
  assert.deepEqual(assessment.scope.committedPaths, []);
  assert.ok(assessment.findings.some((item) => item.category === 'git-history-rewrite'));
  assert.ok(assessment.guardrails.some((item) => item.id === 'do-not-overattribute-rewritten-history'));
});

test('invalid versioned memory lifecycle metadata is not trusted as reviewed-current evidence', async () => {
  const root = await project('cmi-v09-memory-contract-');
  await fs.writeFile(path.join(root, 'src', 'policy.js'), 'export const policy = true;\n');
  await scanProject(root);
  const entry = await remember(root, 'fact', 'Policy is enabled.', { sources: ['src/policy.js'] });
  const file = path.join(root, '.codex-memory', 'memory.md');
  const content = await fs.readFile(file, 'utf8');
  const corrupted = content.replace('"state":"active"', '"state":"ghost"');
  await fs.writeFile(file, corrupted);
  const report = await checkStaleMemory(root);
  assert.equal(report.counts.untracked, 1);
  assert.match(report.entries.find((item) => /Policy is enabled/.test(item.text)).reasons[0], /runtime validation/i);
  const valid = validateMemoryMetadataContract({ schemaVersion: 1, id: entry.id, type: 'fact', createdAt: new Date().toISOString(), sources: [], sourceHashes: {}, projectHash: null, lifecycle: { state: 'active' } });
  assert.equal(valid.valid, true);
});

test('session runtime validation rejects malformed nested observation evidence', () => {
  const now = new Date().toISOString();
  const base = { schemaVersion: 1, id: '12345678-abcd', revision: 1, status: 'active', goal: 'validate nested evidence', createdAt: now, updatedAt: now, start: {}, close: null };
  assert.equal(validateSessionRecord({ ...base, observations: [{ observedAt: now, files: [] }] }), false);
  assert.equal(validateSessionRecord({ ...base, observations: [{ observedAt: now, files: [], notes: [], accomplished: [], blockers: [], decisions: [], questions: [] }] }), true);
});
''')

# Remove one accidental leading space before the first test for style consistency.
text = read('tests/v09-evidence-integrity.test.js').replace("\n test('evidence health", "\ntest('evidence health", 1)
write('tests/v09-evidence-integrity.test.js', text)

# 10) Update current-status README with unreleased development note (version bump happens only after gates).
replace_once('README.md', "`v0.8.1` is the current source release line. It hardens the v0.8 intelligence layer with complete-vs-truncated graph health, stale-impact fail-closed behavior, project-local durable-storage guards, owner-tagged lease locking, broader best-effort secret detection, and a strict separation between source-fingerprint refresh and semantic review. It retains the Behavioral Change Intelligence and Session Continuation capabilities introduced in v0.8.0. The npm badge above is the authoritative indicator of the version currently published to the registry.\n", "`v0.8.1` is the current published release line. It hardens the v0.8 intelligence layer with complete-vs-truncated graph health, stale-impact fail-closed behavior, project-local durable-storage guards, owner-tagged lease locking, broader best-effort secret detection, and a strict separation between source-fingerprint refresh and semantic review. The current development line adds v0.9 Evidence Integrity: unified evidence health, Git-history continuity guardrails, and runtime/schema contract parity. The npm badge above remains the authoritative indicator of the version currently published to the registry.\n")
replace_once('README.md', "See [Change Intelligence](docs/CHANGE_INTELLIGENCE.md), [Session Continuation Intelligence](docs/SESSION_INTELLIGENCE.md), [Durable Memory Lifecycle](docs/MEMORY_LIFECYCLE.md), [Roadmap](ROADMAP.md), and [Changelog](CHANGELOG.md) for storage contracts, evidence limits, and release status.\n", "See [Evidence Integrity](docs/EVIDENCE_INTEGRITY.md), [Change Intelligence](docs/CHANGE_INTELLIGENCE.md), [Session Continuation Intelligence](docs/SESSION_INTELLIGENCE.md), [Durable Memory Lifecycle](docs/MEMORY_LIFECYCLE.md), [Roadmap](ROADMAP.md), and [Changelog](CHANGELOG.md) for storage contracts, evidence limits, and release status.\n")

print('v0.9 evidence-integrity patch applied')
