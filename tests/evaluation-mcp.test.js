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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-evaluation-mcp-'));
  await fs.writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'src', 'index.js'), 'export const value = 1;\n');
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
  const waitFor = (predicate, timeout = 6000) => new Promise((resolve, reject) => {
    const existing = messages.find(predicate);
    if (existing) { resolve(existing); return; }
    const waiter = { predicate, resolve: null };
    const timer = setTimeout(() => {
      const index = waiters.indexOf(waiter);
      if (index >= 0) waiters.splice(index, 1);
      reject(new Error('Timed out waiting for evaluation MCP response.'));
    }, timeout);
    waiter.resolve = (value) => { clearTimeout(timer); resolve(value); };
    waiters.push(waiter);
  });
  return { child, send, waitFor };
}

async function initialize(server) {
  server.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'evaluation-test', version: '1.0.0' } } });
  const response = await server.waitFor((message) => message.id === 1);
  server.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  return response;
}
function stop(server) { server.child.stdin.end(); server.child.kill(); }


test('read-only MCP exposes evaluation reads/report resource without durable capture', async () => {
  const root = await fixture();
  const server = startMcp(root);
  try {
    const initialized = await initialize(server);
    assert.match(initialized.result.instructions, /external-real.*self-host.*synthetic/i);
    assert.match(initialized.result.instructions, /human-reviewed/i);

    server.send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    const tools = (await server.waitFor((message) => message.id === 2)).result.tools;
    assert.ok(tools.some((tool) => tool.name === 'list_project_evaluations'));
    assert.ok(tools.some((tool) => tool.name === 'get_project_evaluation'));
    assert.ok(tools.some((tool) => tool.name === 'get_project_evaluation_report'));
    const reportTool = tools.find((tool) => tool.name === 'get_project_evaluation_report');
    assert.ok(reportTool.inputSchema.properties.sinceDays);
    assert.ok(reportTool.inputSchema.properties.taskKind);
    assert.ok(!tools.some((tool) => tool.name === 'capture_project_evaluation'));
    assert.ok(!tools.some((tool) => tool.name === 'review_project_evaluation'));

    server.send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_project_evaluation_report', arguments: {} } });
    const report = await server.waitFor((message) => message.id === 3);
    assert.equal(report.result.structuredContent.coverage.state, 'none');
    assert.equal(report.result.structuredContent.corpus.externalReal.records, 0);

    server.send({ jsonrpc: '2.0', id: 4, method: 'resources/list', params: {} });
    const resources = (await server.waitFor((message) => message.id === 4)).result.resources;
    assert.ok(resources.some((resource) => resource.uri === 'cmi://project/evaluation-report'));

    server.send({ jsonrpc: '2.0', id: 5, method: 'resources/read', params: { uri: 'cmi://project/evaluation-report' } });
    const resource = JSON.parse((await server.waitFor((message) => message.id === 5)).result.contents[0].text);
    assert.equal(resource.coverage.state, 'none');
  } finally { stop(server); }
});


test('write-enabled MCP captures evaluation evidence without weakening provenance rules', async () => {
  const root = await fixture();
  const server = startMcp(root, { CMI_WRITE_ENABLED: '1' });
  try {
    await initialize(server);
    server.send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    const tools = (await server.waitFor((message) => message.id === 2)).result.tools;
    assert.ok(tools.some((tool) => tool.name === 'capture_project_evaluation'));
    const reviewTool = tools.find((tool) => tool.name === 'review_project_evaluation');
    assert.ok(reviewTool);
    assert.ok(reviewTool.inputSchema.properties.reconstructionRating);
    assert.ok(reviewTool.inputSchema.properties.followUpOutcome);
    assert.ok(reviewTool.inputSchema.properties.verificationChoiceOutcome);
    assert.ok(reviewTool.inputSchema.properties.historyRating);
    assert.ok(tools.some((tool) => tool.name === 'review_project_evaluation'));

    server.send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'capture_project_evaluation', arguments: {
      sourceKind: 'synthetic', protocolKind: 'observational', repositoryClass: 'tooling', taskKind: 'verification', session: 'none',
    } } });
    const captured = await server.waitFor((message) => message.id === 3);
    assert.equal(captured.result.structuredContent.source.kind, 'synthetic');
    assert.equal(captured.result.structuredContent.source.independent, false);
    assert.equal(captured.result.structuredContent.protocol.kind, 'observational');
    assert.equal(captured.result.structuredContent.review.provenance, 'unreviewed');

    server.send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'list_project_evaluations', arguments: {} } });
    const listed = await server.waitFor((message) => message.id === 4);
    assert.equal(listed.result.structuredContent.total, 1);
    assert.equal(listed.result.structuredContent.records[0].sourceKind, 'synthetic');

    server.send({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'get_project_evaluation', arguments: { id: captured.result.structuredContent.id.slice(0, 12) } } });
    const shown = await server.waitFor((message) => message.id === 5);
    assert.equal(shown.result.structuredContent.id, captured.result.structuredContent.id);

    server.send({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'get_project_evaluation_report', arguments: {} } });
    const report = await server.waitFor((message) => message.id === 6);
    assert.equal(report.result.structuredContent.coverage.state, 'synthetic-only');
    assert.equal(report.result.structuredContent.corpus.externalReal.records, 0);

    server.send({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'capture_project_evaluation', arguments: {
      sourceKind: 'synthetic', session: 'none', reviewOutcome: 'pass', nextActionRating: 'useful',
    } } });
    const invalidReview = await server.waitFor((message) => message.id === 7);
    assert.equal(invalidReview.result.isError, true);
    assert.match(invalidReview.result.content[0].text, /review-provenance human or agent/i);

    server.send({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'review_project_evaluation', arguments: {
      id: captured.result.structuredContent.id.slice(0, 12), reviewOutcome: 'pass', reviewProvenance: 'agent', nextActionRating: 'useful',
    } } });
    const reviewed = await server.waitFor((message) => message.id === 8);
    assert.equal(reviewed.result.structuredContent.review.provenance, 'agent');
    assert.equal(reviewed.result.structuredContent.review.nextActionRating, 'useful');

    server.send({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'review_project_evaluation', arguments: {
      id: captured.result.structuredContent.id, reviewOutcome: 'pass', reviewProvenance: 'human',
    } } });
    const duplicateReview = await server.waitFor((message) => message.id === 9);
    assert.equal(duplicateReview.result.isError, true);
    assert.match(duplicateReview.result.content[0].text, /already reviewed/i);
  } finally { stop(server); }
});
