import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scanProject } from '../src/core.js';
import { freezePortableEvidence, inspectPortableEvidence, restorePortableEvidence } from '../src/portable-evidence.js';
import { formatClosingIntelligence } from '../src/closing-intelligence.js';

const cli = fileURLToPath(new URL('../src/cli-entry.js', import.meta.url));
const mcp = fileURLToPath(new URL('../src/mcp-entry.js', import.meta.url));

async function project(prefix = 'cmi-trust-error-') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  await fs.writeFile(path.join(root, 'package.json'), '{"name":"trust-error-portability","type":"module"}\n');
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'main.js'), 'export const main = true;\n');
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

function startMcp(root, env = {}) {
  const child = spawn(process.execPath, [mcp], {
    cwd: root,
    env: { ...process.env, CMI_PROJECT_ROOT: root, ...env },
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
      reject(new Error('Timed out waiting for MCP trust-boundary response.'));
    }, timeout);
    waiter.resolve = (value) => { clearTimeout(timer); resolve(value); };
    waiters.push(waiter);
  });
  return { child, send, waitFor };
}

async function initialize(server) {
  server.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'trust-boundary-test', version: '1' } } });
  const response = await server.waitFor((message) => message.id === 1);
  server.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  return response;
}

function stopMcp(server) {
  if (server.child.exitCode !== null || server.child.signalCode !== null) return;
  server.child.stdin.end();
  server.child.kill();
}

async function exists(target) {
  try { await fs.lstat(target); return true; } catch (error) { if (error?.code === 'ENOENT') return false; throw error; }
}

test('CLI rejects malformed numeric flags before fallback and preserves one JSON error object', async (t) => {
  const root = await project('cmi-cli-numeric-');
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  for (const args of [
    ['search', 'main', '--limit', 'not-a-number', '--json'],
    ['impact', 'src/main.js', '--depth', '0', '--json'],
    ['session', 'list', '--limit', '1.5', '--json'],
    ['evaluate', 'report', '--since-days', 'NaN', '--json'],
  ]) {
    const result = await runCli(args, root);
    assert.equal(result.code, 1, `${args.join(' ')}\n${result.stderr}`);
    assert.equal(result.stdout, '');
    const lines = result.stderr.trim().split(/\r?\n/).filter(Boolean);
    assert.equal(lines.length, 1, result.stderr);
    const payload = JSON.parse(lines[0]);
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, 'CMI_CLI_ERROR');
    assert.match(payload.error.message, /integer|at least/i);
  }
});

test('MCP session adapter fails closed before initialization and on hidden read-only write calls', async (t) => {
  const root = await project('cmi-mcp-fail-closed-');
  await scanProject(root);
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const server = startMcp(root);
  try {
    server.send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_work_session_report', arguments: {} } });
    const beforeInit = await server.waitFor((message) => message.id === 2);
    assert.equal(beforeInit.result.isError, true);
    assert.match(beforeInit.result.content[0].text, /not initialized/i);

    const init = await initialize(server);
    assert.ok(init.result.protocolVersion);

    server.send({ jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} });
    const tools = (await server.waitFor((message) => message.id === 3)).result.tools;
    assert.ok(!tools.some((tool) => tool.name === 'start_work_session'));

    server.send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'start_work_session', arguments: { goal: 'must stay read only' } } });
    const hiddenWrite = await server.waitFor((message) => message.id === 4);
    assert.equal(hiddenWrite.result.isError, true);
    assert.match(hiddenWrite.result.content[0].text, /writes are disabled/i);
  } finally {
    stopMcp(server);
  }
});

