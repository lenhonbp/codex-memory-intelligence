export const MEMORY_SCHEMA_VERSION = 1;
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
function uuidLike(value) { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
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

export function validateRecommendationContract(item, options = {}) {
  const errors = [];
  if (!object(item)) return { valid: false, errors: ['recommendation must be an object.'] };
  add(errors, options.allowLegacyId && item.id === undefined ? true : text(item.id, 500), 'recommendation.id is required.');
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
  const legacyFallback = object(handoff.nextAction) && handoff.nextAction.id === undefined && Array.isArray(handoff.nextActions) && handoff.nextActions.length === 0;
  add(errors, validateRecommendationContract(handoff.nextAction, { allowLegacyId: legacyFallback }).valid, 'handoff.nextAction is invalid.');
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
