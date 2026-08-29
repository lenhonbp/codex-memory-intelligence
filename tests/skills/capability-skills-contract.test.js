import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const skillNames = [
  'cmi-solution-discovery',
  'cmi-skill-discovery',
  'cmi-skill-authoring',
  'cmi-output-quality-review',
];

async function readSkill(name) {
  return (await fs.readFile(path.join(repositoryRoot, 'skills', name, 'SKILL.md'), 'utf8')).replace(/\r\n/g, '\n');
}

function frontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, 'SKILL.md must start with YAML frontmatter');
  const fields = {};
  for (const line of match[1].split('\n')) {
    const index = line.indexOf(':');
    if (index > 0) fields[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return fields;
}

test('capability Skills use portable open-format metadata', async () => {
  for (const name of skillNames) {
    const skill = await readSkill(name);
    const fields = frontmatter(skill);
    assert.equal(fields.name, name);
    assert.ok(fields.description?.length > 0 && fields.description.length <= 1024, `${name} description must be bounded`);
    assert.doesNotMatch(skill, /\/home\/ubuntu\/skills|CLAUDE_PLUGIN_ROOT|~\/.codex\/skills|~\/.grok\/skills/);
  }
});

test('discovery Skills remain advisory and do not become a CMI loader or installer', async () => {
  const [solution, skillDiscovery] = await Promise.all([
    readSkill('cmi-solution-discovery'),
    readSkill('cmi-skill-discovery'),
  ]);

  for (const skill of [solution, skillDiscovery]) {
    assert.match(skill, /recommendation is not authorization|Discovery never means installation|advisory/i);
    assert.match(skill, /not.*install|MUST NOT:[\s\S]*install/i);
    assert.match(skill, /native CMI.*(?:loader|discovery engine|registry)|CMI-native loader/i);
  }
  assert.match(solution, /popularity[\s\S]{0,180}(?:not|never).*proof|stars[\s\S]{0,180}never prove/i);
  assert.match(solution, /license/i);
  assert.match(skillDiscovery, /inspect the actual artifact/i);
  assert.match(skillDiscovery, /cached[\s\S]{0,160}(?:provenance|current evidence)/i);
  assert.match(skillDiscovery, /compatible|adapt-required|reject|needs-evidence/);
});

test('skill authoring is agent-independent and evidence-bounded', async () => {
  const skill = await readSkill('cmi-skill-authoring');
  assert.match(skill, /agent-independent/i);
  assert.match(skill, /Do not encode a speculative workflow as established expertise/i);
  assert.match(skill, /progressive disclosure/i);
  assert.match(skill, /reported verification/i);
  assert.match(skill, /session closure[\s\S]{0,80}partial Change/i);
  assert.match(skill, /validate structure and references/i);
  assert.match(skill, /representative evaluation evidence/i);
});

test('output quality review cannot polish uncertainty into stronger evidence', async () => {
  const skill = await readSkill('cmi-output-quality-review');
  for (const phrase of [
    'must not become `reviewed`',
    'reported verification must remain visibly reported',
    'local/focused verification must not be rewritten as CI',
    'recommendation/severity must not be rewritten as authorization',
    'evidence addresses',
    'must not be invented',
  ]) assert.match(skill, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  assert.match(skill, /not an AI-authorship detector/i);
  assert.match(skill, /smallest coherent changes/i);
});
