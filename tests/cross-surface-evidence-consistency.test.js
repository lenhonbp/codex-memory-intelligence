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
import { extractEvidenceAnchors, formatEvidenceAnchor, verificationStateForFinding } from '../src/evidence-anchors.js';

const execFileAsync = promisify(execFile);
const cli = fileURLToPath(new URL('../src/cli-entry.js', import.meta.url));
const mcp = fileURLToPath(new URL('../src/mcp-entry.js', import.meta.url));

const ARCHETYPES = [
  'prediction-gap',
  'verification-failed',
  'graph-drift',
  'uncaptured-session-change',
  'active-change',
  'session-blocker',
];

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-evidence-contract-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'evidence-contract-corpus', type: 'module' }));
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
      reject(new Error('Timed out waiting for evidence-contract MCP response.'));
    }, timeout);
    waiter.resolve = (value) => { clearTimeout(timer); resolve(value); };
    waiters.push(waiter);
  });
  return { child, send, waitFor };
}

async function initializeMcp(server) {
  server.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'evidence-contract-corpus', version: '1.0.0' } } });
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

function relatedChangeIds(finding) {
  const ids = [];
  for (const evidence of finding.evidence || []) {
    const match = String(evidence).match(/^change:([0-9a-f-]+)$/i);
    if (match) ids.push(match[1]);
  }
  if (finding.category === 'active-change') {
    const target = String(finding.key || '').replace(/^active-change:/, '');
    if (/^[0-9a-f-]{8,}$/i.test(target)) ids.push(target);
  }
  return [...new Set(ids)];
}

function findingContract(finding, action) {
  return {
    finding,
    action,
    changeIds: relatedChangeIds(finding),
    files: [...(finding.relatedFiles || [])],
    anchors: extractEvidenceAnchors(finding).map(formatEvidenceAnchor).filter(Boolean),
    verificationState: verificationStateForFinding(finding),
  };
}

function evidenceBlock(text, findingId) {
  const lines = String(text || '').split(/\r?\n/);
  const recordIndex = lines.findIndex((line) => line.includes(`finding ${findingId}`));
  assert.notEqual(recordIndex, -1, text);
  let start = recordIndex;
  while (start > 0 && !lines[start].trimStart().startsWith('- [')) start -= 1;
  let end = recordIndex + 1;
  while (end < lines.length && !lines[end].trimStart().startsWith('- [') && !lines[end].startsWith('## ')) end += 1;
  return lines.slice(start, end).join('\n');
}

function assertTextContract(text, contract) {
  const { finding, action, changeIds, files, anchors, verificationState } = contract;
  const block = evidenceBlock(text, finding.id);
  assert.ok(block.includes(`finding ${finding.id}`), block);
  for (const changeId of changeIds) assert.ok(block.includes(`change ${changeId}`), block);
  if (!changeIds.length) assert.doesNotMatch(block, /\bchange [0-9a-f-]{8,}\b/i);

  if (files.length) {
    assert.match(block, /^\s*Files:/m);
    for (const file of files.slice(0, 8)) assert.ok(block.includes(file), block);
  } else {
    assert.doesNotMatch(block, /^\s*Files:/m);
  }

  if (anchors.length) {
    assert.match(block, /^\s*Source:/m);
    for (const anchor of anchors.slice(0, 4)) assert.ok(block.includes(anchor), block);
  } else {
    assert.doesNotMatch(block, /^\s*Source:/m);
  }

  assert.ok(block.includes(`Evidence: ${finding.evidenceType} · confidence ${finding.confidence} · ${verificationState}`), block);
  assert.ok(block.includes(`Action: ${action.action}`), block);
}

function assertFindingIdentity(actual, expected) {
  assert.equal(actual.id, expected.id);
  assert.equal(actual.key, expected.key);
  assert.equal(actual.category, expected.category);
  assert.equal(actual.state, expected.state);
  assert.equal(actual.severity, expected.severity);
  assert.equal(actual.title, expected.title);
  assert.equal(actual.detail, expected.detail);
  assert.equal(actual.confidence, expected.confidence);
  assert.equal(actual.evidenceType, expected.evidenceType);
  assert.equal(actual.sessionRelevance || null, expected.sessionRelevance || null);
  assert.deepEqual(actual.evidence, expected.evidence);
  assert.deepEqual(actual.relatedFiles, expected.relatedFiles);
}

