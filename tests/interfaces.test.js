import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
const mcp = fileURLToPath(new URL('../src/mcp.js', import.meta.url));

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-interface-'));
  await fs.writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'src', 'db.js'), 'export function migrate() { return true; }\n');
  await fs.writeFile(path.join(root, 'src', 'index.js'), "import { migrate } from './db.js';\nmigrate();\n");
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

function startMcp(root, env = {}) {
  const child = spawn(process.execPath, [mcp], { cwd: root, env: { ...process.env, CMI_PROJECT_ROOT: root, ...env }, stdio: ['pipe','pipe','pipe'] });
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
  const send = (message) => child.stdin.write(`${typeof message === 'string' ? message : JSON.stringify(message)}\n`);
  const waitFor = (predicate, timeout = 3000) => new Promise((resolve, reject) => {
    const existing = messages.find(predicate);
    if (existing) { resolve(existing); return; }
    const waiter = { predicate, resolve };
    waiters.push(waiter);
    const timer = setTimeout(() => {
      const index = waiters.indexOf(waiter);
      if (index >= 0) waiters.splice(index, 1);
      reject(new Error('Timed out waiting for MCP response.'));
    }, timeout);
    waiter.resolve = (value) => { clearTimeout(timer); resolve(value); };
  });
  return { child, messages, send, waitFor };
}

async function initialize(server, version = '2025-11-25') {
  server.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: version, capabilities: {}, clientInfo: { name: 'test-client', version: '1.0.0' } } });
  const initialized = await server.waitFor((message) => message.id === 1);
  server.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  return initialized;
}

test('CLI exposes v0.5 incremental, workspace, advisory, ignore, and version workflows', async () => {
  const root = await fixture();
  let result = await run(process.execPath, [cli, '--version'], { cwd: root });
  assert.equal(result.stdout.trim(), '0.5.0');
  result = await run(process.execPath, [cli, 'scan', '--json'], { cwd: root });
  assert.equal(result.code, 0);
  assert.equal(JSON.parse(result.stdout).graph.parsedFiles, 2);
  result = await run(process.execPath, [cli, 'scan', '--json'], { cwd: root });
  assert.equal(JSON.parse(result.stdout).graph.reusedFiles, 2);
  result = await run(process.execPath, [cli, 'workspaces', '--json'], { cwd: root });
  assert.equal(JSON.parse(result.stdout).count, 1);
  result = await run(process.execPath, [cli, 'boundaries', '--json'], { cwd: root });
  assert.equal(JSON.parse(result.stdout).available, true);
  result = await run(process.execPath, [cli, 'prepare', 'change migrate flow', '--json'], { cwd: root });
  assert.equal(JSON.parse(result.stdout).ready, true);
  result = await run(process.execPath, [cli, 'memory-gaps', 'change migrate flow', '--json'], { cwd: root });
  assert.ok(JSON.parse(result.stdout).suggestions.every((item) => item.status === 'proposal'));
  result = await run(process.execPath, [cli, 'explain-ignore', 'node_modules', '--directory', '--json'], { cwd: root });
  assert.equal(JSON.parse(result.stdout).ignored, true);
});

test('MCP negotiates stable versions and exposes tools, resources, and prompts', async () => {
  const root = await fixture();
  const server = startMcp(root);
  server.send({ jsonrpc: '2.0', id: 99, method: 'tools/list', params: {} });
  assert.equal((await server.waitFor((message) => message.id === 99)).error.code, -32002);
  const initialized = await initialize(server, '2025-11-25');
  assert.equal(initialized.result.protocolVersion, '2025-11-25');
  assert.ok(initialized.result.capabilities.resources);
  assert.ok(initialized.result.capabilities.prompts);
  server.send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  const tools = await server.waitFor((message) => message.id === 2);
  assert.ok(tools.result.tools.some((tool) => tool.name === 'build_project_context'));
  assert.ok(tools.result.tools.some((tool) => tool.name === 'list_project_workspaces'));
  assert.ok(tools.result.tools.some((tool) => tool.name === 'get_repository_baseline'));
  assert.ok(tools.result.tools.some((tool) => tool.name === 'map_project_boundaries'));
  assert.ok(tools.result.tools.some((tool) => tool.name === 'suggest_project_memory'));
  assert.ok(tools.result.tools.some((tool) => tool.name === 'prepare_change_brief'));
  assert.ok(!tools.result.tools.some((tool) => tool.name === 'remember_project_knowledge'));
  server.send({ jsonrpc: '2.0', id: 3, method: 'resources/list', params: {} });
  const resources = await server.waitFor((message) => message.id === 3);
  assert.ok(resources.result.resources.some((resource) => resource.uri === 'cmi://project/architecture'));
  assert.ok(resources.result.resources.some((resource) => resource.uri === 'cmi://project/baseline'));
  assert.ok(resources.result.resources.some((resource) => resource.uri === 'cmi://project/boundaries'));
  server.send({ jsonrpc: '2.0', id: 4, method: 'prompts/list', params: {} });
  const prompts = await server.waitFor((message) => message.id === 4);
  assert.ok(prompts.result.prompts.some((prompt) => prompt.name === 'prepare_project_change'));
  server.send({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'scan_project_intelligence', arguments: {} } });
  assert.equal((await server.waitFor((message) => message.id === 5)).result.structuredContent.graph.parsedFiles, 2);
  server.send({ jsonrpc: '2.0', id: 6, method: 'resources/read', params: { uri: 'cmi://project/architecture' } });
  assert.match((await server.waitFor((message) => message.id === 6)).result.contents[0].text, /Project Architecture/);
  server.send({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'prepare_change_brief', arguments: { query: 'change migrate flow' } } });
  const brief = await server.waitFor((message) => message.id === 7);
  assert.equal(brief.result.structuredContent.ready, true);
  assert.ok(Array.isArray(brief.result.structuredContent.risks));
  server.child.stdin.end();
});

test('MCP reports parse errors, negotiates fallback, and supports opt-in writes', async () => {
  const root = await fixture();
  const server = startMcp(root, { CMI_WRITE_ENABLED: '1' });
  server.send('{bad json');
  assert.equal((await server.waitFor((message) => message.error?.code === -32700)).error.code, -32700);
  const initialized = await initialize(server, '2099-01-01');
  assert.equal(initialized.result.protocolVersion, '2025-11-25');
  server.send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  assert.ok((await server.waitFor((message) => message.id === 2)).result.tools.some((tool) => tool.name === 'remember_project_knowledge'));
  server.send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'remember_project_knowledge', arguments: { type: 'fact', text: 'MCP writes are explicitly enabled.' } } });
  assert.equal((await server.waitFor((message) => message.id === 3)).result.isError, undefined);
  server.send({ jsonrpc: '2.0', id: 4, method: 'prompts/get', params: { name: 'prepare_project_change', arguments: { target: 'migrate' } } });
  assert.match((await server.waitFor((message) => message.id === 4)).result.messages[0].content.text, /prepare_change_brief/i);
  server.child.stdin.end();
});
