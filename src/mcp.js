#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { searchMemory, buildContextPack, formatResults } from './search.js';
import { remember, scanProject, status, explainIgnore } from './core.js';
import { impactAnalysis, formatImpact, loadProjectGraph } from './graph.js';
import { checkStaleMemory, formatStaleReport, refreshMemory, setMemoryLifecycle } from './stale.js';
import { formatWorkspaces } from './workspaces.js';
import {
  getRepositoryBaseline,
  mapProjectBoundaries,
  suggestProjectMemory,
  prepareChangeBrief,
  formatRepositoryBaseline,
  formatBoundaryMap,
  formatMemorySuggestions,
  formatChangeBrief,
} from './advisor.js';
import {
  startChangeRecord,
  observeChangeRecord,
  completeChangeRecord,
  getChangeRecord,
  listChangeRecords,
  buildChangeInsights,
  formatChangeRecord,
  formatChangeInsights,
  formatChangeList,
} from './change-intelligence.js';
import { VERSION, MCP_PROTOCOL_VERSION, MCP_PROTOCOL_VERSIONS } from './version.js';

const root = path.resolve(process.env.CMI_PROJECT_ROOT || process.cwd());
const writeEnabled = /^(1|true|yes)$/i.test(process.env.CMI_WRITE_ENABLED || '');
const bulkRefreshEnabled = /^(1|true|yes)$/i.test(process.env.CMI_ALLOW_BULK_REFRESH || '');
let lifecycle = 'new';
let negotiatedProtocol = MCP_PROTOCOL_VERSION;

function send(message) { process.stdout.write(`${JSON.stringify(message)}\n`); }
function sendError(id, code, message, data) { send({ jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data === undefined ? {} : { data }) } }); }
function textResult(text, structuredContent) { return { content: [{ type: 'text', text }], ...(structuredContent ? { structuredContent } : {}) }; }
function writable() { if (!writeEnabled) throw new Error('MCP durable project writes are disabled. Generate config with cmi mcp-config --write to enable reviewed memory and change-record writes.'); }
function validRequest(message) { return message && typeof message === 'object' && !Array.isArray(message) && message.jsonrpc === '2.0' && typeof message.method === 'string'; }

