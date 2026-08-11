import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

const PLANNED = [
  'cmi-ambient-brief',
  'cmi-continue',
  'cmi-evidence-health',
  'cmi-closing',
  'cmi-memory-review',
  'cmi-work-session',
  'cmi-change-loop',
  'cmi-activate',
];

async function read(rel) {
  return (await fs.readFile(path.join(repositoryRoot, rel), 'utf8')).replace(/\r\n/g, '\n');
}

test('all eight planned Skill directories exist with SKILL.md', async () => {
  for (const name of PLANNED) {
    const skillPath = path.join(repositoryRoot, 'skills', name, 'SKILL.md');
    const stat = await fs.stat(skillPath);
    assert.equal(stat.isFile(), true, skillPath);
  }
  const entries = await fs.readdir(path.join(repositoryRoot, 'skills'));
  const skillDirs = [];
  for (const entry of entries) {
    const full = path.join(repositoryRoot, 'skills', entry);
    if ((await fs.stat(full)).isDirectory()) skillDirs.push(entry);
  }
  assert.deepEqual(skillDirs.sort(), [...PLANNED].sort());
});

test('package.json files includes skills and version is release-consistent', async () => {
  const manifest = JSON.parse(await read('package.json'));
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.ok(Array.isArray(manifest.files));
  assert.ok(manifest.files.includes('skills'));
  assert.ok(manifest.files.includes('src'));
});

test('docs/SKILLS.md states ship-but-not-activate distribution contract', async () => {
  const doc = await read('docs/SKILLS.md');
  assert.match(doc, /npm package ships Skill artifacts/i);
  assert.match(doc, /npm installation does not activate Skills/i);
  assert.match(doc, /no native Skill loader/i);
  assert.match(doc, /cmi activate` does not install Skills|`cmi activate` does not install Skills/i);
  assert.match(doc, /runtime-blocked|S0–S7|S0-S7|final Codex/i);
  assert.doesNotMatch(doc, /skills are intentionally \*\*not\*\* listed in `package\.json`/i);
  assert.doesNotMatch(doc, /Do not claim that installing `codex-memory-intelligence` from npm delivers Skills/i);
});

test('activation skill contract still forbids treating activate as Skill install', async () => {
  const skill = await read('skills/cmi-activate/SKILL.md');
  assert.match(skill, /Activation is not Skill installation|does \*\*NOT\*\* mean/i);
  assert.match(skill, /~\/\.codex\/skills|~\/\.grok\/skills|~\/\.agents\/skills/);
  assert.match(skill, /activate --agent codex/);
});

test('no ninth planned Skill is required in inventory', async () => {
  assert.equal(PLANNED.length, 8);
  const doc = await read('docs/SKILLS.md');
  assert.match(doc, /All \*\*eight\*\*|all eight|8/i);
  assert.match(doc, /None remaining from the original planned Skill inventory/i);
});
