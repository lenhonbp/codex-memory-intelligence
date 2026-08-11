import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const skillPath = path.join(repositoryRoot, 'skills', 'cmi-change-loop', 'SKILL.md');
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

test('cmi-change-loop Skill file exists', async () => {
  assert.equal((await fs.stat(skillPath)).isFile(), true);
});

test('Skill frontmatter name and change-loop description', async () => {
  const skill = await read(skillPath);
  const fm = parseSkillFrontmatter(skill);
  assert.equal(fm.fields.name, 'cmi-change-loop');
  assert.equal(fm.fields.name, skillDirectoryName);
  const { description } = fm.fields;
  assert.ok(description.length > 0 && description.length <= 1024);
  assert.match(description, /Change Intelligence|BEFORE|DURING|AFTER|change loop/i);
  assert.match(description, /partial keeps the Change active|partial/i);
  assert.match(description, /Write-aware|write-aware/i);
  assert.match(description, /does not auto-remember|does not auto-remember learning/i);
  assert.match(description, /npm may deliver this Skill artifact|does not activate or install it into an agent runtime|npm installation does not activate/i);
});

test('Skill documents start/observe/complete Change MCP tools', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /Tool name:\s*`start_change_record`/);
  assert.match(skill, /Tool name:\s*`observe_change_record`/);
  assert.match(skill, /Tool name:\s*`complete_change_record`/);
  assert.match(skill, /Tool name:\s*`get_change_insights`/);
  const start = extractJsonSchemaAfterTool(skill, 'start_change_record');
  assert.equal(start.goal, 'string');
  assert.ok(Object.keys(start).every((k) => ['goal', 'limit', 'depth', 'workspace'].includes(k)));
  const observe = extractJsonSchemaAfterTool(skill, 'observe_change_record');
  assert.equal(observe.id, 'required-change-id-or-prefix');
  const complete = extractJsonSchemaAfterTool(skill, 'complete_change_record');
  assert.equal(complete.id, 'required');
  assert.match(skill, /succeeded|failed|partial|abandoned|unknown/);
});

test('Skill preserves partial keeps Change active and no terminal-on-session-end', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /outcome = partial/);
  assert.match(skill, /preserves the Change as \*\*ACTIVE\*\*|Leave the Change \*\*ACTIVE\*\*|Change as \*\*ACTIVE\*\*/i);
  assert.match(skill, /Do not reinterpret the method name `complete_change_record`/i);
  assert.match(skill, /session ended|close only the session/i);
  assert.match(skill, /Do not terminalize|Do \*\*not\*\* terminalize|not terminalize a Change solely/i);
});

test('Skill documents verification provenance classes', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /reported/);
  assert.match(skill, /observed-command/);
  assert.match(skill, /Never label verification `observed-command` unless/i);
  assert.match(skill, /command/);
  assert.match(skill, /exitCode/);
  assert.match(skill, /observedAt/);
  assert.match(skill, /CMI itself does not execute those commands/i);
});

test('Skill forbids silent CLI bypass and auto-remember', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /CMI_WRITE_MODE_REQUIRED/);
  assert.match(skill, /Do NOT\*\* silently fall back to CLI|Do NOT silently fall back|no CLI bypass/i);
  assert.match(skill, /NEVER\*\* automatically call|NEVER automatically call/i);
  assert.match(skill, /remember_project_knowledge/);
  assert.match(skill, /proposal/i);
  assert.doesNotMatch(skill, /Tool name:\s*`remember_project_knowledge`/);
});

test('Skill documents project-local change CLI and rejects npx', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /node\s+"\.\/node_modules\/codex-memory-intelligence\/src\/cli-entry\.js"\s+change\s+start/);
  assert.match(skill, /change observe/);
  assert.match(skill, /change complete/);
  assert.match(skill, /CMI_LOCAL_INTERFACE_UNAVAILABLE/);
  assert.doesNotMatch(skill, /npx\s+cmi\b/);
  assert.match(skill, /--verify name=status|reported\*\* evidence|is \*\*reported\*\* evidence/i);
});

test('Skill does not claim npm/runtime discovery', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /npm may deliver this Skill artifact|does not activate or install it into an agent runtime|npm installation does not activate/i);
  const doc = await read(skillsDocPath);
  assert.match(doc, /cmi-change-loop/);
  assert.match(doc, /no native Skill runtime or loader/i);
});

test('package.json files ships skills tree without auto-activation claims', async () => {
  const manifest = JSON.parse(await read(path.join(repositoryRoot, 'package.json')));
  assert.ok(Array.isArray(manifest.files), 'package.json.files must remain an explicit array');
  assert.ok(manifest.files.includes('skills'), 'package.json files must include skills for distribution');
  const skill = await read(skillPath);
  assert.match(skill, /does not activate|does not activate or install|npm installation does not activate/i);
  assert.doesNotMatch(skill, /auto-installs Skills into agent runtime|automatically installs Skills into/i);
});

test('Skill separates investigation session from implementation Change', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /Do not create a Change merely for read-only investigation/i);
  assert.match(skill, /cmi-work-session/);
  assert.match(skill, /thin orchestration adapter|thin orchestration/i);
});
