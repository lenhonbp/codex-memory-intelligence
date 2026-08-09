from pathlib import Path

root = Path('.')

closing = r'''import { listChangeRecords } from './change-intelligence.js';
import { getSession, listSessions, listFindings } from './session-intelligence.js';
import { searchMemory, tokenize } from './search.js';

const MAX_ALERTS = 3;
const LEVEL_ORDER = { blocker: 5, warning: 4, reminder: 3, info: 2, clean: 1 };
const DURABLE_SOURCES = new Set(['memory.md', 'decisions.md', 'mistakes.md']);
const HIGH_SIGNAL_TERMS = new Set([
  'ui', 'figma', 'design', 'css', 'style', 'token', 'spacing', 'layout', 'accessibility', 'a11y',
  'api', 'auth', 'security', 'database', 'db', 'migration', 'schema', 'architecture', 'boundary',
]);

function bounded(values, limit) { return (values || []).slice(0, Math.max(0, limit)); }
function unique(values) { return [...new Set((values || []).filter(Boolean))]; }
function compactText(value, limit = 280) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  return clean.length <= limit ? clean : `${clean.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}
function levelForFinding(finding) {
  if (finding.state === 'accepted') return 'info';
  if (finding.category === 'verification-failed' || finding.category === 'session-blocker') return 'blocker';
  if (finding.category === 'active-change' && finding.sessionRelevance === 'concurrent-unattributed') return 'reminder';
  if (['verification-missing', 'verification-incomplete', 'project-intelligence-missing', 'graph-drift', 'invalid-change-records', 'prediction-gap', 'unexpected-impact', 'uncaptured-session-change'].includes(finding.category)) return 'warning';
  if (['open-question', 'uncommitted-session-work', 'stale-memory', 'preexisting-worktree', 'git-history-rewrite', 'active-change'].includes(finding.category)) return 'reminder';
  return finding.severity === 'critical' ? 'blocker' : finding.severity === 'high' ? 'warning' : finding.severity === 'medium' ? 'warning' : finding.severity === 'low' ? 'reminder' : 'info';
}
function changeIdsFromFinding(finding) {
  const ids = [];
  for (const evidence of finding.evidence || []) {
    const match = String(evidence).match(/^change:([0-9a-f-]+)$/i);
    if (match) ids.push(match[1]);
  }
  if (finding.category === 'active-change') {
    const target = String(finding.key || '').replace(/^active-change:/, '');
    if (/^[0-9a-f-]{8,}$/i.test(target)) ids.push(target);
  }
  return unique(ids);
}
function findingAlert(finding, activeById) {
  const relatedChangeIds = changeIdsFromFinding(finding);
  const active = relatedChangeIds.map((id) => activeById.get(id)).find(Boolean);
  const carryover = finding.category === 'active-change' && finding.sessionRelevance === 'concurrent-unattributed';
  const title = active
    ? `${carryover ? 'Unfinished previous work' : 'Active work remains unfinished'}: ${active.goal}`
    : finding.title;
  return {
    id: `finding:${finding.id}`,
    kind: finding.category === 'active-change' ? 'unfinished-work' : finding.category,
    severity: levelForFinding(finding),
    title,
    detail: finding.detail,
    confidence: finding.confidence || 'low',
    evidenceType: finding.evidenceType || 'inferred',
    evidence: bounded(finding.evidence || [], 12),
    relatedFindingIds: [finding.id],
    relatedChangeIds,
    relatedFiles: bounded(finding.relatedFiles || [], 12),
    occurrences: finding.occurrences || 1,
    findingState: finding.state,
    violationEstablished: ['verification-failed', 'session-blocker'].includes(finding.category),
  };
}
function activeChangeAlert(change) {
  return {
    id: `active-change:${change.id}`,
    kind: 'unfinished-work',
    severity: 'reminder',
    title: `Unfinished previous work: ${change.goal}`,
    detail: `Change "${change.goal}" is still active. CMI is preserving it across sessions so a newer task does not silently erase unfinished work.`,
    confidence: 'high',
    evidenceType: 'observed',
    evidence: [`change:${change.id}`, 'change-status:active'],
    relatedFindingIds: [],
    relatedChangeIds: [change.id],
    relatedFiles: [],
    occurrences: 1,
    findingState: null,
    violationEstablished: false,
  };
}
function sourceOverlapsScope(source, scope) {
  const normalized = String(source || '').replace(/\\/g, '/').replace(/^\.\//, '');
  return scope.some((file) => file === normalized || file.startsWith(`${normalized}/`) || normalized.startsWith(`${file}/`));
}
function reviewedRuleRelevant(item, queryTokens, scope) {
  const sources = item.metadata?.sources || [];
  if (sources.some((source) => sourceOverlapsScope(source, scope))) return true;
  const ruleTokens = new Set(tokenize(`${item.title}\n${item.text}\n${sources.join(' ')}`));
  const shared = [...queryTokens].filter((token) => ruleTokens.has(token));
  if (shared.length >= 2) return true;
  return shared.some((token) => HIGH_SIGNAL_TERMS.has(token));
}
async function reviewedConsistencyAlerts(root, session) {
  const scope = (session.close?.scope?.paths || session.close?.handoff?.sessionScope || []).map((item) => String(item).replace(/\\/g, '/'));
  const query = `${session.goal} ${scope.join(' ')}`.trim();
  if (!query) return [];
  let results = [];
  try { results = await searchMemory(root, query, 30, { stalePolicy: 'exclude' }); } catch { return []; }
  const queryTokens = new Set(tokenize(query));
  return results
    .filter((item) => DURABLE_SOURCES.has(item.source))
    .filter((item) => item.metadata?.semanticReviewCurrent === true && (item.metadata?.knowledgeState || 'active') === 'active')
    .filter((item) => reviewedRuleRelevant(item, queryTokens, scope))
    .slice(0, 4)
    .map((item) => ({
      id: `reviewed-rule:${item.metadata.id || `${item.source}:${item.title}`}`,
      kind: 'consistency-rule',
      severity: 'reminder',
      title: `Reviewed project rule applies: ${compactText(item.title, 120)}`,
      detail: `Reviewed project knowledge is relevant to this session: ${compactText(item.text, 260)} CMI has not established a violation; verify the implementation against this reviewed rule before claiming consistency.`,
      confidence: 'high',
      evidenceType: 'reviewed',
      evidence: unique([item.metadata?.id ? `memory:${item.metadata.id}` : null, ...(item.metadata?.sources || []).map((source) => `source:${source}`)]),
      relatedFindingIds: [],
      relatedChangeIds: [],
      relatedFiles: bounded((item.metadata?.sources || []).filter((source) => sourceOverlapsScope(source, scope)), 12),
      occurrences: 1,
      findingState: null,
      violationEstablished: false,
    }));
}
async function resolveClosedSession(root, selector) {
  if (!selector || selector === 'latest') {
    const sessions = await listSessions(root, { status: 'closed', limit: 1 });
    if (!sessions.records.length) throw new Error('No closed CMI session exists for Closing Intelligence.');
    return getSession(root, sessions.records[0].id);
  }
  const session = await getSession(root, selector);
  if (session.status !== 'closed' || !session.close?.handoff) throw new Error('Closing Intelligence is available only for a closed session.');
  return session;
}
function dedupeAlerts(alerts) {
  const seenFindings = new Set();
  const seenChanges = new Set();
  const output = [];
  for (const alert of alerts) {
    if ((alert.relatedFindingIds || []).some((id) => seenFindings.has(id))) continue;
    if (alert.kind === 'unfinished-work' && (alert.relatedChangeIds || []).some((id) => seenChanges.has(id))) continue;
    output.push(alert);
    for (const id of alert.relatedFindingIds || []) seenFindings.add(id);
    for (const id of alert.relatedChangeIds || []) seenChanges.add(id);
  }
  return output;
}
function sortAlerts(alerts) {
  return alerts.sort((a, b) => (LEVEL_ORDER[b.severity] || 0) - (LEVEL_ORDER[a.severity] || 0)
    || (b.occurrences || 1) - (a.occurrences || 1)
    || a.title.localeCompare(b.title));
}

export async function buildClosingIntelligence(root, selector = 'latest') {
  const session = await resolveClosedSession(root, selector);
  const [allFindings, activeChanges, consistency] = await Promise.all([
    listFindings(root, { limit: 200 }),
    listChangeRecords(root, { status: 'active', limit: 100 }),
    reviewedConsistencyAlerts(root, session),
  ]);
  const activeById = new Map(activeChanges.records.map((item) => [item.id, item]));
  const projectFindings = allFindings.findings.filter((item) => ['open', 'accepted'].includes(item.state));
  const findingAlerts = projectFindings.map((item) => findingAlert(item, activeById));
  const representedChanges = new Set(findingAlerts.flatMap((item) => item.relatedChangeIds || []));
  const carryover = activeChanges.records.filter((item) => !representedChanges.has(item.id)).map(activeChangeAlert);
  const candidates = sortAlerts(dedupeAlerts([...findingAlerts, ...carryover, ...consistency]));
  const alerts = bounded(candidates, MAX_ALERTS);
  const counts = { blocker: 0, warning: 0, reminder: 0, info: 0, totalCandidates: candidates.length, shown: alerts.length };
  for (const alert of candidates) if (counts[alert.severity] !== undefined) counts[alert.severity] += 1;
  const state = alerts.length ? alerts[0].severity : 'clean';
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    session: { id: session.id, goal: session.goal, outcome: session.close.outcome, closedAt: session.close.closedAt },
    state,
    alerts,
    counts,
    nextAction: session.close.handoff.nextAction,
    policy: 'Closing Intelligence is a bounded read model over existing CMI session, change, finding, and reviewed-memory evidence. It shows at most three alerts, does not create durable truth, and does not treat reviewed-rule relevance or heuristic consistency as proof of a violation.',
  };
}

export function formatClosingIntelligence(result) {
  if (!result.alerts.length) return '### CMI Intelligence\n✓ CLEAN · No material unresolved, carryover, verification, or reviewed-consistency alert was found for this closing view.';
  const icon = { blocker: '🔴', warning: '🟠', reminder: '🟡', info: '🔵' };
  const rows = result.alerts.map((alert) => {
    const occurrence = alert.occurrences > 1 ? ` · seen ${alert.occurrences} times` : '';
    return `${icon[alert.severity] || '🔵'} **${alert.severity.toUpperCase()} · ${alert.title}**\n${alert.detail}\nEvidence: ${alert.evidenceType} · confidence ${alert.confidence}${occurrence}`;
  });
  const next = result.nextAction ? `\n→ **Next:** ${result.nextAction.priority} ${result.nextAction.action}` : '';
  return `### CMI Intelligence\n${rows.join('\n\n')}${next}\n\n_CMI reports evidence and reviewed constraints; relevance alone is not proof of a design, architecture, or policy violation._`;
}
'''
(root / 'src/closing-intelligence.js').write_text(closing, encoding='utf-8')