test('portable manifest identity corruption is rejected before artifact trust is claimed', async (t) => {
  const root = await project('cmi-portable-corrupt-');
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-portable-bundle-'));
  const bundle = path.join(parent, 'bundle');
  t.after(async () => { await fs.rm(root, { recursive: true, force: true }); await fs.rm(parent, { recursive: true, force: true }); });
  await scanProject(root);
  await freezePortableEvidence(root, bundle);

  const manifestPath = path.join(bundle, 'manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  manifest.project.identityPolicy.scan.maxGraphFiles += 1;
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  await assert.rejects(
    () => inspectPortableEvidence(bundle),
    (error) => error?.code === 'CMI_PORTABLE_MANIFEST_CORRUPT' && /identity digest/i.test(error.message),
  );
});

test('portable artifact corruption is rejected by digest verification', async (t) => {
  const root = await project('cmi-portable-artifact-');
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-portable-artifact-bundle-'));
  const bundle = path.join(parent, 'bundle');
  t.after(async () => { await fs.rm(root, { recursive: true, force: true }); await fs.rm(parent, { recursive: true, force: true }); });
  await scanProject(root);
  const frozen = await freezePortableEvidence(root, bundle);
  const descriptor = frozen.manifest.evidence.files.find((item) => item.path === '.codex-memory/memory.md');
  assert.ok(descriptor);
  await fs.appendFile(path.join(bundle, 'evidence', descriptor.path), '\ncorrupted-after-freeze\n');

  await assert.rejects(
    () => inspectPortableEvidence(bundle),
    (error) => ['CMI_PORTABLE_DIGEST_MISMATCH', 'CMI_PORTABLE_OVERSIZED'].includes(error?.code),
  );
});

test('portable source identity mismatch returns actionable evidence and leaves destination untouched', async (t) => {
  const source = await project('cmi-portable-source-');
  const destination = await project('cmi-portable-destination-');
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-portable-restore-bundle-'));
  const bundle = path.join(parent, 'bundle');
  t.after(async () => {
    await fs.rm(source, { recursive: true, force: true });
    await fs.rm(destination, { recursive: true, force: true });
    await fs.rm(parent, { recursive: true, force: true });
  });
  await scanProject(source);
  await freezePortableEvidence(source, bundle);
  await fs.writeFile(path.join(destination, 'src', 'main.js'), 'export const main = false;\n');

  await assert.rejects(
    () => restorePortableEvidence(destination, bundle),
    (error) => {
      assert.equal(error?.code, 'CMI_EVIDENCE_MISMATCH');
      assert.ok(error.details.mismatches.some((item) => item.dimension === 'source-content'));
      assert.equal(error.details.recommendedAction.mutatesCmiState, false);
      assert.match(error.details.recommendedAction.reason, /No CMI evidence was written/i);
      return true;
    },
  );
  assert.equal(await exists(path.join(destination, '.codex-memory')), false);
});

test('Closing formatter preserves record ids, exact file locations, evidence anchors, and action', () => {
  const text = formatClosingIntelligence({
    runtime: { name: 'codex-memory-intelligence', version: '0.12.0' },
    alerts: [{
      severity: 'warning',
      title: 'Prediction scope escaped',
      detail: 'Observed path was outside the predicted boundary.',
      evidenceType: 'observed',
      confidence: 'high',
      verificationState: 'observed',
      occurrences: 1,
      findingId: 'finding-1234',
      relatedChangeIds: ['change-5678'],
      scopeRelation: 'current-session',
      relatedFiles: ['src/worker.js'],
      evidenceAnchors: [{ path: 'src/worker.js', startLine: 12, endLine: 18, symbol: 'runWorker' }],
      recommendedAction: 'Inspect src/worker.js before trusting the previous scope prediction.',
    }],
    nextAction: { priority: 'P1', action: 'Inspect src/worker.js and reconcile the prediction gap.' },
  });

  assert.match(text, /Runtime: codex-memory-intelligence v0\.12\.0/);
  assert.match(text, /finding finding-1234/);
  assert.match(text, /change change-5678/);
  assert.match(text, /Files: src\/worker\.js/);
  assert.match(text, /Source: src\/worker\.js:12-18 · symbol runWorker/);
  assert.match(text, /Action: Inspect src\/worker\.js/);
  assert.match(text, /Next:.*P1.*src\/worker\.js/);
});
