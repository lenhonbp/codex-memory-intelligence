import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scanProject } from '../src/core.js';
import { strictInputSchema, validateToolArguments } from '../src/mcp-schema.js';

const coreMcp = fileURLToPath(new URL('../src/mcp.js', import.meta.url));
const publicMcp = fileURLToPath(new URL('../src/mcp-entry.js', import.meta.url));

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-mcp-malformed-'));
  await fs.writeFile(path.join(root, 'package.json'), '{"name":"mcp-malformed","type":"module"}\n');
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'src', 'main.js'), 'export const main = true;\n');
  await scanProject(root);
  return root;
}

function startServer(executable, root, extraEnv = {}) {
  const child = spawn(process.execPath, [executable], {
    cwd: root,
    env: { ...process.env, CMI_PROJECT_ROOT: root, ...extraEnv },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const messages = [];
  const waiters = [];
  let buffer = '';
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
  const waitFor = (predicate, timeout = 5000) => new Promise((resolve, reject) => {
    const existing = messages.find(predicate);
    if (existing) return resolve(existing);
    const waiter = { predicate, resolve: null };
    const timer = setTimeout(() => {
      const index = waiters.indexOf(waiter);
      if (index >= 0) waiters.splice(index, 1);
      reject(new Error('Timed out waiting for MCP malformed-boundary response.'));
    }, timeout);
    waiter.resolve = (value) => { clearTimeout(timer); resolve(value); };
    waiters.push(waiter);
  });
  return { child, send, waitFor };
}

async function initialize(server) {
  server.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'malformed-test', version: '1' } } });
  const response = await server.waitFor((message) => message.id === 1);
  assert.ok(response.result?.protocolVersion, response.error?.message);
  server.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
}

function stop(server) {
  return new Promise((resolve) => {
    const child = server.child;
    if (child.exitCode !== null || child.signalCode !== null) { resolve(); return; }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill();
      finish();
    }, 2000);
    child.once('close', finish);
    child.stdin.end();
  });
}

function assertInvalidParams(response, pattern) {
  assert.equal(response.error?.code, -32602, JSON.stringify(response));
  if (pattern) assert.match(response.error.message, pattern);
}

test('strict MCP schema closes real objects without breaking verification if/then semantics', () => {
  const verification = {
    type: 'object',
    required: ['name', 'status'],
    properties: {
      name: { type: 'string' },
      status: { type: 'string', enum: ['passed', 'failed'] },
      provenance: { type: 'string', enum: ['reported', 'observed-command'] },
      command: { type: 'string' },
      exitCode: { type: 'integer' },
      observedAt: { type: 'string', format: 'date-time' },
    },
    allOf: [{ if: { properties: { provenance: { const: 'observed-command' } }, required: ['provenance'] }, then: { required: ['command', 'exitCode', 'observedAt'] } }],
  };
  const schema = strictInputSchema({ type: 'object', properties: { verifications: { type: 'array', items: verification } } });
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.verifications.items.additionalProperties, false);
  assert.equal(schema.properties.verifications.items.allOf[0].if.additionalProperties, undefined);

  assert.doesNotThrow(() => validateToolArguments(schema, { verifications: [{ name: 'tests', status: 'passed', provenance: 'reported' }] }));
  assert.throws(
    () => validateToolArguments(schema, { verifications: [{ name: 'tests', status: 'passed', provenance: 'observed-command' }] }),
    /command is required/i,
  );
  assert.throws(
    () => validateToolArguments(schema, { verifications: [{ name: 'tests', status: 'passed', unexpected: true }] }),
    /unexpected is not allowed/i,
  );
});