async function callTool(name, args = {}) {
  if (name === 'search_project_memory') {
    const results = await searchMemory(root, args.query || '', args.limit || 6, { workspace: args.workspace, stalePolicy: args.stalePolicy, includeInactive: Boolean(args.includeInactive) });
    return textResult(formatResults(results), { results });
  }
  if (name === 'build_project_context') {
    const pack = await buildContextPack(root, args.query || '', args.limit || 8, { workspace: args.workspace, stalePolicy: args.stalePolicy, includeInactive: Boolean(args.includeInactive) });
    return textResult(formatResults(pack.results), pack);
  }
  if (name === 'get_repository_baseline') {
    const result = await getRepositoryBaseline(root);
    return textResult(formatRepositoryBaseline(result), result);
  }
  if (name === 'map_project_boundaries') {
    const result = await mapProjectBoundaries(root);
    return textResult(formatBoundaryMap(result), result);
  }
  if (name === 'suggest_project_memory') {
    const result = await suggestProjectMemory(root, args.query || '', { limit: args.limit || 20, workspace: args.workspace });
    return textResult(formatMemorySuggestions(result), result);
  }
  if (name === 'prepare_change_brief') {
    const result = await prepareChangeBrief(root, args.query || '', { limit: args.limit || 12, depth: args.depth || 3, workspace: args.workspace });
    return textResult(formatChangeBrief(result), result);
  }
  if (name === 'get_change_insights') {
    const result = await buildChangeInsights(root, args.query || '', { limit: args.limit || 6 });
    return textResult(formatChangeInsights(result), result);
  }
  if (name === 'get_change_record') {
    const result = await getChangeRecord(root, args.id || '');
    return textResult(formatChangeRecord(result), result);
  }
  if (name === 'list_change_records') {
    const result = await listChangeRecords(root, { status: args.status, limit: args.limit || 20 });
    return textResult(formatChangeList(result), result);
  }
  if (name === 'start_change_record') {
    writable();
    const result = await startChangeRecord(root, args.goal || '', { limit: args.limit || 12, depth: args.depth || 3, workspace: args.workspace });
    return textResult(formatChangeRecord(result), result);
  }
  if (name === 'observe_change_record') {
    writable();
    const result = await observeChangeRecord(root, args.id || '', { files: args.files || [] });
    return textResult(`Observed ${result.observedChangedFiles.length} changed path(s) with ${result.comparison.missedByPrediction.length} prediction gap(s).`, result);
  }
  if (name === 'complete_change_record') {
    writable();
    const result = await completeChangeRecord(root, args.id || '', {
      outcome: args.outcome || 'unknown',
      files: args.files || [],
      verifications: args.verifications || [],
      unexpectedImpact: args.unexpectedImpact || [],
      notes: args.notes || [],
    });
    return textResult(formatChangeRecord(result), result);
  }
  if (name === 'remember_project_knowledge') {
    writable();
    const metadata = await remember(root, args.type, args.text, { sources: args.sources || [] });
    return textResult(`Saved ${args.type} project memory as ${metadata.id}.`, metadata);
  }
  if (name === 'scan_project_intelligence') {
    const result = await scanProject(root, { full: Boolean(args.full) });
    return textResult(JSON.stringify(result, null, 2), result);
  }
  if (name === 'get_project_memory_status') {
    const result = await status(root);
    return textResult(JSON.stringify(result, null, 2), result);
  }
  if (name === 'list_project_workspaces') {
    const result = await status(root);
    if (!result.workspaces) throw new Error('Project workspace index is missing. Run scan_project_intelligence first.');
    return textResult(formatWorkspaces(result.workspaces), result.workspaces);
  }
  if (name === 'explain_project_ignore') {
    const result = await explainIgnore(root, args.path, { directory: Boolean(args.directory) });
    return textResult(`${result.ignored ? 'IGNORED' : 'INCLUDED'} ${result.path}\n${result.reason}`, result);
  }
  if (name === 'get_project_graph') {
    const result = await loadProjectGraph(root);
    if (!result) throw new Error('Project graph is missing. Run scan_project_intelligence first.');
    const compact = { summary: result.summary, hubs: result.hubs, externalDependencies: result.externalDependencies };
    return textResult(JSON.stringify(compact, null, 2), compact);
  }
  if (name === 'analyze_project_impact') {
    const result = await impactAnalysis(root, args.target, args.depth || 3);
    return textResult(formatImpact(result), result);
  }
  if (name === 'check_stale_memory') {
    const result = await checkStaleMemory(root);
    return textResult(formatStaleReport(result), result);
  }
  if (name === 'refresh_project_memory') {
    writable();
    const selector = args.id || '';
    if (!selector) throw new Error('A reviewed memory ID prefix is required.');
    if (selector === 'all' && !bulkRefreshEnabled) throw new Error('Bulk refresh is disabled. Set CMI_ALLOW_BULK_REFRESH=1 only for an explicitly reviewed operation.');
    const result = await refreshMemory(root, selector, { reviewedBy: args.reviewedBy || 'mcp-agent', reason: args.reason || 'Reviewed through MCP.' });
    return textResult(`Refreshed ${result.updated} memory entries.`, result);
  }
  if (name === 'set_project_memory_state') {
    writable();
    const result = await setMemoryLifecycle(root, args.id || '', args.state || '', { reason: args.reason, changedBy: args.changedBy || 'mcp-agent', supersededBy: args.supersededBy });
    return textResult(`Memory ${result.id} is now ${result.state}.`, result);
  }
  throw new Error(`Unknown tool: ${name}`);
}

const evidenceProperties = {
  stalePolicy: { type: 'string', enum: ['demote', 'include', 'exclude'], description: 'How stale/review evidence is handled. Defaults to demote.' },
  includeInactive: { type: 'boolean', description: 'Include deprecated, rejected, or superseded memory for explicit historical inspection. Defaults to false.' },
};
const verificationSchema = {
  type: 'object',
  required: ['name', 'status'],
  properties: {
    name: { type: 'string', maxLength: 500 },
    status: { type: 'string', enum: ['passed', 'failed', 'skipped', 'unknown'] },
    provenance: { type: 'string', enum: ['reported', 'observed-command'] },
    evidence: { type: 'string', maxLength: 500 },
    command: { type: 'string', maxLength: 500 },
    exitCode: { type: 'integer' },
    observedAt: { type: 'string', format: 'date-time' },
    outputDigest: { type: 'string', maxLength: 500 },
  },
  allOf: [{ if: { properties: { provenance: { const: 'observed-command' } }, required: ['provenance'] }, then: { required: ['command', 'exitCode', 'observedAt'] } }],
};

