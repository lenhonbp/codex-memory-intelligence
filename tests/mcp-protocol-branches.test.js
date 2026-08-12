import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scanProject } from '../src/core.js';

const mcp = fileURLToPath(new URL('../src/mcp.js', import.meta.url));

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-mcp-branches-'));
  await fs.writeFile(path.join(root, 'package.json'), '{"name":"mcp-branches","type":"module"}\n');
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'src', 'main.js'), 'export const main = true;\n');
  await scanProject(root);
  return root;
}

function startMcp(root, extraEnv = {}) {
  const child = spawn(process.execPath, [mcp], {
    cwd: root,
    env: { ...process.env, CMI_PROJECT_ROOT: root, ...extraEnv },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
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
      for (const waiter of [...waiters]) {
        if (!waiter.predicate(message)) continue;
        waiter.resolve(message);
        waiters.splice(waiters.indexOf(waiter), 1);
      }
    }
  });
  const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
  const sendRaw = (line) => child.stdin.write(`${line}\n`);
  const waitFor = (predicate, timeout = 5000) => new Promise((resolve, reject) => {
    const existing = messages.find(predicate);
    if (existing) return resolve(existing);
    const waiter = { predicate, resolve: null };
    const timer = setTimeout(() => {
      const index = waiters.indexOf(waiter);
      if (index >= 0) waiters.splice(index, 1);
      reject(new Error('Timed out waiting for MCP branch response.'));
    }, timeout);
    waiter.resolve = (value) => { clearTimeout(timer); resolve(value); };
    waiters.push(waiter);
  });
  return { child, send, sendRaw, waitFor };
}

async function initialize(server) {
  server.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: 'unsupported-version', capabilities: {}, clientInfo: { name: 'branch-test', version: '1' } } });
  const initialized = await server.waitFor((message) => message.id === 1);
  server.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  return initialized;
}

async function stop(server) {
  server.child.stdin.end();
  server.child.kill();
}

test('MCP fails closed for parse errors, invalid requests, lifecycle misuse, and unknown methods', async (t) => {
  const root = await fixture();
  const server = startMcp(root);
  t.after(() => stop(server));

  server.sendRaw('{not-json');
  assert.equal((await server.waitFor((message) => message.error?.code === -32700)).error.message, 'Parse error');

  server.send({ jsonrpc: '2.0', id: 2 });
  assert.equal((await server.waitFor((message) => message.id === 2)).error.code, -32600);

  server.send({ jsonrpc: '2.0', id: 3, method: 'tools/list' });
  assert.equal((await server.waitFor((message) => message.id === 3)).error.code, -32002);

  const initialized = await initialize(server);
  assert.ok(initialized.result.protocolVersion);
  assert.match(initialized.result.instructions, /disabled by default/i);

  server.send({ jsonrpc: '2.0', id: 4, method: 'initialize', params: {} });
  assert.equal((await server.waitFor((message) => message.id === 4)).error.code, -32600);

  server.send({ jsonrpc: '2.0', id: 5, method: 'ping' });
  assert.deepEqual((await server.waitFor((message) => message.id === 5)).result, {});

  server.send({ jsonrpc: '2.0', id: 6, method: 'unknown/method' });
  assert.equal((await server.waitFor((message) => message.id === 6)).error.code, -32601);
});