test_closing = r'''import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanProject, remember } from '../src/core.js';
import { setMemoryLifecycle } from '../src/stale.js';
import { startChangeRecord, completeChangeRecord } from '../src/change-intelligence.js';
import { startSession, closeSession } from '../src/session-intelligence.js';
import { buildClosingIntelligence, formatClosingIntelligence } from '../src/closing-intelligence.js';
import { activateProject } from '../src/activation.js';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-closing-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ type: 'module' }));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'feature-a.js'), 'export const featureA = true;\n');
  await fs.writeFile(path.join(root, 'src', 'feature-b.js'), 'export const featureB = true;\n');
  await scanProject(root);
  return root;
}

test('unfinished feature A remains visible after unrelated feature B closes, then disappears after A is completed', async () => {
  const root = await fixture();
  const changeA = await startChangeRecord(root, 'feature A profile flow');
  const sessionA = await startSession(root, 'feature A profile flow');
  await closeSession(root, sessionA.id, { outcome: 'partial', notes: ['Feature A is intentionally left unfinished for now.'] });
  const sessionB = await startSession(root, 'feature B notification copy');
  await closeSession(root, sessionB.id, { outcome: 'investigated', notes: ['Reviewed feature B without touching feature A.'] });
  const closingB = await buildClosingIntelligence(root, sessionB.id);
  const carryover = closingB.alerts.find((item) => item.kind === 'unfinished-work' && item.relatedChangeIds.includes(changeA.id));
  assert.ok(carryover);
  assert.equal(carryover.severity, 'reminder');
  assert.match(carryover.title, /Unfinished previous work.*feature A/i);
  assert.equal(carryover.evidenceType, 'observed');
  await completeChangeRecord(root, changeA.id, { outcome: 'abandoned', notes: ['Explicitly deferred by project owner.'] });
  const sessionC = await startSession(root, 'feature C unrelated review');
  await closeSession(root, sessionC.id, { outcome: 'investigated', notes: ['No implementation change.'] });
  const closingC = await buildClosingIntelligence(root, sessionC.id);
  assert.ok(!closingC.alerts.some((item) => item.relatedChangeIds.includes(changeA.id)));
});

test('reviewed UI rule is surfaced as applicability evidence without inventing a Figma violation', async () => {
  const root = await fixture();
  await fs.mkdir(path.join(root, 'docs'), { recursive: true });
  await fs.writeFile(path.join(root, 'docs', 'design-system.md'), '# Design system\nUse Figma spacing tokens and the reviewed primary-button sizing contract.\n');
  await fs.writeFile(path.join(root, 'src', 'ui.js'), 'export const buttonLayout = true;\n');
  await scanProject(root);
  const decision = await remember(root, 'decision', 'UI button layout must follow the reviewed Figma spacing tokens and primary-button sizing contract.', { sources: ['docs/design-system.md'] });
  await setMemoryLifecycle(root, decision.id, 'active', { changedBy: 'design-reviewer', reason: 'Design-system rule reviewed for project UI work.' });
  const session = await startSession(root, 'update UI button layout from Figma');
  await closeSession(root, session.id, { outcome: 'investigated', files: ['src/ui.js'], notes: ['Reviewed UI layout implementation.'] });
  const closing = await buildClosingIntelligence(root, session.id);
  const rule = closing.alerts.find((item) => item.kind === 'consistency-rule');
  assert.ok(rule);
  assert.equal(rule.evidenceType, 'reviewed');
  assert.equal(rule.violationEstablished, false);
  assert.match(rule.detail, /has not established a violation/i);
});

test('clean closing emits a single branded CLEAN line', async () => {
  const root = await fixture();
  const session = await startSession(root, 'read current feature names');
  await closeSession(root, session.id, { outcome: 'investigated', notes: ['Read-only inspection completed.'] });
  const closing = await buildClosingIntelligence(root, session.id);
  assert.equal(closing.state, 'clean');
  assert.deepEqual(closing.alerts, []);
  assert.match(formatClosingIntelligence(closing), /^### CMI Intelligence\n✓ CLEAN/m);
});

test('closing intelligence shows at most three highest-priority alerts', async () => {
  const root = await fixture();
  const session = await startSession(root, 'investigate multiple blockers');
  await closeSession(root, session.id, { blockers: ['Blocker one.', 'Blocker two.', 'Blocker three.', 'Blocker four.'] });
  const closing = await buildClosingIntelligence(root, session.id);
  assert.equal(closing.alerts.length, 3);
  assert.ok(closing.counts.totalCandidates >= 4);
  assert.ok(closing.alerts.every((item) => item.severity === 'blocker'));
});

test('Codex activation instructs the agent to append bounded evidence-based CMI Intelligence', async () => {
  const root = await fixture();
  await activateProject(root, { agent: 'codex' });
  const agents = await fs.readFile(path.join(root, 'AGENTS.md'), 'utf8');
  assert.match(agents, /### CMI Intelligence/);
  assert.match(agents, /at most three alerts/i);
  assert.match(agents, /CLEAN/i);
  assert.match(agents, /not proof of a violation/i);
});
'''
(root / 'tests/closing-intelligence.test.js').write_text(test_closing, encoding='utf-8')