const readTools = [
  { name: 'search_project_memory', title: 'Search project memory', description: 'Find relevant active durable project facts, decisions, mistakes, architecture, files, workspaces, and indexed symbols. Inactive knowledge is excluded unless explicitly requested.', inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 30 }, workspace: { type: 'string', description: 'Optional workspace name, ID, or path.' }, ...evidenceProperties } }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: 'build_project_context', title: 'Build project context', description: 'Build a ranked context pack for an agent task, optionally scoped to one workspace, with explicit evidence and lifecycle policy.', inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 30 }, workspace: { type: 'string' }, ...evidenceProperties } }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: 'get_repository_baseline', title: 'Get repository baseline', description: 'Return bounded local Git branch, commit, clean-worktree, upstream, and ahead/behind context without exposing absolute paths.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: 'map_project_boundaries', title: 'Map project boundaries', description: 'Infer advisory architecture boundaries and cross-boundary connections from workspaces, paths, and the import graph. Every boundary includes confidence and provenance.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: 'suggest_project_memory', title: 'Suggest project memory gaps', description: 'Identify missing task-relevant facts, decisions, and lessons as review-only proposals. This tool never writes durable memory.', inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 30 }, workspace: { type: 'string' } } }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: 'prepare_change_brief', title: 'Prepare change brief', description: 'Build a professional pre-change brief combining Git baseline, ranked context, inferred boundaries, impact, memory gaps, risks, verification, confidence, and provenance.', inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 30 }, depth: { type: 'integer', minimum: 1, maximum: 8 }, workspace: { type: 'string' } } }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: 'get_change_insights', title: 'Get historical change intelligence', description: 'Retrieve relevant completed change records, file and boundary co-change evidence, verification patterns, and expected-vs-actual path calibration. Historical correlation is never presented as causality.', inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 20 } } }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: 'get_change_record', title: 'Get change record', description: 'Read one durable change record by ID or unique prefix.', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: 'list_change_records', title: 'List change records', description: 'List bounded summaries of active or completed project change records.', inputSchema: { type: 'object', properties: { status: { type: 'string', enum: ['active', 'completed'] }, limit: { type: 'integer', minimum: 1, maximum: 100 } } }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: 'scan_project_intelligence', title: 'Scan project intelligence', description: 'Refresh repository structure, workspaces, import graph, and symbol intelligence. Uses incremental reuse unless full is true.', inputSchema: { type: 'object', properties: { full: { type: 'boolean' } } }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: 'get_project_memory_status', title: 'Get project status', description: 'Inspect memory, graph, index, workspaces, staleness, lifecycle, and snapshot status.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: 'list_project_workspaces', title: 'List project workspaces', description: 'List detected npm, pnpm, Cargo, and Go workspaces.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: 'explain_project_ignore', title: 'Explain ignored path', description: 'Explain whether a path is included or ignored and identify the matching rule.', inputSchema: { type: 'object', required: ['path'], properties: { path: { type: 'string' }, directory: { type: 'boolean' } } }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: 'get_project_graph', title: 'Get project graph', description: 'Return compact import-graph statistics, high-impact files, incremental-scan metrics, and external dependencies.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: 'analyze_project_impact', title: 'Analyze project impact', description: 'Find files and workspaces that depend on a file or symbol before changing it.', inputSchema: { type: 'object', required: ['target'], properties: { target: { type: 'string' }, depth: { type: 'integer', minimum: 1, maximum: 8 } } }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: 'check_stale_memory', title: 'Check memory health and lifecycle', description: 'Detect active project knowledge that is stale, needs review, or predates metadata tracking, and list intentionally inactive knowledge separately.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
];
const writeTools = [
  { name: 'start_change_record', title: 'Start change intelligence record', description: 'Start a durable BEFORE record from the current pre-change brief and relevant historical evidence. Requires explicit MCP write opt-in.', inputSchema: { type: 'object', required: ['goal'], properties: { goal: { type: 'string', maxLength: 500 }, limit: { type: 'integer', minimum: 1, maximum: 30 }, depth: { type: 'integer', minimum: 1, maximum: 8 }, workspace: { type: 'string' } } }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } },
  { name: 'observe_change_record', title: 'Observe change progress', description: 'Capture DURING evidence from Git plus optional explicit project-relative file paths without storing diffs or source contents.', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' }, files: { type: 'array', items: { type: 'string' }, maxItems: 160 } } }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } },
  { name: 'complete_change_record', title: 'Complete change intelligence record', description: 'Capture AFTER evidence, outcome, verification claims/provenance, unexpected impact, prediction gaps, and review-only learning candidates.', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' }, outcome: { type: 'string', enum: ['succeeded', 'failed', 'partial', 'abandoned', 'unknown'] }, files: { type: 'array', items: { type: 'string' }, maxItems: 160 }, verifications: { type: 'array', maxItems: 20, items: verificationSchema }, unexpectedImpact: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 500 } }, notes: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 500 } } } }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } },
  { name: 'remember_project_knowledge', title: 'Remember project knowledge', description: 'Persist a durable active fact, architecture decision, or lesson, optionally linked to source files.', inputSchema: { type: 'object', required: ['type','text'], properties: { type: { type: 'string', enum: ['fact','decision','mistake'] }, text: { type: 'string' }, sources: { type: 'array', items: { type: 'string' }, maxItems: 20 } } }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } },
  { name: 'refresh_project_memory', title: 'Refresh reviewed memory', description: 'Mark one explicitly reviewed active memory entry as current. Ambiguous prefixes are rejected; bulk refresh requires a separate server opt-in and skips inactive knowledge.', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string', description: 'Memory ID prefix; use all only when bulk refresh is enabled.' }, reviewedBy: { type: 'string' }, reason: { type: 'string' } } }, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false } },
  { name: 'set_project_memory_state', title: 'Set reviewed memory lifecycle state', description: 'Explicitly activate, deprecate, reject, or supersede one uniquely identified memory entry with reviewer and reason metadata. Superseded state requires an active replacement ID.', inputSchema: { type: 'object', required: ['id','state','reason'], properties: { id: { type: 'string' }, state: { type: 'string', enum: ['active','deprecated','rejected','superseded'] }, reason: { type: 'string', minLength: 1, maxLength: 500 }, changedBy: { type: 'string', maxLength: 100 }, supersededBy: { type: 'string' } } }, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false } },
];
function tools() { return writeEnabled ? [...readTools, ...writeTools] : readTools; }

