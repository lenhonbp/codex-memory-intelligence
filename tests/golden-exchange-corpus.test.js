import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { scanProject } from '../src/core.js';
import { startChangeRecord, observeChangeRecord, completeChangeRecord } from '../src/change-intelligence.js';
import { startSession, closeSession } from '../src/session-intelligence.js';

const execFileAsync = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const cli = fileURLToPath(new URL('../src/cli-entry.js', import.meta.url));
const mcp = fileURLToPath(new URL('../src/mcp-entry.js', import.meta.url));
const contract = JSON.parse(await fs.readFile(path.join(here, 'fixtures', 'evidence-contract', 'v1.json'), 'utf8'));
const golden = JSON.parse(await fs.readFile(path.join(here, 'fixtures', 'evidence-contract', 'golden-exchange-v1.json'), 'utf8'));

const ARCHETYPES = ['prediction-gap', 'verification-failed', 'graph-drift'];

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-golden-exchange-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'golden-exchange-corpus', type: 'module' }));
  await fs.mkdir(path.join(root, 'src', 'api'), { recursive: true });
  await fs.mkdir(path.join(root, 'src', 'billing'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'service.js'), 'export function service() { return true; }\n');
  await fs.writeFile(path.join(root, 'src', 'billing', 'ledger.js'), 'export function recordCharge() { return true; }\n');
  await fs.writeFile(path.join(root, 'src', 'api', 'checkout.js'), "import { recordCharge } from '../billing/ledger.js';\nexport function checkout() { return recordCharge(); }\n");
  await scanProject(root);
  return root;
}

async function initializeGit(root, context) {
  try {
    await execFileAsync('git', ['init'], { cwd: root, windowsHide: true });
    await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: root, windowsHide: true });
    await execFileAsync('git', ['config', 'user.name', 'CMI Test'], { cwd: root, windowsHide: true });
    await execFileAsync('git', ['add', '.'], { cwd: root, windowsHide: true });
    await execFileAsync('git', ['commit', '-m', 'Initial fixture'], { cwd: root, windowsHide: true });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      context.skip('Git is unavailable on this runner.');
      return false;
    }
    throw error;
  }
  return true;
}

async function commitPaths(root, files, message) {
  await execFileAsync('git', ['add', ...files], { cwd: root, windowsHide: true });
  await execFileAsync('git', ['commit', '-m', message], { cwd: root, windowsHide: true });
}

function runCli(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
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
    windowsHide: true,
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
      reject(new Error('Timed out waiting for golden-exchange MCP response.'));
    }, timeout);
    waiter.resolve = (value) => { clearTimeout(timer); resolve(value); };
    waiters.push(waiter);
  });
  return { child, send, waitFor };
}

async function initializeMcp(server) {
  server.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'golden-exchange-corpus', version: '2.0.0' } } });
  await server.waitFor((message) => message.id === 1);
  server.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
}

async function stopMcp(server) {
  if (server.child.exitCode !== null) return;
  const exited = new Promise((resolve, reject) => {
    server.child.once('exit', resolve);
    server.child.once('error', reject);
  });
  server.child.stdin.end();
  await exited;
}

function handoffEvidenceBlock(text, findingId) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const recordIndex = lines.findIndex((line) => line.includes(`finding ${findingId}`));
  assert.notEqual(recordIndex, -1, text);
  let start = recordIndex;
  while (start > 0 && !lines[start].trimStart().startsWith('- [')) start -= 1;
  let end = recordIndex + 1;
  while (end < lines.length && !lines[end].trimStart().startsWith('- [') && !lines[end].startsWith('## ')) end += 1;
  return lines.slice(start, end).join('\n').trimEnd();
}

function closingAlertBlock(text, findingId) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const recordIndex = lines.findIndex((line) => line.includes(`finding ${findingId}`));
  assert.notEqual(recordIndex, -1, text);
  let start = recordIndex;
  while (start > 0 && !/\*\*(?:BLOCKER|WARNING|REMINDER) ·/.test(lines[start])) start -= 1;
  assert.match(lines[start], /\*\*(?:BLOCKER|WARNING|REMINDER) ·/);
  let end = recordIndex + 1;
  while (end < lines.length && lines[end].trim() !== '') end += 1;
  return lines.slice(start, end).join('\n').trimEnd();
}

function normalizeValue(value, ids) {
  if (typeof value === 'string') {
    let normalized = value.replace(/\r\n/g, '\n');
    if (ids.sessionId) normalized = normalized.replaceAll(ids.sessionId, '<SESSION_ID>');
    if (ids.changeId) normalized = normalized.replaceAll(ids.changeId, '<CHANGE_ID>');
    if (ids.findingId) normalized = normalized.replaceAll(ids.findingId, '<FINDING_ID>');
    return normalized;
  }
  if (Array.isArray(value)) return value.map((item) => normalizeValue(item, ids));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeValue(item, ids)]));
  return value;
}

