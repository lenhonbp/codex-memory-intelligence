import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scanProject } from '../src/core.js';
import { findLocalCliEntrypoint } from '../src/local-cli.js';
import { VERSION } from '../src/version.js';

const cli = fileURLToPath(new URL('../src/cli-entry.js', import.meta.url));
const mcp = fileURLToPath(new URL('../src/mcp-entry.js', import.meta.url));
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));

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

async function installLocalPackage(root) {
  const packageRoot = path.join(root, 'node_modules', 'codex-memory-intelligence');
  await fs.mkdir(path.dirname(packageRoot), { recursive: true });
  await fs.cp(path.join(repositoryRoot, 'src'), path.join(packageRoot, 'src'), { recursive: true });
  await fs.copyFile(path.join(repositoryRoot, 'package.json'), path.join(packageRoot, 'package.json'));
  await fs.mkdir(path.join(root, '.no-cmi-path'));
  return path.join(packageRoot, 'src', 'cli-entry.js');
}

function runLocalCli(entrypoint, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entrypoint, ...args], {
      cwd,
      env: { ...process.env, PATH: path.join(cwd, '.no-cmi-path') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => resolve({ code: null, stdout, stderr, error }));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

function runBareCmi(cwd) {
  return new Promise((resolve) => {
    const child = spawn('cmi', ['--version'], {
      cwd,
      env: { ...process.env, PATH: path.join(cwd, '.no-cmi-path') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => resolve({ code: null, stdout, stderr, error }));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
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
  const quotedRoot = JSON.stringify(await fs.realpath(root));
  assert.match(generatedConfig, /\[mcp_servers\.cmi\]/);
  assert.ok(generatedConfig.includes(`args = ["--yes", "--package=codex-memory-intelligence@${VERSION}", "cmi-mcp"]`));
  assert.doesNotMatch(generatedConfig, /"--no"/);
  assert.ok(generatedConfig.includes(`cwd = ${quotedRoot}`));
  assert.ok(generatedConfig.includes(`CMI_PROJECT_ROOT = ${quotedRoot}`));

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

test('activated Codex fallback preserves the durable session and truthful Closing contract when MCP is unavailable', async () => {
  const root = await fixture();
  const activated = await runCli(['activate', '--json'], root);
  assert.equal(activated.code, 0, activated.stderr);
  const activation = JSON.parse(activated.stdout);
  assert.ok(activation.scan.sourceFiles >= 1);
  const agents = await fs.readFile(path.join(root, 'AGENTS.md'), 'utf8');

  for (const status of ['active', 'closed']) {
    const sessions = await runCli(['session', 'list', '--status', status, '--json'], root);
    assert.equal(sessions.code, 0, sessions.stderr);
    assert.deepEqual(JSON.parse(sessions.stdout).records, []);
  }

  assert.match(agents, /local executable fallback.*cmi ambient/i);
  assert.match(agents, /start or resume a durable CMI work session before substantive project work/i);
  assert.match(agents, /cmi session start/i);
  assert.match(agents, /cmi session observe/i);
  assert.match(agents, /cmi session close/i);
  assert.match(agents, /cmi session closing/i);
  assert.match(agents, /only from that actual closed-session Closing Intelligence result/i);
  assert.match(agents, /never synthesize a Closing-style.*CLEAN.*health-only/i);
  assert.match(agents, /Closing Intelligence was not finalized/i);

  const started = await runCli(['session', 'start', 'field-style project health verification', '--json'], root);
  assert.equal(started.code, 0, started.stderr);
  const sessionId = JSON.parse(started.stdout).id;
  const closed = await runCli(['session', 'close', sessionId, '--outcome', 'investigated', '--accomplished', 'Verified project health.', '--json'], root);
  assert.equal(closed.code, 0, closed.stderr);
  const closing = await runCli(['session', 'closing', sessionId, '--json'], root);
  assert.equal(closing.code, 0, closing.stderr);
  assert.equal(JSON.parse(closing.stdout).state, 'clean');
});

test('activated fallback resolves the project-local CLI after a bare PATH miss and preserves full lifecycle', async () => {
  const root = await fixture();
  const entrypoint = await installLocalPackage(root);
  const resolved = await findLocalCliEntrypoint(root);
  assert.equal(resolved.relativeEntrypoint, 'node_modules/codex-memory-intelligence/src/cli-entry.js');
  const activated = await runCli(['activate', '--json'], root);
  assert.equal(activated.code, 0, activated.stderr);
  const agents = await fs.readFile(path.join(root, 'AGENTS.md'), 'utf8');
  assert.match(agents, /local executable fallback for `cmi ambient`/i);
  assert.match(agents, /node "\.\/node_modules\/codex-memory-intelligence\/src\/cli-entry\.js" ambient/);
  assert.match(agents, /a PATH miss is not evidence that CMI is unavailable/i);
  assert.match(agents, /only then report that CMI lifecycle is unavailable/i);

  const bare = await runBareCmi(root);
  assert.equal(bare.error?.code, 'ENOENT');
  const ambient = await runLocalCli(entrypoint, ['ambient', 'Sửa lỗi combat', '--json'], root);
  assert.equal(ambient.code, 0, ambient.stderr);
  assert.equal(JSON.parse(ambient.stdout).classification.intent, 'mutate');

  const started = await runLocalCli(entrypoint, ['session', 'start', 'local fallback lifecycle', '--json'], root);
  assert.equal(started.code, 0, started.stderr);
  const sessionId = JSON.parse(started.stdout).id;
  const observed = await runLocalCli(entrypoint, ['session', 'observe', sessionId, '--accomplished', 'Observed local CLI progress.', '--file', 'src/main.js', '--json'], root);
  assert.equal(observed.code, 0, observed.stderr);
  const closed = await runLocalCli(entrypoint, ['session', 'close', sessionId, '--outcome', 'investigated', '--json'], root);
  assert.equal(closed.code, 0, closed.stderr);
  const closing = await runLocalCli(entrypoint, ['session', 'closing', sessionId, '--json'], root);
  assert.equal(closing.code, 0, closing.stderr);
  assert.equal(JSON.parse(closing.stdout).session.id, sessionId);
});

test('resolved local CLI carries mutation lifecycle while an intentionally incomplete change remains durable', async () => {
  const root = await fixture();
  const entrypoint = await installLocalPackage(root);
  const activated = await runCli(['activate', '--json'], root);
  assert.equal(activated.code, 0, activated.stderr);

  const started = await runLocalCli(entrypoint, ['session', 'start', 'local mutation fallback', '--json'], root);
  const sessionId = JSON.parse(started.stdout).id;
  const change = await runLocalCli(entrypoint, ['change', 'start', 'update local combat behavior', '--json'], root);
  assert.equal(change.code, 0, change.stderr);
  const changeId = JSON.parse(change.stdout).id;
  await fs.writeFile(path.join(root, 'src', 'main.js'), 'export function run() { return false; }\n');
  const changeObservation = await runLocalCli(entrypoint, ['change', 'observe', changeId, '--file', 'src/main.js', '--json'], root);
  assert.equal(changeObservation.code, 0, changeObservation.stderr);
  const sessionObservation = await runLocalCli(entrypoint, ['session', 'observe', sessionId, '--accomplished', 'Observed the incomplete mutation.', '--file', 'src/main.js', '--json'], root);
  assert.equal(sessionObservation.code, 0, sessionObservation.stderr);
  const closed = await runLocalCli(entrypoint, ['session', 'close', sessionId, '--outcome', 'investigated', '--json'], root);
  assert.equal(closed.code, 0, closed.stderr);
  const closing = JSON.parse((await runLocalCli(entrypoint, ['session', 'closing', sessionId, '--json'], root)).stdout);
  assert.ok(closing.alerts.some((alert) => alert.kind === 'unfinished-work'));
  assert.ok(closing.alerts.every((alert) => alert.severity !== 'blocker'));

  const activeChanges = await runLocalCli(entrypoint, ['change', 'list', '--status', 'active', '--json'], root);
  assert.equal(activeChanges.code, 0, activeChanges.stderr);
  assert.equal(JSON.parse(activeChanges.stdout).records.some((record) => record.id === changeId), true);
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