async function assertAcrossSurfaces(root, closed, finding) {
  assert.ok(finding, `Expected finding in ${JSON.stringify(closed.close.handoff.openFindings, null, 2)}`);
  const action = closed.close.handoff.nextActions.find((item) => (item.relatedFindingIds || []).includes(finding.id));
  assert.ok(action, `Expected action for finding ${finding.id}`);
  const contract = findingContract(finding, action);

  const cliHandoff = await runCli(['session', 'handoff', closed.id], root);
  assert.equal(cliHandoff.code, 0, cliHandoff.stderr);
  assertTextContract(cliHandoff.stdout, contract);

  const cliReport = await runCli(['session', 'show', closed.id], root);
  assert.equal(cliReport.code, 0, cliReport.stderr);
  assertTextContract(cliReport.stdout, contract);

  const cliClosing = await runCli(['session', 'closing', closed.id], root);
  assert.equal(cliClosing.code, 0, cliClosing.stderr);
  assertTextContract(cliClosing.stdout, contract);

  const server = startMcp(root);
  try {
    await initializeMcp(server);

    server.send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_session_handoff', arguments: { id: closed.id } } });
    const mcpHandoff = await server.waitFor((message) => message.id === 2);
    assertTextContract(mcpHandoff.result.content[0].text, contract);
    const mcpHandoffFinding = mcpHandoff.result.structuredContent.openFindings.find((item) => item.id === finding.id);
    assert.ok(mcpHandoffFinding);
    assertFindingIdentity(mcpHandoffFinding, finding);
    const mcpHandoffAction = mcpHandoff.result.structuredContent.nextActions.find((item) => (item.relatedFindingIds || []).includes(finding.id));
    assert.equal(mcpHandoffAction.action, action.action);

    server.send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_work_session_report', arguments: { id: closed.id } } });
    const mcpReport = await server.waitFor((message) => message.id === 3);
    assertTextContract(mcpReport.result.content[0].text, contract);
    const mcpReportFinding = mcpReport.result.structuredContent.close.handoff.openFindings.find((item) => item.id === finding.id);
    assert.ok(mcpReportFinding);
    assertFindingIdentity(mcpReportFinding, finding);

    server.send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'get_closing_intelligence', arguments: { id: closed.id } } });
    const mcpClosing = await server.waitFor((message) => message.id === 4);
    assertTextContract(mcpClosing.result.content[0].text, contract);
    const alert = mcpClosing.result.structuredContent.alerts.find((item) => item.findingId === finding.id);
    assert.ok(alert, JSON.stringify(mcpClosing.result.structuredContent.alerts, null, 2));
    assert.deepEqual(alert.relatedChangeIds, contract.changeIds);
    assert.deepEqual(alert.relatedFiles, contract.files.slice(0, 12));
    assert.equal(alert.evidenceType, finding.evidenceType);
    assert.equal(alert.confidence, finding.confidence);
    assert.equal(alert.verificationState, contract.verificationState);
    assert.equal(alert.findingState, finding.state);
    assert.deepEqual(alert.evidenceAnchors.map(formatEvidenceAnchor), contract.anchors);
    assert.equal(alert.recommendedAction, action.action);

    server.send({ jsonrpc: '2.0', id: 5, method: 'resources/read', params: { uri: 'cmi://project/session-handoff/latest' } });
    const resource = await server.waitFor((message) => message.id === 5);
    const resourceHandoff = JSON.parse(resource.result.contents[0].text);
    assert.equal(resourceHandoff.sessionId, closed.id);
    const resourceFinding = resourceHandoff.openFindings.find((item) => item.id === finding.id);
    assert.ok(resourceFinding);
    assertFindingIdentity(resourceFinding, finding);
    const resourceAction = resourceHandoff.nextActions.find((item) => (item.relatedFindingIds || []).includes(finding.id));
    assert.equal(resourceAction.action, action.action);
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
  assert.ok(observation.comparison.missedByPrediction.includes('src/cache/profile.js'));
  await completeChangeRecord(root, change.id, {
    outcome: 'succeeded',
    files: ['src/cache/profile.js'],
    verifications: [{ name: 'npm test', status: 'passed' }],
  });
  const closed = await closeSession(root, session.id, { outcome: 'succeeded' });
  const finding = closed.close.handoff.openFindings.find((item) => item.category === 'prediction-gap' && item.evidence.includes(`change:${change.id}`));
  return { root, closed, finding };
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
  return { root, closed, finding };
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
  assert.ok(finding && !finding.evidence.includes('session-source-mutation'));
  return { root, closed, finding };
}

async function uncapturedChangeScenario(t) {
  const root = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  if (!await initializeGit(root, t)) return null;
  const session = await startSession(root, 'change service without a Change record');
  await fs.writeFile(path.join(root, 'src', 'service.js'), 'export function service() { return false; }\n');
  const closed = await closeSession(root, session.id, { files: ['src/service.js'] });
  const finding = closed.close.handoff.openFindings.find((item) => item.category === 'uncaptured-session-change' && item.relatedFiles.includes('src/service.js'));
  return { root, closed, finding };
}

async function activeChangeScenario(t) {
  const root = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  if (!await initializeGit(root, t)) return null;
  const change = await startChangeRecord(root, 'authentication retry handling');
  const session = await startSession(root, 'authentication retry handling');
  const closed = await closeSession(root, session.id, { outcome: 'partial', notes: ['The related Change intentionally remains active.'] });
  const finding = closed.close.handoff.openFindings.find((item) => item.category === 'active-change' && item.evidence.includes(`change:${change.id}`) && item.sessionRelevance === 'related');
  return { root, closed, finding };
}

async function sessionBlockerScenario(t) {
  const root = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  if (!await initializeGit(root, t)) return null;
  const session = await startSession(root, 'investigate migration ordering');
  const closed = await closeSession(root, session.id, { blockers: ['Migration ordering is still unknown.'] });
  const finding = closed.close.handoff.openFindings.find((item) => item.category === 'session-blocker' && item.detail === 'Migration ordering is still unknown.');
  return { root, closed, finding };
}

const SCENARIOS = [
  ['prediction-gap', predictionGapScenario],
  ['verification-failed', verificationFailedScenario],
  ['graph-drift', graphDriftScenario],
  ['uncaptured-session-change', uncapturedChangeScenario],
  ['active-change', activeChangeScenario],
  ['session-blocker', sessionBlockerScenario],
];

test('evidence-contract regression corpus preserves one truth across CLI, MCP, Closing, Session, and Handoff', async (t) => {
  assert.deepEqual(SCENARIOS.map(([category]) => category), ARCHETYPES);
  for (const [category, buildScenario] of SCENARIOS) {
    await t.test(category, async (subtest) => {
      const scenario = await buildScenario(subtest);
      if (!scenario) return;
      assert.equal(scenario.finding?.category, category, JSON.stringify(scenario.closed.close.handoff.openFindings, null, 2));
      await assertAcrossSurfaces(scenario.root, scenario.closed, scenario.finding);
    });
  }
});
