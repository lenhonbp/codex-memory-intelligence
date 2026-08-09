import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadProjectGraph, impactAnalysis, inspectProjectGraphHealth } from './graph.js';
import { buildContextPack, searchMemory, tokenize } from './search.js';

const execFileAsync = promisify(execFile);
const DURABLE_MEMORY_SOURCES = new Set(['memory.md', 'decisions.md', 'mistakes.md', 'agent-instructions.md']);
const LEADING_STRUCTURE = new Set([
  'src', 'source', 'sources', 'lib', 'libs', 'app', 'apps', 'package', 'packages',
  'module', 'modules', 'feature', 'features', 'domain', 'domains', 'service', 'services',
  'crate', 'crates', 'cmd', 'internal',
]);
const TEST_STRUCTURE = new Set(['test', 'tests', 'spec', 'specs', '__tests__']);
const TOPIC_RULES = [
  {
    id: 'identity-access',
    pattern: /(?:^|[\W_])(auth|authorization|authentication|session|login|oauth|permission|role|acl|token|identity)(?:$|[\W_])/i,
    title: 'Identity and access control',
    memory: 'Record the trusted identity source, authorization boundary, and session or token invariants.',
    risk: 'Identity or authorization behavior may change across a trust boundary.',
    verification: 'Test unauthenticated, authenticated, unauthorized, expired, and replayed identity states where applicable.',
  },
  {
    id: 'persistence-schema',
    pattern: /(?:^|[\W_])(db|database|schema|migration|migrate|sql|storage|store|repository|persistence|model|ledger|transaction)(?:$|[\W_])/i,
    title: 'Persistence and schema',
    memory: 'Record schema ownership, migration compatibility, rollback expectations, and consistency invariants.',
    risk: 'Persistence changes may create compatibility, rollback, or consistency failures.',
    verification: 'Test migration order, idempotency, rollback or forward recovery, and data invariants where applicable.',
  },
  {
    id: 'api-contract',
    pattern: /(?:^|[\W_])(api|route|router|controller|endpoint|graphql|rpc|webhook|request|response)(?:$|[\W_])/i,
    title: 'API contract',
    memory: 'Record request, response, error, compatibility, and ownership constraints for the affected contract.',
    risk: 'A public or internal contract may drift between callers and implementations.',
    verification: 'Test success, validation, error, compatibility, and retry behavior for the affected contract.',
  },
  {
    id: 'async-consistency',
    pattern: /(?:^|[\W_])(queue|job|worker|event|receipt|attempt|retry|idempot|concurr|lock|race|async|stream)(?:$|[\W_])/i,
    title: 'Asynchronous consistency',
    memory: 'Record idempotency keys, retry semantics, ordering guarantees, and duplicate-processing rules.',
    risk: 'Retries, duplication, races, or out-of-order work may violate state invariants.',
    verification: 'Test duplicate, retry, concurrent, out-of-order, timeout, and partial-failure scenarios where applicable.',
  },
  {
    id: 'user-interface',
    pattern: /(?:^|[\W_])(ui|view|component|screen|page|form|modal|layout|animation|render|canvas|style)(?:$|[\W_])/i,
    title: 'User interface and rendering',
    memory: 'Record state ownership, responsive behavior, accessibility constraints, and rendering or animation budgets.',
    risk: 'UI state, accessibility, responsiveness, or rendering performance may regress.',
    verification: 'Test loading, empty, error, retry, responsive, accessibility, and performance states where applicable.',
  },
  {
    id: 'deployment-operations',
    pattern: /(?:^|[\W_])(deploy|deployment|infra|config|environment|docker|kubernetes|terraform|cloud|workflow|release)(?:$|[\W_])/i,
    title: 'Deployment and operations',
    memory: 'Record environment differences, rollout order, rollback steps, and operational ownership.',
    risk: 'Environment or rollout differences may make a locally correct change fail in production.',
    verification: 'Verify environment configuration, rollout order, observability, rollback, and smoke checks.',
  },
  {
    id: 'performance-budget',
    pattern: /(?:^|[\W_])(performance|latency|cache|throughput|memory|animation|render|frame|batch|pool)(?:$|[\W_])/i,
    title: 'Performance budget',
    memory: 'Record measurable latency, memory, throughput, frame-time, or bundle-size budgets.',
    risk: 'The change may regress a performance budget without functional test failures.',
    verification: 'Run a representative benchmark or profile and compare against an explicit budget.',
  },
  {
    id: 'security-privacy',
    pattern: /(?:^|[\W_])(security|secret|credential|password|crypto|encrypt|privacy|sanitize|untrusted|upload)(?:$|[\W_])/i,
    title: 'Security and privacy',
    memory: 'Record trust boundaries, sensitive-data handling, validation rules, and prohibited disclosures.',
    risk: 'Untrusted input or sensitive data may cross a security or privacy boundary.',
    verification: 'Test validation, authorization, redaction, path handling, and failure responses without exposing sensitive data.',
  },
];