test('core MCP advertises closed schemas and rejects malformed arguments before business logic', async (t) => {
  const root = await fixture();
  const server = startServer(coreMcp, root);
  t.after(() => stop(server));
  await initialize(server);

  server.send({ jsonrpc: '2.0', id: 10, method: 'tools/list' });
  const listed = await server.waitFor((message) => message.id === 10);
  const baselineTool = listed.result.tools.find((tool) => tool.name === 'get_repository_baseline');
  assert.equal(baselineTool.inputSchema.additionalProperties, false);

  server.send({ jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'get_repository_baseline', arguments: { unexpected: true } } });
  assertInvalidParams(await server.waitFor((message) => message.id === 11), /arguments\.unexpected is not allowed/i);

  server.send({ jsonrpc: '2.0', id: 12, method: 'tools/call', params: { name: 'search_project_memory', arguments: null } });
  assertInvalidParams(await server.waitFor((message) => message.id === 12), /Invalid tool parameters/i);

  server.send({ jsonrpc: '2.0', id: 13, method: 'tools/call', params: { name: 'search_project_memory', arguments: { query: 'main', limit: '5' } } });
  assertInvalidParams(await server.waitFor((message) => message.id === 13), /arguments\.limit must be integer/i);

  server.send({ jsonrpc: '2.0', id: 14, method: 'tools/call', params: { name: 'search_project_memory', arguments: { query: 'main', limit: 31 } } });
  assertInvalidParams(await server.waitFor((message) => message.id === 14), /arguments\.limit must be <= 30/i);

  server.send({ jsonrpc: '2.0', id: 15, method: 'tools/call', params: { name: 'search_project_memory', arguments: { query: 'main', limit: 1 } } });
  const valid = await server.waitFor((message) => message.id === 15);
  assert.equal(valid.error, undefined, JSON.stringify(valid.error));
  assert.ok(valid.result?.structuredContent);
});

test('core MCP enforces nested observed-command verification requirements before record lookup', async (t) => {
  const root = await fixture();
  const server = startServer(coreMcp, root, { CMI_WRITE_ENABLED: '1' });
  t.after(() => stop(server));
  await initialize(server);

  server.send({ jsonrpc: '2.0', id: 20, method: 'tools/call', params: { name: 'complete_change_record', arguments: {
    id: 'does-not-exist',
    verifications: [{ name: 'tests', status: 'passed', provenance: 'observed-command' }],
  } } });
  assertInvalidParams(await server.waitFor((message) => message.id === 20), /command is required/i);

  server.send({ jsonrpc: '2.0', id: 21, method: 'tools/call', params: { name: 'complete_change_record', arguments: {
    id: 'does-not-exist',
    verifications: [{ name: 'tests', status: 'passed', unexpected: true }],
  } } });
  assertInvalidParams(await server.waitFor((message) => message.id === 21), /unexpected is not allowed/i);
});

test('public MCP adapter rejects malformed local tool arguments and advertises the same closed boundary', async (t) => {
  const root = await fixture();
  const server = startServer(publicMcp, root, { CMI_WRITE_ENABLED: '1' });
  t.after(() => stop(server));
  await initialize(server);

  server.send({ jsonrpc: '2.0', id: 30, method: 'tools/list' });
  const listed = await server.waitFor((message) => message.id === 30);
  const sessionTool = listed.result.tools.find((tool) => tool.name === 'start_work_session');
  assert.equal(sessionTool.inputSchema.additionalProperties, false);

  for (const [id, args] of [[31, null], [32, []], [33, 'wrong-shape']]) {
    server.send({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'start_work_session', arguments: args } });
    assertInvalidParams(await server.waitFor((message) => message.id === id), /Invalid tool parameters/i);
  }

  server.send({ jsonrpc: '2.0', id: 34, method: 'tools/call', params: { name: 'start_work_session', arguments: { goal: 42 } } });
  assertInvalidParams(await server.waitFor((message) => message.id === 34), /arguments\.goal must be string/i);

  server.send({ jsonrpc: '2.0', id: 35, method: 'tools/call', params: { name: 'start_work_session', arguments: { goal: '' } } });
  assertInvalidParams(await server.waitFor((message) => message.id === 35), /at least 1 character/i);

  server.send({ jsonrpc: '2.0', id: 36, method: 'tools/call', params: { name: 'start_work_session', arguments: { goal: 'must not start', unexpected: true } } });
  assertInvalidParams(await server.waitFor((message) => message.id === 36), /arguments\.unexpected is not allowed/i);

  server.send({ jsonrpc: '2.0', id: 37, method: 'tools/call', params: { name: 'list_work_sessions', arguments: {} } });
  const sessions = await server.waitFor((message) => message.id === 37);
  assert.deepEqual(sessions.result.structuredContent.records, []);

  server.send({ jsonrpc: '2.0', id: 38, method: 'tools/call', params: { name: 'start_work_session', arguments: { goal: 'valid boundary request' } } });
  const started = await server.waitFor((message) => message.id === 38);
  assert.equal(started.error, undefined, JSON.stringify(started.error));
  assert.ok(started.result?.structuredContent?.id);
});
