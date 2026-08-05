import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(projectRoot, 'src', 'cli.js');
const mcpPath = path.join(projectRoot, 'src', 'mcp.js');

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-interface-'));
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  await fs.writeFile(path.join(root, 'src', 'shared.js'), 'export function shared() { return 1; }\n');
  await fs.writeFile(path.join(root, 'src', 'index.js'), "import { shared } from './shared.js';\nshared();\n");
  return root;
}

function mcpClient(root, env = {}) {
  const child = spawn(process.execPath, [mcpPath], { cwd: root, env: { ...process.env, CMI_PROJECT_ROOT: root, ...env }, stdio: ['pipe','pipe','pipe'] });
  let buffer = '';
  const pending = new Map();
  const unsolicited = [];
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    while (buffer.includes('\n')) {
      const index = buffer.indexOf('\n');
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      const resolver = pending.get(message.id);
      if (resolver) { resolver(message); pending.delete(message.id); }
      else unsolicited.push(message);
    }
  });
  const request = (id, method, params = {}) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`MCP timeout for ${method}`)), 3_000);
    pending.set(id, (message) => { clearTimeout(timer); resolve(message); });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
  return {
    child,
    request,
    notify: (method, params = {}) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`),
    raw: (line) => child.stdin.write(`${line}\n`),
    unsolicited,
  };
}

test('CLI scans, records source-linked memory, reports impact, and exposes version', async () => {
  const root = await fixture();
  assert.equal((await exec(process.execPath, [cliPath, '--version'], { cwd: root })).stdout.trim(), '0.4.0');
  const scan = JSON.parse((await exec(process.execPath, [cliPath, 'scan', '--json'], { cwd: root })).stdout);
  assert.equal(scan.graph.localEdges, 1);
  assert.match((await exec(process.execPath, [cliPath, 'remember', 'decision', 'Shared API remains stable.', '--source', 'src/shared.js'], { cwd: root })).stdout, /Memory updated/);
  const impact = JSON.parse((await exec(process.execPath, [cliPath, 'impact', 'shared', '--json'], { cwd: root })).stdout);
  assert.ok(impact.directDependents.includes('src/index.js'));
  const doctor = JSON.parse((await exec(process.execPath, [cliPath, 'doctor', '--json'], { cwd: root })).stdout);
  assert.equal(doctor.healthy, true);
});

test('MCP enforces lifecycle and defaults to read-only tools', async (context) => {
  const root = await fixture();
  await exec(process.execPath, [cliPath, 'scan'], { cwd: root });
  const client = mcpClient(root);
  context.after(() => client.child.kill());
  const early = await client.request(1, 'tools/list');
  assert.equal(early.error.code, -32002);
  const initialized = await client.request(2, 'initialize', { protocolVersion: '2099-01-01' });
  assert.equal(initialized.result.protocolVersion, '2025-06-18');
  client.notify('notifications/initialized');
  const listed = await client.request(3, 'tools/list');
  const names = listed.result.tools.map((tool) => tool.name);
  assert.ok(names.includes('analyze_project_impact'));
  assert.ok(!names.includes('remember_project_knowledge'));
  const writeAttempt = await client.request(4, 'tools/call', { name: 'remember_project_knowledge', arguments: { type: 'fact', text: 'No.' } });
  assert.equal(writeAttempt.result.isError, true);
});

test('MCP reports JSON parse errors and supports opt-in writes', async (context) => {
  const root = await fixture();
  await exec(process.execPath, [cliPath, 'scan'], { cwd: root });
  const client = mcpClient(root, { CMI_WRITE_ENABLED: '1' });
  context.after(() => client.child.kill());
  client.raw('{bad json');
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(client.unsolicited[0].error.code, -32700);
  await client.request(1, 'initialize', { protocolVersion: '2025-06-18' });
  client.notify('notifications/initialized');
  const listed = await client.request(2, 'tools/list');
  assert.ok(listed.result.tools.some((tool) => tool.name === 'remember_project_knowledge'));
  const saved = await client.request(3, 'tools/call', { name: 'remember_project_knowledge', arguments: { type: 'fact', text: 'Shared module is stable.', sources: ['src/shared.js'] } });
  assert.ok(saved.result.structuredContent.id);
  const bulk = await client.request(4, 'tools/call', { name: 'refresh_project_memory', arguments: { id: 'all' } });
  assert.equal(bulk.result.isError, true);
});
