import test from 'node:test';
import assert from 'node:assert/strict';
import { associateSessionChanges, changedPathsFromChange, goalRelationship } from '../src/session-change-association.js';

function completed(id, goal, paths) {
  return {
    id,
    goal,
    status: 'completed',
    completion: { finalObservation: { observedChangedFiles: paths } },
    observations: [],
  };
}

test('changed-path overlap is direct evidence for session/change association', () => {
  const related = completed('a', 'unrelated wording', ['src/auth/session.js']);
  const concurrent = completed('b', 'billing reconciliation', ['src/billing/ledger.js']);
  const result = associateSessionChanges({
    sessionGoal: 'fix authentication retry behavior',
    completedDetails: [related, concurrent],
    scopePaths: ['src/auth/session.js'],
  });
  assert.equal(result.relatedCompleted.length, 1);
  assert.equal(result.relatedCompleted[0].change.id, 'a');
  assert.equal(result.relatedCompleted[0].relation, 'changed-path-overlap');
  assert.equal(result.relatedCompleted[0].evidenceType, 'observed');
  assert.equal(result.concurrentCompleted[0].change.id, 'b');
});

test('goal evidence can relate the sole continuing active change but unrelated concurrent work stays unattributed', () => {
  const auth = { id: 'auth', goal: 'authentication retry handling' };
  const billing = { id: 'billing', goal: 'billing invoice export' };
  const result = associateSessionChanges({
    sessionGoal: 'investigate authentication retries',
    startActiveChanges: [auth, billing],
    currentActiveChanges: [auth, billing],
  });
  assert.ok(result.relatedActive.some((item) => item.change.id === 'auth'));
  assert.ok(result.concurrentActive.some((item) => item.change.id === 'billing'));
});

test('a sole active change can continue by observed session-start identity when goal wording is sparse', () => {
  const active = { id: 'only', goal: 'module cleanup' };
  const result = associateSessionChanges({
    sessionGoal: 'inspect behavior',
    startActiveChanges: [active],
    currentActiveChanges: [active],
  });
  assert.equal(result.relatedActive.length, 1);
  assert.equal(result.relatedActive[0].relation, 'sole-active-continuation');
  assert.equal(result.relatedActive[0].evidenceType, 'observed');
});

test('completed concurrent work in the same time window is not associated merely by time', () => {
  const result = associateSessionChanges({
    sessionGoal: 'authentication retry review',
    startActiveChanges: [],
    completedDetails: [completed('other', 'billing migration', ['src/billing/db.js'])],
    scopePaths: [],
  });
  assert.equal(result.relatedCompleted.length, 0);
  assert.equal(result.concurrentCompleted.length, 1);
  assert.equal(result.concurrentCompleted[0].relation, 'concurrent-unattributed');
});

test('goal relationship is explicitly inferred rather than treated as direct evidence', () => {
  const relationship = goalRelationship('authentication retry investigation', 'authentication retry handling');
  assert.equal(relationship.related, true);
  assert.deepEqual(new Set(relationship.sharedTerms), new Set(['authentication', 'retry']));
  assert.equal(relationship.evidenceType, 'inferred');
});

test('changedPathsFromChange prefers durable observed changed paths', () => {
  assert.deepEqual(changedPathsFromChange(completed('x', 'task', ['src/a.js', 'src/b.js'])), ['src/a.js', 'src/b.js']);
});