test_mcp = r'''import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scanProject } from '../src/core.js';

const mcp = fileURLToPath(new URL('../src/mcp-entry.js', import.meta.url));
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-closing-mcp-'));
  await fs.writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'src', 'worker.js'), 'export function run() { return true; }\n');
  await scanProject(root);
  return root;
}
function startMcp(root, env = {}) {
  const child = spawn(process.execPath, [mcp], { cwd: root, env: { ...process.env, CMI_PROJECT_ROOT: root, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  const messages = []; let buffer = ''; const waiters = [];
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    while (buffer.includes('\n')) {
      const index = buffer.indexOf('\n'); const line = buffer.slice(0, index).trim(); buffer = buffer.slice(index + 1);
      if (!line) continue;
      const message = JSON.parse(line); messages.push(message);
      for (const waiter of [...waiters]) if (waiter.predicate(message)) { waiter.resolve(message); waiters.splice(waiters.indexOf(waiter), 1); }
    }
  });
  const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
  const waitFor = (predicate, timeout = 5000) => new Promise((resolve, reject) => {
    const existing = messages.find(predicate); if (existing) return resolve(existing);
    const waiter = { predicate, resolve: null };
    const timer = setTimeout(() => { const index = waiters.indexOf(waiter); if (index >= 0) waiters.splice(index, 1); reject(new Error('Timed out waiting for closing MCP response.')); }, timeout);
    waiter.resolve = (value) => { clearTimeout(timer); resolve(value); }; waiters.push(waiter);
  });
  return { child, send, waitFor };
}
async function initialize(server) {
  server.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'closing-test', version: '1' } } });
  const response = await server.waitFor((message) => message.id === 1);
  server.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  return response;
}
function stop(server) { server.child.stdin.end(); server.child.kill(); }

test('MCP exposes read-only Closing Intelligence and finalize returns branded closing output', async () => {
  const root = await fixture();
  const server = startMcp(root, { CMI_WRITE_ENABLED: '1' });
  try {
    const init = await initialize(server);
    assert.match(init.result.instructions, /CMI Intelligence/i);
    server.send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    const tools = (await server.waitFor((message) => message.id === 2)).result.tools;
    assert.ok(tools.some((item) => item.name === 'get_closing_intelligence'));
    server.send({ jsonrpc: '2.0', id: 3, method: 'resources/list', params: {} });
    const resources = (await server.waitFor((message) => message.id === 3)).result.resources;
    assert.ok(resources.some((item) => item.uri === 'cmi://project/closing-intelligence/latest'));
    server.send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'start_work_session', arguments: { goal: 'inspect worker reliability' } } });
    const started = await server.waitFor((message) => message.id === 4);
    const id = started.result.structuredContent.id;
    server.send({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'finalize_work_session', arguments: { id, blockers: ['Retry ownership is unresolved.'] } } });
    const finalized = await server.waitFor((message) => message.id === 5);
    assert.match(finalized.result.content[0].text, /### CMI Intelligence/);
    assert.match(finalized.result.content[0].text, /BLOCKER/);
    assert.equal(finalized.result.structuredContent.closingIntelligence.state, 'blocker');
    server.send({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'get_closing_intelligence', arguments: { id } } });
    const closing = await server.waitFor((message) => message.id === 6);
    assert.equal(closing.result.structuredContent.state, 'blocker');
    assert.equal(closing.result.structuredContent.alerts.length, finalized.result.structuredContent.closingIntelligence.alerts.length);
  } finally { stop(server); }
});
'''
(root / 'tests/closing-mcp.test.js').write_text(test_mcp, encoding='utf-8')

