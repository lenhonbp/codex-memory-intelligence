function finiteCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : 0;
}

function memoryDomain(report = {}) {
  report = report || {};
  const counts = report.counts || report;
  const stale = finiteCount(counts.stale);
  const review = finiteCount(counts.review);
  const untracked = finiteCount(counts.untracked);
  const inactive = finiteCount(counts.inactive);
  const blocked = finiteCount(counts.blocked);
  const diagnostics = [...(report.fileErrors || []), ...(report.metadataErrors || [])];
  const unsupported = diagnostics.some((item) => item.code === 'CMI_MEMORY_VERSION_UNSUPPORTED');
  const attention = stale + review + untracked + blocked;
  const state = blocked > 0 ? 'blocked' : stale > 0 ? 'stale' : (review + untracked) > 0 ? 'review-required' : 'healthy';
  return {
    state,
    healthy: attention === 0,
    usable: blocked === 0,
    counts: { stale, review, untracked, inactive, blocked },
    attention,
    code: unsupported ? 'CMI_MEMORY_VERSION_UNSUPPORTED' : blocked > 0 ? 'CMI_MEMORY_BLOCKED' : null,
  };
}

function configurationDomain(configHealth) {
  if (!configHealth) return { state: 'current', healthy: true, usable: true, current: true, storedVersion: null, supportedVersion: null, code: null, reason: null };
  return {
    state: configHealth.state || (configHealth.usable ? 'current' : 'invalid'),
    healthy: configHealth.healthy !== false && configHealth.usable !== false,
    usable: configHealth.usable !== false,
    current: configHealth.current !== false,
    storedVersion: configHealth.storedVersion ?? null,
    supportedVersion: configHealth.supportedVersion ?? null,
    code: configHealth.code || null,
    reason: configHealth.reason || null,
  };
}

function graphDomain(graphHealth) {
  if (!graphHealth?.available) return {
    state: graphHealth?.state === 'unsupported' ? 'unsupported' : 'missing',
    healthy: false,
    usable: false,
    current: false,
    complete: false,
    formatStatus: graphHealth?.formatStatus || 'missing',
    rebuildRequired: Boolean(graphHealth?.rebuildRequired),
    scanAllowed: graphHealth?.scanAllowed !== false,
    blockedReason: graphHealth?.blockedReason || null,
  };
  const current = Boolean(graphHealth.current);
  const complete = Boolean(graphHealth.complete);
  const state = graphHealth.state === 'unsupported' ? 'unsupported' : !current ? 'stale' : !complete ? 'incomplete' : 'healthy';
  return {
    state,
    healthy: current && complete,
    usable: current,
    current,
    complete,
    staleNodes: finiteCount(graphHealth.staleNodes),
    missingNodes: finiteCount(graphHealth.missingNodes),
    stalePaths: (graphHealth.stalePaths || []).slice(0, 200),
    missingPaths: (graphHealth.missingPaths || []).slice(0, 200),
    truncated: Boolean(graphHealth.truncated),
    sourceSetChanged: Boolean(graphHealth.sourceSetChanged),
    resolverInputsChanged: Boolean(graphHealth.resolverInputsChanged),
    workspaceInputsChanged: Boolean(graphHealth.workspaceInputsChanged),
    scanConfigChanged: Boolean(graphHealth.scanConfigChanged),
    freshnessUnknown: Boolean(graphHealth.freshnessUnknown),
    schemaVersion: graphHealth.schemaVersion ?? null,
    formatStatus: graphHealth.formatStatus || 'current',
    rebuildRequired: Boolean(graphHealth.rebuildRequired),
    formatReason: graphHealth.formatReason || null,
    scanAllowed: graphHealth.scanAllowed !== false,
    blockedReason: graphHealth.blockedReason || null,
    generatedState: graphHealth.generatedState || null,
    configurationState: graphHealth.configurationState || null,
  };
}

