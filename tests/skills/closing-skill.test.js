import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const skillPath = path.join(repositoryRoot, 'skills', 'cmi-closing', 'SKILL.md');
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

test('cmi-closing Skill file exists', async () => {
  const stat = await fs.stat(skillPath);
  assert.equal(stat.isFile(), true);
});

test('Skill SKILL.md starts with Agent Skills YAML frontmatter (name + description)', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /^---\n/);
  const frontmatter = parseSkillFrontmatter(skill);
  assert.ok(frontmatter);

  const { name, description } = frontmatter.fields;
  assert.equal(name, 'cmi-closing');
  assert.equal(name, skillDirectoryName);
  assert.ok(name.length <= 64);
  assert.match(name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);

  assert.ok(description.length > 0 && description.length <= 1024);
  assert.match(description, /Closing Intelligence|already-closed|closed session/i);
  assert.match(description, /Use when|flagged when work ended|final CMI alerts/i);
  assert.match(description, /read-only/i);
  assert.match(description, /does not close|does not close or finalize/i);
  assert.match(description, /does not auto-apply|external tooling may select/i);
  assert.match(description, /npm may deliver this Skill artifact|does not activate or install it into an agent runtime|npm installation does not activate/i);
  assert.doesNotMatch(description, /CMI automatically|auto-applies Skills|native Skill loader/i);
  assert.doesNotMatch(description, /write-enabled|mutates memory/i);
  assert.doesNotMatch(description, /Codex runtime validated|Grok runtime validated|runtime discovery (is |has been )?validated/i);
});

test('Skill is read-only Closing for already-closed sessions and documents get_closing_intelligence', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /already-closed|already-closed CMI work session|already closed/i);
  assert.match(skill, /does \*\*NOT\*\* close a session|does NOT close a session|does \*\*not\*\* close/i);
  assert.match(skill, /Tool name:\s*`get_closing_intelligence`/);
  const schema = extractJsonSchemaAfterTool(skill, 'get_closing_intelligence');
  assert.deepEqual(Object.keys(schema), ['id']);
  assert.equal(schema.id, 'string');
  assert.match(skill, /optional/i);
  assert.doesNotMatch(skill, /"workspace"\s*:/);
  assert.doesNotMatch(skill, /"path"\s*:/);
  assert.doesNotMatch(skill, /"write"\s*:/);
  assert.doesNotMatch(skill, /"outcome"\s*:/);
});

test('Skill documents exact project-local session closing CLI and forbids close/finalize', async () => {
  const skill = await read(skillPath);
  assert.match(
    skill,
    /node\s+"\.\/node_modules\/codex-memory-intelligence\/src\/cli-entry\.js"\s+session\s+closing\s+latest\s+--json/,
  );
  assert.match(
    skill,
    /node\s+"\.\/node_modules\/codex-memory-intelligence\/src\/cli-entry\.js"\s+session\s+closing\s+<session-id-or-prefix>\s+--json/,
  );
  assert.match(skill, /\*\*Never\*\* replace this with `session close`/i);
  assert.match(skill, /\*\*Never\*\* invoke `finalize_work_session`|Never invoke `finalize_work_session`/i);
  assert.doesNotMatch(skill, /session close <id|session close latest|cmi session close/);
  assert.doesNotMatch(skill, /npx\s+cmi\b/);
  assert.doesNotMatch(skill, /npx\s+codex-memory-intelligence/);
  assert.match(skill, /bare `cmi` command PATH failure alone is \*\*not\*\* evidence/i);
  assert.match(skill, /CMI_LOCAL_INTERFACE_UNAVAILABLE/);
});

test('Skill forbids lifecycle write tools as executable workflow', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /strictly read-only/i);
  for (const forbidden of [
    'start_work_session',
    'observe_work_session',
    'finalize_work_session',
    'start_change_record',
    'observe_change_record',
    'complete_change_record',
    'set_project_finding_state',
    'remember_project_knowledge',
    'refresh_project_memory',
    'scan_project_intelligence',
  ]) {
    assert.doesNotMatch(skill, new RegExp(`Tool name:\\s*\`${forbidden}\``));
    assert.doesNotMatch(skill, new RegExp(`call \`${forbidden}\``));
  }
  assert.match(skill, /finalize_work_session/);
  assert.match(skill, /must \*\*not\*\*|Never\*\* call|Never call/i);
});

test('Skill requires real closed session and forbids fabricated CLEAN', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /real closed session|already-closed|closed session/i);
  assert.match(skill, /CLOSING_INTELLIGENCE_NOT_AVAILABLE/);
  assert.match(skill, /must \*\*NEVER\*\* fabricate|NEVER\*\* fabricate|must \*\*NEVER\*\* fabricate/i);
  assert.match(skill, /### CMI Intelligence/);
  assert.match(skill, /Git cleanliness/);
  assert.match(skill, /healthy CMI status/);
  assert.match(skill, /no open findings/);
  assert.match(skill, /no active Changes/);
  assert.match(skill, /Do not synthesize CLEAN|do not synthesize CLEAN/i);
  assert.match(skill, /health alone cannot produce CLEAN|healthy status alone/i);
});

test('Skill forbids alert re-ranking and preserves reviewed-rule boundary', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /BLOCKER/);
  assert.match(skill, /WARNING/);
  assert.match(skill, /REMINDER/);
  assert.match(skill, /INFO/);
  assert.match(skill, /Do not reimplement or re-rank|do not re-rank/i);
  assert.match(skill, /Do not invent a fourth alert/i);
  assert.match(skill, /Do not recompute severity/i);
  assert.match(skill, /Do not upgrade reminders into blockers/i);
  assert.match(skill, /Do not downgrade blockers/i);
  assert.match(skill, /relevant reviewed rule/i);
  assert.match(skill, /confirmed violation/i);
  assert.match(skill, /not\*\* automatically a proven violation|not automatically a proven violation/i);
  assert.match(skill, /User priority remains authoritative/i);
});

test('Skill does not claim npm distribution or runtime auto-discovery', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /npm may deliver|does not activate|installs them into agent runtimes|npm installation activates/i);
  assert.match(skill, /runtime discovery/i);
  assert.doesNotMatch(skill, /automatically discovered by Codex|native Skill loader activates/i);
  const doc = await read(skillsDocPath);
  assert.match(doc, /cmi-closing/);
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

test('Skill states purpose, triggers, non-triggers, and separation from active close', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /## 1\. Purpose/);
  assert.match(skill, /## 2\. Appropriate trigger/);
  assert.match(skill, /## 3\. Non-triggers/);
  assert.match(skill, /future `cmi-work-session`|future cmi-work-session/i);
  assert.match(skill, /cmi-evidence-health/);
  assert.match(skill, /cmi-continue/);
  assert.match(skill, /thin orchestration contract|thin adapter/i);
});
