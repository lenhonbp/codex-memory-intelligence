import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const scenarioNames = [
  'solution-discovery.md',
  'skill-discovery.md',
  'skill-authoring.md',
  'output-quality-review.md',
];

async function read(rel) {
  return (await fs.readFile(path.join(repositoryRoot, rel), 'utf8')).replace(/\r\n/g, '\n');
}

test('Capability Skills validation harness is explicit about evidence and non-release status', async () => {
  const readme = await read('evaluation/capability-skills/README.md');
  const rubric = await read('evaluation/capability-skills/rubric.md');

  for (const name of [
    'cmi-solution-discovery',
    'cmi-skill-discovery',
    'cmi-skill-authoring',
    'cmi-output-quality-review',
  ]) {
    assert.match(readme, new RegExp(name));
  }

  assert.match(readme, /does not prove automatic runtime discovery|does \*\*not\*\* prove automatic runtime discovery/i);
  assert.match(readme, /descriptive validation infrastructure, not a release gate/i);
  assert.match(readme, /executed evaluation record/i);
  assert.match(rubric, /Evidence integrity/i);
  assert.match(rubric, /Trust and authorization/i);
  assert.match(rubric, /Critical fail conditions/i);
  assert.match(rubric, /PASS[\s\S]*PARTIAL[\s\S]*FAIL[\s\S]*BLOCKED/);
  assert.match(rubric, /field-validation PASS without an executed record/i);
});

test('Capability scenario inventory is complete and uniformly evidence-bounded', async () => {
  for (const name of scenarioNames) {
    const scenario = await read(`evaluation/capability-skills/scenarios/${name}`);
    assert.match(scenario, /^# Scenario:/m);
    assert.match(scenario, /## Skill under evaluation/);
    assert.match(scenario, /## Task/);
    assert.match(scenario, /## Required evidence/);
    assert.match(scenario, /## Expected behavior/);
    assert.match(scenario, /## Negative control \/ adversarial pressure/);
    assert.match(scenario, /## Prohibited promotions\/actions/);
    assert.match(scenario, /## Failure cases/);
    assert.match(scenario, /## Evaluation notes/);
    assert.match(scenario, /## Handoff/);
    assert.doesNotMatch(scenario, /universally validated|production[- ]proven|guaranteed compatible/i);
  }
});

test('solution discovery scenario prevents popularity and recommendation from becoming proof or authority', async () => {
  const scenario = await read('evaluation/capability-skills/scenarios/solution-discovery.md');
  assert.match(scenario, /reuse[\s\S]*adapt[\s\S]*build[\s\S]*needs-evidence/i);
  assert.match(scenario, /stars, downloads, age, or popularity as proof of fitness/i);
  assert.match(scenario, /no package installation|no package installation or candidate code execution/i);
  assert.match(scenario, /authorized adoption|separately authorized action/i);
});

test('skill discovery scenario preserves discovery != trust/install/activation/execution', async () => {
  const scenario = await read('evaluation/capability-skills/scenarios/skill-discovery.md');
  assert.match(scenario, /compatible[\s\S]*adapt-required[\s\S]*reject[\s\S]*needs-evidence/i);
  assert.match(scenario, /discovery is presented as installation\/trust\/compatibility proof/i);
  assert.match(scenario, /no copying, installing, activating or executing/i);
  assert.match(scenario, /cached metadata is not enough/i);
});

test('skill authoring scenario rejects vendor assumptions and speculative expertise', async () => {
  const scenario = await read('evaluation/capability-skills/scenarios/skill-authoring.md');
  assert.match(scenario, /\/home\/ubuntu/);
  assert.match(scenario, /CLAUDE_PLUGIN_ROOT/);
  assert.match(scenario, /must not encode speculative workflow knowledge as established expertise/i);
  assert.match(scenario, /no automatic installation\/activation/i);
  assert.match(scenario, /do not by themselves prove runtime invocation/i);
});

test('output quality scenario cannot edit uncertainty into stronger technical claims', async () => {
  const scenario = await read('evaluation/capability-skills/scenarios/output-quality-review.md');
  assert.match(scenario, /reported passing/i);
  assert.match(scenario, /CI was not run/i);
  assert.match(scenario, /partial and release readiness is not assessed|Change is partial and release readiness is not assessed/i);
  assert.match(scenario, /inferred.*observed|inferred.*reviewed/i);
  assert.match(scenario, /reported.*observed-command.*CI.*live proof/i);
  assert.match(scenario, /no invention or alteration of IDs, revisions, commands, paths, evidence addresses or artifact references/i);
});
