import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const skillNames = [
  'cmi-agent-operating-system',
  'cmi-evidence-first-workflow',
  'cmi-release-readiness',
];
const scenarioNames = [
  'game-prototype.md',
  'ux-journey-audit.md',
  'coding-bug-fix.md',
  'schema-change.md',
  'release-preparation.md',
  'failure-recovery.md',
  'browser-mobile-verification.md',
  'performance-verification.md',
];

async function read(rel) {
  return (await fs.readFile(path.join(repositoryRoot, rel), 'utf8')).replace(/\r\n/g, '\n');
}

function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  assert.ok(match, 'Skill must start with YAML frontmatter');
  const fields = {};
  for (const line of match[1].split('\n')) {
    const index = line.indexOf(':');
    if (index > 0) fields[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return fields;
}

test('Agent OS tranche has valid open-format frontmatter and matching names', async () => {
  for (const name of skillNames) {
    const text = await read(`skills/${name}/SKILL.md`);
    const fields = parseFrontmatter(text);
    assert.equal(fields.name, name);
    assert.ok(fields.description.length > 0 && fields.description.length <= 1024);
    assert.match(name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.match(text, /thin (?:policy\/orchestration|adapter)/i);
    assert.match(text, /no native Skill loader|CMI has no native Skill loader/i);
    assert.match(text, /does not activate|does not .*install/i);
  }
});

test('Agent OS Skills preserve CMI ownership and external-action boundaries', async () => {
  const text = await Promise.all(skillNames.map((name) => read(`skills/${name}/SKILL.md`)));
  const combined = text.join('\n');
  for (const phrase of [
    'does not implement CMI memory',
    'do not rewrite CMI Core',
    'never auto-remember',
    'local pass does not',
  ]) {
    assert.match(combined, new RegExp(phrase, 'i'), `missing boundary: ${phrase}`);
  }
  assert.match(combined, /Session.*does not complete.*Change|Session closure does not complete a partial Change/i);
  assert.match(combined, /does not implement CMI|does not reimplement CMI|does not implement storage/i);
  assert.match(combined, /(?:do not|never)\s+(?:publish|deploy|push)|Do not:[\s\S]{0,300}(?:publish|deploy|push)/i);
  assert.match(combined, /not-observed|not-assessed/);
});

test('Evaluation fixture inventory is complete and evidence-bounded', async () => {
  for (const name of scenarioNames) {
    const text = await read(`evaluation/agent-os/scenarios/${name}`);
    assert.match(text, /^# Scenario:/m);
    assert.match(text, /Required evidence/i);
    assert.match(text, /Failure cases/i);
    assert.match(text, /Evaluation notes/i);
    assert.doesNotMatch(text, /production[- ]proven|universally proven|guaranteed/i);
  }
  const rubric = await read('evaluation/agent-os/rubric.md');
  assert.match(rubric, /Evidence integrity/i);
  assert.match(rubric, /Verification quality/i);
  assert.match(rubric, /Handoff quality/i);
  assert.match(rubric, /descriptive, not a release gate|descriptive-only|descriptive only/i);
});

test('Agent OS documentation maps to existing CMI surfaces without adding a loader', async () => {
  const contract = await read('docs/AGENT_OS.md');
  const evaluation = await read('docs/AGENT_OS_EVALUATION.md');
  const skills = await read('docs/SKILLS.md');
  assert.match(contract, /Orient[\s\S]*Handoff/);
  assert.match(contract, /CMI remains authoritative/i);
  assert.match(contract, /does\s+(?:\*\*)?not(?:\*\*)?\s+create a native Skill runtime/i);
  assert.match(evaluation, /Conditions/i);
  assert.match(evaluation, /plain agent|Agent \+ CMI|Agent \+ CMI \+ Agent OS/i);
  assert.match(skills, /fifteen|15/i);
  assert.match(skills, /no native Skill loader/i);
  assert.match(skills, /not(?:\s+|\*\*\s*)automatically/i);
});