function slash(value) { return String(value || '').replace(/\\/g, '/'); }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function bounded(values, limit = 50) { return values.slice(0, Math.max(0, limit)); }
function isCmiInternalPath(value) {
  const normalized = slash(value).replace(/^\.\/+/, '');
  return normalized === '.codex-memory' || normalized.startsWith('.codex-memory/');
}
function isUntrackedGitStatus(status) {
  const value = String(status || '');
  return value[0] === '?' && value[1] === '?';
}
function humanize(value) {
  if (value === 'root') return 'Root source';
  return String(value).replace(/[-_.]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function workspacePath(workspace) {
  const value = String(workspace || '');
  const separator = value.indexOf(':');
  if (separator < 0) return null;
  const candidate = slash(value.slice(separator + 1));
  return candidate && candidate !== '.' ? candidate : null;
}
function cleanTestStem(fileName) {
  return path.posix.basename(fileName, path.posix.extname(fileName)).replace(/(?:\.(?:test|spec)|_(?:test|spec))$/i, '') || 'tests';
}

function classifyBoundary(node) {
  const filePath = slash(node.path);
  const workspaceRoot = workspacePath(node.workspace);
  let relative = filePath;
  if (workspaceRoot && (filePath === workspaceRoot || filePath.startsWith(`${workspaceRoot}/`))) relative = filePath.slice(workspaceRoot.length).replace(/^\//, '');
  const parts = relative.split('/').filter(Boolean);
  const directories = parts.slice(0, -1);
  let testScoped = false;
  let index = 0;
  while (index < directories.length) {
    const segment = directories[index].toLowerCase();
    if (TEST_STRUCTURE.has(segment)) { testScoped = true; index += 1; continue; }
    if (LEADING_STRUCTURE.has(segment)) { index += 1; continue; }
    break;
  }
  let key = directories[index]?.toLowerCase() || null;
  if (!key && testScoped) key = cleanTestStem(parts.at(-1) || 'tests').toLowerCase();
  if (!key) key = 'root';
  const scope = node.workspace || 'project';
  return {
    id: `${scope}#${key}`,
    key,
    label: humanize(key),
    workspace: node.workspace || null,
    inferredFrom: testScoped ? 'test-path' : key === 'root' ? 'repository-root' : 'directory-path',
  };
}

async function runGit(root, args) {
  const result = await execFileAsync('git', args, {
    cwd: root,
    timeout: 4_000,
    maxBuffer: 1_048_576,
    windowsHide: true,
    encoding: 'utf8',
  });
  return String(result.stdout || '').trimEnd();
}

function parseGitStatusPorcelainZ(output) {
  if (!output) return [];
  const fields = String(output).split('\0');
  const changes = [];
  for (let index = 0; index < fields.length; index += 1) {
    const record = fields[index];
    if (!record) continue;
    const status = record.slice(0, 2);
    const currentPath = slash(record.slice(3));
    if (!currentPath) continue;
    if (status.includes('R') || status.includes('C')) {
      const originalPath = slash(fields[index + 1] || '');
      if (originalPath) index += 1;
      changes.push({ status, path: currentPath, ...(originalPath ? { originalPath } : {}) });
      continue;
    }
    changes.push({ status, path: currentPath });
  }
  return changes;
}

export async function getRepositoryBaseline(root) {
  const resolvedRoot = path.resolve(root);
  try {
    const inside = await runGit(resolvedRoot, ['rev-parse', '--is-inside-work-tree']);
    if (inside !== 'true') return { available: false, reason: 'The project is not inside a Git worktree.' };
    const projectPrefix = await runGit(resolvedRoot, ['rev-parse', '--show-prefix']);
    const projectPath = slash(projectPrefix).replace(/\/$/, '') || '.';
    let branch = null;
    let upstream = null;
    let ahead = null;
    let behind = null;
    try { branch = await runGit(resolvedRoot, ['symbolic-ref', '--quiet', '--short', 'HEAD']); } catch {}
    try { upstream = await runGit(resolvedRoot, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']); } catch {}
    if (upstream) {
      try {
        const [behindValue, aheadValue] = (await runGit(resolvedRoot, ['rev-list', '--left-right', '--count', `HEAD...${upstream}`])).split(/\s+/).map(Number);
        behind = Number.isFinite(behindValue) ? behindValue : null;
        ahead = Number.isFinite(aheadValue) ? aheadValue : null;
      } catch {}
    }
    let fullHead = null;
    let head = null;
    let subject = null;
    let committedAt = null;
    try {
      fullHead = await runGit(resolvedRoot, ['rev-parse', 'HEAD']);
      head = await runGit(resolvedRoot, ['rev-parse', '--short=12', 'HEAD']);
      subject = await runGit(resolvedRoot, ['log', '-1', '--format=%s']);
      committedAt = await runGit(resolvedRoot, ['log', '-1', '--format=%cI']);
    } catch {}
    const porcelain = await runGit(resolvedRoot, ['status', '--porcelain=v1', '-z', '--untracked-files=normal']);
    const allChanges = parseGitStatusPorcelainZ(porcelain).filter((item) => {
      const cmiInternal = isCmiInternalPath(item.path) || isCmiInternalPath(item.originalPath);
      return !(cmiInternal && isUntrackedGitStatus(item.status));
    });
    return {
      available: true,
      projectPath,
      branch: branch || 'detached',
      head,
      fullHead,
      clean: allChanges.length === 0,
      changes: bounded(allChanges, 200),
      changesTruncated: allChanges.length > 200,
      upstream,
      ahead,
      behind,
      commit: fullHead ? { subject, committedAt } : null,
    };
  } catch (error) {
    return { available: false, reason: error.code === 'ENOENT' ? 'Git is not installed or not available on PATH.' : 'The project is not inside a readable Git worktree.' };
  }
}

function compactSha(value) {
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

export async function mapProjectBoundaries(root) {
  const graph = await loadProjectGraph(root);
  if (!graph) return { available: false, reason: 'Project graph is missing. Run cmi scan.', boundaries: [], connections: [], graphHealth: await inspectProjectGraphHealth(root, graph) };
  const graphHealth = await inspectProjectGraphHealth(root, graph);
  if (!graphHealth.current) return { available: false, reason: 'Project graph is stale. Run cmi scan before mapping boundaries.', boundaries: [], connections: [], graphHealth };
  const groups = new Map();
  const fileBoundary = new Map();
  const dependentCounts = new Map(Object.entries(graph.reverseDependents || {}).map(([file, dependents]) => [file, dependents.length]));
  const nodeByPath = new Map((graph.nodes || []).map((node) => [node.path, node]));
  for (const node of graph.nodes || []) {
    const boundary = classifyBoundary(node);
    fileBoundary.set(node.path, boundary.id);
    if (!groups.has(boundary.id)) groups.set(boundary.id, { ...boundary, files: [], symbolCount: 0, inboundEdges: 0, outboundEdges: 0 });
    const group = groups.get(boundary.id);
    group.files.push(node.path);
    group.symbolCount += node.symbols?.length || 0;
  }
  const edgeCounts = new Map();
  for (const node of graph.nodes || []) {
    const from = fileBoundary.get(node.path);
    for (const item of node.imports || []) {
      if (!item.resolved) continue;
      const to = fileBoundary.get(item.resolved);
      if (!from || !to || from === to) continue;
      const key = `${from}\u0000${to}`;
      edgeCounts.set(key, (edgeCounts.get(key) || 0) + 1);
      groups.get(from).outboundEdges += 1;
      groups.get(to).inboundEdges += 1;
    }
  }
  const boundaries = [...groups.values()].map((group) => {
    const representatives = [...group.files].sort((a, b) => {
      const nodeA = nodeByPath.get(a);
      const nodeB = nodeByPath.get(b);
      const scoreA = (dependentCounts.get(a) || 0) * 4 + (nodeA?.imports?.filter((item) => item.resolved).length || 0) * 2 + (nodeA?.symbols?.length || 0) / 10;
      const scoreB = (dependentCounts.get(b) || 0) * 4 + (nodeB?.imports?.filter((item) => item.resolved).length || 0) * 2 + (nodeB?.symbols?.length || 0) / 10;
      return scoreB - scoreA || a.localeCompare(b);
    }).slice(0, 5);
    const evidenceStrength = group.files.length + group.inboundEdges + group.outboundEdges;
    const confidence = group.key === 'root' ? 'low' : evidenceStrength >= 6 ? 'high' : evidenceStrength >= 3 ? 'medium' : 'low';
    return {
      id: group.id,
      label: group.label,
      workspace: group.workspace,
      fileCount: group.files.length,
      symbolCount: group.symbolCount,
      inboundEdges: group.inboundEdges,
      outboundEdges: group.outboundEdges,
      representativeFiles: representatives,
      confidence,
      inferredFrom: group.inferredFrom,
    };
  }).sort((a, b) => (b.inboundEdges + b.outboundEdges) - (a.inboundEdges + a.outboundEdges) || b.fileCount - a.fileCount || a.id.localeCompare(b.id));
  const connections = [...edgeCounts.entries()].map(([key, edges]) => {
    const [from, to] = key.split('\u0000');
    return { from, to, edges };
  }).sort((a, b) => b.edges - a.edges || a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  return {
    available: true,
    generatedAt: new Date().toISOString(),
    method: 'Deterministic directory, workspace, and import-graph inference. Boundaries are advisory and must not be treated as declared architecture.',
    summary: {
      boundaries: boundaries.length,
      crossBoundaryEdges: connections.reduce((sum, item) => sum + item.edges, 0),
      highConfidence: boundaries.filter((item) => item.confidence === 'high').length,
      mediumConfidence: boundaries.filter((item) => item.confidence === 'medium').length,
      lowConfidence: boundaries.filter((item) => item.confidence === 'low').length,
    },
    boundaries,
    connections,
    fileBoundary: Object.fromEntries(fileBoundary),
    graphHealth,
  };
}

function matchedTopics(query, files = []) {
  const haystack = `${query}\n${files.join('\n')}`;
  return TOPIC_RULES.filter((rule) => rule.pattern.test(haystack));
}

export async function suggestProjectMemory(root, query, options = {}) {
  const normalizedQuery = String(query || '').trim();
  if (!normalizedQuery) throw new Error('Memory-gap query cannot be empty.');
  const results = await searchMemory(root, normalizedQuery, Math.max(12, Math.min(30, options.limit || 20)), { workspace: options.workspace });
  const durable = results.filter((item) => item.kind === 'memory' && DURABLE_MEMORY_SOURCES.has(item.source));
  const reviewedEntries = durable.filter((item) => item.source !== 'agent-instructions.md' && item.metadata?.id);
  const relatedFiles = unique(results.filter((item) => item.kind === 'graph').map((item) => item.metadata?.path)).slice(0, 12);
  const facts = reviewedEntries.filter((item) => item.source === 'memory.md');
  const decisions = reviewedEntries.filter((item) => item.source === 'decisions.md');
  const mistakes = reviewedEntries.filter((item) => item.source === 'mistakes.md');
  const instructions = durable.filter((item) => item.source === 'agent-instructions.md');
  const suggestions = [];
  if (!facts.length) suggestions.push({ type: 'fact', title: 'Relevant project facts', proposal: 'After review, record stable ownership, runtime, data-flow, or environment facts that materially constrain this task.', rationale: 'No task-relevant durable fact was retrieved.', evidence: relatedFiles, confidence: relatedFiles.length ? 'medium' : 'low', status: 'proposal' });
  if (!decisions.length) suggestions.push({ type: 'decision', title: 'Architecture constraints and invariants', proposal: 'After review, record the chosen boundary, invariant, compatibility rule, and rejected alternatives for this change.', rationale: 'No task-relevant architecture decision was retrieved.', evidence: relatedFiles, confidence: relatedFiles.length ? 'medium' : 'low', status: 'proposal' });
  if (!mistakes.length) suggestions.push({ type: 'mistake', title: 'Known failure modes', proposal: 'After validation, record reproducible failure modes, causes, detection signals, and prevention rules discovered during the work.', rationale: 'No task-relevant lesson or failure mode was retrieved.', evidence: relatedFiles, confidence: 'low', status: 'proposal' });
  for (const rule of matchedTopics(normalizedQuery, relatedFiles)) {
    if (suggestions.some((item) => item.title === rule.title)) continue;
    suggestions.push({ type: 'decision', title: rule.title, proposal: rule.memory, rationale: `The task or related paths indicate ${rule.title.toLowerCase()} concerns.`, evidence: relatedFiles.filter((file) => rule.pattern.test(file)).slice(0, 8), confidence: relatedFiles.some((file) => rule.pattern.test(file)) ? 'medium' : 'low', status: 'proposal' });
  }
  return {
    query: normalizedQuery,
    workspace: options.workspace || null,
    coverage: {
      relevantDurableEntries: reviewedEntries.length,
      facts: facts.length,
      decisions: decisions.length,
      mistakes: mistakes.length,
      instructions: instructions.length,
    },
    relatedFiles,
    suggestions: suggestions.slice(0, 8),
    policy: 'Suggestions are review prompts only. CMI never converts inferred knowledge into durable memory without an explicit write operation and human review.',
  };
}

function inferImpact(graph, seedFiles, depth = 3) {
  const seeds = unique(seedFiles).filter((file) => graph.nodes.some((node) => node.path === file));
  if (!seeds.length) return { found: false, inferred: true, reason: 'No task-relevant graph files were retrieved.' };
  const visited = new Set(seeds);
  let frontier = [...seeds];
  const levels = [];
  for (let currentDepth = 1; currentDepth <= Math.max(1, Math.min(8, depth)); currentDepth += 1) {
    const next = unique(frontier.flatMap((file) => graph.reverseDependents?.[file] || [])).filter((file) => !visited.has(file));
    if (!next.length) break;
    next.forEach((file) => visited.add(file));
    levels.push({ depth: currentDepth, files: next.sort() });
    frontier = next;
  }
  const workspaceByFile = new Map(graph.nodes.map((node) => [node.path, node.workspace]));
  const affectedFiles = levels.flatMap((level) => level.files);
  return {
    found: true,
    inferred: true,
    confidence: seeds.length >= 3 ? 'medium' : 'low',
    seedFiles: seeds,
    directDependents: levels[0]?.files || [],
    affectedFiles,
    affectedWorkspaces: unique([...seeds, ...affectedFiles].map((file) => workspaceByFile.get(file))).sort(),
    levels,
  };
}

function relevantBoundaries(boundaryMap, files, query) {
  if (!boundaryMap.available) return [];
  const fileScores = new Map();
  for (const file of files) {
    const id = boundaryMap.fileBoundary[file];
    if (id) fileScores.set(id, (fileScores.get(id) || 0) + 3);
  }
  const terms = tokenize(query);
  for (const boundary of boundaryMap.boundaries) {
    const label = boundary.label.toLowerCase();
    for (const term of terms) if (label.includes(term)) fileScores.set(boundary.id, (fileScores.get(boundary.id) || 0) + 2);
  }
  return boundaryMap.boundaries
    .map((boundary) => ({ ...boundary, relevance: fileScores.get(boundary.id) || 0 }))
    .filter((boundary) => boundary.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance || (b.inboundEdges + b.outboundEdges) - (a.inboundEdges + a.outboundEdges))
    .slice(0, 8);
}

function buildRisks({ baseline, graph, memory, boundaries, topics }) {
  const risks = [];
  if (baseline.available && !baseline.clean) risks.push({ id: 'dirty-worktree', title: 'Dirty worktree', severity: 'medium', reason: 'Existing changes can be mixed with the planned change or invalidate attribution.', evidence: baseline.changes.map((item) => item.path).slice(0, 20), confidence: 'high' });
  if (graph.summary?.truncated) risks.push({ id: 'truncated-graph', title: 'Truncated project graph', severity: 'high', reason: 'The graph reached its configured file limit, so impact coverage is incomplete.', evidence: [], confidence: 'high' });
  if ((graph.summary?.unresolvedImports || 0) > 0) risks.push({ id: 'unresolved-imports', title: 'Unresolved local imports', severity: 'medium', reason: `${graph.summary.unresolvedImports} local imports could not be resolved, so impact analysis may be incomplete.`, evidence: [], confidence: 'high' });
  if (memory.coverage.relevantDurableEntries === 0) risks.push({ id: 'memory-gap', title: 'No relevant durable memory', severity: 'low', reason: 'The change lacks reviewed project-specific facts, decisions, or lessons in the retrieved context.', evidence: memory.relatedFiles, confidence: 'high' });
  if (boundaries.length > 1) risks.push({ id: 'cross-boundary-change', title: 'Cross-boundary change', severity: boundaries.length >= 4 ? 'high' : 'medium', reason: `The retrieved context spans ${boundaries.length} inferred boundaries.`, evidence: boundaries.map((item) => item.label), confidence: 'medium' });
  for (const topic of topics) risks.push({ id: topic.id, title: topic.title, severity: ['identity-access', 'persistence-schema', 'security-privacy'].includes(topic.id) ? 'high' : 'medium', reason: topic.risk, evidence: memory.relatedFiles.filter((file) => topic.pattern.test(file)).slice(0, 8), confidence: memory.relatedFiles.some((file) => topic.pattern.test(file)) ? 'medium' : 'low' });
  return risks.slice(0, 10);
}

function buildVerification({ boundaries, topics, memory }) {
  const items = [
    { id: 'targeted-tests', title: 'Targeted regression tests', guidance: 'Run the smallest test set that directly covers the changed behavior and every modified boundary.', evidence: memory.relatedFiles.slice(0, 8) },
  ];
  if (boundaries.length > 1) items.push({ id: 'boundary-integration', title: 'Boundary integration tests', guidance: 'Verify contracts and state transitions across each affected boundary, not only isolated units.', evidence: boundaries.map((item) => item.label) });
  for (const topic of topics) items.push({ id: `verify-${topic.id}`, title: topic.title, guidance: topic.verification, evidence: memory.relatedFiles.filter((file) => topic.pattern.test(file)).slice(0, 8) });
  if (memory.coverage.mistakes > 0) items.push({ id: 'known-failures', title: 'Known failure regression', guidance: 'Re-run checks that cover retrieved mistakes and prevention rules.', evidence: [] });
  return items.slice(0, 10);
}

export async function prepareChangeBrief(root, query, options = {}) {
  const normalizedQuery = String(query || '').trim();
  if (!normalizedQuery) throw new Error('Change goal cannot be empty.');
  const graph = await loadProjectGraph(root);
  const baseline = await getRepositoryBaseline(root);
  const graphHealth = await inspectProjectGraphHealth(root, graph);
  if (!graph) {
    return { schemaVersion: 1, generatedAt: new Date().toISOString(), query: normalizedQuery, workspace: options.workspace || null, ready: false, baseline, reason: graphHealth.scanAllowed === false ? graphHealth.blockedReason : 'Project graph is missing. Run cmi scan before preparing a change.', graphHealth };
  }
  if (!graphHealth.current) {
    return { schemaVersion: 1, generatedAt: new Date().toISOString(), query: normalizedQuery, workspace: options.workspace || null, ready: false, baseline, reason: graphHealth.scanAllowed === false ? graphHealth.blockedReason || graphHealth.formatReason : graphHealth.formatReason || 'Project graph is stale. Run cmi scan before preparing a change.', graphHealth };
  }
  const context = await buildContextPack(root, normalizedQuery, options.limit || 12, { workspace: options.workspace });
  const boundaryMap = await mapProjectBoundaries(root);
  const memory = await suggestProjectMemory(root, normalizedQuery, { workspace: options.workspace, limit: options.limit || 20 });
  let impact = await impactAnalysis(root, normalizedQuery, options.depth || 3);
  if (!impact.found) impact = inferImpact(graph, context.recommendedFiles.slice(0, 5), options.depth || 3);
  const boundaries = relevantBoundaries(boundaryMap, unique([...(context.recommendedFiles || []), ...(impact.seedFiles || []), ...(impact.matchedFiles || [])]), normalizedQuery);
  const topics = matchedTopics(normalizedQuery, memory.relatedFiles);
  const risks = buildRisks({ baseline, graph, memory, boundaries, topics });
  const verification = buildVerification({ boundaries, topics, memory });
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    query: normalizedQuery,
    workspace: options.workspace || null,
    ready: true,
    graphHealth,
    baseline,
    context: {
      summary: context.summary,
      recommendedFiles: context.recommendedFiles,
      affectedWorkspaces: context.affectedWorkspaces,
      decisions: context.sections.decisions,
      risks: context.sections.risks,
      globalKnowledge: context.sections.globalKnowledge,
    },
    boundaries: {
      method: boundaryMap.method,
      relevant: boundaries,
      connections: boundaryMap.connections.filter((connection) => boundaries.some((boundary) => boundary.id === connection.from || boundary.id === connection.to)).slice(0, 20),
    },
    impact,
    memory,
    risks,
    verification,
    assumptions: [
      'Inferred boundaries and topic classifications are advisory heuristics, not declared architecture.',
      'No suggested memory is durable until an explicit reviewed write occurs.',
      'Impact completeness depends on parser coverage, graph limits, generated code, runtime wiring, reflection, and dependency injection.',
    ],
    provenance: {
      baseline: 'local Git metadata',
      context: 'ranked durable memory and project graph',
      boundaries: 'workspace, directory, and import-graph inference',
      impact: impact.inferred ? 'reverse dependencies from context-selected seed files' : 'exact file or symbol match',
      memorySuggestions: 'coverage gaps plus task and path heuristics',
    },
  };
}

export function formatRepositoryBaseline(result) {
  if (!result.available) return `Repository baseline unavailable: ${result.reason}`;
  const sync = result.upstream ? ` · upstream ${result.upstream}${result.ahead === null ? '' : ` · ahead ${result.ahead} · behind ${result.behind}`}` : '';
  const changes = result.clean ? '- None' : result.changes.map((item) => `- ${item.status} ${item.path}${item.originalPath ? ` (from ${item.originalPath})` : ''}`).join('\n');
  return `# Repository baseline\n\n- Branch: ${result.branch}\n- HEAD: ${result.head || 'unborn'}\n- Worktree: ${result.clean ? 'clean' : 'dirty'}\n- Project path: ${result.projectPath}${sync}\n- Latest commit: ${result.commit?.subject || 'none'}\n\n## Changes\n${changes}`;
}

export function formatBoundaryMap(result) {
  if (!result.available) return result.reason;
  const boundaries = result.boundaries.map((item) => `- ${item.label}${item.workspace ? ` · ${item.workspace}` : ''}: ${item.fileCount} files, ${item.inboundEdges} inbound, ${item.outboundEdges} outbound · confidence ${item.confidence}\n  ${item.representativeFiles.join(', ') || 'No representative files'}`).join('\n');
  const connections = result.connections.slice(0, 20).map((item) => `- ${item.from} → ${item.to}: ${item.edges} edges`).join('\n') || '- None detected';
  return `# Inferred project boundaries\n\n${result.method}\n\n## Boundaries\n${boundaries || '- None detected'}\n\n## Cross-boundary connections\n${connections}`;
}

export function formatMemorySuggestions(result) {
  const items = result.suggestions.map((item) => `- [${item.type}] ${item.title}: ${item.proposal}\n  Rationale: ${item.rationale} · confidence ${item.confidence}`).join('\n') || '- No gaps detected in the retrieved durable memory.';
  return `# Project memory coverage\n\nRelevant durable entries: ${result.coverage.relevantDurableEntries} · facts ${result.coverage.facts} · decisions ${result.coverage.decisions} · mistakes ${result.coverage.mistakes}\n\n## Review proposals\n${items}\n\n${result.policy}`;
}

export function formatChangeBrief(result) {
  if (!result.ready) return `# Pre-change brief unavailable\n\n${result.reason}\n\n${formatRepositoryBaseline(result.baseline)}`;
  const boundaryText = result.boundaries.relevant.map((item) => `- ${item.label}${item.workspace ? ` · ${item.workspace}` : ''}: ${item.fileCount} files · confidence ${item.confidence}`).join('\n') || '- None inferred from the retrieved context';
  const files = result.context.recommendedFiles.map((file) => `- \`${file}\``).join('\n') || '- None retrieved';
  const risks = result.risks.map((item) => `- [${item.severity}] ${item.title}: ${item.reason} · confidence ${item.confidence}`).join('\n') || '- No additional risks inferred';
  const verification = result.verification.map((item) => `- ${item.title}: ${item.guidance}`).join('\n');
  const memory = result.memory.suggestions.map((item) => `- [${item.type}] ${item.title}: ${item.proposal}`).join('\n') || '- Retrieved durable memory covers the main categories';
  const impact = result.impact.found
    ? `Mode: ${result.impact.inferred ? 'inferred from context files' : 'exact match'}\n- Direct dependents: ${result.impact.directDependents?.length || 0}\n- Affected files: ${result.impact.affectedFiles?.length || 0}\n- Affected workspaces: ${(result.impact.affectedWorkspaces || []).join(', ') || 'none'}`
    : `Unavailable: ${result.impact.reason}`;
  return `# Pre-change brief: ${result.query}\n\n${formatRepositoryBaseline(result.baseline)}\n\n## Recommended files\n${files}\n\n## Relevant inferred boundaries\n${boundaryText}\n\n## Impact\n${impact}\n\n## Memory gaps to review\n${memory}\n\n## Risks\n${risks}\n\n## Verification plan\n${verification}\n\n## Guardrails\n${result.assumptions.map((item) => `- ${item}`).join('\n')}`;
}
