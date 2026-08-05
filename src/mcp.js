#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { searchMemory, buildContextPack, formatResults } from './search.js';
import { remember, scanProject, status, explainIgnore } from './core.js';
import { impactAnalysis, formatImpact, loadProjectGraph } from './graph.js';
import { checkStaleMemory, formatStaleReport, refreshMemory } from './stale.js';
import { formatWorkspaces } from './workspaces.js';
import { VERSION, MCP_PROTOCOL_VERSION, MCP_PROTOCOL_VERSIONS } from './version.js';

const root = path.resolve(process.env.CMI_PROJECT_ROOT || process.cwd());
const writeEnabled = /^(1|true|yes)$/i.test(process.env.CMI_WRITE_ENABLED || '');
const bulkRefreshEnabled = /^(1|true|yes)$/i.test(process.env.CMI_ALLOW_BULK_REFRESH || '');
let lifecycle = 'new';
let negotiatedProtocol = MCP_PROTOCOL_VERSION;

function send(message) { process.stdout.write(`${JSON.stringify(message)}\n`); }
function sendError(id, code, message, data) { send({ jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data === undefined ? {} : { data }) } }); }
function textResult(text, structuredContent) { return { content: [{ type: 'text', text }], ...(structuredContent ? { structuredContent } : {}) }; }
function writable() { if (!writeEnabled) throw new Error('MCP durable-memory tools are disabled. Generate config with cmi mcp-config --write to enable them.'); }
function validRequest(message) { return message && typeof message === 'object' && !Array.isArray(message) && message.jsonrpc === '2.0' && typeof message.method === 'string'; }

async function callTool(name, args = {}) {
  if (name === 'search_project_memory') {
    const results = await searchMemory(root, args.query || '', args.limit || 6, { workspace: args.workspace });
    return textResult(formatResults(results), { results });
  }
  if (name === 'build_project_context') {
    const pack = await buildContextPack(root, args.query || '', args.limit || 8, { workspace: args.workspace });
    return textResult(formatResults(pack.results), pack);
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
  throw new Error(`Unknown tool: ${name}`);
}

const readTools = [
  { name: 'search_project_memory', title: 'Search project memory', description: 'Find relevant durable project facts, decisions, mistakes, architecture, files, workspaces, and indexed symbols.', inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 30 }, workspace: { type: 'string', description: 'Optional workspace name, ID, or path.' } } }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: 'build_project_context', title: 'Build project context', description: 'Build a ranked context pack for an agent task, optionally scoped to one workspace.', inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 30 }, workspace: { type: 'string' } } }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: 'scan_project_intelligence', title: 'Scan project intelligence', description: 'Refresh repository structure, workspaces, import graph, and symbol intelligence. Uses incremental reuse unless full is true.', inputSchema: { type: 'object', properties: { full: { type: 'boolean' } } }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: 'get_project_memory_status', title: 'Get project status', description: 'Inspect memory, graph, index, workspaces, staleness, and snapshot status.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: 'list_project_workspaces', title: 'List project workspaces', description: 'List detected npm, pnpm, Cargo, and Go workspaces.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: 'explain_project_ignore', title: 'Explain ignored path', description: 'Explain whether a path is included or ignored and identify the matching rule.', inputSchema: { type: 'object', required: ['path'], properties: { path: { type: 'string' }, directory: { type: 'boolean' } } }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: 'get_project_graph', title: 'Get project graph', description: 'Return compact import-graph statistics, high-impact files, incremental-scan metrics, and external dependencies.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: 'analyze_project_impact', title: 'Analyze project impact', description: 'Find files and workspaces that depend on a file or symbol before changing it.', inputSchema: { type: 'object', required: ['target'], properties: { target: { type: 'string' }, depth: { type: 'integer', minimum: 1, maximum: 8 } } }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: 'check_stale_memory', title: 'Check stale memory', description: 'Detect project knowledge that is stale, needs review, or predates metadata tracking.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
];
const writeTools = [
  { name: 'remember_project_knowledge', title: 'Remember project knowledge', description: 'Persist a durable fact, architecture decision, or lesson, optionally linked to source files.', inputSchema: { type: 'object', required: ['type','text'], properties: { type: { type: 'string', enum: ['fact','decision','mistake'] }, text: { type: 'string' }, sources: { type: 'array', items: { type: 'string' }, maxItems: 20 } } }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } },
  { name: 'refresh_project_memory', title: 'Refresh reviewed memory', description: 'Mark one explicitly reviewed memory entry as current. Bulk refresh requires a separate server opt-in.', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string', description: 'Memory ID prefix; use all only when bulk refresh is enabled.' }, reviewedBy: { type: 'string' }, reason: { type: 'string' } } }, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false } },
];
function tools() { return writeEnabled ? [...readTools, ...writeTools] : readTools; }

