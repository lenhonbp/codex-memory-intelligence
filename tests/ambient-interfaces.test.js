import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scanProject } from '../src/core.js';

const cli = fileURLToPath(new URL('../src/cli-entry.js', import.meta.url));
const mcp = fileURLToPath(new URL('../src/mcp-entry.js', import.meta.url));

async function fixture(prefix = 'cmi-ambient-interface-') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  await fs.writeFile(path.join(root, 'package.json'), '{"name":"ambient-interface","type":"module"}\n');
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'src', 'main.js'), 'export function run() { return true; }\n');
  return root;
}

function runCli(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

function startMcp(root) {
  const child = spawn(process.execPath, [mcp], {
    cwd: root,
    env: { ...process.env, CMI_PROJECT_ROOT: root },
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
  const waitFor = (predicate, timeout = 5000) => new Promise((resolve, reject) => {
    const existing = messages.find(predicate);
    if (existing) { resolve(existing); return; }
    const waiter = { predicate, resolve: null };
    const timer = setTimeout(() => {
      const index = waiters.indexOf(waiter);
      if (index >= 0) waiters.splice(index, 1);
      reject(new Error('Timed out waiting for ambient MCP response.'));
    }, timeout);
    waiter.resolve = (value) => { clearTimeout(timer); resolve(value); };
    waiters.push(waiter);
  });
  return { child, send, waitFor };
}

async function initialize(server) {
  server.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'ambient-interface-test', version: '1.0.0' } } });
  const response = await server.waitFor((message) => message.id === 1);
  server.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  return response;
}

function stopMcp(server) {
  server.child.stdin.end();
  server.child.kill();
}

test('CLI activate configures Codex once and CLI ambient accepts a terse user request', async () => {
  const root = await fixture();
  const activated = await runCli(['activate', '--json'], root);
  assert.equal(activated.code, 0, activated.stderr);
  const activation = JSON.parse(activated.stdout);
  assert.equal(activation.activated, true);
  assert.equal(activation.agent, 'codex');
  assert.match(await fs.readFile(path.join(root, 'AGENTS.md'), 'utf8'), /CMI ambient project intelligence/);
  const generatedConfig = await fs.readFile(path.join(root, '.codex', 'config.toml'), 'utf8');
  assert.match(generatedConfig, /\[mcp_servers\.cmi\]/);
  assert.match(generatedConfig, /--package=codex-memory-intelligence/);
  assert.match(generatedConfig, /"--no"/);
  assert.doesNotMatch(generatedConfig, /--no-install/);

  const agentsBefore = await fs.readFile(path.join(root, 'AGENTS.md'), 'utf8');
  const configBefore = generatedConfig;
  const activatedAgain = await runCli(['activate', '--json'], root);
  assert.equal(activatedAgain.code, 0, activatedAgain.stderr);
  assert.equal(await fs.readFile(path.join(root, 'AGENTS.md'), 'utf8'), agentsBefore);
  assert.equal(await fs.readFile(path.join(root, '.codex', 'config.toml'), 'utf8'), configBefore);

  const ambient = await runCli(['ambient', 'Sửa lỗi combat', '--json'], root);
  assert.equal(ambient.code, 0, ambient.stderr);
  const brief = JSON.parse(ambient.stdout);
  assert.equal(brief.request, 'Sửa lỗi combat');
  assert.equal(brief.classification.intent, 'mutate');
  assert.ok(brief.workflow.some((item) => /Change Intelligence/i.test(item)));
});

test('CLI activation fails closed on unmanaged conflicting Codex CMI configuration', async () => {
  const root = await fixture();
  await fs.mkdir(path.join(root, '.codex'));
  const existing = '[mcp_servers.cmi]\ncommand = "custom-cmi"\n';
  await fs.writeFile(path.join(root, '.codex', 'config.toml'), existing);
  const result = await runCli(['activate', '--json'], root);
  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
  const error = JSON.parse(result.stderr);
  assert.equal(error.ok, false);
  assert.match(error.error.message, /unmanaged.*mcp_servers\.cmi/i);
  assert.equal(await fs.readFile(path.join(root, '.codex', 'config.toml'), 'utf8'), existing);
});

test('read-only MCP advertises and executes ambient task briefing for terse prompts', async () => {
  const root = await fixture();
  await scanProject(root);
  const server = startMcp(root);
  try {
    const initialized = await initialize(server);
    assert.match(initialized.result.instructions, /ambient project intelligence/i);
    assert.match(initialized.result.instructions, /terse user requests/i);

    server.send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    const tools = (await server.waitFor((message) => message.id === 2)).result.tools;
    const ambientTool = tools.find((tool) => tool.name === 'get_ambient_task_brief');
    assert.ok(ambientTool);
    assert.equal(ambientTool.annotations.readOnlyHint, true);

    server.send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_ambient_task_brief', arguments: { request: 'Làm tiếp đi' } } });
    const response = await server.waitFor((message) => message.id === 3);
    assert.equal(response.result.structuredContent.request, 'Làm tiếp đi');
    assert.equal(response.result.structuredContent.classification.intent, 'continue');
    assert.ok(response.result.structuredContent.workflow.some((item) => /handoff/i.test(item)));
  } finally {
    stopMcp(server);
  }
});
