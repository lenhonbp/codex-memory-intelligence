from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read(rel):
    return (ROOT / rel).read_text(encoding='utf-8')

def write(rel, text):
    path = ROOT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    if not text.endswith('\n'):
        text += '\n'
    path.write_text(text, encoding='utf-8')

def replace_once(rel, old, new):
    text = read(rel)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{rel}: expected one anchor, got {count}: {old[:120]!r}')
    write(rel, text.replace(old, new, 1))

# MCP adapter imports evaluation runtime.
replace_once('src/mcp-entry.js',
"} from './session-intelligence.js';\n\nconst here = path.dirname(fileURLToPath(import.meta.url));\n",
"} from './session-intelligence.js';\nimport {\n  captureEvaluation,\n  getEvaluation,\n  listEvaluations,\n  buildEvaluationReport,\n  formatEvaluationRecord,\n  formatEvaluationList,\n  formatEvaluationReport,\n} from './evaluation.js';\n\nconst here = path.dirname(fileURLToPath(import.meta.url));\n")

replace_once('src/mcp-entry.js',
"function writable() { if (!writeEnabled) throw new Error('MCP durable project writes are disabled. Generate config with cmi mcp-config --write to enable session/finding writes.'); }\n",
"function writable() { if (!writeEnabled) throw new Error('MCP durable project writes are disabled. Generate config with cmi mcp-config --write to enable session, finding, and evaluation writes.'); }\n")

# Insert evaluation tool/resource schemas before session resources.
replace_once('src/mcp-entry.js',
"const sessionResources = [\n",
r'''const evaluationReadTools = [
  { name: 'list_project_evaluations', title: 'List project evaluations', description: 'List bounded anonymized evaluation records with explicit source, protocol, CMI subject revision, repository/task class, and review provenance.', inputSchema: { type: 'object', properties: { sourceKind: { type: 'string', enum: ['external-real', 'self-host', 'synthetic'] }, limit: { type: 'integer', minimum: 1, maximum: 200 } } }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: 'get_project_evaluation', title: 'Get project evaluation', description: 'Read one durable anonymized evaluation record by ID or unique prefix.', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: 'get_project_evaluation_report', title: 'Get project evaluation report', description: 'Aggregate the retained evaluation corpus while keeping external-real/self-host/synthetic, observational/controlled-stress, and human/agent/unreviewed evidence separate.', inputSchema: { type: 'object', properties: { sourceKind: { type: 'string', enum: ['external-real', 'self-host', 'synthetic'] } } }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
];
const evaluationWriteTools = [
  { name: 'capture_project_evaluation', title: 'Capture project evaluation', description: 'Persist one bounded anonymized evaluation record. Requires MCP write opt-in. Source class, protocol, and review provenance are explicit and are never auto-promoted.', inputSchema: { type: 'object', required: ['sourceKind'], properties: {
    sourceKind: { type: 'string', enum: ['external-real', 'self-host', 'synthetic'] },
    protocolKind: { type: 'string', enum: ['observational', 'controlled-stress'] },
    repositoryClass: { type: 'string', enum: ['application', 'service', 'library', 'cli-tool', 'tooling', 'monorepo', 'unknown'] },
    taskKind: { type: 'string', enum: ['implementation', 'debugging', 'audit', 'review', 'research', 'verification', 'no-code-investigation', 'unknown'] },
    session: { type: 'string', description: 'Closed session ID/prefix, latest, or none for project-only evidence.' },
    reviewOutcome: { type: 'string', enum: ['pass', 'partial', 'fail', 'unreviewed'] },
    reviewProvenance: { type: 'string', enum: ['human', 'agent', 'unreviewed'] },
    falsePositiveFindings: { type: 'integer', minimum: 0 },
    missedFindings: { type: 'integer', minimum: 0 },
    nextActionRating: { type: 'string', enum: ['useful', 'not-useful', 'unknown'] },
    handoffRating: { type: 'string', enum: ['useful', 'not-useful', 'unknown'] },
  } }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } },
];
const evaluationResources = [
  { uri: 'cmi://project/evaluation-report', name: 'Project evaluation report', title: 'Real-Repository Evaluation Report', description: 'Aggregate local evaluation evidence without collapsing source class, protocol, or reviewer provenance.', mimeType: 'application/json' },
];

const sessionResources = [
''')

# Replace tool selector and add evaluation handlers.
replace_once('src/mcp-entry.js',
"function isSessionTool(name) { return [...sessionReadTools, ...sessionWriteTools].some((tool) => tool.name === name); }\n",
"function isLocalTool(name) { return [...sessionReadTools, ...sessionWriteTools, ...evaluationReadTools, ...evaluationWriteTools].some((tool) => tool.name === name); }\n")

