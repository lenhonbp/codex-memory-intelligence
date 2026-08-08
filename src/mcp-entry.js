#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import {
  startSession,
  observeSession,
  assessSession,
  closeSession,
  getSession,
  listSessions,
  getSessionHandoff,
  listFindings,
  getFinding,
  setFindingState,
  formatSessionReport,
  formatSessionAssessment,
  formatHandoff,
  formatFindingList,
} from './session-intelligence.js';
import {
  captureEvaluation,
  getEvaluation,
  reviewEvaluation,
  listEvaluations,
  buildEvaluationReport,
  formatEvaluationRecord,
  formatEvaluationList,
  formatEvaluationReport,
} from './evaluation.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.env.CMI_PROJECT_ROOT || process.cwd());
const writeEnabled = /^(1|true|yes)$/i.test(process.env.CMI_WRITE_ENABLED || '');
const child = spawn(process.execPath, [path.join(here, 'mcp.js')], {
  cwd: process.cwd(),
  env: process.env,
  stdio: ['pipe', 'pipe', 'pipe'],
  windowsHide: true,
});
child.stderr.on('data', (chunk) => process.stderr.write(chunk));
child.on('error', (error) => process.stderr.write(`CMI MCP core error: ${error.message}\n`));

let lifecycle = 'new';
const transforms = new Map();
function send(message) { process.stdout.write(`${JSON.stringify(message)}\n`); }
function errorResult(id, message) { send({ jsonrpc: '2.0', id: id ?? null, result: { isError: true, content: [{ type: 'text', text: message }] } }); }
function textResult(text, structuredContent) { return { content: [{ type: 'text', text }], ...(structuredContent ? { structuredContent } : {}) }; }
function writable() { if (!writeEnabled) throw new Error('MCP durable project writes are disabled. Generate config with cmi mcp-config --write to enable session, finding, and evaluation writes.'); }
function forward(message, transform) {
  if (transform && message?.id !== undefined) transforms.set(String(message.id), transform);
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

const observationProperties = {
  files: { type: 'array', items: { type: 'string' }, maxItems: 160 },
  notes: { type: 'array', items: { type: 'string', maxLength: 500 }, maxItems: 40 },
  accomplished: { type: 'array', items: { type: 'string', maxLength: 500 }, maxItems: 40 },
  blockers: { type: 'array', items: { type: 'string', maxLength: 500 }, maxItems: 40 },
  decisions: { type: 'array', items: { type: 'string', maxLength: 500 }, maxItems: 40 },
  questions: { type: 'array', items: { type: 'string', maxLength: 500 }, maxItems: 40 },
};
const sessionReadTools = [
  { name: 'get_work_session_status', title: 'Get work-session status', description: 'Assess the active work session now: current repository state, persistent unresolved findings, session scope, and prioritized evidence-based next actions.', inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Session ID/prefix; defaults to latest active session.' } } }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: 'get_work_session_report', title: 'Get work-session report', description: 'Read one active or closed durable session record, including outcome intelligence when closed.', inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Session ID/prefix or latest.' } } }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: 'list_work_sessions', title: 'List work sessions', description: 'List bounded session summaries and their recorded next action.', inputSchema: { type: 'object', properties: { status: { type: 'string', enum: ['active', 'closed'] }, limit: { type: 'integer', minimum: 1, maximum: 100 } } }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: 'get_session_handoff', title: 'Get session handoff', description: 'Return the continuation pack from a closed session: objective, state, open findings, and prioritized next actions.', inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Session ID/prefix or latest closed session.' } } }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: 'list_project_findings', title: 'List persistent project findings', description: 'List unresolved or reviewed findings that persist across sessions so important issues are not forgotten when an AI session ends.', inputSchema: { type: 'object', properties: { state: { type: 'string', enum: ['open', 'resolved', 'accepted', 'dismissed', 'superseded'] }, limit: { type: 'integer', minimum: 1, maximum: 200 } } }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: 'get_project_finding', title: 'Get project finding', description: 'Read one persistent finding by ID or unique prefix with its evidence and lifecycle.', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
];
const sessionWriteTools = [
  { name: 'start_work_session', title: 'Start work session', description: 'Start durable session tracking for coding, audit, debugging, review, research, verification, or other project work. Requires MCP write opt-in.', inputSchema: { type: 'object', required: ['goal'], properties: { goal: { type: 'string', minLength: 1, maxLength: 500 }, ...observationProperties } }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } },
  { name: 'observe_work_session', title: 'Observe work session', description: 'Record meaningful session progress, files, accomplishments, blockers, decisions, or open questions so close-session intelligence has explicit evidence.', inputSchema: { type: 'object', properties: { id: { type: 'string' }, ...observationProperties } }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } },
  { name: 'finalize_work_session', title: 'Finalize work session', description: 'Close the session and always return outcome, unresolved findings, prioritized next actions, knowledge candidates, and a handoff. Call before ending substantial project work.', inputSchema: { type: 'object', properties: { id: { type: 'string' }, outcome: { type: 'string', enum: ['succeeded', 'partial', 'blocked', 'investigated', 'abandoned', 'unknown'] }, ...observationProperties } }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } },
  { name: 'set_project_finding_state', title: 'Set project-finding state', description: 'Explicitly resolve, accept, dismiss, reopen, or supersede one persistent finding with a review reason.', inputSchema: { type: 'object', required: ['id', 'state', 'reason'], properties: { id: { type: 'string' }, state: { type: 'string', enum: ['open', 'resolved', 'accepted', 'dismissed', 'superseded'] }, reason: { type: 'string', minLength: 1, maxLength: 500 }, changedBy: { type: 'string', maxLength: 100 }, supersededBy: { type: 'string' } } }, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false } },
];
const evaluationReadTools = [
  { name: 'list_project_evaluations', title: 'List project evaluations', description: 'List bounded anonymized evaluation records with explicit source, protocol, CMI subject revision, repository/task class, and review provenance.', inputSchema: { type: 'object', properties: { sourceKind: { type: 'string', enum: ['external-real', 'self-host', 'synthetic'] }, taskKind: { type: 'string', enum: ['implementation', 'debugging', 'audit', 'review', 'research', 'verification', 'refactor', 'migration', 'architecture-analysis', 'no-code-investigation', 'unknown'] }, subjectVersion: { type: 'string' }, sinceDays: { type: 'integer', minimum: 1, maximum: 3650 }, limit: { type: 'integer', minimum: 1, maximum: 200 } } }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: 'get_project_evaluation', title: 'Get project evaluation', description: 'Read one durable anonymized evaluation record by ID or unique prefix.', inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: 'get_project_evaluation_report', title: 'Get project evaluation report', description: 'Aggregate retained evaluation evidence with repeated-repository longitudinal metrics, explicit reviewer outcomes, filters, and structural evidence gaps while preserving provenance separation.', inputSchema: { type: 'object', properties: { sourceKind: { type: 'string', enum: ['external-real', 'self-host', 'synthetic'] }, taskKind: { type: 'string', enum: ['implementation', 'debugging', 'audit', 'review', 'research', 'verification', 'refactor', 'migration', 'architecture-analysis', 'no-code-investigation', 'unknown'] }, subjectVersion: { type: 'string' }, sinceDays: { type: 'integer', minimum: 1, maximum: 3650 } } }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
];
const evaluationWriteTools = [
  { name: 'capture_project_evaluation', title: 'Capture project evaluation', description: 'Persist one bounded anonymized evaluation record. Requires MCP write opt-in. Source class, protocol, and review provenance are explicit and are never auto-promoted.', inputSchema: { type: 'object', required: ['sourceKind'], properties: {
    sourceKind: { type: 'string', enum: ['external-real', 'self-host', 'synthetic'] },
    protocolKind: { type: 'string', enum: ['observational', 'controlled-stress'] },
    repositoryClass: { type: 'string', enum: ['application', 'service', 'library', 'cli-tool', 'tooling', 'monorepo', 'unknown'] },
    taskKind: { type: 'string', enum: ['implementation', 'debugging', 'audit', 'review', 'research', 'verification', 'refactor', 'migration', 'architecture-analysis', 'no-code-investigation', 'unknown'] },
    session: { type: 'string', description: 'Closed session ID/prefix, latest, or none for project-only evidence.' },
    reviewOutcome: { type: 'string', enum: ['pass', 'partial', 'fail', 'unreviewed'] },
    reviewProvenance: { type: 'string', enum: ['human', 'agent', 'unreviewed'] },
    falsePositiveFindings: { type: 'integer', minimum: 0 },
    missedFindings: { type: 'integer', minimum: 0 },
    nextActionRating: { type: 'string', enum: ['useful', 'not-useful', 'unknown'] },
    handoffRating: { type: 'string', enum: ['useful', 'not-useful', 'unknown'] },
    reconstructionRating: { type: 'string', enum: ['reduced', 'unchanged', 'increased', 'not-applicable', 'unknown'] },
    followUpOutcome: { type: 'string', enum: ['not-needed', 'needed', 'not-applicable', 'unknown'] },
    verificationChoiceOutcome: { type: 'string', enum: ['improved', 'unchanged', 'worse', 'not-applicable', 'unknown'] },
    historyRating: { type: 'string', enum: ['useful', 'not-useful', 'not-applicable', 'unknown'] },
    stressScenario: { type: 'string', enum: ['rename-after-scan', 'history-rewrite', 'dirty-worktree', 'clock-skew', 'interrupted-session', 'concurrent-sessions', 'large-monorepo', 'corrupt-durable-record', 'stale-graph'] },
    stressExpected: { type: 'integer', minimum: 1 },
    stressPassed: { type: 'integer', minimum: 0 },
    stressFailed: { type: 'integer', minimum: 0 },
  } }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } },
  { name: 'review_project_evaluation', title: 'Review project evaluation', description: 'Attach one explicit human or agent post-hoc review to an unreviewed evaluation record without changing its captured measurements, source/protocol class, or stress evidence. Requires MCP write opt-in.', inputSchema: { type: 'object', required: ['id', 'reviewOutcome', 'reviewProvenance'], properties: {
    id: { type: 'string' },
    reviewOutcome: { type: 'string', enum: ['pass', 'partial', 'fail'] },
    reviewProvenance: { type: 'string', enum: ['human', 'agent'] },
    falsePositiveFindings: { type: 'integer', minimum: 0 },
    missedFindings: { type: 'integer', minimum: 0 },
    nextActionRating: { type: 'string', enum: ['useful', 'not-useful', 'unknown'] },
    handoffRating: { type: 'string', enum: ['useful', 'not-useful', 'unknown'] },
    reconstructionRating: { type: 'string', enum: ['reduced', 'unchanged', 'increased', 'not-applicable', 'unknown'] },
    followUpOutcome: { type: 'string', enum: ['not-needed', 'needed', 'not-applicable', 'unknown'] },
    verificationChoiceOutcome: { type: 'string', enum: ['improved', 'unchanged', 'worse', 'not-applicable', 'unknown'] },
    historyRating: { type: 'string', enum: ['useful', 'not-useful', 'not-applicable', 'unknown'] },
  } }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } },
];
const evaluationResources = [
  { uri: 'cmi://project/evaluation-report', name: 'Project evaluation report', title: 'Real-Repository Evaluation Report', description: 'Aggregate local evaluation evidence without collapsing source class, protocol, or reviewer provenance.', mimeType: 'application/json' },
];

