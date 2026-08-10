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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-closing-mcp-'));
  await fs.writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'src', 'worker.js'), 'export function run() { return true; }\n');
  await scanProject(root);
  return root;
}
function startMcp(root, env = {}) {
  const child = spawn(process.execPath, [mcp], { cwd: root, env: { ...process.env, CMI_PROJECT_ROOT: root, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  const messages = []; let buffer = ''; const waiters = [];
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    while (buffer.includes('\n')) {
      const index = buffer.indexOf('\n'); const line = buffer.slice(0, index).trim(); buffer = buffer.slice(index + 1);
      if (!line) continue;
      const message = JSON.parse(line); messages.push(message);
      for (const waiter of [...waiters]) if (waiter.predicate(message)) { waiter.resolve(message); waiters.splice(waiters.indexOf(waiter), 1); }
    }
  });
  const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
  const waitFor = (predicate, timeout = 5000) => new Promise((resolve, reject) => {
    const existing = messages.find(predicate); if (existing) return resolve(existing);
    const waiter = { predicate, resolve: null };
    const timer = setTimeout(() => { const index = waiters.indexOf(waiter); if (index >= 0) waiters.splice(index, 1); reject(new Error('Timed out waiting for closing MCP response.')); }, timeout);
    waiter.resolve = (value) => { clearTimeout(timer); resolve(value); }; waiters.push(waiter);
  });
  return { child, send, waitFor };
}
async function initialize(server) {
  server.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'closing-test', version: '1' } } });
  const response = await server.waitFor((message) => message.id === 1);
  server.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  return response;
}
function stop(server) { server.child.stdin.end(); server.child.kill(); }

test('MCP exposes read-only Closing Intelligence and finalize returns branded closing output', async () => {
  const root = await fixture();
  const server = startMcp(root, { CMI_WRITE_ENABLED: '1' });
  try {
    const init = await initialize(server);
    assert.match(init.result.instructions, /CMI Intelligence/i);
    server.send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    const tools = (await server.waitFor((message) => message.id === 2)).result.tools;
    assert.ok(tools.some((item) => item.name === 'get_closing_intelligence'));
    server.send({ jsonrpc: '2.0', id: 3, method: 'resources/list', params: {} });
    const resources = (await server.waitFor((message) => message.id === 3)).result.resources;
    assert.ok(resources.some((item) => item.uri === 'cmi://project/closing-intelligence/latest'));
    server.send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'start_work_session', arguments: { goal: 'inspect worker reliability' } } });
    const started = await server.waitFor((message) => message.id === 4);
    const id = started.result.structuredContent.id;
    server.send({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'finalize_work_session', arguments: { id, blockers: ['Retry ownership is unresolved.'] } } });
    const finalized = await server.waitFor((message) => message.id === 5);
    assert.match(finalized.result.content[0].text, /### CMI Intelligence/);
    assert.match(finalized.result.content[0].text, /BLOCKER/);
    assert.equal(finalized.result.structuredContent.closingIntelligence.state, 'blocker');
    server.send({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'get_closing_intelligence', arguments: { id } } });
    const closing = await server.waitFor((message) => message.id === 6);
    assert.equal(closing.result.structuredContent.state, 'blocker');
    assert.equal(closing.result.structuredContent.alerts.length, finalized.result.structuredContent.closingIntelligence.alerts.length);
  } finally { stop(server); }
});

test('MCP preserves partial Change progress as active across session close, then permits completion', async () => {
  const root = await fixture();
  const server = startMcp(root, { CMI_WRITE_ENABLED: '1' });
  try {
    await initialize(server);
    const call = (id, name, args) => {
      server.send({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
      return server.waitFor((message) => message.id === id);
    };
    const session = await call(10, 'start_work_session', { goal: 'implement worker checkpoint' });
    const sessionId = session.result.structuredContent.id;
    const change = await call(11, 'start_change_record', { goal: 'worker checkpoint implementation' });
    const changeId = change.result.structuredContent.id;
    await call(12, 'observe_change_record', { id: changeId, files: ['src/worker.js'] });
    const partial = await call(13, 'complete_change_record', { id: changeId, outcome: 'partial', files: ['src/worker.js'], verifications: [{ name: 'worker unit', status: 'passed' }] });
    assert.equal(partial.result.structuredContent.status, 'active');
    assert.equal(partial.result.structuredContent.progress.outcome, 'partial');
    const finalized = await call(14, 'finalize_work_session', { id: sessionId, outcome: 'partial', notes: ['Paused before final integration for review.'] });
    const handoff = finalized.result.structuredContent.close.handoff;
    assert.ok(handoff.activeChanges.some((item) => item.id === changeId));
    assert.ok(!handoff.completedChanges.some((item) => item.id === changeId));
    const completed = await call(15, 'complete_change_record', { id: changeId, outcome: 'succeeded', verifications: [{ name: 'worker integration', status: 'passed' }] });
    assert.equal(completed.result.structuredContent.status, 'completed');
    assert.equal(completed.result.structuredContent.completion.outcome, 'succeeded');
  } finally { stop(server); }
});
