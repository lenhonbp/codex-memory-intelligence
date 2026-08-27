import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const skillRelativePath = 'skills/cmi-agent-operating-system/SKILL.md';
const skillPath = path.join(repositoryRoot, skillRelativePath);
const templateNames = [
  'orientation-checklist.md',
  'evidence-ledger.md',
  'verification-matrix.md',
  'truthful-handoff.md',
];

async function read(rel) {
  return (await fs.readFile(path.join(repositoryRoot, rel), 'utf8')).replace(/\r\n/g, '\n');
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

test('core Agent OS Skill contains the complete contract section set', async () => {
  const skill = await read(skillRelativePath);
  const requiredSections = [
    '## 1. Name and purpose',
    '## 2. Appropriate triggers',
    '## 3. Non-triggers',
    '## 4. Non-goals',
    '## 5. Required inputs',
    '## 6. Authority and authorization boundary',
    '## 7. Core operating loop',
    '## 8. Evidence vocabulary',
    '## 9. Phase-by-phase rules',
    '## 10. CMI surface mapping',
    '## 11. Verification ladder',
    '## 12. Failure and recovery behavior',
    '## 13. Completion criteria',
    '## 14. Handoff template',
    '## 15. Short usage example',
    '## 16. Claims prohibited without evidence',
  ];
  for (const section of requiredSections) assert.match(skill, new RegExp(`^${section.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`, 'm'), `missing ${section}`);
  for (const phase of ['Orient', 'Observe', 'Capture Evidence', 'Diagnose', 'Prioritize', 'Implement', 'Verify', 'Reflect', 'Handoff']) {
    assert.match(skill, new RegExp(`^### ${phase}$`, 'm'), `missing phase ${phase}`);
  }
});

test('core Skill frontmatter, template references and internal links are valid', async () => {
  const skill = await read(skillRelativePath);
  const fields = frontmatter(skill);
  assert.equal(fields.name, 'cmi-agent-operating-system');
  assert.ok(fields.description.length > 0 && fields.description.length <= 1024);
  for (const name of templateNames) {
    const templatePath = path.join(repositoryRoot, 'skills/cmi-agent-operating-system/templates', name);
    assert.equal((await fs.stat(templatePath)).isFile(), true, `missing template ${name}`);
    assert.match(skill, new RegExp(`templates/${name.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}`));
  }
  const links = [...skill.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1]);
  for (const link of links) {
    if (/^(?:https?:|mailto:|#)/i.test(link)) continue;
    const target = path.resolve(path.dirname(skillPath), link);
    assert.equal(target.startsWith(path.join(repositoryRoot, 'skills/cmi-agent-operating-system')), true, `link escapes Skill directory: ${link}`);
    assert.ok(await fs.stat(target), `broken internal link: ${link}`);
  }
});

test('core Skill preserves evidence and lifecycle boundary claims', async () => {
  const skill = await read(skillRelativePath);
  for (const phrase of [
    'does not implement CMI memory',
    'does not create a native Skill runtime',
    'Session closure does not complete a partial Change',
    'local check does not imply CI',
    'do not fabricate IDs',
    'not-enough-evidence',
    'reported-verification',
    'observed-command',
  ]) {
    assert.match(skill, new RegExp(phrase.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&'), 'i'), `missing boundary: ${phrase}`);
  }
  assert.match(skill, /CMI remains authoritative/i);
  assert.match(skill, /Do not publish, deploy, push, submit or create external side effects/i);
  assert.match(skill, /automatically write[\s\S]{0,120}durable memory|do not automatically call memory mutation surfaces/i);
  assert.match(skill, /Domain-specific .* remain bounded|domain-specific game/i);
  assert.doesNotMatch(skill, /native Skill loader implementation|new memory database|automatic memory writer/i);
});

test('supporting templates preserve separate verification and authorization statuses', async () => {
  const [orientation, ledger, matrix, handoff] = await Promise.all(templateNames.map((name) => read(`skills/cmi-agent-operating-system/templates/${name}`)));
  assert.match(orientation, /Goal and actor|Authority boundary|Acceptance and evidence/i);
  assert.match(ledger, /Evidence vocabulary|Claim ledger|Verification provenance|Promotion guardrail/i);
  for (const level of ['Focused/local', 'Repository', 'CI', 'External/live', 'Release readiness']) assert.match(matrix, new RegExp(level.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')));
  assert.match(handoff, /Objective|Accomplished|Decisions|Verification|Active lifecycle|Open findings|Next actions|Guardrails/i);
  assert.match(matrix, /External action.*not-run/i);
  assert.match(handoff, /Session closure does not complete a partial Change/i);
});
