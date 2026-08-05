#!/usr/bin/env node
import path from 'node:path';
import readline from 'node:readline';
import { searchMemory, formatResults } from './search.js';
import { remember, scanProject, status } from './core.js';
import { impactAnalysis, formatImpact, loadProjectGraph } from './graph.js';
import { checkStaleMemory, formatStaleReport, refreshMemory } from './stale.js';
import { VERSION, MCP_PROTOCOL_VERSION } from './version.js';

const root = path.resolve(process.env.CMI_PROJECT_ROOT || process.cwd());
const writeEnabled = /^(1|true|yes)$/i.test(process.env.CMI_WRITE_ENABLED || '');
const bulkRefreshEnabled = /^(1|true|yes)$/i.test(process.env.CMI_ALLOW_BULK_REFRESH || '');
let lifecycle = 'new';

function send(message) { process.stdout.write(`${JSON.stringify(message)}\n`); }
function sendError(id, code, message, data) { send({ jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data === undefined ? {} : { data }) } }); }
function textResult(text, structuredContent) { return { content: [{ type: 'text', text }], ...(structuredContent ? { structuredContent } : {}) }; }
function writable() { if (!writeEnabled) throw new Error('MCP write tools are disabled. Generate config with cmi mcp-config --write to enable them.'); }

async function callTool(name, args = {}) {
  if (name === 'search_project_memory') { const results = await searchMemory(root, args.query || '', args.limit || 6); return textResult(formatResults(results), { results }); }
  if (name === 'remember_project_knowledge') { writable(); const metadata = await remember(root, args.type, args.text, { sources: args.sources || [] }); return textResult(`Saved ${args.type} project memory as ${metadata.id}.`, metadata); }
  if (name === 'scan_project_intelligence') { const result = await scanProject(root); return textResult(JSON.stringify(result, null, 2), result); }
  if (name === 'get_project_memory_status') { const result = await status(root); return textResult(JSON.stringify(result, null, 2), result); }
  if (name === 'get_project_graph') { const result = await loadProjectGraph(root); if (!result) throw new Error('Project graph is missing. Run scan_project_intelligence first.'); const compact = { summary: result.summary, hubs: result.hubs, externalDependencies: result.externalDependencies }; return textResult(JSON.stringify(compact, null, 2), compact); }
  if (name === 'analyze_project_impact') { const result = await impactAnalysis(root, args.target, args.depth || 3); return textResult(formatImpact(result), result); }
  if (name === 'check_stale_memory') { const result = await checkStaleMemory(root); return textResult(formatStaleReport(result), result); }
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
  { name: 'search_project_memory', description: 'Find relevant durable project facts, decisions, mistakes, architecture, files, and indexed symbols.', inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 20 } } }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: 'scan_project_intelligence', description: 'Refresh repository structure, stack, import graph, and symbol intelligence.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: 'get_project_memory_status', description: 'Inspect memory, graph, index, staleness, and snapshot status.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: 'get_project_graph', description: 'Return compact import-graph statistics, high-impact files, and external dependencies.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: 'analyze_project_impact', description: 'Find files that depend on a file or symbol before changing it.', inputSchema: { type: 'object', required: ['target'], properties: { target: { type: 'string' }, depth: { type: 'integer', minimum: 1, maximum: 8 } } }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: 'check_stale_memory', description: 'Detect project knowledge that is stale, needs review, or predates metadata tracking.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
];
const writeTools = [
  { name: 'remember_project_knowledge', description: 'Persist a durable fact, architecture decision, or lesson, optionally linked to source files.', inputSchema: { type: 'object', required: ['type','text'], properties: { type: { type: 'string', enum: ['fact','decision','mistake'] }, text: { type: 'string' }, sources: { type: 'array', items: { type: 'string' }, maxItems: 20 } } }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } },
  { name: 'refresh_project_memory', description: 'Mark one explicitly reviewed memory entry as current. Bulk refresh requires a separate server opt-in.', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string', description: 'Memory ID prefix; use all only when bulk refresh is enabled.' }, reviewedBy: { type: 'string' }, reason: { type: 'string' } } }, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false } },
];
function tools() { return writeEnabled ? [...readTools, ...writeTools] : readTools; }
function validRequest(message) { return message && typeof message === 'object' && !Array.isArray(message) && message.jsonrpc === '2.0' && typeof message.method === 'string'; }

async function handle(message) {
  if (!validRequest(message)) { sendError(message?.id ?? null, -32600, 'Invalid Request'); return; }
  const { id, method, params = {} } = message;
  if (method === 'initialize') {
    lifecycle = 'initializing';
    const requested = params?.protocolVersion;
    const protocolVersion = requested === MCP_PROTOCOL_VERSION ? requested : MCP_PROTOCOL_VERSION;
    send({ jsonrpc: '2.0', id, result: { protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'codex-memory-intelligence', version: VERSION }, instructions: `Local-first project intelligence. MCP writes are ${writeEnabled ? 'enabled' : 'disabled by default'}.` } });
    return;
  }
  if (method === 'notifications/initialized') { if (lifecycle === 'initializing') lifecycle = 'ready'; return; }
  if (method === 'ping') { if (id !== undefined) send({ jsonrpc: '2.0', id, result: {} }); return; }
  if (lifecycle !== 'ready') { if (id !== undefined) sendError(id, -32002, 'Server is not initialized.'); return; }
  if (method === 'tools/list') { send({ jsonrpc: '2.0', id, result: { tools: tools() } }); return; }
  if (method === 'tools/call') {
    if (typeof params?.name !== 'string' || (params.arguments !== undefined && (typeof params.arguments !== 'object' || Array.isArray(params.arguments)))) { sendError(id, -32602, 'Invalid tool parameters.'); return; }
    try { send({ jsonrpc: '2.0', id, result: await callTool(params.name, params.arguments || {}) }); }
    catch (error) { send({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: error.message }] } }); }
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