replace_once('src/mcp-entry.js',
"  throw new Error(`Unknown session tool: ${name}`);\n}\nasync function readSessionResource(uri) {\n",
r'''  if (name === 'list_project_evaluations') {
    const result = await listEvaluations(root, { sourceKind: args.sourceKind, limit: args.limit || 50 });
    return textResult(formatEvaluationList(result), result);
  }
  if (name === 'get_project_evaluation') {
    const result = await getEvaluation(root, args.id || '');
    return textResult(formatEvaluationRecord(result), result);
  }
  if (name === 'get_project_evaluation_report') {
    const result = await buildEvaluationReport(root, { sourceKind: args.sourceKind });
    return textResult(formatEvaluationReport(result), result);
  }
  if (name === 'capture_project_evaluation') {
    writable();
    const result = await captureEvaluation(root, args);
    return textResult(formatEvaluationRecord(result), result);
  }
  throw new Error(`Unknown session/evaluation tool: ${name}`);
}
async function readSessionResource(uri) {
''')

replace_once('src/mcp-entry.js',
"  if (uri === 'cmi://project/findings') return { uri, mimeType: 'application/json', text: JSON.stringify(await listFindings(root, { state: 'open', limit: 100 }), null, 2) };\n  throw new Error(`Unknown session resource: ${uri}`);\n",
"  if (uri === 'cmi://project/findings') return { uri, mimeType: 'application/json', text: JSON.stringify(await listFindings(root, { state: 'open', limit: 100 }), null, 2) };\n  if (uri === 'cmi://project/evaluation-report') return { uri, mimeType: 'application/json', text: JSON.stringify(await buildEvaluationReport(root), null, 2) };\n  throw new Error(`Unknown session/evaluation resource: ${uri}`);\n")

# Advertise evaluation contract in initialization and surface lists.
replace_once('src/mcp-entry.js',
"        if (response?.result) response.result.instructions = `${response.result.instructions || ''} Session continuation intelligence is available. For substantial work, start/observe a work session when writes are enabled; before ending, finalize it and surface unresolved P0/P1 findings plus the highest-priority next action so the user does not need to ask what comes next.`.trim();\n",
"        if (response?.result) response.result.instructions = `${response.result.instructions || ''} Session continuation intelligence is available. For substantial work, start/observe a work session when writes are enabled; before ending, finalize it and surface unresolved P0/P1 findings plus the highest-priority next action so the user does not need to ask what comes next. Real-repository evaluation intelligence is also available: keep external-real, self-host, and synthetic evidence separate; keep observational and controlled-stress protocols separate; and never treat unreviewed or agent-reviewed evidence as human-reviewed usefulness.`.trim();\n")

replace_once('src/mcp-entry.js',
"        if (response?.result?.tools) response.result.tools.push(...sessionReadTools, ...(writeEnabled ? sessionWriteTools : []));\n",
"        if (response?.result?.tools) response.result.tools.push(...sessionReadTools, ...evaluationReadTools, ...(writeEnabled ? [...sessionWriteTools, ...evaluationWriteTools] : []));\n")
replace_once('src/mcp-entry.js',
"      forward(message, (response) => { if (response?.result?.resources) response.result.resources.push(...sessionResources); return response; });\n",
"      forward(message, (response) => { if (response?.result?.resources) response.result.resources.push(...sessionResources, ...evaluationResources); return response; });\n")
replace_once('src/mcp-entry.js',
"    if (method === 'tools/call' && isSessionTool(params?.name)) {\n",
"    if (method === 'tools/call' && isLocalTool(params?.name)) {\n")
replace_once('src/mcp-entry.js',
"    if (method === 'resources/read' && sessionResources.some((resource) => resource.uri === params?.uri)) {\n",
"    if (method === 'resources/read' && [...sessionResources, ...evaluationResources].some((resource) => resource.uri === params?.uri)) {\n")

# Add an end-to-end MCP regression suite.
write('tests/evaluation-mcp.test.js', r'''import test from 'node:test';
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
    assert.ok(!tools.some((tool) => tool.name === 'capture_project_evaluation'));

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
  } finally { stop(server); }
});
''')