const resources = [
  { uri: 'cmi://project/memory', name: 'Project memory', title: 'Project Memory', description: 'Durable project facts and their lifecycle metadata.', mimeType: 'text/markdown' },
  { uri: 'cmi://project/decisions', name: 'Architecture decisions', title: 'Architecture Decisions', description: 'Durable architecture decisions and their lifecycle metadata.', mimeType: 'text/markdown' },
  { uri: 'cmi://project/mistakes', name: 'Mistakes and lessons', title: 'Mistakes and Lessons', description: 'Known failures, causes, prevention rules, and lifecycle metadata.', mimeType: 'text/markdown' },
  { uri: 'cmi://project/architecture', name: 'Project architecture', title: 'Project Architecture', description: 'Generated stack, workspace, and graph summary.', mimeType: 'text/markdown' },
  { uri: 'cmi://project/workspaces', name: 'Project workspaces', title: 'Project Workspaces', description: 'Detected workspace inventory.', mimeType: 'application/json' },
  { uri: 'cmi://project/graph-summary', name: 'Graph summary', title: 'Project Graph Summary', description: 'Compact graph metrics and high-impact files.', mimeType: 'application/json' },
  { uri: 'cmi://project/baseline', name: 'Repository baseline', title: 'Repository Baseline', description: 'Bounded Git baseline without absolute local paths.', mimeType: 'application/json' },
  { uri: 'cmi://project/boundaries', name: 'Inferred project boundaries', title: 'Inferred Project Boundaries', description: 'Advisory boundary map with confidence and provenance.', mimeType: 'application/json' },
  { uri: 'cmi://project/change-history', name: 'Change history', title: 'Project Change History', description: 'Bounded summaries of durable BEFORE/DURING/AFTER change records.', mimeType: 'application/json' },
];