docs = r'''# CMI Closing Intelligence

Closing Intelligence is CMI's bounded end-of-work read model. It exists so unresolved work, verification gaps, and reviewed project constraints remain visible when an AI agent finishes a substantive repository task.

## Agent-facing contract

After a supported agent finalizes a substantial CMI work session, it should append a concise `### CMI Intelligence` section to its normal user-visible answer.

CMI shows at most three alerts, ordered by materiality:

- `BLOCKER`: failed verification or an unresolved session blocker.
- `WARNING`: material verification, evidence-health, scope, or consistency risk that should be addressed before treating affected work as complete.
- `REMINDER`: unfinished previous work, open questions, uncommitted scope, or a reviewed consistency rule that applies and should be checked.
- `INFO`: lower-impact accepted or informational project evidence.
- `CLEAN`: no material closing alert was found.

The footer is product presence, not advertising copy: it should demonstrate value by surfacing evidence the user or agent might otherwise forget.

## Cross-session continuity

Closing Intelligence reads current persistent findings and active Change Intelligence records. If Feature A remains active while the user later works on unrelated Feature B, B's closing view can show `Unfinished previous work: Feature A`. Starting B does not silently abandon A, and the reminder disappears only when current evidence/lifecycle no longer supports it.

CMI does not block a user from changing priorities. Carryover work is a reminder unless stronger evidence makes it directly relevant or blocking.

## Consistency and reviewed rules

CMI may surface reviewed-current facts, decisions, or lessons that are relevant to the just-closed session. Relevance is only a cue to verify compliance.

A reviewed design/Figma, architecture, database, security, or other project rule is **not** automatically a proven violation. The closing alert explicitly says when CMI has not established a violation. Actual conflict language requires stronger observed evidence, such as failed verification or another evidence-backed finding.

This preserves the distinction between observed violations/failures, reviewed durable project knowledge, historical correlation, and inferred relevance.

## Persistence

Closing Intelligence introduces no new durable notification database or persistence schema. It is computed from existing session, finding, change, and reviewed-memory evidence. Findings keep their existing lifecycle (`open`, `accepted`, `resolved`, `dismissed`, `superseded`), and active changes keep the existing Change Intelligence lifecycle.

## Interfaces

CLI:

```bash
cmi session closing latest
cmi session closing <session-id> --json
```

MCP:

- read-only tool: `get_closing_intelligence`
- resource: `cmi://project/closing-intelligence/latest`
- `finalize_work_session` returns the existing closed-session record plus a non-persisted `closingIntelligence` read model in tool structured output.

## Evidence limits

Closing Intelligence does not create project truth, prove universal agent compliance, or establish productivity/time-savings claims. Agent adapters can require presentation behavior only on clients that actually honor project instructions/MCP.
'''
(root / 'docs/CLOSING_INTELLIGENCE.md').write_text(docs, encoding='utf-8')

