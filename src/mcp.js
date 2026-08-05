#!/usr/bin/env node
import path from 'node:path';
import readline from 'node:readline';
import { searchMemory, formatResults } from './search.js';
import { remember, scanProject, status } from './core.js';
import { impactAnalysis, formatImpact, loadProjectGraph } from './graph.js';
import { checkStaleMemory, formatStaleReport, refreshMemory } from './stale.js';

const root = path.resolve(process.env.CMI_PROJECT_ROOT || process.cwd());

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function textResult(text, structuredContent) {
  return { content: [{ type: 'text', text }], ...(structuredContent ? { structuredContent } : {}) };
}

async function callTool(name, args = {}) {
  if (name === 'search_project_memory') {
    const results = await searchMemory(root, args.query || '', args.limit || 6);
    return textResult(formatResults(results), { results });
  }
  if (name === 'remember_project_knowledge') {
    const metadata = await remember(root, args.type, args.text, { sources: args.sources || [] });
    return textResult(`Saved ${args.type} project memory as ${metadata.id}.`, metadata);
  }
  if (name === 'scan_project_intelligence') {
    const result = await scanProject(root);
    return textResult(JSON.stringify(result, null, 2), result);
  }
  if (name === 'get_project_memory_status') {
    const result = await status(root);
    return textResult(JSON.stringify(result, null, 2), result);
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
    const result = await refreshMemory(root, args.id || 'all');
    return textResult(`Refreshed ${result.updated} memory entries.`, result);
  }
  throw new Error(`Unknown tool: ${name}`);
}

const tools = [
  {
    name: 'search_project_memory',
    description: 'Find relevant durable project facts, decisions, mistakes, architecture, files, and indexed symbols.',
    inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 20 } } },
  },
  {
    name: 'remember_project_knowledge',
    description: 'Persist a durable fact, architecture decision, or lesson, optionally linked to source files for staleness tracking.',
    inputSchema: { type: 'object', required: ['type','text'], properties: { type: { type: 'string', enum: ['fact','decision','mistake'] }, text: { type: 'string' }, sources: { type: 'array', items: { type: 'string' }, maxItems: 20 } } },
  },
  {
    name: 'scan_project_intelligence',
    description: 'Refresh repository structure, stack, import graph, and symbol intelligence.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_project_memory_status',
    description: 'Inspect memory, graph, index, staleness, and snapshot status.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_project_graph',
    description: 'Return compact import-graph statistics, high-impact files, and external dependencies.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'analyze_project_impact',
    description: 'Find files that depend on a file or symbol before changing it.',
    inputSchema: { type: 'object', required: ['target'], properties: { target: { type: 'string' }, depth: { type: 'integer', minimum: 1, maximum: 8 } } },
  },
  {
    name: 'check_stale_memory',
    description: 'Detect project knowledge that is stale, needs review, or predates metadata tracking.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'refresh_project_memory',
    description: 'Mark one reviewed memory entry, by ID prefix, or all tracked entries as current against source fingerprints.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Memory ID prefix or all.' } } },
  },
];

async function handle(message) {
  const { id, method, params = {} } = message;
  if (method === 'initialize') {
    send({ jsonrpc: '2.0', id, result: { protocolVersion: params.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'codex-memory-intelligence', version: '0.3.0' } } });
    return;
  }
  if (method === 'notifications/initialized') return;
  if (method === 'ping') { send({ jsonrpc: '2.0', id, result: {} }); return; }
  if (method === 'tools/list') { send({ jsonrpc: '2.0', id, result: { tools } }); return; }
  if (method === 'tools/call') {
    try { send({ jsonrpc: '2.0', id, result: await callTool(params.name, params.arguments) }); }
    catch (error) { send({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: error.message }] } }); }
    return;
  }
  if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  Promise.resolve().then(() => handle(JSON.parse(trimmed))).catch((error) => console.error(error));
});
