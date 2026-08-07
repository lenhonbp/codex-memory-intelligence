import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getPlanningSignals } from '../src/planning-intelligence.js';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-planning-field-'));
  await fs.mkdir(path.join(root, 'docs', 'context-pack'), { recursive: true });
  return root;
}

test('discovers nested current-priority documents and extracts numbered priorities as low-confidence review candidates', async () => {
  const root = await fixture();
  await fs.writeFile(path.join(root, 'docs', 'context-pack', 'CURRENT_PRIORITIES.md'), `# Current priorities\n\n1. Verify the release candidate against the real integration environment.\n2. Preserve the stable storage contract while collecting evidence.\n`);
  const result = await getPlanningSignals(root, { limit: 10 });
  assert.equal(result.signals.length, 2);
  assert.equal(result.signals[0].path, 'docs/context-pack/CURRENT_PRIORITIES.md');
  assert.equal(result.signals[0].type, 'planning-list-item');
  assert.equal(result.signals[0].confidence, 'low');
  assert.match(result.signals[0].text, /Verify the release candidate/);
  assert.match(result.policy, /not proof of current business priority/i);
});

test('discovers roadmap variants and only treats ordinary lists as continuation evidence under explicit planning sections', async () => {
  const root = await fixture();
  await fs.writeFile(path.join(root, 'ROADMAP_COMMERCIAL_3_PHASE.md'), `# Commercial roadmap\n\n## Background\n1. This is explanatory history, not a next task.\n2. This is also explanatory history.\n\n## Backlog\n1. Add bounded activity export.\n2. Validate retention behavior.\n`);
  const result = await getPlanningSignals(root, { limit: 10 });
  assert.equal(result.signals.length, 2);
  assert.ok(result.signals.every((item) => item.section === 'Backlog'));
  assert.ok(result.signals.some((item) => /bounded activity export/i.test(item.text)));
  assert.ok(!result.signals.some((item) => /explanatory history/i.test(item.text)));
});

test('does not turn implementation-plan scope bullets into next actions without a current/next/priority section', async () => {
  const root = await fixture();
  await fs.mkdir(path.join(root, 'docs'), { recursive: true });
  await fs.writeFile(path.join(root, 'docs', 'IMPLEMENTATION_PLAN.md'), `# Implementation plan\n\n## Phase 1\n\n### Minimum scope\n- Add API boundary.\n- Add UI state.\n\n### Acceptance criteria\n- API remains bounded.\n`);
  const result = await getPlanningSignals(root, { limit: 10 });
  assert.deepEqual(result.signals, []);
});

test('checkbox tasks remain eligible even outside a continuation heading and outrank lower-confidence list items', async () => {
  const root = await fixture();
  await fs.writeFile(path.join(root, 'ROADMAP.md'), `# Roadmap\n\n## Future\n- [ ] Verify storage migration compatibility.\n\n## Backlog\n1. Consider a lower-confidence cleanup item.\n`);
  const result = await getPlanningSignals(root, { limit: 10 });
  assert.equal(result.signals.length, 2);
  assert.equal(result.signals[0].type, 'unchecked-markdown-task');
  assert.equal(result.signals[0].confidence, 'medium');
  assert.match(result.signals[0].text, /storage migration/i);
});

test('explicit NEXT/TODO markers are observed without requiring list syntax', async () => {
  const root = await fixture();
  await fs.writeFile(path.join(root, 'PLAN.md'), `# Plan\n\nNEXT: Validate the candidate on a second repository.\nTODO: Capture an anonymized field-validation summary.\n`);
  const result = await getPlanningSignals(root, { limit: 10 });
  assert.equal(result.signals.length, 2);
  assert.ok(result.signals.every((item) => item.type === 'explicit-planning-marker'));
  assert.ok(result.signals.every((item) => item.confidence === 'medium'));
});

test('planning discovery remains bounded to conventional planning locations', async () => {
  const root = await fixture();
  await fs.mkdir(path.join(root, 'docs', 'archive', 'deep'), { recursive: true });
  await fs.writeFile(path.join(root, 'docs', 'archive', 'deep', 'CURRENT_PRIORITIES.md'), `# Current priorities\n\n1. Archived task must not be discovered.\n`);
  const result = await getPlanningSignals(root, { limit: 10 });
  assert.deepEqual(result.signals, []);
});
