function finiteCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : 0;
}

function memoryDomain(counts = {}) {
  const stale = finiteCount(counts.stale);
  const review = finiteCount(counts.review);
  const untracked = finiteCount(counts.untracked);
  const inactive = finiteCount(counts.inactive);
  const blocked = finiteCount(counts.blocked);
  const attention = stale + review + untracked + blocked;
  const state = blocked > 0 ? 'blocked' : stale > 0 ? 'stale' : (review + untracked) > 0 ? 'review-required' : 'healthy';
  return {
    state,
    healthy: attention === 0,
    usable: blocked === 0,
    counts: { stale, review, untracked, inactive, blocked },
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
    sourceSetChanged: Boolean(graphHealth.sourceSetChanged),
    resolverInputsChanged: Boolean(graphHealth.resolverInputsChanged),
    workspaceInputsChanged: Boolean(graphHealth.workspaceInputsChanged),
    scanConfigChanged: Boolean(graphHealth.scanConfigChanged),
    freshnessUnknown: Boolean(graphHealth.freshnessUnknown),
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
    const drift = [
      graph.sourceSetChanged ? 'source-set drift' : null,
      graph.resolverInputsChanged ? 'resolver-config drift' : null,
      graph.workspaceInputsChanged ? 'workspace-manifest drift' : null,
      graph.scanConfigChanged ? 'scan/ignore-config drift' : null,
      graph.freshnessUnknown ? 'unverified discovery state' : null,
    ].filter(Boolean);
    reasons.push(`Project graph is stale (${graph.staleNodes} stale, ${graph.missingNodes} missing node(s)${drift.length ? `; ${drift.join(', ')}` : ''}).`);
    recommendations.push({ id: 'refresh-graph', command: 'cmi scan', reason: 'Refresh repository discovery, resolver inputs, and source fingerprints before relying on graph or impact evidence.' });
  } else if (graph.state === 'incomplete') {
    reasons.push('Project graph is current but incomplete because configured graph coverage was truncated.');
    recommendations.push({ id: 'expand-graph', command: 'cmi scan', reason: 'Raise graph coverage limits or narrow scope before treating impact evidence as complete.' });
  }
  if (memory.state === 'blocked') {
    reasons.push(`${memory.counts.blocked} durable memory file${memory.counts.blocked === 1 ? '' : 's'} could not be safely read or validated.`);
    recommendations.push({ id: 'repair-memory-storage', command: 'cmi stale', reason: 'Repair or recover unreadable durable memory before relying on or mutating project knowledge.' });
  } else if (memory.state === 'stale') {
    reasons.push(`${memory.counts.stale} durable memory entr${memory.counts.stale === 1 ? 'y is' : 'ies are'} stale.`);
    recommendations.push({ id: 'review-stale-memory', command: 'cmi stale', reason: 'Review source-linked memory before treating it as current project truth.' });
  } else if (memory.state === 'review-required') {
    reasons.push(`${memory.counts.review + memory.counts.untracked} durable memory entr${memory.counts.review + memory.counts.untracked === 1 ? 'y needs' : 'ies need'} review or tracking.`);
    recommendations.push({ id: 'review-memory', command: 'cmi stale', reason: 'Review untracked/review-state memory before relying on it as durable truth.' });
  }

  let state = 'healthy';
  if (!initialized) state = 'uninitialized';
  else if (!storageSafe || !indexAvailable || graph.state === 'missing' || graph.state === 'stale' || memory.state === 'blocked') state = 'blocked';
  else if (graph.state === 'incomplete' || !memory.healthy) state = 'degraded';

  const capabilities = {
    durableMemory: !initialized || !storageSafe ? 'unavailable' : !memory.usable ? 'blocked' : memory.healthy ? 'current' : 'degraded',
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
