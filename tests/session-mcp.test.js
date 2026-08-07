import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scanProject } from '../src/core.js';

const mcp = fileURLToPath(new URL('../src/mcp-entry.js', import.meta.url));

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-session-mcp-'));
  await fs.writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'src', 'worker.js'), 'export function run() { return true; }\n');
  await scanProject(root);
  return root;
}

function startMcp(root, env = {}) {
  const child = spawn(process.execPath, [mcp], { cwd: root, env: { ...process.env, CMI_PROJECT_ROOT: root, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
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
  const waitFor = (predicate, timeout = 5000) => new Promise((resolve, reject) => {
    const existing = messages.find(predicate);
    if (existing) { resolve(existing); return; }
    const waiter = { predicate, resolve: null };
    const timer = setTimeout(() => {
      const index = waiters.indexOf(waiter);
      if (index >= 0) waiters.splice(index, 1);
      reject(new Error('Timed out waiting for session MCP response.'));
    }, timeout);
    waiter.resolve = (value) => { clearTimeout(timer); resolve(value); };
    waiters.push(waiter);
  });
  return { child, send, waitFor };
}

async function initialize(server) {
  server.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'session-test', version: '1.0.0' } } });
  const response = await server.waitFor((message) => message.id === 1);
  server.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  return response;
}

function stop(server) {
  server.child.stdin.end();
  server.child.kill();
}

test('read-only MCP advertises continuation intelligence without exposing session mutations', async () => {
  const root = await fixture();
  const server = startMcp(root);
  try {
    const init = await initialize(server);
    assert.match(init.result.instructions, /next action/i);
    server.send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    const tools = (await server.waitFor((message) => message.id === 2)).result.tools;
    assert.ok(tools.some((tool) => tool.name === 'get_work_session_report'));
    assert.ok(tools.some((tool) => tool.name === 'list_project_findings'));
    assert.ok(!tools.some((tool) => tool.name === 'start_work_session'));
    server.send({ jsonrpc: '2.0', id: 3, method: 'resources/list', params: {} });
    const resources = (await server.waitFor((message) => message.id === 3)).result.resources;
    assert.ok(resources.some((item) => item.uri === 'cmi://project/session-handoff/latest'));
    assert.ok(resources.some((item) => item.uri === 'cmi://project/findings'));
    server.send({ jsonrpc: '2.0', id: 4, method: 'prompts/list', params: {} });
    const prompts = (await server.waitFor((message) => message.id === 4)).result.prompts;
    assert.ok(prompts.some((item) => item.name === 'close_project_session'));
    assert.ok(prompts.some((item) => item.name === 'continue_from_session_handoff'));
  } finally { stop(server); }
});

test('write-enabled MCP closes a session with a persistent blocker and explicit P0 next action', async () => {
  const root = await fixture();
  const server = startMcp(root, { CMI_WRITE_ENABLED: '1' });
  try {
    await initialize(server);
    server.send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    const tools = (await server.waitFor((message) => message.id === 2)).result.tools;
    assert.ok(tools.some((tool) => tool.name === 'start_work_session'));
    assert.ok(tools.some((tool) => tool.name === 'finalize_work_session'));

    server.send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'start_work_session', arguments: { goal: 'inspect worker reliability' } } });
    const started = await server.waitFor((message) => message.id === 3);
    const sessionId = started.result.structuredContent.id;
    assert.equal(started.result.structuredContent.status, 'active');

    server.send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'finalize_work_session', arguments: { id: sessionId, blockers: ['Worker retry ownership is unresolved.'] } } });
    const closed = await server.waitFor((message) => message.id === 4);
    assert.equal(closed.result.structuredContent.close.outcome, 'blocked');
    assert.equal(closed.result.structuredContent.close.handoff.nextAction.priority, 'P0');
    assert.match(closed.result.content[0].text, /Recommended next actions/i);

    server.send({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'list_project_findings', arguments: { state: 'open' } } });
    const findings = await server.waitFor((message) => message.id === 5);
    assert.ok(findings.result.structuredContent.findings.some((item) => item.category === 'session-blocker'));

    server.send({ jsonrpc: '2.0', id: 6, method: 'resources/read', params: { uri: 'cmi://project/session-handoff/latest' } });
    const handoff = JSON.parse((await server.waitFor((message) => message.id === 6)).result.contents[0].text);
    assert.equal(handoff.nextAction.priority, 'P0');

    server.send({ jsonrpc: '2.0', id: 7, method: 'prompts/get', params: { name: 'close_project_session', arguments: {} } });
    assert.match((await server.waitFor((message) => message.id === 7)).result.messages[0].content.text, /without waiting.*ask what to do next/i);
  } finally { stop(server); }
});
