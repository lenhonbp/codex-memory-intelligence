import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanProject } from '../src/core.js';
import { startSession, closeSession } from '../src/session-intelligence.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureDir = path.join(root, 'tests', 'fixtures', 'field-validation');

async function readFixture(name) {
  return JSON.parse(await fs.readFile(path.join(fixtureDir, name), 'utf8'));
}

test('anonymized field-validation corpus preserves positive, negative-control, and self-host expectations', async () => {
  const large = await readFixture('large-js-application.json');
  const small = await readFixture('small-negative-control.json');
  const self = await readFixture('cmi-self-host.json');

  for (const item of [large, small, self]) {
    assert.equal(item.schemaVersion, 1);
    assert.equal(item.fieldDate, '2026-08-07');
    assert.equal(item.projectHealthy, true);
    assert.equal(item.graphCurrent, true);
    assert.equal(item.projectClean, true);
    assert.equal(item.sessionScopeCount, 0);
    assert.equal(item.openFindingCount, 0);
    assert.ok(!/lenhonbp|CuuChau|mygame/i.test(JSON.stringify(item)), 'retained field fixture must not name private repositories');
  }

  assert.equal(large.beforePlanningHardening.fallbackWasGeneric, true);
  assert.equal(large.afterPlanningHardening.nextActionKind, 'source-linked-planning-review-candidate');
  assert.ok(large.afterPlanningHardening.guardrails.includes('do-not-treat-planning-as-command'));

  assert.equal(small.planningSignals, 0);
  assert.equal(small.recommendationCount, 0);
  assert.equal(small.nextActionKind, 'generic-user-prioritized-goal-fallback');

  assert.equal(self.nextActionKind, 'source-linked-unchecked-roadmap-review-candidate');
  assert.ok(self.planningSignalsAtLeast >= 5);
});

test('ordinary current-priority list evidence is not mislabeled as an unchecked planning task', async () => {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-field-wording-'));
  await fs.writeFile(path.join(project, 'package.json'), JSON.stringify({ type: 'module' }));
  await fs.mkdir(path.join(project, 'docs', 'context-pack'), { recursive: true });
  await fs.writeFile(path.join(project, 'docs', 'context-pack', 'CURRENT_PRIORITIES.md'), '# Current priorities\n\n1. Review the release candidate against current evidence.\n');
  await scanProject(project);

  const session = await startSession(project, 'review release readiness');
  const closed = await closeSession(project, session.id, {
    outcome: 'investigated',
    notes: ['Read-only wording regression check.'],
  });

  const action = closed.close.handoff.nextAction;
  assert.match(action.action, /planning item/i);
  assert.doesNotMatch(action.action, /unchecked planning/i);
  assert.match(action.reason, /Observed planning item/i);
  const guardrail = closed.close.handoff.guardrails.find((item) => item.id === 'do-not-treat-planning-as-command');
  assert.ok(guardrail);
  assert.match(guardrail.rule, /planning text/i);
  assert.doesNotMatch(guardrail.rule, /unchecked roadmap/i);
});
