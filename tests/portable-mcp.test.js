import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { initProject, scanProject } from '../src/core.js';
import { freezePortableEvidence } from '../src/portable-evidence.js';

const mcp = fileURLToPath(new URL('../src/mcp.js', import.meta.url));

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-portable-mcp-'));
  await fs.writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'index.js'), 'export const value = 1;\n');
  await initProject(root);
  await scanProject(root);
  return root;
}

function start(root, writeEnabled = false) {
  const child = spawn(process.execPath, [mcp], { cwd: root, env: { ...process.env, CMI_PROJECT_ROOT: root, CMI_WRITE_ENABLED: writeEnabled ? '1' : '0' }, stdio: ['pipe', 'pipe', 'pipe'] });
  let buffer = '';
  const messages = [];
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
      for (const waiter of [...waiters]) if (waiter.predicate(message)) {
        waiter.resolve(message);
        waiters.splice(waiters.indexOf(waiter), 1);
      }
    }
  });
  return {
    child,
    send(message) { child.stdin.write(`${JSON.stringify(message)}\n`); },
    waitFor(predicate) {
      const existing = messages.find(predicate);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timed out waiting for MCP response.')), 4_000);
        waiters.push({ predicate, resolve: (value) => { clearTimeout(timer); resolve(value); } });
      });
    },
  };
}

async function initialize(server) {
  server.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25' } });
  await server.waitFor((message) => message.id === 1);
  server.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
}

test('read-only MCP exposes provenance and bundle inspection but no hidden mutation', async () => {
  const root = await fixture();
  const server = start(root);
  try {
    await initialize(server);
    server.send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const tools = (await server.waitFor((message) => message.id === 2)).result.tools;
    assert.ok(tools.some((tool) => tool.name === 'get_executable_provenance'));
    assert.ok(tools.some((tool) => tool.name === 'inspect_portable_evidence'));
    assert.ok(!tools.some((tool) => tool.name === 'freeze_portable_evidence'));
    server.send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_executable_provenance', arguments: {} } });
    const provenance = await server.waitFor((message) => message.id === 3);
    assert.equal(provenance.result.structuredContent.kind, 'cmi-executable-provenance');
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-portable-mcp-bundle-'));
    const bundle = await freezePortableEvidence(root, path.join(parent, 'bundle'));
    server.send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'inspect_portable_evidence', arguments: { bundlePath: bundle.path } } });
    assert.equal((await server.waitFor((message) => message.id === 4)).result.structuredContent.state, 'verified');
    server.send({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'freeze_portable_evidence', arguments: { bundlePath: path.join(parent, 'hidden-write') } } });
    const blocked = await server.waitFor((message) => message.id === 5);
    assert.equal(blocked.result.isError, true);
    assert.match(blocked.result.content[0].text, /writes are disabled/i);
  } finally { server.child.stdin.end(); server.child.kill(); }
});
test('write-enabled MCP exposes gated freeze and rebind operations', async () => {
  const root = await fixture();
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-portable-mcp-write-'));
  const server = start(root, true);
  try {
    await initialize(server);
    server.send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const tools = (await server.waitFor((message) => message.id === 2)).result.tools;
    assert.ok(tools.some((tool) => tool.name === 'freeze_portable_evidence'));
    assert.ok(tools.some((tool) => tool.name === 'restore_portable_evidence'));
    assert.ok(tools.some((tool) => tool.name === 'rebind_portable_evidence'));
    server.send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'freeze_portable_evidence', arguments: { bundlePath: path.join(parent, 'bundle') } } });
    const result = await server.waitFor((message) => message.id === 3);
    assert.equal(result.result.structuredContent.authenticated, false);
    assert.equal(result.result.structuredContent.state, 'frozen');
  } finally { server.child.stdin.end(); server.child.kill(); }
});