def replace_once(path, old, new):
    p = root / path
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one replacement target, found {count}: {old[:80]!r}')
    p.write_text(text.replace(old, new), encoding='utf-8')

replace_once('src/activation.js',
    '- Before ending substantial work, finalize the CMI session when possible and surface unresolved P0/P1 findings plus the highest-priority evidence-based next action.',
    '- Before ending substantial work, finalize the CMI session when possible, retrieve Closing Intelligence, and append a concise `### CMI Intelligence` section to the final user-visible response. Show at most three alerts; never omit material P0/P1 evidence; if no material alert exists, show the one-line CLEAN state.\n- Treat reviewed design, architecture, policy, and other consistency-rule relevance as a requirement to check, not proof of a violation. Only call something a violation when evidence establishes it.')

replace_once('src/cli-entry.js', "} from './session-intelligence.js';\nimport {", "} from './session-intelligence.js';\nimport { buildClosingIntelligence, formatClosingIntelligence } from './closing-intelligence.js';\nimport {")
replace_once('src/cli-entry.js', "status: ['--json'], close: commonObservation, show: ['--json'], list: ['--status','--limit','--json'], handoff: ['--json'],", "status: ['--json'], close: commonObservation, closing: ['--json'], show: ['--json'], list: ['--status','--limit','--json'], handoff: ['--json'],")
replace_once('src/cli-entry.js', "if (name === 'session') return 'Usage: cmi session <start|observe|status|close|show|list|handoff> ...\\n\\nTrack project work, persist findings, and produce an evidence-based handoff/next action.';", "if (name === 'session') return 'Usage: cmi session <start|observe|status|close|closing|show|list|handoff> ...\\n\\nTrack project work, persist findings, and produce an evidence-based handoff/next action plus bounded Closing Intelligence.';")
replace_once('src/cli-entry.js', "    } else if (action === 'close') {\n      const record = await closeSession(process.cwd(), values[0] || 'latest', sessionOptions());\n      print(record, formatSessionReport(record));\n    } else if (action === 'show') {", "    } else if (action === 'close') {\n      const record = await closeSession(process.cwd(), values[0] || 'latest', sessionOptions());\n      if (json) print(record, formatSessionReport(record));\n      else {\n        const closing = await buildClosingIntelligence(process.cwd(), record.id);\n        console.log(`${formatSessionReport(record)}\\n\\n${formatClosingIntelligence(closing)}`);\n      }\n    } else if (action === 'closing') {\n      const closing = await buildClosingIntelligence(process.cwd(), values[0] || 'latest');\n      print(closing, formatClosingIntelligence(closing));\n    } else if (action === 'show') {")
replace_once('src/cli-entry.js', "throw new Error('Usage: cmi session <start|observe|status|close|show|list|handoff> ...');", "throw new Error('Usage: cmi session <start|observe|status|close|closing|show|list|handoff> ...');")

