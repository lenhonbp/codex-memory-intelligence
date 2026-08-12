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

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-cross-surface-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'cross-surface-evidence', type: 'module' }));
  await fs.mkdir(path.join(root, 'src', 'api'), { recursive: true });
  await fs.mkdir(path.join(root, 'src', 'billing'), { recursive: true });
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
      reject(new Error('Timed out waiting for cross-surface MCP response.'));
    }, timeout);
    waiter.resolve = (value) => { clearTimeout(timer); resolve(value); };
    waiters.push(waiter);
  });
  return { child, send, waitFor };
}

async function initializeMcp(server) {
  server.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'cross-surface-test', version: '1.0.0' } } });
  await server.waitFor((message) => message.id === 1);
  server.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
}

function stopMcp(server) {
  server.child.stdin.end();
  server.child.kill();
}

function assertFindingIdentity(actual, expected) {
  assert.equal(actual.id, expected.id);
  assert.equal(actual.category, expected.category);
  assert.equal(actual.state, expected.state);
  assert.equal(actual.severity, expected.severity);
  assert.equal(actual.confidence, expected.confidence);
  assert.equal(actual.evidenceType, expected.evidenceType);
  assert.deepEqual(actual.evidence, expected.evidence);
  assert.deepEqual(actual.relatedFiles, expected.relatedFiles);
}

test('one prediction-gap finding preserves identity, evidence address, provenance state, and action across CLI, MCP, Closing, Session, and Handoff', async (t) => {
  const root = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  if (!await initializeGit(root, t)) return;

  const change = await startChangeRecord(root, 'change checkout flow');
  const session = await startSession(root, 'change checkout flow');
  await fs.appendFile(path.join(root, 'src', 'api', 'checkout.js'), '\nexport const checkoutVersion = 2;\n');
  await fs.mkdir(path.join(root, 'src', 'cache'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'cache', 'profile.js'), 'export const cacheProfile = true;\n');

  const observation = await observeChangeRecord(root, change.id, { files: ['src/cache/profile.js'] });
  assert.ok(observation.comparison.missedByPrediction.includes('src/cache/profile.js'));
  await completeChangeRecord(root, change.id, {
    outcome: 'succeeded',
    files: ['src/api/checkout.js', 'src/cache/profile.js'],
    verifications: [{ name: 'npm test', status: 'passed' }],
  });

  const closed = await closeSession(root, session.id, { outcome: 'succeeded' });
  const finding = closed.close.handoff.openFindings.find((item) => item.category === 'prediction-gap' && item.evidence.includes(`change:${change.id}`));
  assert.ok(finding, JSON.stringify(closed.close.handoff.openFindings, null, 2));
  const action = closed.close.handoff.nextActions.find((item) => (item.relatedFindingIds || []).includes(finding.id));
  assert.ok(action, JSON.stringify(closed.close.handoff.nextActions, null, 2));
  const verificationState = verificationStateForFinding(finding);
  const anchor = extractEvidenceAnchors(finding).find((item) => item.path === 'src/cache/profile.js');
  assert.ok(anchor);
  const formattedAnchor = formatEvidenceAnchor(anchor);

  const assertAddressText = (text) => {
    assert.ok(text.includes(`finding ${finding.id}`), text);
    assert.ok(text.includes(`change ${change.id}`), text);
    assert.ok(text.includes('src/cache/profile.js'), text);
    assert.ok(text.includes(`Source: ${formattedAnchor}`), text);
    assert.ok(text.includes(`Evidence: ${finding.evidenceType} · confidence ${finding.confidence} · ${verificationState}`), text);
    assert.ok(text.includes(`Action: ${action.action}`), text);
  };

  const cliHandoff = await runCli(['session', 'handoff', session.id], root);
  assert.equal(cliHandoff.code, 0, cliHandoff.stderr);
  assertAddressText(cliHandoff.stdout);

  const cliReport = await runCli(['session', 'show', session.id], root);
  assert.equal(cliReport.code, 0, cliReport.stderr);
  assertAddressText(cliReport.stdout);

  const cliClosing = await runCli(['session', 'closing', session.id], root);
  assert.equal(cliClosing.code, 0, cliClosing.stderr);
  assertAddressText(cliClosing.stdout);

  const server = startMcp(root);
  try {
    await initializeMcp(server);

    server.send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_session_handoff', arguments: { id: session.id } } });
    const mcpHandoff = await server.waitFor((message) => message.id === 2);
    assertAddressText(mcpHandoff.result.content[0].text);
    const mcpHandoffFinding = mcpHandoff.result.structuredContent.openFindings.find((item) => item.id === finding.id);
    assert.ok(mcpHandoffFinding);
    assertFindingIdentity(mcpHandoffFinding, finding);
    const mcpHandoffAction = mcpHandoff.result.structuredContent.nextActions.find((item) => (item.relatedFindingIds || []).includes(finding.id));
    assert.equal(mcpHandoffAction.action, action.action);

    server.send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_work_session_report', arguments: { id: session.id } } });
    const mcpReport = await server.waitFor((message) => message.id === 3);
    assertAddressText(mcpReport.result.content[0].text);
    const mcpReportFinding = mcpReport.result.structuredContent.close.handoff.openFindings.find((item) => item.id === finding.id);
    assertFindingIdentity(mcpReportFinding, finding);

    server.send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'get_closing_intelligence', arguments: { id: session.id } } });
    const mcpClosing = await server.waitFor((message) => message.id === 4);
    assertAddressText(mcpClosing.result.content[0].text);
    const alert = mcpClosing.result.structuredContent.alerts.find((item) => item.findingId === finding.id);
    assert.ok(alert, JSON.stringify(mcpClosing.result.structuredContent.alerts, null, 2));
    assert.ok(alert.relatedChangeIds.includes(change.id));
    assert.ok(alert.relatedFiles.includes('src/cache/profile.js'));
    assert.equal(alert.evidenceType, finding.evidenceType);
    assert.equal(alert.confidence, finding.confidence);
    assert.equal(alert.verificationState, verificationState);
    assert.ok(alert.evidenceAnchors.some((item) => formatEvidenceAnchor(item) === formattedAnchor));
    assert.equal(alert.recommendedAction, action.action);

    server.send({ jsonrpc: '2.0', id: 5, method: 'resources/read', params: { uri: 'cmi://project/session-handoff/latest' } });
    const resource = await server.waitFor((message) => message.id === 5);
    const resourceHandoff = JSON.parse(resource.result.contents[0].text);
    const resourceFinding = resourceHandoff.openFindings.find((item) => item.id === finding.id);
    assertFindingIdentity(resourceFinding, finding);
    const resourceAction = resourceHandoff.nextActions.find((item) => (item.relatedFindingIds || []).includes(finding.id));
    assert.equal(resourceAction.action, action.action);
  } finally {
    stopMcp(server);
  }
});
