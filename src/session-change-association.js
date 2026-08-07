const STOPWORDS = new Set([
  'about','after','again','against','before','being','change','changes','current','debug','from','into','investigate','investigation','make','project','review','session','that','these','this','those','understand','update','with','work','working',
]);

function slash(value) { return String(value || '').replace(/\\/g, '/'); }
function unique(values) { return [...new Set((values || []).filter(Boolean))]; }
function tokens(value) {
  return unique(String(value || '').toLowerCase().match(/[a-z0-9_\-/]{3,}/g) || [])
    .flatMap((token) => token.split(/[\/_-]+/))
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}
function pathSet(values) { return new Set((values || []).map(slash).filter(Boolean)); }
function intersection(left, right) {
  const output = [];
  for (const value of left) if (right.has(value)) output.push(value);
  return output;
}

export function changedPathsFromChange(record) {
  return unique([
    ...(record?.completion?.finalObservation?.observedChangedFiles || []),
    ...(record?.observations?.at?.(-1)?.observedChangedFiles || []),
  ].map(slash));
}

export function goalRelationship(sessionGoal, changeGoal) {
  const session = new Set(tokens(sessionGoal));
  const change = new Set(tokens(changeGoal));
  const shared = intersection(session, change);
  const denominator = Math.max(1, Math.min(session.size, change.size));
  const support = shared.length / denominator;
  return {
    related: shared.length >= 2 || (shared.length >= 1 && support >= 0.5),
    sharedTerms: shared,
    support: Math.round(support * 1000) / 1000,
    evidenceType: 'inferred',
  };
}

export function associateSessionChanges({ sessionGoal, startActiveChanges = [], currentActiveChanges = [], completedDetails = [], scopePaths = [] }) {
  const scope = pathSet(scopePaths);
  const startActiveIds = new Set(startActiveChanges.map((item) => item.id));
  const soleStartActiveId = startActiveChanges.length === 1 ? startActiveChanges[0].id : null;
  const soleCurrentActiveId = currentActiveChanges.length === 1 ? currentActiveChanges[0].id : null;

  const active = currentActiveChanges.map((change) => {
    const goal = goalRelationship(sessionGoal, change.goal);
    const soleContinuation = Boolean(soleCurrentActiveId === change.id && soleStartActiveId === change.id);
    const related = goal.related || soleContinuation;
    return {
      change,
      related,
      relation: related ? (goal.related ? 'goal-overlap' : 'sole-active-continuation') : 'concurrent-unattributed',
      evidenceType: goal.related ? 'inferred' : soleContinuation ? 'observed' : 'inferred',
      sharedTerms: goal.sharedTerms,
      goalSupport: goal.support,
    };
  });

  const completed = completedDetails.map((change) => {
    const paths = changedPathsFromChange(change);
    const overlap = intersection(pathSet(paths), scope);
    const goal = goalRelationship(sessionGoal, change.goal);
    const startedActive = startActiveIds.has(change.id);
    const soleContinuation = Boolean(soleStartActiveId === change.id);
    let related = false;
    let relation = 'concurrent-unattributed';
    let evidenceType = 'inferred';
    if (overlap.length) {
      related = true;
      relation = 'changed-path-overlap';
      evidenceType = 'observed';
    } else if (soleContinuation && goal.related) {
      related = true;
      relation = 'sole-start-active-and-goal-overlap';
      evidenceType = 'observed+inferred';
    } else if (startedActive && goal.related) {
      related = true;
      relation = 'start-active-and-goal-overlap';
      evidenceType = 'observed+inferred';
    }
    return { change, related, relation, evidenceType, overlapPaths: overlap, sharedTerms: goal.sharedTerms, goalSupport: goal.support };
  });

  return {
    relatedActive: active.filter((item) => item.related),
    concurrentActive: active.filter((item) => !item.related),
    relatedCompleted: completed.filter((item) => item.related),
    concurrentCompleted: completed.filter((item) => !item.related),
    policy: 'Session/change association is conservative. Changed-path overlap is direct evidence; goal overlap is inferred; concurrent/unattributed changes remain project context but must not block or hijack the current session next action.',
  };
}