replace_once('src/mcp-entry.js', "} from './session-intelligence.js';\nimport { buildAmbientTaskBrief, formatAmbientTaskBrief } from './ambient-intelligence.js';", "} from './session-intelligence.js';\nimport { buildClosingIntelligence, formatClosingIntelligence } from './closing-intelligence.js';\nimport { buildAmbientTaskBrief, formatAmbientTaskBrief } from './ambient-intelligence.js';")
replace_once('src/mcp-entry.js', "  { name: 'get_ambient_task_brief', title: 'Get ambient task brief', description: 'Route a natural-language user request through CMI project health, Git baseline, task context, optional pre-change preparation, continuation handoff, and conservative workflow hints. Use this early for substantive or terse requests; the user does not need to mention CMI.', inputSchema: { type: 'object', required: ['request'], properties: { request: { type: 'string', minLength: 1, maxLength: 1000 } } }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },", "  { name: 'get_ambient_task_brief', title: 'Get ambient task brief', description: 'Route a natural-language user request through CMI project health, Git baseline, task context, optional pre-change preparation, continuation handoff, and conservative workflow hints. Use this early for substantive or terse requests; the user does not need to mention CMI.', inputSchema: { type: 'object', required: ['request'], properties: { request: { type: 'string', minLength: 1, maxLength: 1000 } } }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },\n  { name: 'get_closing_intelligence', title: 'Get Closing Intelligence', description: 'Build the bounded branded end-of-work view for a closed session: up to three cross-session, verification, finding, and reviewed-consistency alerts plus the evidence-based next action. This read model never creates durable truth.', inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Closed session ID/prefix; defaults to latest closed session.' } } }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },")
replace_once('src/mcp-entry.js', "  { uri: 'cmi://project/findings', name: 'Project findings', title: 'Persistent Project Findings', description: 'Open findings that should remain visible across AI sessions until evidence or review resolves them.', mimeType: 'application/json' },", "  { uri: 'cmi://project/findings', name: 'Project findings', title: 'Persistent Project Findings', description: 'Open findings that should remain visible across AI sessions until evidence or review resolves them.', mimeType: 'application/json' },\n  { uri: 'cmi://project/closing-intelligence/latest', name: 'Latest Closing Intelligence', title: 'CMI Closing Intelligence', description: 'Bounded end-of-work alerts and next action for the latest closed work session.', mimeType: 'application/json' },")
replace_once('src/mcp-entry.js', "  if (name === 'get_work_session_status') {", "  if (name === 'get_closing_intelligence') {\n    const result = await buildClosingIntelligence(root, args.id || 'latest');\n    return textResult(formatClosingIntelligence(result), result);\n  }\n  if (name === 'get_work_session_status') {")
replace_once('src/mcp-entry.js', "  if (name === 'finalize_work_session') {\n    writable();\n    const result = await closeSession(root, args.id || 'latest', args);\n    return textResult(formatSessionReport(result), result);\n  }", "  if (name === 'finalize_work_session') {\n    writable();\n    const result = await closeSession(root, args.id || 'latest', args);\n    const closingIntelligence = await buildClosingIntelligence(root, result.id);\n    return textResult(`${formatSessionReport(result)}\\n\\n${formatClosingIntelligence(closingIntelligence)}`, { ...result, closingIntelligence });\n  }")
replace_once('src/mcp-entry.js', "  if (uri === 'cmi://project/findings') return { uri, mimeType: 'application/json', text: JSON.stringify(await listFindings(root, { state: 'open', limit: 100 }), null, 2) };", "  if (uri === 'cmi://project/findings') return { uri, mimeType: 'application/json', text: JSON.stringify(await listFindings(root, { state: 'open', limit: 100 }), null, 2) };\n  if (uri === 'cmi://project/closing-intelligence/latest') return { uri, mimeType: 'application/json', text: JSON.stringify(await buildClosingIntelligence(root, 'latest'), null, 2) };")
replace_once('src/mcp-entry.js', "Then present the session outcome, all P0/P1 unresolved findings, and the highest-priority next action to the user without waiting for them to ask what to do next. Preserve the distinction between observed evidence, reviewed knowledge, historical correlation, and inference. Do not claim verification that was not actually performed.", "Then retrieve Closing Intelligence and append its concise `### CMI Intelligence` section to the final user-visible response: at most three alerts, material P0/P1 evidence first, or the one-line CLEAN state when no material alert exists. Preserve the distinction between observed evidence, reviewed knowledge, historical correlation, and inference. Reviewed consistency-rule relevance is not proof of a violation. Do not claim verification that was not actually performed.")
replace_once('src/mcp-entry.js', "before ending, finalize it and surface unresolved P0/P1 findings plus the highest-priority next action so the user does not need to ask what comes next.", "before ending, finalize it, retrieve Closing Intelligence, and append a concise `CMI Intelligence` section with at most three alerts (or CLEAN) so the user can see unresolved cross-session work and evidence-backed consistency reminders without asking. Do not present reviewed-rule relevance as proof of a violation.")

