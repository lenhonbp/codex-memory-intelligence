#!/usr/bin/env node
import path from 'node:path';
import { searchMemory, formatResults } from './search.js';
import { remember, scanProject, status } from './core.js';

const root = path.resolve(process.env.CMI_PROJECT_ROOT || process.cwd());
let buffer = Buffer.alloc(0);

function send(message) {
  const body = Buffer.from(JSON.stringify(message));
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}

async function callTool(name, args = {}) {
  if (name === 'search_project_memory') {
    const results = await searchMemory(root, args.query || '', args.limit || 6);
    return { content: [{ type: 'text', text: formatResults(results) }], structuredContent: { results } };
  }
  if (name === 'remember_project_knowledge') {
    await remember(root, args.type, args.text);
    return { content: [{ type: 'text', text: `Saved ${args.type} project memory.` }] };
  }
  if (name === 'scan_project_intelligence') {
    const result = await scanProject(root);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], structuredContent: result };
  }
  if (name === 'get_project_memory_status') {
    const result = await status(root);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], structuredContent: result };
  }
  throw new Error(`Unknown tool: ${name}`);
}

async function handle(message) {
  const { id, method, params = {} } = message;
  if (method === 'initialize') {
    return send({ jsonrpc: '2.0', id, result: { protocolVersion: params.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'codex-memory-intelligence', version: '0.2.0' } } });
  }
  if (method === 'notifications/initialized') return;
  if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} });
  if (method === 'tools/list') {
    return send({ jsonrpc: '2.0', id, result: { tools: [
      { name: 'search_project_memory', description: 'Find relevant durable project facts, decisions, mistakes and architecture.', inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 20 } } } },
      { name: 'remember_project_knowledge', description: 'Persist a durable fact, architecture decision, or lesson.', inputSchema: { type: 'object', required: ['type','text'], properties: { type: { type: 'string', enum: ['fact','decision','mistake'] }, text: { type: 'string' } } } },
      { name: 'scan_project_intelligence', description: 'Refresh repository structure and stack intelligence.', inputSchema: { type: 'object', properties: {} } },
      { name: 'get_project_memory_status', description: 'Inspect memory initialization, index and snapshot status.', inputSchema: { type: 'object', properties: {} } }
    ] } });
  }
  if (method === 'tools/call') {
    try { return send({ jsonrpc: '2.0', id, result: await callTool(params.name, params.arguments) }); }
    catch (error) { return send({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: error.message }] } }); }
  }
  if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
}

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    const boundary = buffer.indexOf('\r\n\r\n');
    if (boundary < 0) break;
    const headers = buffer.subarray(0, boundary).toString();
    const match = headers.match(/Content-Length:\s*(\d+)/i);
    if (!match) { buffer = buffer.subarray(boundary + 4); continue; }
    const length = Number(match[1]);
    const start = boundary + 4;
    if (buffer.length < start + length) break;
    const body = buffer.subarray(start, start + length).toString();
    buffer = buffer.subarray(start + length);
    Promise.resolve().then(() => handle(JSON.parse(body))).catch((error) => console.error(error));
  }
});