test('read-only MCP exposes reads while rejecting malformed calls and durable writes', async (t) => {
  const root = await fixture();
  const server = startMcp(root);
  t.after(() => stop(server));
  await initialize(server);

  server.send({ jsonrpc: '2.0', id: 10, method: 'tools/list' });
  const listed = await server.waitFor((message) => message.id === 10);
  assert.ok(listed.result.tools.some((item) => item.name === 'get_repository_baseline'));
  assert.ok(!listed.result.tools.some((item) => item.name === 'start_change_record'));

  server.send({ jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 123, arguments: [] } });
  assert.equal((await server.waitFor((message) => message.id === 11)).error.code, -32602);

  server.send({ jsonrpc: '2.0', id: 12, method: 'tools/call', params: { name: 'start_change_record', arguments: { goal: 'must remain read only' } } });
  const writeRejected = await server.waitFor((message) => message.id === 12);
  assert.equal(writeRejected.result.isError, true);
  assert.match(writeRejected.result.content[0].text, /writes are disabled/i);

  server.send({ jsonrpc: '2.0', id: 13, method: 'tools/call', params: { name: 'definitely_unknown_tool', arguments: {} } });
  const unknownTool = await server.waitFor((message) => message.id === 13);
  assert.equal(unknownTool.result.isError, true);
  assert.match(unknownTool.result.content[0].text, /Unknown tool/i);

  server.send({ jsonrpc: '2.0', id: 14, method: 'tools/call', params: { name: 'get_repository_baseline', arguments: {} } });
  const baseline = await server.waitFor((message) => message.id === 14);
  assert.ok(baseline.result.structuredContent);
});

test('MCP resources and prompts validate identifiers and exercise successful read paths', async (t) => {
  const root = await fixture();
  const server = startMcp(root);
  t.after(() => stop(server));
  await initialize(server);

  server.send({ jsonrpc: '2.0', id: 20, method: 'resources/list' });
  assert.ok((await server.waitFor((message) => message.id === 20)).result.resources.length > 5);

  server.send({ jsonrpc: '2.0', id: 21, method: 'resources/read', params: {} });
  assert.equal((await server.waitFor((message) => message.id === 21)).error.code, -32602);

  for (const [id, uri] of [[22, 'cmi://project/memory'], [23, 'cmi://project/workspaces'], [24, 'cmi://project/graph-summary'], [25, 'cmi://project/baseline'], [26, 'cmi://project/boundaries'], [27, 'cmi://project/change-history'], [28, 'cmi://project/provenance']]) {
    server.send({ jsonrpc: '2.0', id, method: 'resources/read', params: { uri } });
    const response = await server.waitFor((message) => message.id === id);
    assert.equal(response.error, undefined, `${uri}: ${response.error?.message || ''}`);
    assert.equal(response.result.contents[0].uri, uri);
  }

  server.send({ jsonrpc: '2.0', id: 29, method: 'resources/read', params: { uri: 'cmi://project/unknown' } });
  assert.equal((await server.waitFor((message) => message.id === 29)).error.code, -32001);

  server.send({ jsonrpc: '2.0', id: 30, method: 'prompts/list' });
  assert.equal((await server.waitFor((message) => message.id === 30)).result.prompts.length, 3);

  server.send({ jsonrpc: '2.0', id: 31, method: 'prompts/get', params: {} });
  assert.equal((await server.waitFor((message) => message.id === 31)).error.code, -32602);

  server.send({ jsonrpc: '2.0', id: 32, method: 'prompts/get', params: { name: 'prepare_project_change', arguments: {} } });
  assert.equal((await server.waitFor((message) => message.id === 32)).error.code, -32602);

  server.send({ jsonrpc: '2.0', id: 33, method: 'prompts/get', params: { name: 'prepare_project_change', arguments: { target: 'src/main.js', workspace: 'app' } } });
  assert.match((await server.waitFor((message) => message.id === 33)).result.description, /src\/main\.js/);

  server.send({ jsonrpc: '2.0', id: 34, method: 'prompts/get', params: { name: 'run_change_intelligence_loop', arguments: { target: 'src/main.js' } } });
  assert.match((await server.waitFor((message) => message.id === 34)).result.messages[0].content.text, /BEFORE/);

  server.send({ jsonrpc: '2.0', id: 35, method: 'prompts/get', params: { name: 'review_stale_memory', arguments: {} } });
  assert.match((await server.waitFor((message) => message.id === 35)).result.description, /Review project knowledge/i);

  server.send({ jsonrpc: '2.0', id: 36, method: 'prompts/get', params: { name: 'unknown_prompt', arguments: {} } });
  assert.equal((await server.waitFor((message) => message.id === 36)).error.code, -32602);
});