async function readResource(uri) {
  const markdown = {
    'cmi://project/memory': 'memory.md',
    'cmi://project/decisions': 'decisions.md',
    'cmi://project/mistakes': 'mistakes.md',
    'cmi://project/architecture': 'architecture.md',
  }[uri];
  if (markdown) {
    const text = await fs.readFile(path.join(root, '.codex-memory', markdown), 'utf8');
    return { uri, mimeType: 'text/markdown', text };
  }
  if (uri === 'cmi://project/workspaces') {
    const result = await status(root);
    return { uri, mimeType: 'application/json', text: JSON.stringify(result.workspaces || { count: 0, workspaces: [] }, null, 2) };
  }
  if (uri === 'cmi://project/graph-summary') {
    const graph = await loadProjectGraph(root);
    if (!graph) throw new Error('Project graph is missing. Run scan_project_intelligence first.');
    return { uri, mimeType: 'application/json', text: JSON.stringify({ summary: graph.summary, hubs: graph.hubs, externalDependencies: graph.externalDependencies }, null, 2) };
  }
  if (uri === 'cmi://project/baseline') {
    return { uri, mimeType: 'application/json', text: JSON.stringify(await getRepositoryBaseline(root), null, 2) };
  }
  if (uri === 'cmi://project/boundaries') {
    return { uri, mimeType: 'application/json', text: JSON.stringify(await mapProjectBoundaries(root), null, 2) };
  }
  if (uri === 'cmi://project/change-history') {
    return { uri, mimeType: 'application/json', text: JSON.stringify(await listChangeRecords(root, { limit: 50 }), null, 2) };
  }
  throw new Error(`Unknown resource: ${uri}`);
}

const prompts = [
  { name: 'prepare_project_change', title: 'Prepare a project change', description: 'Build a disciplined pre-change workflow using CMI context, historical change intelligence, and the structured change brief before editing.', arguments: [{ name: 'target', description: 'File, symbol, feature, or change goal.', required: true }, { name: 'workspace', description: 'Optional workspace name or path.', required: false }] },
  { name: 'run_change_intelligence_loop', title: 'Run the change intelligence loop', description: 'Guide a BEFORE → DURING → AFTER workflow that records evidence and prediction gaps. Durable record writes require MCP write opt-in.', arguments: [{ name: 'target', description: 'Change goal.', required: true }, { name: 'workspace', description: 'Optional workspace name or path.', required: false }] },
  { name: 'review_stale_memory', title: 'Review stale project memory', description: 'Guide a human-reviewed memory health and lifecycle audit.', arguments: [] },
];

function promptResult(name, args = {}) {
  if (name === 'prepare_project_change') {
    const target = String(args.target || '').trim();
    if (!target) throw new Error('Prompt argument target is required.');
    const workspace = args.workspace ? ` Scope retrieval to workspace "${args.workspace}".` : '';
    return { description: `Prepare a safe change for ${target}.`, messages: [{ role: 'user', content: { type: 'text', text: `Use get_change_insights for ${target} to inspect relevant completed changes and historical co-change evidence, then use prepare_change_brief for ${target}.${workspace} Review Git baseline, active durable memory, inferred boundaries, impact, risks, verification, confidence, provenance, and historical limitations. Historical co-change is correlation only. Resolve material unknowns before editing and propose a minimal plan. Do not store new memory until evidence is reviewed.` } }] };
  }
  if (name === 'run_change_intelligence_loop') {
    const target = String(args.target || '').trim();
    if (!target) throw new Error('Prompt argument target is required.');
    const workspace = args.workspace ? ` Use workspace "${args.workspace}" when starting the record.` : '';
    return { description: `Track evidence for ${target}.`, messages: [{ role: 'user', content: { type: 'text', text: `Run CMI's change intelligence loop for ${target}.${workspace} BEFORE: inspect get_change_insights, then call start_change_record and review its predicted scope, historical evidence, risks, and verification plan. DURING: implement the smallest justified change and call observe_change_record after meaningful edits; provide explicit project-relative files only when Git cannot attribute them. AFTER: rescan project intelligence, run the project's real verification commands yourself, then call complete_change_record with outcome and verification statuses/provenance. Review prediction gaps and learning candidates, but never convert them into project memory automatically. Treat changed paths as observed evidence, not proof of complete runtime impact or causality.` } }] };
  }
  if (name === 'review_stale_memory') {
    return { description: 'Review project knowledge health and lifecycle before mutating it.', messages: [{ role: 'user', content: { type: 'text', text: 'Run the memory health check. For each active stale or review item, inspect its linked sources and current architecture. Refresh only entries that remain valid after explicit review. If knowledge is no longer trustworthy or applicable, use the reviewed lifecycle tool to deprecate, reject, or supersede it instead of silently deleting or refreshing it. Supersession must point to an active replacement entry.' } }] };
  }
  throw new Error(`Unknown prompt: ${name}`);
}