const sessionResources = [
  { uri: 'cmi://project/session/latest', name: 'Latest work session', title: 'Latest Work Session', description: 'Latest durable session report, including next-action intelligence when closed.', mimeType: 'application/json' },
  { uri: 'cmi://project/session-handoff/latest', name: 'Latest session handoff', title: 'Latest Session Handoff', description: 'Continuation pack for the latest closed session.', mimeType: 'application/json' },
  { uri: 'cmi://project/findings', name: 'Project findings', title: 'Persistent Project Findings', description: 'Open findings that should remain visible across AI sessions until evidence or review resolves them.', mimeType: 'application/json' },
];
const sessionPrompts = [
  { name: 'close_project_session', title: 'Close project session with next actions', description: 'Finalize substantial project work and surface what remains plus exactly what should happen next.', arguments: [] },
  { name: 'continue_from_session_handoff', title: 'Continue from the latest handoff', description: 'Resume project work from the latest CMI handoff instead of asking the user to reconstruct context.', arguments: [] },
];

function isLocalTool(name) { return [...sessionReadTools, ...sessionWriteTools, ...evaluationReadTools, ...evaluationWriteTools].some((tool) => tool.name === name); }
async function callSessionTool(name, args = {}) {
  if (name === 'get_work_session_status') {
    const result = await assessSession(root, args.id || 'latest');
    return textResult(formatSessionAssessment(result), result);
  }
  if (name === 'get_work_session_report') {
    const result = await getSession(root, args.id || 'latest');
    return textResult(formatSessionReport(result), result);
  }
  if (name === 'list_work_sessions') {
    const result = await listSessions(root, { status: args.status, limit: args.limit || 20 });
    return textResult(JSON.stringify(result, null, 2), result);
  }
  if (name === 'get_session_handoff') {
    const result = await getSessionHandoff(root, args.id || 'latest');
    return textResult(formatHandoff(result), result);
  }
  if (name === 'list_project_findings') {
    const result = await listFindings(root, { state: args.state, limit: args.limit || 50 });
    return textResult(formatFindingList(result), result);
  }
  if (name === 'get_project_finding') {
    const result = await getFinding(root, args.id || '');
    return textResult(`${result.title}\nState: ${result.state}\nSeverity: ${result.severity}\nConfidence: ${result.confidence}\nEvidence type: ${result.evidenceType}\n\n${result.detail}`, result);
  }
  if (name === 'start_work_session') {
    writable();
    const result = await startSession(root, args.goal || '', args);
    return textResult(formatSessionReport(result), result);
  }
  if (name === 'observe_work_session') {
    writable();
    const result = await observeSession(root, args.id || 'latest', args);
    return textResult(`Observed work session ${result.id} with ${result.observations.length} durable observation(s).`, result);
  }
  if (name === 'finalize_work_session') {
    writable();
    const result = await closeSession(root, args.id || 'latest', args);
    return textResult(formatSessionReport(result), result);
  }
  if (name === 'set_project_finding_state') {
    writable();
    const result = await setFindingState(root, args.id || '', args.state || '', { reason: args.reason, changedBy: args.changedBy || 'mcp-agent', supersededBy: args.supersededBy });
    return textResult(`Finding ${result.id} is now ${result.state}.`, result);
  }
  if (name === 'list_project_evaluations') {
    const result = await listEvaluations(root, { sourceKind: args.sourceKind, taskKind: args.taskKind, subjectVersion: args.subjectVersion, sinceDays: args.sinceDays, limit: args.limit || 50 });
    return textResult(formatEvaluationList(result), result);
  }
  if (name === 'get_project_evaluation') {
    const result = await getEvaluation(root, args.id || '');
    return textResult(formatEvaluationRecord(result), result);
  }
  if (name === 'get_project_evaluation_report') {
    const result = await buildEvaluationReport(root, { sourceKind: args.sourceKind, taskKind: args.taskKind, subjectVersion: args.subjectVersion, sinceDays: args.sinceDays });
    return textResult(formatEvaluationReport(result), result);
  }
  if (name === 'capture_project_evaluation') {
    writable();
    const result = await captureEvaluation(root, args);
    return textResult(formatEvaluationRecord(result), result);
  }
  if (name === 'review_project_evaluation') {
    writable();
    const result = await reviewEvaluation(root, args.id || '', args);
    return textResult(formatEvaluationRecord(result), result);
  }
  throw new Error(`Unknown session/evaluation tool: ${name}`);
}
async function readSessionResource(uri) {
  if (uri === 'cmi://project/session/latest') return { uri, mimeType: 'application/json', text: JSON.stringify(await getSession(root, 'latest'), null, 2) };
  if (uri === 'cmi://project/session-handoff/latest') return { uri, mimeType: 'application/json', text: JSON.stringify(await getSessionHandoff(root, 'latest'), null, 2) };
  if (uri === 'cmi://project/findings') return { uri, mimeType: 'application/json', text: JSON.stringify(await listFindings(root, { state: 'open', limit: 100 }), null, 2) };
  if (uri === 'cmi://project/evaluation-report') return { uri, mimeType: 'application/json', text: JSON.stringify(await buildEvaluationReport(root), null, 2) };
  throw new Error(`Unknown session/evaluation resource: ${uri}`);
}
function sessionPrompt(name) {
  if (name === 'close_project_session') {
    return { description: 'Close the current project session and make the next step obvious.', messages: [{ role: 'user', content: { type: 'text', text: 'Before ending substantial project work, call finalize_work_session. Record any final accomplishments, blockers, decisions, open questions, and project-relative files that CMI cannot observe itself. Then present the session outcome, all P0/P1 unresolved findings, and the highest-priority next action to the user without waiting for them to ask what to do next. Preserve the distinction between observed evidence, reviewed knowledge, historical correlation, and inference. Do not claim verification that was not actually performed.' } }] };
  }
  if (name === 'continue_from_session_handoff') {
    return { description: 'Resume from durable CMI continuation state.', messages: [{ role: 'user', content: { type: 'text', text: 'Read get_session_handoff or cmi://project/session-handoff/latest before reconstructing project state manually. Continue the recorded objective when appropriate. Address P0/P1 next actions before unrelated work unless the user explicitly changes priority. Re-check current repository evidence because handoff state can become stale, and do not promote knowledge candidates into durable truth without review.' } }] };
  }
  throw new Error(`Unknown session prompt: ${name}`);
}

