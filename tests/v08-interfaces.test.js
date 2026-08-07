import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scanProject, remember } from '../src/core.js';

const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
const mcp = fileURLToPath(new URL('../src/mcp.js', import.meta.url));

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-v08-interface-'));
  await fs.writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'index.js'), 'export const marker = true;\n');
  await scanProject(root);
  return root;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore','pipe','pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

function startMcp(root) {
  const child = spawn(process.execPath, [mcp], { cwd: root, env: { ...process.env, CMI_PROJECT_ROOT: root, CMI_WRITE_ENABLED: '1' }, stdio: ['pipe','pipe','pipe'] });
  const messages = [];
  let buffer = '';
  const waiters = [];
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    while (buffer.includes('\n')) {
      const index = buffer.indexOf('\n');
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      messages.push(message);
      for (const waiter of [...waiters]) if (waiter.predicate(message)) { waiter.resolve(message); waiters.splice(waiters.indexOf(waiter), 1); }
    }
  });
  const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
  const waitFor = (predicate, timeout = 3000) => new Promise((resolve, reject) => {
    const existing = messages.find(predicate);
    if (existing) { resolve(existing); return; }
    const waiter = { predicate, resolve: null };
    const timer = setTimeout(() => {
      const index = waiters.indexOf(waiter);
      if (index >= 0) waiters.splice(index, 1);
      reject(new Error('Timed out waiting for MCP response.'));
    }, timeout);
    waiter.resolve = (value) => { clearTimeout(timer); resolve(value); };
    waiters.push(waiter);
  });
  return { child, send, waitFor };
}

async function initialize(server) {
  server.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'v08-test', version: '1.0.0' } } });
  await server.waitFor((message) => message.id === 1);
  server.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
}

test('CLI exposes reviewed lifecycle mutation and explicit inactive-history retrieval', async () => {
  const root = await fixture();
  const entry = await remember(root, 'fact', 'Lifecycle interface marker.', { sources: ['src/index.js'] });

  let result = await run(process.execPath, [cli, 'memory-state', entry.id.slice(0, 12), 'deprecated', '--reason', 'Replaced during interface test.', '--changed-by', 'cli-test', '--json'], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).state, 'deprecated');

  result = await run(process.execPath, [cli, 'search', 'lifecycle interface marker', '--json'], { cwd: root });
  assert.ok(!JSON.parse(result.stdout).some((item) => item.metadata?.id === entry.id));

  result = await run(process.execPath, [cli, 'search', 'lifecycle interface marker', '--include-inactive', '--stale-policy', 'include', '--json'], { cwd: root });
  const historical = JSON.parse(result.stdout).find((item) => item.metadata?.id === entry.id);
  assert.equal(historical.metadata.knowledgeState, 'deprecated');
});

test('MCP exposes lifecycle controls and observed-command verification provenance end to end', async () => {
  const root = await fixture();
  const server = startMcp(root);
  await initialize(server);

  server.send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  const tools = (await server.waitFor((message) => message.id === 2)).result.tools;
  const lifecycleTool = tools.find((tool) => tool.name === 'set_project_memory_state');
  assert.ok(lifecycleTool);
  const searchTool = tools.find((tool) => tool.name === 'search_project_memory');
  assert.equal(searchTool.inputSchema.properties.includeInactive.type, 'boolean');
  assert.deepEqual(searchTool.inputSchema.properties.stalePolicy.enum, ['demote','include','exclude']);
  const completeTool = tools.find((tool) => tool.name === 'complete_change_record');
  const verification = completeTool.inputSchema.properties.verifications.items;
  assert.deepEqual(verification.properties.provenance.enum, ['reported','observed-command']);
  assert.equal(verification.properties.exitCode.type, 'integer');

  server.send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'remember_project_knowledge', arguments: { type: 'fact', text: 'MCP lifecycle marker.' } } });
  const saved = await server.waitFor((message) => message.id === 3);
  const memoryId = saved.result.structuredContent.id;

  server.send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'set_project_memory_state', arguments: { id: memoryId.slice(0, 12), state: 'rejected', reason: 'Deliberately rejected test knowledge.', changedBy: 'mcp-test' } } });
  assert.equal((await server.waitFor((message) => message.id === 4)).result.structuredContent.state, 'rejected');

  server.send({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'search_project_memory', arguments: { query: 'MCP lifecycle marker' } } });
  assert.ok(!(await server.waitFor((message) => message.id === 5)).result.structuredContent.results.some((item) => item.metadata?.id === memoryId));

  server.send({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'search_project_memory', arguments: { query: 'MCP lifecycle marker', includeInactive: true, stalePolicy: 'include' } } });
  const historical = (await server.waitFor((message) => message.id === 6)).result.structuredContent.results.find((item) => item.metadata?.id === memoryId);
  assert.equal(historical.metadata.knowledgeState, 'rejected');

  server.send({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'start_change_record', arguments: { goal: 'verify MCP provenance path' } } });
  const changeId = (await server.waitFor((message) => message.id === 7)).result.structuredContent.id;
  const observedAt = new Date().toISOString();
  server.send({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'complete_change_record', arguments: { id: changeId, outcome: 'succeeded', files: ['src/index.js'], verifications: [{ name: 'node test', status: 'passed', provenance: 'observed-command', command: 'node --test', exitCode: 0, observedAt, outputDigest: 'sha256:test-digest' }] } } });
  const completed = await server.waitFor((message) => message.id === 8);
  assert.equal(completed.result.structuredContent.completion.verifications[0].provenance, 'observed-command');
  assert.equal(completed.result.structuredContent.completion.verifications[0].command, 'node --test');
  assert.equal(completed.result.structuredContent.completion.verifications[0].exitCode, 0);
  server.child.stdin.end();
});
