import {
  EVIDENCE_TYPES,
  validateFindingContract,
  validateHandoffContract,
  validateRecommendationContract,
  validateSessionRecordContract,
} from './durable-contracts.js';
import { validateChangeRecord } from './change-intelligence.js';

const VERIFICATION_LEVELS = Object.freeze({
  focused: new Set(['verified', 'failed', 'not-run']),
  repository: new Set(['verified', 'failed', 'not-run']),
  CI: new Set(['verified', 'failed', 'not-observed']),
  'external/live': new Set(['verified', 'failed', 'not-required', 'not-observed']),
  release: new Set(['ready', 'not-ready', 'not-assessed']),
});

const AGENT_OS_LABELS = new Set([
  'observation',
  'inference',
  'fact',
  'reported-verification',
  'observed-command',
  'not-enough-evidence',
  'needs-evidence',
]);

function cleanText(value, label, max = 500) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${label} must be a non-empty string of ${max} characters or fewer.`);
  return value.trim();
}

function iso(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function gap(reason, address = null) {
  return {
    claimState: 'not-enough-evidence',
    ...(address ? { evidence: [address] } : {}),
    missingEvidence: [reason],
  };
}

function normalizeReviewEvidence(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const address = typeof value.address === 'string' && value.address.trim() ? value.address.trim() : null;
  const reviewedAt = value.reviewedAt;
  const reviewedBy = typeof value.reviewedBy === 'string' && value.reviewedBy.trim() ? value.reviewedBy.trim() : null;
  if (!address || !iso(reviewedAt) || !reviewedBy) return null;
  return { address, reviewedAt, reviewedBy };
}

function normalizeCommandEvidence(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const command = typeof value.command === 'string' && value.command.trim() ? value.command.trim() : null;
  if (!command || !Number.isInteger(value.exitCode) || !iso(value.observedAt)) return null;
  return {
    command,
    exitCode: value.exitCode,
    observedAt: value.observedAt,
    ...(typeof value.outputAddress === 'string' && value.outputAddress.trim() ? { outputAddress: value.outputAddress.trim() } : {}),
    ...(typeof value.outputDigest === 'string' && value.outputDigest.trim() ? { outputDigest: value.outputDigest.trim() } : {}),
  };
}

function evidenceResult(evidenceType, address, extra = {}) {
  if (!EVIDENCE_TYPES.has(evidenceType)) throw new Error(`Unsupported CMI evidence type: ${evidenceType}`);
  return { evidenceType, evidence: [address], ...extra };
}

/**
 * Normalize an Agent OS evidence label into an existing CMI representation.
 * This function is deliberately pure: it does not write memory, create IDs,
 * execute commands, or mutate Session/Change lifecycle state.
 */
export function normalizeAgentOsEvidence(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Agent OS evidence must be an object.');
  const label = cleanText(input.label, 'Agent OS evidence label', 80).toLowerCase();
  if (!AGENT_OS_LABELS.has(label)) return gap('supported Agent OS evidence label');

  const address = typeof input.address === 'string' && input.address.trim() ? input.address.trim() : null;
  if (label === 'needs-evidence') return { taskStatus: 'needs-evidence' };
  if (label === 'not-enough-evidence') return { claimState: 'not-enough-evidence' };
  if (!address) return gap('evidence address');

  if (label === 'observation') return evidenceResult('observed', address);
  if (label === 'inference') return evidenceResult('inferred', address);
  if (label === 'reported-verification') return { provenance: 'reported', evidence: [address] };

  if (label === 'observed-command') {
    const command = normalizeCommandEvidence(input.command);
    return command
      ? evidenceResult('observed', address, { provenance: 'observed-command', command })
      : gap('command, integer exitCode and observedAt for observed-command', address);
  }

  const review = normalizeReviewEvidence(input.authoritativeReviewEvidence);
  if (!review) return gap('authoritative review evidence for fact', address);
  return evidenceResult('reviewed', address, {
    reviewEvidence: review,
    evidence: [address, `review:${review.address}`],
  });
}

export function normalizeAgentOsClaim(input = {}) {
  return normalizeAgentOsEvidence(input);
}

export function normalizeVerificationState(matrix = {}) {
  if (!matrix || typeof matrix !== 'object' || Array.isArray(matrix)) throw new Error('Verification matrix must be an object.');
  const normalized = {};
  for (const [level, allowed] of Object.entries(VERIFICATION_LEVELS)) {
    const value = matrix[level] ?? (level === 'CI' || level === 'external/live' ? 'not-observed' : level === 'release' ? 'not-assessed' : 'not-run');
    if (!allowed.has(value)) throw new Error(`Invalid ${level} verification state: ${value}`);
    normalized[level] = value;
  }
  return normalized;
}

export function preserveLifecycleIndependence({ session, change } = {}) {
  const sessionValid = validateSessionRecordContract(session).valid;
  const changeValid = validateChangeRecord(change).valid;
  return {
    sessionStatus: session?.status ?? null,
    changeStatus: change?.status ?? null,
    sessionValid,
    changeValid,
    independent: session?.status === 'closed' && change?.status === 'active',
  };
}

export function validateAgentOsRuntimeSurface({ finding, recommendation, handoff, session, change } = {}) {
  return {
    finding: finding ? validateFindingContract(finding) : null,
    recommendation: recommendation ? validateRecommendationContract(recommendation) : null,
    handoff: handoff ? validateHandoffContract(handoff) : null,
    session: session ? validateSessionRecordContract(session) : null,
    change: change ? validateChangeRecord(change) : null,
  };
}

export function checkExternalActionAuthorization({ explicitAuthorization = false } = {}) {
  return explicitAuthorization === true;
}
