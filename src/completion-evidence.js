const MAX_VERIFICATIONS = 20;
const MAX_REASONS = 6;
const MAX_GAPS = 6;
const VALID_STATUSES = new Set(['passed', 'failed', 'skipped', 'unknown']);
const CLAIM_STATES = new Set(['supported', 'unverified', 'contradicted']);

function text(value, fallback = '') {
  const clean = typeof value === 'string' ? value.trim() : '';
  return clean || fallback;
}

function iso(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function bounded(values, limit) {
  return values.filter(Boolean).slice(0, limit);
}

function outcomeFor(record) {
  const evidence = record?.status === 'active' ? record.progress : record?.completion;
  return {
    source: evidence || null,
    outcome: text(evidence?.outcome, 'unknown').toLowerCase(),
  };
}

function changedPathsFor(record) {
  const paths = [];
  for (const observation of Array.isArray(record?.observations) ? record.observations : []) {
    if (Array.isArray(observation?.observedChangedFiles)) paths.push(...observation.observedChangedFiles.filter((item) => typeof item === 'string' && item.trim()));
  }
  const evidence = record?.status === 'active' ? record?.progress : record?.completion;
  if (Array.isArray(evidence?.finalObservation?.observedChangedFiles)) paths.push(...evidence.finalObservation.observedChangedFiles.filter((item) => typeof item === 'string' && item.trim()));
  return [...new Set(paths)].slice(0, 160);
}

function normalizeVerification(item, index) {
  const source = item && typeof item === 'object' && !Array.isArray(item) ? item : {};
  const name = text(source.name, `verification-${index + 1}`);
  const rawStatus = text(source.status, 'unknown').toLowerCase();
  const status = VALID_STATUSES.has(rawStatus) ? rawStatus : 'unknown';
  const declaredObserved = source.provenance === 'observed-command';
  const observedCommand = declaredObserved
    && typeof source.command === 'string' && source.command.trim().length > 0
    && Number.isInteger(source.exitCode) && iso(source.observedAt);
  const incomplete = status === 'skipped' || status === 'unknown' || (declaredObserved && !observedCommand);
  const contradictory = observedCommand && ((status === 'passed' && source.exitCode !== 0) || (status === 'failed' && source.exitCode === 0));
  return {
    name,
    status,
    provenance: observedCommand ? 'observed-command' : 'reported',
    observedCommand,
    contradictory,
    ...(contradictory ? { conflict: 'status-exitCode' } : {}),
    incomplete,
  };
}

function verificationAssessment(rawVerifications) {
  const records = rawVerifications.slice(0, MAX_VERIFICATIONS).map(normalizeVerification);
  if (!records.length) {
    return { state: 'missing', provenance: null, records: [], passing: 0, failed: 0, incomplete: 0 };
  }
  const failed = records.filter((item) => item.status === 'failed' || item.contradictory);
  const incomplete = records.filter((item) => item.incomplete);
  const observed = records.filter((item) => item.observedCommand);
  const provenance = new Set(records.map((item) => item.provenance));
  const state = failed.length ? 'failed' : incomplete.length ? 'incomplete' : observed.length ? 'observed' : 'reported';
  return {
    state,
    provenance: provenance.size > 1 ? 'mixed' : records[0].provenance,
    records,
    passing: records.filter((item) => item.status === 'passed').length,
    failed: failed.length,
    incomplete: incomplete.length,
  };
}

function claimState(outcome, verification) {
  if (outcome !== 'succeeded') return 'unverified';
  if (verification.state === 'failed') return 'contradicted';
  if (verification.state === 'observed') return 'supported';
  return 'unverified';
}

function explain({ outcome, implementation, verification, lifecycle }) {
  const reasons = [];
  const gaps = [];
  if (implementation.state === 'observed') reasons.push(`Observed changed paths: ${implementation.changedPaths.length} project path(s).`);
  else reasons.push('No observed changed project paths are attached to the Change.');

  if (verification.state === 'missing') {
    reasons.push('No verification evidence was recorded.');
    if (outcome === 'succeeded') gaps.push('Successful completion claim has no verification evidence.');
  } else if (verification.state === 'reported') {
    reasons.push('Passing verification was reported without observed command metadata.');
    gaps.push('CMI did not observe command execution.');
  } else if (verification.state === 'observed') {
    reasons.push('At least one passing verification has valid observed-command metadata.');
    gaps.push('Without a Task Contract, browser, device, integration, production and release acceptance are not assessed.');
  } else if (verification.state === 'failed') {
    reasons.push(verification.records.some((item) => item.contradictory) ? 'A recorded verification failed or conflicts with its observed command exit code.' : 'A recorded verification failed.');
    if (outcome === 'succeeded') gaps.push('Successful completion claim conflicts with recorded verification.');
  } else {
    reasons.push('Verification is skipped, unknown, or missing required observed-command metadata.');
    gaps.push('Successful completion claim lacks complete verification evidence.');
  }

  if (lifecycle.status === 'active') gaps.push('Change remains active; this assessment does not terminalize its lifecycle.');
  if (outcome !== 'succeeded') gaps.push('Assessment concerns Change completion evidence only and does not convert a non-succeeded outcome into success.');
  return { reasons: bounded(reasons, MAX_REASONS), gaps: bounded(gaps, MAX_GAPS) };
}

/**
 * Derive bounded completion-evidence semantics from an existing Change record.
 * This is pure: it performs no I/O, command execution, persistence or mutation.
 */
export function assessCompletionEvidence(record = {}) {
  const { outcome } = outcomeFor(record);
  const changedPaths = changedPathsFor(record);
  const implementation = {
    state: changedPaths.length ? 'observed' : 'not-observed',
    changedPaths,
  };
  const evidence = outcomeFor(record).source;
  const verification = verificationAssessment(Array.isArray(evidence?.verifications) ? evidence.verifications : []);
  const lifecycle = {
    status: record?.status || 'unknown',
    outcome,
    terminal: record?.status === 'completed',
  };
  const claim = claimState(outcome, verification);
  const explanation = explain({ outcome, implementation, verification, lifecycle });
  return {
    claimState: CLAIM_STATES.has(claim) ? claim : 'unverified',
    claim: { outcome, scope: 'Change completion evidence' },
    implementation,
    verification,
    lifecycle,
    reasons: explanation.reasons,
    gaps: explanation.gaps,
  };
}