function project(value, fields, label) {
  assert.ok(value && typeof value === 'object', `${label} must be an object.`);
  const result = {};
  for (const field of fields) {
    assert.ok(Object.hasOwn(value, field), `${label} lost protected field ${field}.`);
    result[field] = value[field];
  }
  return result;
}

function findingFrom(handoff, findingId) {
  const finding = handoff.openFindings.find((item) => item.id === findingId);
  assert.ok(finding, `Missing Finding ${findingId}.`);
  return finding;
}

function actionFrom(handoff, findingId) {
  const action = handoff.nextActions.find((item) => (item.relatedFindingIds || []).includes(findingId));
  assert.ok(action, `Missing recommendation linked to Finding ${findingId}.`);
  return action;
}

function assertHandoffHumanExchange(text, ids, exchange) {
  assert.equal(normalizeValue(handoffEvidenceBlock(text, ids.findingId), ids), exchange.handoffHumanEvidenceBlock);
}

function assertClosingHumanExchange(text, ids, exchange) {
  assert.equal(normalizeValue(closingAlertBlock(text, ids.findingId), ids), exchange.closingHumanAlertBlock);
}

function assertHandoffExchange(handoff, ids, exchange, label) {
  const finding = findingFrom(handoff, ids.findingId);
  const action = actionFrom(handoff, ids.findingId);
  assert.deepEqual(normalizeValue(project(finding, contract.finding.requiredFields, `${label} Finding`), ids), exchange.finding);
  assert.deepEqual(normalizeValue(project(action, contract.recommendation.requiredFields, `${label} Recommendation`), ids), exchange.recommendation);
}

async function assertAcrossConsumers(root, closed, finding, ids, exchange, category) {
  for (const [args, label] of [
    [['session', 'handoff', closed.id], 'CLI session handoff'],
    [['session', 'show', closed.id], 'CLI session show'],
  ]) {
    const result = await runCli(args, root);
    assert.equal(result.code, 0, `${category} ${label}: ${result.stderr}`);
    assertHandoffHumanExchange(result.stdout, ids, exchange);
  }

  const cliClosing = await runCli(['session', 'closing', closed.id], root);
  assert.equal(cliClosing.code, 0, `${category} CLI session closing: ${cliClosing.stderr}`);
  assertClosingHumanExchange(cliClosing.stdout, ids, exchange);

  const server = startMcp(root);
  try {
    await initializeMcp(server);

    server.send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_session_handoff', arguments: { id: closed.id } } });
    const mcpHandoff = await server.waitFor((message) => message.id === 2);
    assert.ok(mcpHandoff.result, JSON.stringify(mcpHandoff));
    assertHandoffHumanExchange(mcpHandoff.result.content[0].text, ids, exchange);
    assertHandoffExchange(mcpHandoff.result.structuredContent, ids, exchange, `${category} MCP Handoff`);

    server.send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_work_session_report', arguments: { id: closed.id } } });
    const mcpReport = await server.waitFor((message) => message.id === 3);
    assert.ok(mcpReport.result, JSON.stringify(mcpReport));
    assertHandoffHumanExchange(mcpReport.result.content[0].text, ids, exchange);
    assertHandoffExchange(mcpReport.result.structuredContent.close.handoff, ids, exchange, `${category} MCP Session Report`);

    server.send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'get_closing_intelligence', arguments: { id: closed.id } } });
    const mcpClosing = await server.waitFor((message) => message.id === 4);
    assert.ok(mcpClosing.result, JSON.stringify(mcpClosing));
    assertClosingHumanExchange(mcpClosing.result.content[0].text, ids, exchange);
    const alert = mcpClosing.result.structuredContent.alerts.find((item) => item.findingId === finding.id);
    assert.ok(alert, JSON.stringify(mcpClosing.result.structuredContent.alerts, null, 2));
    assert.deepEqual(normalizeValue(project(alert, contract.closingAlert.requiredFields, `${category} MCP Closing alert`), ids), exchange.closingAlert);

    server.send({ jsonrpc: '2.0', id: 5, method: 'resources/read', params: { uri: 'cmi://project/session-handoff/latest' } });
    const resource = await server.waitFor((message) => message.id === 5);
    assert.ok(resource.result, JSON.stringify(resource));
    const resourceHandoff = JSON.parse(resource.result.contents[0].text);
    assertHandoffExchange(resourceHandoff, ids, exchange, `${category} MCP Handoff Resource`);
  } finally {
    await stopMcp(server);
  }
}

async function predictionGapScenario(t) {
  const root = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  if (!await initializeGit(root, t)) return null;
  const change = await startChangeRecord(root, 'change checkout flow');
  const session = await startSession(root, 'change checkout flow');
  await fs.mkdir(path.join(root, 'src', 'cache'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'cache', 'profile.js'), 'export const cacheProfile = true;\n');
  const observation = await observeChangeRecord(root, change.id, { files: ['src/cache/profile.js'] });
  assert.deepEqual(observation.comparison.missedByPrediction, ['src/cache', 'src/cache/profile.js']);
  await completeChangeRecord(root, change.id, {
    outcome: 'succeeded',
    files: ['src/cache/profile.js'],
    verifications: [{ name: 'npm test', status: 'passed' }],
  });
  const closed = await closeSession(root, session.id, { outcome: 'succeeded' });
  const finding = closed.close.handoff.openFindings.find((item) => item.category === 'prediction-gap' && item.evidence.includes(`change:${change.id}`));
  assert.ok(finding, JSON.stringify(closed.close.handoff.openFindings, null, 2));
  return { root, closed, finding, ids: { sessionId: closed.id, changeId: change.id, findingId: finding.id } };
}