const childOutput = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
childOutput.on('line', (line) => {
  let message;
  try { message = JSON.parse(line); } catch { process.stdout.write(`${line}\n`); return; }
  const key = message?.id === undefined ? null : String(message.id);
  const transform = key ? transforms.get(key) : null;
  if (transform) {
    transforms.delete(key);
    try { message = transform(message) || message; } catch (error) { process.stderr.write(`CMI MCP adapter error: ${error.message}\n`); }
  }
  send(message);
});

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
let queue = Promise.resolve();
input.on('line', (line) => {
  queue = queue.then(async () => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let message;
    try { message = JSON.parse(trimmed); }
    catch { child.stdin.write(`${trimmed}\n`); return; }
    const { id, method, params = {} } = message;
    if (method === 'initialize') {
      lifecycle = 'initializing';
      forward(message, (response) => {
        if (response?.result) response.result.instructions = `${response.result.instructions || ''} Session continuation intelligence is available. For substantial work, start/observe a work session when writes are enabled; before ending, finalize it and surface unresolved P0/P1 findings plus the highest-priority next action so the user does not need to ask what comes next. Real-repository evaluation intelligence is also available: keep external-real, self-host, and synthetic evidence separate; keep observational and controlled-stress protocols separate; and never treat unreviewed or agent-reviewed evidence as human-reviewed usefulness. Longitudinal reconstruction, follow-up, history-usefulness, and verification-choice outcomes require explicit review; structural evidence diagnostics never imply statistical sufficiency or automatic threshold recalibration.`.trim();
        return response;
      });
      return;
    }
    if (method === 'notifications/initialized') { lifecycle = 'ready'; forward(message); return; }
    if (method === 'tools/list') {
      forward(message, (response) => {
        if (response?.result?.tools) response.result.tools.push(...sessionReadTools, ...evaluationReadTools, ...(writeEnabled ? [...sessionWriteTools, ...evaluationWriteTools] : []));
        return response;
      });
      return;
    }
    if (method === 'resources/list') {
      forward(message, (response) => { if (response?.result?.resources) response.result.resources.push(...sessionResources, ...evaluationResources); return response; });
      return;
    }
    if (method === 'prompts/list') {
      forward(message, (response) => { if (response?.result?.prompts) response.result.prompts.push(...sessionPrompts); return response; });
      return;
    }
    if (method === 'tools/call' && isLocalTool(params?.name)) {
      if (lifecycle !== 'ready') { errorResult(id, 'Server is not initialized.'); return; }
      try { send({ jsonrpc: '2.0', id, result: await callSessionTool(params.name, params.arguments || {}) }); }
      catch (error) { errorResult(id, error.message); }
      return;
    }
    if (method === 'resources/read' && [...sessionResources, ...evaluationResources].some((resource) => resource.uri === params?.uri)) {
      if (lifecycle !== 'ready') { send({ jsonrpc: '2.0', id, error: { code: -32002, message: 'Server is not initialized.' } }); return; }
      try { send({ jsonrpc: '2.0', id, result: { contents: [await readSessionResource(params.uri)] } }); }
      catch (error) { send({ jsonrpc: '2.0', id, error: { code: -32001, message: error.message } }); }
      return;
    }
    if (method === 'prompts/get' && sessionPrompts.some((prompt) => prompt.name === params?.name)) {
      if (lifecycle !== 'ready') { send({ jsonrpc: '2.0', id, error: { code: -32002, message: 'Server is not initialized.' } }); return; }
      try { send({ jsonrpc: '2.0', id, result: sessionPrompt(params.name) }); }
      catch (error) { send({ jsonrpc: '2.0', id, error: { code: -32602, message: error.message } }); }
      return;
    }
    forward(message);
  }).catch((error) => process.stderr.write(`CMI MCP session adapter error: ${error.message}\n`));
});

function stop() {
  child.stdin.end();
  child.kill();
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
