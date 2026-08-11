import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const skillPath = path.join(repositoryRoot, 'skills', 'cmi-memory-review', 'SKILL.md');
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

test('cmi-memory-review Skill file exists', async () => {
  const stat = await fs.stat(skillPath);
  assert.equal(stat.isFile(), true);
});

test('Skill SKILL.md starts with Agent Skills YAML frontmatter (name + description)', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /^---\n/);
  const frontmatter = parseSkillFrontmatter(skill);
  assert.ok(frontmatter);

  const { name, description } = frontmatter.fields;
  assert.equal(name, 'cmi-memory-review');
  assert.equal(name, skillDirectoryName);
  assert.ok(name.length <= 64);
  assert.match(name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);

  assert.ok(description.length > 0 && description.length <= 1024);
  assert.match(description, /memory|stale|review|audit/i);
  assert.match(description, /Use when|needs review|inactive|blocked/i);
  assert.match(description, /read-only/i);
  assert.match(description, /does not refresh|does not refresh, remember, or change/i);
  assert.match(description, /does not auto-apply|external tooling may select/i);
  assert.match(description, /npm install does not deliver|does not deliver or activate/i);
  assert.doesNotMatch(description, /CMI automatically|auto-applies Skills|native Skill loader/i);
  assert.doesNotMatch(description, /write-enabled|mutates memory lifecycle as workflow/i);
  assert.doesNotMatch(description, /Codex runtime validated|Grok runtime validated|runtime discovery (is |has been )?validated/i);
});

test('Skill documents check_stale_memory and optional get_project_memory_status', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /Tool name:\s*`check_stale_memory`/);
  assert.deepEqual(extractJsonSchemaAfterTool(skill, 'check_stale_memory'), {});
  assert.match(skill, /Tool name:\s*`get_project_memory_status`/);
  assert.deepEqual(extractJsonSchemaAfterTool(skill, 'get_project_memory_status'), {});
  assert.match(skill, /Primary|primary/i);
  assert.match(skill, /Optional|optional/i);
  assert.doesNotMatch(skill, /"workspace"\s*:/);
  assert.doesNotMatch(skill, /"id"\s*:\s*"string"/); // no invented filter schema on primary stale call
});

test('Skill documents exact project-local stale/status CLI and rejects npx', async () => {
  const skill = await read(skillPath);
  assert.match(
    skill,
    /node\s+"\.\/node_modules\/codex-memory-intelligence\/src\/cli-entry\.js"\s+stale\s+--json/,
  );
  assert.match(
    skill,
    /node\s+"\.\/node_modules\/codex-memory-intelligence\/src\/cli-entry\.js"\s+status\s+--json/,
  );
  assert.match(skill, /Do \*\*not\*\* call `refresh-memory`, `memory-state`, or `remember`/i);
  assert.match(skill, /bare `cmi` command PATH failure alone is \*\*not\*\* evidence/i);
  assert.match(skill, /CMI_LOCAL_INTERFACE_UNAVAILABLE/);
  assert.doesNotMatch(skill, /npx\s+cmi\b/);
  assert.doesNotMatch(skill, /npx\s+codex-memory-intelligence/);
});

test('Skill preserves fresh/stale/review/untracked/inactive/blocked distinctions', async () => {
  const skill = await read(skillPath);
  for (const label of ['fresh', 'stale', 'review', 'untracked', 'inactive', 'blocked']) {
    assert.match(skill, new RegExp(label, 'i'));
  }
  assert.match(skill, /Do not merge these into one vague|Do not merge these categories|vague .bad memory. bucket/i);
  assert.match(skill, /historical evidence/i);
  assert.match(skill, /not normal trusted retrieval input/i);
  assert.match(skill, /Blocked is \*\*NOT\*\* empty|Blocked is NOT empty|not empty memory/i);
  assert.match(skill, /Do not silently skip blocked/i);
  assert.match(skill, /deprecated/);
  assert.match(skill, /rejected/);
  assert.match(skill, /superseded/);
  assert.match(skill, /Do not call it stale unless CMI calls it stale/i);
});

test('Skill preserves source refresh != semantic review', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /source refresh != semantic approval|source fingerprint refresh is \*\*NOT\*\* semantic review/i);
  assert.match(skill, /Do not tell the user that refreshing fingerprints .reviewed./i);
  assert.match(skill, /Do not automatically mark memory active\/current/i);
  assert.match(skill, /Do not run `refresh-memory` under this Skill|Do \*\*not\*\* call `refresh-memory`/i);
});

test('Skill forbids mutation tools as executable workflow and refuses silent write mode', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /strictly read-only/i);
  assert.match(skill, /Forbidden mutation tools|not executable workflow/i);
  for (const forbidden of [
    'refresh_project_memory',
    'set_project_memory_state',
    'remember_project_knowledge',
  ]) {
    assert.match(skill, new RegExp(forbidden));
    assert.doesNotMatch(skill, new RegExp(`Tool name:\\s*\`${forbidden}\``));
  }
  assert.match(skill, /mark this reviewed/i);
  assert.match(skill, /does \*\*not\*\* perform that mutation|does not perform that mutation/i);
  assert.match(skill, /explicitly authorized write-enabled/i);
  assert.match(skill, /Do \*\*not\*\* silently transition into write mode|do not silently enter write mode/i);
  assert.doesNotMatch(skill, /mcp-config --write/);
  assert.doesNotMatch(skill, /CMI_WRITE_ENABLED=1/);
});

test('Skill does not claim npm distribution or runtime auto-discovery', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /npm package install delivers|does not deliver or activate|Claim npm package install delivers/i);
  assert.match(skill, /runtime discovery/i);
  assert.doesNotMatch(skill, /automatically discovered by Codex|native Skill loader activates/i);
  const doc = await read(skillsDocPath);
  assert.match(doc, /cmi-memory-review/);
  assert.match(doc, /no native Skill runtime or loader/i);
});

test('package.json published files list does not ship the skills tree', async () => {
  const manifest = JSON.parse(await read(path.join(repositoryRoot, 'package.json')));
  for (const entry of manifest.files) {
    const normalized = String(entry).replace(/\\/g, '/').replace(/\/+$/, '');
    assert.notEqual(normalized, 'skills');
    assert.ok(!normalized.startsWith('skills/'));
  }
});

test('Skill states purpose, triggers, non-triggers, and separation from evidence-health', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /## 1\. Purpose/);
  assert.match(skill, /## 2\. Appropriate trigger/);
  assert.match(skill, /## 3\. Non-triggers/);
  assert.match(skill, /cmi-evidence-health/);
  assert.match(skill, /entry-level|memory audit/i);
  assert.match(skill, /thin orchestration contract|thin adapter/i);
  assert.match(skill, /does \*\*not\*\* mutate memory lifecycle/i);
});
