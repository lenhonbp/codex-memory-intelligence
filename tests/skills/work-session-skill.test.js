import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const skillPath = path.join(repositoryRoot, 'skills', 'cmi-work-session', 'SKILL.md');
const skillDirectoryName = path.basename(path.dirname(skillPath));
const skillsDocPath = path.join(repositoryRoot, 'docs', 'SKILLS.md');

async function read(filePath) {
  return (await fs.readFile(filePath, 'utf8')).replace(/\r\n/g, '\n');
}

function parseSkillFrontmatter(skillText) {
  const match = skillText.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf(':');
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    fields[key] = value;
  }
  return { raw: match[1], fields };
}

function extractJsonSchemaAfterTool(skill, toolName) {
  const toolIndex = skill.indexOf(`Tool name: \`${toolName}\``);
  assert.ok(toolIndex >= 0, `Skill must document tool ${toolName}`);
  const after = skill.slice(toolIndex);
  const schemaBlock = after.match(/```json\s*([\s\S]*?)\s*```/);
  assert.ok(schemaBlock, `Skill must document JSON schema for ${toolName}`);
  return JSON.parse(schemaBlock[1]);
}

test('cmi-work-session Skill file exists', async () => {
  assert.equal((await fs.stat(skillPath)).isFile(), true);
});

test('Skill frontmatter name and write-aware session description', async () => {
  const skill = await read(skillPath);
  const fm = parseSkillFrontmatter(skill);
  assert.ok(fm);
  assert.equal(fm.fields.name, 'cmi-work-session');
  assert.equal(fm.fields.name, skillDirectoryName);
  assert.match(fm.fields.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  const { description } = fm.fields;
  assert.ok(description.length > 0 && description.length <= 1024);
  assert.match(description, /work-session|session lifecycle|finalize|start/i);
  assert.match(description, /Use when|track work|finalize/i);
  assert.match(description, /Write-aware|write-aware/i);
  assert.match(description, /does not terminalize Changes|does not terminalize/i);
  assert.match(description, /npm install does not deliver|does not deliver or activate/i);
  assert.doesNotMatch(description, /native Skill loader|auto-applies Skills/i);
});

test('Skill documents start/observe/finalize MCP tools with exact names', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /Tool name:\s*`start_work_session`/);
  assert.match(skill, /Tool name:\s*`observe_work_session`/);
  assert.match(skill, /Tool name:\s*`finalize_work_session`/);
  const start = extractJsonSchemaAfterTool(skill, 'start_work_session');
  assert.equal(start.goal, 'string');
  assert.ok(Object.keys(start).every((k) => ['goal', 'files', 'notes', 'accomplished', 'blockers', 'decisions', 'questions'].includes(k)));
  const observe = extractJsonSchemaAfterTool(skill, 'observe_work_session');
  assert.ok(Object.keys(observe).includes('id') || Object.keys(observe).length >= 0);
  const fin = extractJsonSchemaAfterTool(skill, 'finalize_work_session');
  assert.ok(Object.keys(fin).every((k) => ['id', 'outcome', 'files', 'notes', 'accomplished', 'blockers', 'decisions', 'questions'].includes(k)));
  assert.match(skill, /succeeded/);
  assert.match(skill, /partial/);
  assert.match(skill, /blocked/);
  assert.match(skill, /investigated/);
  assert.match(skill, /abandoned/);
  assert.match(skill, /unknown/);
});

test('Skill forbids silent CLI fallback when MCP write tools absent', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /CMI_WRITE_MODE_REQUIRED/);
  assert.match(skill, /Do NOT\*\* silently fall back to CLI|Do NOT silently fall back|no CLI bypass|not cause silent fallback/i);
  assert.match(skill, /MCP is available but required write tools are \*\*absent\*\*|write tools are \*\*absent\*\*|write tools are absent/i);
});

test('Skill documents project-local session CLI and rejects npx', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /node\s+"\.\/node_modules\/codex-memory-intelligence\/src\/cli-entry\.js"\s+session\s+start/);
  assert.match(skill, /session observe/);
  assert.match(skill, /session close/);
  assert.match(skill, /session closing/);
  assert.match(skill, /CMI_LOCAL_INTERFACE_UNAVAILABLE/);
  assert.match(skill, /Do \*\*not\*\* use registry `npx`|registry `npx`/i);
  assert.doesNotMatch(skill, /npx\s+cmi\s+session/);
  assert.doesNotMatch(skill, /npx\s+codex-memory-intelligence\s+session/);
  assert.match(skill, /bare `cmi` PATH failure is not absence proof|PATH failure is not absence/i);
});

test('Skill preserves session completion != Change completion', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /session completion != Change completion|session completion ≠ Change completion/i);
  assert.match(skill, /NEVER\*\* automatically terminalize|must \*\*NEVER\*\* automatically terminalize|NEVER automatically terminalize/i);
  assert.match(skill, /must \*\*not\*\* call `complete_change_record`|not\*\* call `complete_change_record`/i);
  assert.match(skill, /Change remains \*\*active\*\*|remains active/i);
});

test('Skill requires Closing fidelity and forbids fabricated CLEAN', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /closingIntelligence/);
  assert.match(skill, /session closing/);
  assert.match(skill, /CLEAN.*real Closing|only from a real Closing/i);
  assert.match(skill, /Never fabricate Closing|do not fabricate Closing/i);
});

test('Skill forbids auto Change/finding/memory mutations and project commands', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /must not automatically/i);
  assert.match(skill, /complete Change records|start\/observe\/complete Change/i);
  assert.match(skill, /remember project knowledge/i);
  assert.match(skill, /run tests\/builds\/deploys/i);
  assert.match(skill, /edit project source/i);
  assert.doesNotMatch(skill, /Tool name:\s*`complete_change_record`/);
  assert.doesNotMatch(skill, /Tool name:\s*`remember_project_knowledge`/);
});

test('Skill does not claim npm distribution or runtime discovery', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /npm install delivers Skills|does not deliver or activate/i);
  assert.match(skill, /runtime discovery/i);
  const doc = await read(skillsDocPath);
  assert.match(doc, /cmi-work-session/);
  assert.match(doc, /no native Skill runtime or loader/i);
});

test('package.json files does not ship skills', async () => {
  const manifest = JSON.parse(await read(path.join(repositoryRoot, 'package.json')));
  for (const entry of manifest.files) {
    const n = String(entry).replace(/\\/g, '/').replace(/\/+$/, '');
    assert.notEqual(n, 'skills');
    assert.ok(!n.startsWith('skills/'));
  }
});