async function handle(message) {
  if (!validRequest(message)) { sendError(message?.id ?? null, -32600, 'Invalid Request'); return; }
  const { id, method, params = {} } = message;
  if (method === 'initialize') {
    if (lifecycle !== 'new') { sendError(id, -32600, 'Initialize may only be called once.'); return; }
    lifecycle = 'initializing';
    const requested = String(params?.protocolVersion || '');
    negotiatedProtocol = MCP_PROTOCOL_VERSIONS.includes(requested) ? requested : MCP_PROTOCOL_VERSION;
    send({ jsonrpc: '2.0', id, result: { protocolVersion: negotiatedProtocol, capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false }, prompts: { listChanged: false } }, serverInfo: { name: 'codex-memory-intelligence', title: 'Codex Memory Intelligence', version: VERSION }, instructions: `Local-first project intelligence with incremental scanning, workspace-aware retrieval, active-memory lifecycle filtering, evidence-labeled pre-change briefs, and historical change intelligence. Inferred boundaries, co-change patterns, and learning candidates are advisory. Durable project writes are ${writeEnabled ? 'enabled' : 'disabled by default'}.` } });
    return;
  }
  if (method === 'notifications/initialized') { if (lifecycle === 'initializing') lifecycle = 'ready'; return; }
  if (method === 'notifications/cancelled') return;
  if (method === 'ping') { if (id !== undefined) send({ jsonrpc: '2.0', id, result: {} }); return; }
  if (lifecycle !== 'ready') { if (id !== undefined) sendError(id, -32002, 'Server is not initialized.'); return; }
  if (method === 'tools/list') { send({ jsonrpc: '2.0', id, result: { tools: tools() } }); return; }
  if (method === 'tools/call') {
    if (typeof params?.name !== 'string' || (params.arguments !== undefined && (typeof params.arguments !== 'object' || Array.isArray(params.arguments)))) { sendError(id, -32602, 'Invalid tool parameters.'); return; }
    try { send({ jsonrpc: '2.0', id, result: await callTool(params.name, params.arguments || {}) }); }
    catch (error) { send({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: error.message }] } }); }
    return;
  }
  if (method === 'resources/list') { send({ jsonrpc: '2.0', id, result: { resources } }); return; }
  if (method === 'resources/read') {
    if (typeof params?.uri !== 'string') { sendError(id, -32602, 'Resource URI is required.'); return; }
    try { send({ jsonrpc: '2.0', id, result: { contents: [await readResource(params.uri)] } }); }
    catch (error) { sendError(id, -32001, error.message); }
    return;
  }
  if (method === 'prompts/list') { send({ jsonrpc: '2.0', id, result: { prompts } }); return; }
  if (method === 'prompts/get') {
    if (typeof params?.name !== 'string') { sendError(id, -32602, 'Prompt name is required.'); return; }
    try { send({ jsonrpc: '2.0', id, result: promptResult(params.name, params.arguments || {}) }); }
    catch (error) { sendError(id, -32602, error.message); }
    return;
  }
  if (id !== undefined) sendError(id, -32601, `Method not found: ${method}`);
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
let queue = Promise.resolve();
input.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  queue = queue.then(async () => {
    let message;
    try { message = JSON.parse(trimmed); }
    catch { sendError(null, -32700, 'Parse error'); return; }
    await handle(message);
  }).catch((error) => process.stderr.write(`CMI MCP error: ${error.message}\n`));
});