async function verificationFailedScenario(t) {
  const root = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  if (!await initializeGit(root, t)) return null;
  const change = await startChangeRecord(root, 'verify checkout failure');
  const session = await startSession(root, 'verify checkout failure');
  await completeChangeRecord(root, change.id, {
    outcome: 'failed',
    files: [],
    verifications: [{ name: 'npm test', status: 'failed' }],
  });
  const closed = await closeSession(root, session.id);
  const finding = closed.close.handoff.openFindings.find((item) => item.category === 'verification-failed' && item.evidence.includes(`change:${change.id}`));
  assert.ok(finding, JSON.stringify(closed.close.handoff.openFindings, null, 2));
  return { root, closed, finding, ids: { sessionId: closed.id, changeId: change.id, findingId: finding.id } };
}

async function graphDriftScenario(t) {
  const root = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  if (!await initializeGit(root, t)) return null;
  await fs.writeFile(path.join(root, 'src', 'service.js'), 'export function service() { return false; }\n');
  await commitPaths(root, ['src/service.js'], 'Create pre-session graph drift');
  const session = await startSession(root, 'inspect already-stale project intelligence');
  const closed = await closeSession(root, session.id, { outcome: 'investigated', notes: ['No project mutation occurred in this session.'] });
  const finding = closed.close.handoff.openFindings.find((item) => item.category === 'graph-drift' && item.relatedFiles.includes('src/service.js'));
  assert.ok(finding && !finding.evidence.includes('session-source-mutation'), JSON.stringify(closed.close.handoff.openFindings, null, 2));
  return { root, closed, finding, ids: { sessionId: closed.id, findingId: finding.id } };
}

const SCENARIOS = [
  ['prediction-gap', predictionGapScenario],
  ['verification-failed', verificationFailedScenario],
  ['graph-drift', graphDriftScenario],
];

test('golden exchange v1 corpus v2 is bounded to three high-signal real-consumer archetypes', () => {
  assert.equal(golden.schemaVersion, 1);
  assert.equal(golden.corpusVersion, 2);
  assert.equal(golden.evidenceContractVersion, contract.contractVersion);
  assert.equal(golden.name, 'cmi-golden-exchange');
  assert.deepEqual(golden.archetypes, ARCHETYPES);
  assert.deepEqual(Object.keys(golden.exchanges), ARCHETYPES);
  assert.deepEqual(golden.surfaces, [
    'cli:session-handoff',
    'cli:session-show',
    'cli:session-closing',
    'mcp:get_session_handoff',
    'mcp:get_work_session_report',
    'mcp:get_closing_intelligence',
    'mcp-resource:cmi://project/session-handoff/latest',
  ]);
  assert.match(golden.purpose, /real CLI, MCP tool, and MCP resource/i);
  assert.ok(golden.normalizationPolicy.allowed.every((item) => /Session ID|Change ID|Finding ID|CRLF/.test(item)));
  assert.ok(golden.normalizationPolicy.forbidden.some((item) => /evidence provenance/i.test(item)));

  for (const category of ARCHETYPES) {
    const exchange = golden.exchanges[category];
    assert.equal(exchange.finding.category, category);
    assert.match(exchange.handoffHumanEvidenceBlock, /^- \[(?:critical|high|medium|low|info)\]/);
    assert.match(exchange.closingHumanAlertBlock, /^(?:🔴|🟠|🟡) \*\*(?:BLOCKER|WARNING|REMINDER)/);
  }
  assert.equal(golden.exchanges['verification-failed'].closingAlert.verificationState, 'established');
  assert.equal(golden.exchanges['verification-failed'].closingAlert.violationEstablished, true);
  assert.equal(golden.exchanges['graph-drift'].closingAlert.verificationState, 'observed');
  assert.equal(golden.exchanges['graph-drift'].closingAlert.violationEstablished, false);
});

test('real CLI, MCP tools, and MCP resource replay all expanded v1 golden exchanges without semantic normalization', async (t) => {
  assert.deepEqual(SCENARIOS.map(([category]) => category), ARCHETYPES);
  for (const [category, buildScenario] of SCENARIOS) {
    await t.test(category, async (subtest) => {
      const scenario = await buildScenario(subtest);
      if (!scenario) return;
      assert.equal(scenario.finding.category, category);
      await assertAcrossConsumers(scenario.root, scenario.closed, scenario.finding, scenario.ids, golden.exchanges[category], category);
    });
  }
});