# MCP docs and public surface.
replace_once('docs/MCP.md',
"CMI exposes local project, change, and session-continuation intelligence over MCP stdio.\n",
"CMI exposes local project, change, session-continuation, and real-repository evaluation intelligence over MCP stdio.\n")
replace_once('docs/MCP.md',
"This keeps durable project writes disabled. Read-only durable history, memory search, graph intelligence, advisory pre-change analysis, change history, session reports, handoffs, and persistent findings remain available.\n",
"This keeps durable project writes disabled. Read-only durable history, memory search, graph intelligence, advisory pre-change analysis, change history, session reports, handoffs, persistent findings, and evaluation reports remain available.\n")
replace_once('docs/MCP.md',
"Enable durable project writes explicitly when a connected agent should create project memory, review memory/finding lifecycle, create BEFORE/DURING/AFTER change records, or track/finalize work sessions:\n",
"Enable durable project writes explicitly when a connected agent should create project memory, review memory/finding lifecycle, create BEFORE/DURING/AFTER change records, track/finalize work sessions, or capture a reviewed/anonymized evaluation record:\n")
replace_once('docs/MCP.md',
"The installed `cmi-mcp` entrypoint is session-aware: it preserves the existing MCP server as the core protocol surface and augments it with continuation tools, resources, prompts, and server instructions.\n",
"The installed `cmi-mcp` entrypoint is session-aware and evaluation-aware: it preserves the existing MCP server as the core protocol surface and augments it with continuation/evaluation tools, resources, prompts, and server instructions.\n")
replace_once('docs/MCP.md',
"Session-continuation read tools add:\n",
"Evaluation read tools add:\n\n- `list_project_evaluations` — list bounded anonymized records with source/protocol/review provenance;\n- `get_project_evaluation` — read one evaluation record by ID/prefix;\n- `get_project_evaluation_report` — aggregate corpus coverage and reviewed usefulness while keeping evidence classes separate.\n\nSession-continuation read tools add:\n")
replace_once('docs/MCP.md',
"Session-continuation write tools add:\n",
"Evaluation write tools add:\n\n- `capture_project_evaluation` — persist one bounded evaluation record with explicit source kind, protocol, task/repository class, optional closed-session association, and review provenance. It is absent unless `CMI_WRITE_ENABLED=1`.\n\nSession-continuation write tools add:\n")
replace_once('docs/MCP.md',
"Session-continuation resources:\n\n- `cmi://project/session/latest`\n",
"Evaluation resources:\n\n- `cmi://project/evaluation-report`\n\nSession-continuation resources:\n\n- `cmi://project/session/latest`\n")
replace_once('docs/MCP.md',
"See [Session Continuation Intelligence](SESSION_INTELLIGENCE.md).\n\n## Durable mutation boundary\n",
"See [Session Continuation Intelligence](SESSION_INTELLIGENCE.md).\n\n## Evaluation trust model\n\nEvaluation records live under `.codex-memory/evaluations/`. Read/list/report are available in safe MCP mode; durable capture is write-gated. MCP uses the same runtime contract as the CLI, including explicit `external-real|self-host|synthetic` source class, `observational|controlled-stress` protocol, CMI version/source revision, and `human|agent|unreviewed` review provenance.\n\nThe evaluation report never promotes self-host/synthetic runs into independent repository evidence, never lets controlled-stress inflate ordinary observational coverage, and never combines agent-reviewed usefulness with human-reviewed usefulness. MCP does not make an evaluation judgment merely because an agent calls the report tool.\n\nSee [Real-Repository Evaluation](EVALUATION.md).\n\n## Durable mutation boundary\n")

replace_once('README.md',
"The unreleased v0.9.x evaluation foundation keeps field evidence separate from ordinary regression tests. Capture explicitly classified runs after scanning and, when relevant, closing a work session:\n",
"The unreleased v0.9.x evaluation foundation keeps field evidence separate from ordinary regression tests and exposes the same contract through CLI plus the session-aware MCP adapter. Capture explicitly classified runs after scanning and, when relevant, closing a work session:\n")

replace_once('CHANGELOG.md',
"- Evaluation subject provenance (CMI version + source revision when available), observational vs controlled-stress protocol classification, and explicit human vs agent review provenance so field coverage and usefulness evidence cannot be silently mixed.\n",
"- Evaluation subject provenance (CMI version + source revision when available), observational vs controlled-stress protocol classification, and explicit human vs agent review provenance so field coverage and usefulness evidence cannot be silently mixed.\n- Session-aware MCP parity for evaluation list/show/report plus write-gated capture and `cmi://project/evaluation-report`, using the same runtime evidence contract as the CLI.\n")

replace_once('ROADMAP.md',
"- [x] Bind evaluation records to CMI version/source revision and keep observational vs controlled-stress plus human vs agent review provenance separate.\n",
"- [x] Bind evaluation records to CMI version/source revision and keep observational vs controlled-stress plus human vs agent review provenance separate.\n- [x] Keep CLI and session-aware MCP evaluation surfaces aligned, with safe-mode reads/reporting and explicit write-gated capture.\n")

print('evaluation MCP parity patch applied')