const resources = [
  { uri: 'cmi://project/memory', name: 'Project memory', title: 'Project Memory', description: 'Durable project facts.', mimeType: 'text/markdown' },
  { uri: 'cmi://project/decisions', name: 'Architecture decisions', title: 'Architecture Decisions', description: 'Durable architecture decisions.', mimeType: 'text/markdown' },
  { uri: 'cmi://project/mistakes', name: 'Mistakes and lessons', title: 'Mistakes and Lessons', description: 'Known failures, causes, and prevention rules.', mimeType: 'text/markdown' },
  { uri: 'cmi://project/architecture', name: 'Project architecture', title: 'Project Architecture', description: 'Generated stack, workspace, and graph summary.', mimeType: 'text/markdown' },
  { uri: 'cmi://project/workspaces', name: 'Project workspaces', title: 'Project Workspaces', description: 'Detected workspace inventory.', mimeType: 'application/json' },
  { uri: 'cmi://project/graph-summary', name: 'Graph summary', title: 'Project Graph Summary', description: 'Compact graph metrics and high-impact files.', mimeType: 'application/json' },
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
  throw new Error(`Unknown resource: ${uri}`);
}

const prompts = [
  { name: 'prepare_project_change', title: 'Prepare a project change', description: 'Build a disciplined pre-change workflow using memory, impact, and workspace context.', arguments: [{ name: 'target', description: 'File, symbol, feature, or change goal.', required: true }, { name: 'workspace', description: 'Optional workspace name or path.', required: false }] },
  { name: 'review_stale_memory', title: 'Review stale project memory', description: 'Guide a human-reviewed stale-memory audit.', arguments: [] },
];

function promptResult(name, args = {}) {
  if (name === 'prepare_project_change') {
    const target = String(args.target || '').trim();
    if (!target) throw new Error('Prompt argument target is required.');
    const workspace = args.workspace ? ` Scope retrieval to workspace "${args.workspace}".` : '';
    return { description: `Prepare a safe change for ${target}.`, messages: [{ role: 'user', content: { type: 'text', text: `Prepare to change ${target}.${workspace} First check project status and stale memory. Search durable decisions and mistakes. Run impact analysis for the target. Identify affected workspaces, tests, migrations, and deployment risks. Propose a minimal plan before editing. Do not store new memory until the change is reviewed.` } }] };
  }
  if (name === 'review_stale_memory') {
    return { description: 'Review stale project knowledge before refreshing it.', messages: [{ role: 'user', content: { type: 'text', text: 'Run the stale-memory check. For each stale or review item, inspect its linked sources and current architecture. Explain whether it remains valid, needs rewriting, or should be removed. Refresh only entries that were explicitly reviewed, recording reviewer identity and reason.' } }] };
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
    send({ jsonrpc: '2.0', id, result: { protocolVersion: negotiatedProtocol, capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false }, prompts: { listChanged: false } }, serverInfo: { name: 'codex-memory-intelligence', title: 'Codex Memory Intelligence', version: VERSION }, instructions: `Local-first project intelligence with incremental scanning and workspace-aware retrieval. Durable-memory mutations are ${writeEnabled ? 'enabled' : 'disabled by default'}.` } });
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