changelog = root / 'CHANGELOG.md'
text = changelog.read_text(encoding='utf-8')
marker = '- Added read-only ambient task routing through `cmi ambient` and MCP `get_ambient_task_brief`, with conservative short-prompt intent classification and evidence-linked context/workflow guidance.\n'
if text.count(marker) != 1: raise SystemExit('CHANGELOG ambient Added marker not unique')
text = text.replace(marker, marker + '- Added CMI Closing Intelligence: a bounded end-of-work read model and branded `CMI Intelligence` footer that surfaces up to three evidence-based cross-session, verification, finding, and reviewed-consistency alerts plus a clean fallback.\n')
changed_marker = '- Generic memory-gap and regression-test suggestions are suppressed when no task-specific files, boundaries, or topic evidence support them.\n'
if text.count(changed_marker) != 1: raise SystemExit('CHANGELOG Changed marker not unique')
text = text.replace(changed_marker, changed_marker + '- Codex activation now requires supported agents to retrieve Closing Intelligence before ending substantial work and append a concise user-visible CMI footer; unfinished active changes remain visible across later sessions without blocking a user priority change by default.\n')
evidence_marker = '- Agent activation cannot force clients that ignore repository instructions or MCP to follow CMI.\n'
if text.count(evidence_marker) != 1: raise SystemExit('CHANGELOG evidence marker not unique')
text = text.replace(evidence_marker, evidence_marker + '- Reviewed design/architecture/policy relevance in Closing Intelligence is a consistency-check cue, not proof that the implementation violates the reviewed rule. Closing Intelligence introduces no separate durable notification store.\n')
changelog.write_text(text, encoding='utf-8')