export function buildEvidenceHealth(input = {}) {
  const initialized = input.initialized !== false;
  const storageSafe = input.storageSafe !== false;
  const configuration = configurationDomain(input.configHealth);
  const indexCurrent = Boolean(input.indexAvailable);
  const indexHealth = input.indexHealth || {
    available: indexCurrent,
    current: indexCurrent,
    schemaVersion: null,
    state: indexCurrent ? 'current' : 'missing',
    rebuildRequired: false,
  };
  const indexAvailable = Boolean(indexHealth.available);
  const graph = graphDomain(input.graphHealth);
  const memory = memoryDomain(input.memoryHealth);
  const scanAllowed = configuration.usable && indexHealth.scanAllowed !== false && graph.scanAllowed !== false;
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
  if (initialized && !configuration.usable) {
    reasons.push(configuration.reason || 'Project configuration is invalid or unsupported.');
    recommendations.push({
      id: 'configuration-blocked',
      command: null,
      reason: configuration.state === 'unsupported'
        ? 'Use a compatible/newer CMI version, or preserve and explicitly remove the unsupported configuration before reinitializing.'
        : 'Repair the project configuration without replacing the original bytes before relying on configuration-dependent evidence.',
    });
  }
  if (initialized && !indexCurrent) {
    if (indexHealth.state === 'missing') reasons.push('Project index is missing.');
    else if (indexHealth.rebuildRequired) {
      reasons.push(`Project index format ${indexHealth.schemaVersion ?? 'unknown'} is ${indexHealth.state}; it is not treated as current evidence.`);
    }
    recommendations.push({
      id: indexHealth.state === 'unsupported' ? 'unsupported-index' : 'scan-index',
      command: scanAllowed ? 'cmi scan' : null,
      reason: indexHealth.state === 'unsupported'
        ? indexHealth.reason || 'Use a compatible/newer CMI version, or preserve and explicitly remove the unsupported generated files before rebuilding.'
        : indexHealth.rebuildRequired ? 'Rebuild the obsolete generated project index with this CMI version.' : 'Build the project index before relying on structural intelligence.',
    });
  }
  if (initialized && graph.state === 'unsupported') {
    reasons.push(graph.blockedReason || graph.formatReason || 'Project graph use is blocked by unsupported configuration or generated state.');
    if (!recommendations.some((item) => item.id === 'configuration-blocked' || item.id === 'unsupported-index')) recommendations.push({ id: 'unsupported-generated-state', command: null, reason: graph.blockedReason || graph.formatReason || 'Use a compatible/newer CMI version, or preserve and explicitly remove the unsupported files before rebuilding.' });
  } else if (initialized && graph.state === 'missing') {
    reasons.push('Project graph is missing.');
    if (scanAllowed && !recommendations.some((item) => item.command === 'cmi scan')) recommendations.push({ id: 'scan-graph', command: 'cmi scan', reason: 'Build the project graph before relying on graph or impact evidence.' });
  } else if (graph.state === 'stale') {
    const drift = [
      graph.sourceSetChanged ? 'source-set drift' : null,
      graph.resolverInputsChanged ? 'resolver-config drift' : null,
      graph.workspaceInputsChanged ? 'workspace-manifest drift' : null,
      graph.scanConfigChanged ? 'scan/ignore-config drift' : null,
      graph.freshnessUnknown ? 'unverified discovery state' : null,
    ].filter(Boolean);
    reasons.push(graph.rebuildRequired && graph.formatReason
      ? graph.formatReason
      : `Project graph is stale (${graph.staleNodes} stale, ${graph.missingNodes} missing node(s)${drift.length ? `; ${drift.join(', ')}` : ''}).`);
    recommendations.push({ id: 'refresh-graph', command: scanAllowed ? 'cmi scan' : null, reason: scanAllowed ? (graph.rebuildRequired ? graph.formatReason : 'Refresh repository discovery, resolver inputs, and source fingerprints before relying on graph or impact evidence.') : graph.blockedReason || 'Use a compatible/newer CMI version before rebuilding generated intelligence.' });
  } else if (graph.state === 'incomplete') {
    reasons.push('Project graph is current but incomplete because configured graph coverage was truncated.');
    recommendations.push({ id: 'expand-graph', command: 'cmi scan', reason: 'Raise graph coverage limits or narrow scope before treating impact evidence as complete.' });
  }
  if (memory.state === 'blocked') {
    reasons.push(`${memory.counts.blocked} durable memory source${memory.counts.blocked === 1 ? '' : 's'} could not be safely read or validated.`);
    recommendations.push(memory.code === 'CMI_MEMORY_VERSION_UNSUPPORTED'
      ? { id: 'unsupported-memory', command: null, reason: 'Use a compatible/newer CMI version; current CMI will not reinterpret, refresh, or mutate future-version memory metadata.' }
      : { id: 'repair-memory-storage', command: 'cmi stale', reason: 'Repair or recover unreadable or invalid durable memory before relying on or mutating project knowledge.' });
  } else if (memory.state === 'stale') {
    reasons.push(`${memory.counts.stale} durable memory entr${memory.counts.stale === 1 ? 'y is' : 'ies are'} stale.`);
    recommendations.push({ id: 'review-stale-memory', command: 'cmi stale', reason: 'Review source-linked memory before treating it as current project truth.' });
  } else if (memory.state === 'review-required') {
    reasons.push(`${memory.counts.review + memory.counts.untracked} durable memory entr${memory.counts.review + memory.counts.untracked === 1 ? 'y needs' : 'ies need'} review or tracking.`);
    recommendations.push({ id: 'review-memory', command: 'cmi stale', reason: 'Review untracked/review-state memory before relying on it as durable truth.' });
  }

  let state = 'healthy';
  if (!initialized) state = 'uninitialized';
  else if (!storageSafe || !configuration.usable || !indexCurrent || ['missing', 'stale', 'unsupported'].includes(graph.state) || memory.state === 'blocked') state = 'blocked';
  else if (graph.state === 'incomplete' || !memory.healthy) state = 'degraded';

  const capabilities = {
    durableMemory: !initialized || !storageSafe ? 'unavailable' : !memory.usable ? 'blocked' : memory.healthy ? 'current' : 'degraded',
    graphContext: !configuration.usable || indexHealth.state === 'unsupported' || !graph.usable ? 'blocked' : graph.complete ? 'current' : 'partial',
    impactAnalysis: !configuration.usable || indexHealth.state === 'unsupported' || !graph.usable ? 'blocked' : graph.complete ? 'current' : 'partial',
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
      configuration,
      index: { state: indexHealth.state === 'current' ? 'available' : indexHealth.state, healthy: indexCurrent, available: indexAvailable, current: indexCurrent, schemaVersion: indexHealth.schemaVersion ?? null, rebuildRequired: Boolean(indexHealth.rebuildRequired), scanAllowed: indexHealth.scanAllowed !== false, reason: indexHealth.reason || null },
      graph,
      memory,
    },
    capabilities,
    reasons,
    recommendations,
    policy: 'Evidence health describes whether each evidence class is current and usable. Degraded evidence may remain inspectable when explicitly labeled; blocked evidence must not be represented as current.',
  };
}
