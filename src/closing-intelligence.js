import { listChangeRecords } from './change-intelligence.js';
import { getSession, listSessions, listFindings } from './session-intelligence.js';
import { searchMemory, tokenize } from './search.js';
import { extractEvidenceAnchors, formatEvidenceAnchor, verificationStateForFinding } from './evidence-anchors.js';

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
  if (finding.category === 'graph-drift' && finding.severity === 'low' && (finding.evidence || []).includes('session-source-mutation')) return 'reminder';
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
function findingAlert(finding, activeById, relatedActiveIds, concurrentActiveIds) {
  const relatedChangeIds = changeIdsFromFinding(finding);
  const active = relatedChangeIds.map((id) => activeById.get(id)).find(Boolean);
  const activeChangeId = relatedChangeIds.find((id) => activeById.has(id)) || null;
  const carryover = finding.category === 'active-change'
    ? (activeChangeId ? (concurrentActiveIds.has(activeChangeId) || !relatedActiveIds.has(activeChangeId)) : finding.sessionRelevance === 'concurrent-unattributed')
    : false;
  const title = active
    ? `${carryover ? 'Unfinished previous work' : 'Active work remains unfinished'}: ${active.goal}`
    : finding.title;
  const verificationState = verificationStateForFinding(finding);
  const evidenceAnchors = extractEvidenceAnchors(finding);
  return {
    id: `finding:${finding.id}`,
    kind: finding.category === 'active-change' ? 'unfinished-work' : finding.category,
    severity: carryover ? 'reminder' : levelForFinding(finding),
    title,
    subject: active?.goal || null,
    detail: finding.detail,
    confidence: finding.confidence || 'low',
    evidenceType: finding.evidenceType || 'inferred',
    evidence: bounded(finding.evidence || [], 12),
    evidenceAnchors,
    verificationState,
    relatedFindingIds: [finding.id],
    relatedChangeIds,
    relatedFiles: bounded(finding.relatedFiles || [], 12),
    occurrences: finding.occurrences || 1,
    findingState: finding.state,
    violationEstablished: verificationState === 'established',
  };
}
function activeChangeAlert(change) {
  return {
    id: `active-change:${change.id}`,
    kind: 'unfinished-work',
    severity: 'reminder',
    title: `Unfinished previous work: ${change.goal}`,
    subject: change.goal,
    detail: `Change "${change.goal}" is still active. CMI is preserving it across sessions so a newer task does not silently erase unfinished work.`,
    confidence: 'high',
    evidenceType: 'observed',
    evidence: [`change:${change.id}`, 'change-status:active'],
    evidenceAnchors: [],
    verificationState: 'observed',
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
    .map((item) => {
      const relatedFiles = bounded((item.metadata?.sources || []).filter((source) => sourceOverlapsScope(source, scope)), 12);
      const evidence = unique([item.metadata?.id ? `memory:${item.metadata.id}` : null, ...(item.metadata?.sources || []).map((source) => `source:${source}`), `feature:${compactText(item.title, 120)}`]);
      return {
        id: `reviewed-rule:${item.metadata.id || `${item.source}:${item.title}`}`,
        kind: 'consistency-rule',
        severity: 'reminder',
        title: `Reviewed project rule applies: ${compactText(item.title, 120)}`,
        subject: item.title,
        detail: `Reviewed project knowledge is relevant to this session: ${compactText(item.text, 260)} CMI has not established a violation; inspect the affected source and verify the implementation against this reviewed rule before claiming consistency.`,
        confidence: 'high',
        evidenceType: 'reviewed',
        evidence,
        evidenceAnchors: extractEvidenceAnchors({ evidence, relatedFiles }),
        verificationState: 'suspected',
        relatedFindingIds: [],
        relatedChangeIds: [],
        relatedFiles,
        occurrences: 1,
        findingState: null,
        violationEstablished: false,
      };
    });
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
function nextActionReferencesAlert(nextAction, alert) {
  if (!nextAction || !alert) return false;
  if ((nextAction.relatedFindingIds || []).some((id) => (alert.relatedFindingIds || []).includes(id))) return true;
  return (alert.relatedChangeIds || []).some((id) => (nextAction.evidence || []).includes(`change:${id}`));
}
function normalizeNextAction(session, alerts) {
  const nextAction = session.close?.handoff?.nextAction || null;
  if (!nextAction) return null;
  const linkedAlert = alerts.find((alert) => nextActionReferencesAlert(nextAction, alert)) || null;
  const referencedFindings = nextAction.relatedFindingIds || [];
  if (referencedFindings.length && !linkedAlert) return null;
  if (['P0', 'P1'].includes(nextAction.priority) && !linkedAlert) return null;
  if (linkedAlert?.findingState === 'accepted') return null;
  const carryover = linkedAlert?.kind === 'unfinished-work' && linkedAlert.severity === 'reminder' ? linkedAlert : null;
  if (!carryover || nextAction.priority === 'P3') return nextAction;
  const subject = carryover.subject || carryover.title.replace(/^Unfinished previous work:\s*/i, '');
  return {
    id: `closing-carryover:${carryover.relatedChangeIds[0] || carryover.id}`,
    priority: 'P3',
    action: `Keep unfinished work "${subject}" visible and resume or explicitly defer it when the user prioritizes it; do not block the just-completed unrelated task on it by default.`,
    reason: 'Closing Intelligence classified this active change as cross-session carryover rather than current-session goal evidence.',
    evidenceType: carryover.evidenceType,
    evidence: carryover.evidence,
    confidence: carryover.confidence,
    relatedFindingIds: carryover.relatedFindingIds,
  };
}

export async function buildClosingIntelligence(root, selector = 'latest') {
  const session = await resolveClosedSession(root, selector);
  const [allFindings, activeChanges, consistency] = await Promise.all([
    listFindings(root, { limit: 200 }),
    listChangeRecords(root, { status: 'active', limit: 100 }),
    reviewedConsistencyAlerts(root, session),
  ]);
  const activeById = new Map(activeChanges.records.map((item) => [item.id, item]));
  const relatedActiveIds = new Set((session.close?.handoff?.activeChanges || []).filter((item) => item.relation !== 'sole-active-continuation').map((item) => item.id));
  const concurrentActiveIds = new Set((session.close?.handoff?.concurrentChanges?.active || []).map((item) => item.id));
  const projectFindings = allFindings.findings.filter((item) => ['open', 'accepted'].includes(item.state));
  const findingAlerts = projectFindings.map((item) => findingAlert(item, activeById, relatedActiveIds, concurrentActiveIds));
  const representedChanges = new Set(findingAlerts.flatMap((item) => item.relatedChangeIds || []));
  const carryover = activeChanges.records.filter((item) => !representedChanges.has(item.id)).map(activeChangeAlert);
  const candidates = sortAlerts(dedupeAlerts([...findingAlerts, ...carryover, ...consistency]));
  const alerts = bounded(candidates, MAX_ALERTS);
  const counts = { blocker: 0, warning: 0, reminder: 0, info: 0, totalCandidates: candidates.length, shown: alerts.length };
  for (const alert of candidates) if (counts[alert.severity] !== undefined) counts[alert.severity] += 1;
  const state = alerts.length ? alerts[0].severity : 'clean';
  const nextAction = normalizeNextAction(session, candidates);
  if (state === 'clean' && ['P0', 'P1'].includes(nextAction?.priority)) {
    const error = new Error('Closing Intelligence invariant failed: CLEAN cannot carry a material P0/P1 next action without a current alert.');
    error.code = 'CMI_CLOSING_INCONSISTENT';
    throw error;
  }
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    session: { id: session.id, goal: session.goal, outcome: session.close.outcome, closedAt: session.close.closedAt },
    state,
    alerts,
    counts,
    nextAction,
    policy: 'Closing Intelligence is a bounded read model over current CMI finding/change/reviewed-memory evidence plus the closed-session snapshot. Evidence anchors explain where a signal came from but do not upgrade relevance or static source matches into established violations. Historical session next actions are suppressed when their finding lifecycle is no longer current. It shows at most three alerts and does not create durable truth.',
  };
}

export function formatClosingIntelligence(result) {
  if (!result.alerts.length) return '### CMI Intelligence\n✓ CLEAN · No material unresolved, carryover, verification, or reviewed-consistency alert was found for this closing view.';
  const icon = { blocker: '🔴', warning: '🟠', reminder: '🟡', info: '🔵' };
  const rows = result.alerts.map((alert) => {
    const occurrence = alert.occurrences > 1 ? ` · seen ${alert.occurrences} times` : '';
    const anchors = bounded(alert.evidenceAnchors || [], 3).map(formatEvidenceAnchor).filter(Boolean);
    const citations = anchors.length ? `\nSource: ${anchors.join('; ')}` : '';
    const verification = alert.verificationState ? ` · ${alert.verificationState}` : '';
    return `${icon[alert.severity] || '🔵'} **${alert.severity.toUpperCase()} · ${alert.title}**\n${alert.detail}\nEvidence: ${alert.evidenceType} · confidence ${alert.confidence}${verification}${occurrence}${citations}`;
  });
  const next = result.nextAction ? `\n→ **Next:** ${result.nextAction.priority} ${result.nextAction.action}` : '';
  return `### CMI Intelligence\n${rows.join('\n\n')}${next}\n\n_CMI reports evidence and reviewed constraints; source relevance or a static match alone is not proof of a design, architecture, or policy violation._`;
}
