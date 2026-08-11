import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const skillPath = path.join(repositoryRoot, 'skills', 'cmi-evidence-health', 'SKILL.md');
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

test('cmi-evidence-health Skill file exists', async () => {
  const stat = await fs.stat(skillPath);
  assert.equal(stat.isFile(), true);
});

test('Skill SKILL.md starts with Agent Skills YAML frontmatter (name + description)', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /^---\n/);
  const frontmatter = parseSkillFrontmatter(skill);
  assert.ok(frontmatter, 'SKILL.md must open with YAML frontmatter delimited by ---');

  assert.ok(Object.hasOwn(frontmatter.fields, 'name'), 'frontmatter must include name');
  assert.ok(Object.hasOwn(frontmatter.fields, 'description'), 'frontmatter must include description');

  const { name, description } = frontmatter.fields;
  assert.equal(name, 'cmi-evidence-health');
  assert.equal(name, skillDirectoryName, 'name must match parent directory');
  assert.ok(name.length <= 64);
  assert.match(name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);

  assert.equal(typeof description, 'string');
  assert.ok(description.length > 0);
  assert.ok(description.length <= 1024, `description must be <= 1024 characters (got ${description.length})`);

  assert.match(description, /healthy|readiness|evidence|stale|blocked/i);
  assert.match(description, /Use when|before relying|before starting/i);
  assert.match(description, /read-only/i);
  assert.match(description, /does not auto-apply|not auto-apply|external tooling may select/i);
  assert.match(description, /does not scan|does not scan, init, or refresh|does not.*refresh/i);
  assert.match(description, /npm may deliver this Skill artifact|does not activate or install it into an agent runtime|npm installation does not activate/i);
  assert.doesNotMatch(description, /CMI automatically|auto-applies Skills|native Skill loader/i);
  assert.doesNotMatch(description, /write-enabled|enables durable writes|mutates memory/i);
  assert.doesNotMatch(description, /Codex runtime validated|Grok runtime validated|runtime discovery (is |has been )?validated/i);
});

test('Skill documents exact get_project_memory_status and check_stale_memory MCP contracts', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /Tool name:\s*`get_project_memory_status`/);
  assert.deepEqual(extractJsonSchemaAfterTool(skill, 'get_project_memory_status'), {});
  assert.match(skill, /Tool name:\s*`check_stale_memory`/);
  assert.deepEqual(extractJsonSchemaAfterTool(skill, 'check_stale_memory'), {});
  assert.match(skill, /Call with \*\*no arguments\*\*|no arguments/i);
  assert.doesNotMatch(skill, /"workspace"\s*:/);
  assert.doesNotMatch(skill, /"path"\s*:/);
  assert.doesNotMatch(skill, /"projectRoot"\s*:/);
  assert.doesNotMatch(skill, /"write"\s*:/);
});

test('Skill documents exact project-local CLI fallbacks and rejects PATH-only / npx registry fallback', async () => {
  const skill = await read(skillPath);
  assert.match(
    skill,
    /node\s+"\.\/node_modules\/codex-memory-intelligence\/src\/cli-entry\.js"\s+status\s+--json/,
  );
  assert.match(
    skill,
    /node\s+"\.\/node_modules\/codex-memory-intelligence\/src\/cli-entry\.js"\s+doctor\s+--json/,
  );
  assert.match(
    skill,
    /node\s+"\.\/node_modules\/codex-memory-intelligence\/src\/cli-entry\.js"\s+stale\s+--json/,
  );
  assert.match(skill, /bare `cmi` command PATH failure alone is \*\*not\*\* evidence/i);
  assert.match(skill, /Do \*\*not\*\* use registry `npx`/i);
  assert.match(skill, /CMI_LOCAL_INTERFACE_UNAVAILABLE/);
  assert.doesNotMatch(skill, /npx\s+cmi\b/);
  assert.doesNotMatch(skill, /npx\s+codex-memory-intelligence/);
});

test('Skill forbids auto init/scan/refresh and write-enabled MCP as workflow', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /strictly read-only/i);
  assert.match(skill, /Do \*\*not\*\* automatically run `init`, `scan`, or `refresh-memory`/i);
  assert.match(skill, /do not auto-execute|Do not execute|do not execute/i);
  for (const forbidden of [
    'scan_project_intelligence',
    'refresh_project_memory',
    'remember_project_knowledge',
    'set_project_memory_state',
    'start_work_session',
    'finalize_work_session',
    'start_change_record',
    'complete_change_record',
    'set_project_finding_state',
  ]) {
    // Allowed only as forbidden-list mentions; ensure not prescribed as primary workflow steps.
    const primary = skill.match(/## 4\. Primary workflow[\s\S]*?(?=\n## 5\.)/)?.[1] || '';
    assert.doesNotMatch(primary, new RegExp(forbidden));
  }
  assert.doesNotMatch(skill, /mcp-config --write/);
  assert.doesNotMatch(skill, /CMI_WRITE_ENABLED=1/);
  assert.match(skill, /scan_project_intelligence/);
  assert.match(skill, /Do \*\*not\*\* call as part of this Skill/i);
});

test('Skill preserves non-zero diagnostic exit semantics and blocked != empty', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /non-zero|non‑zero|exits \*\*non-zero\*\*|exits \*\*non-zero\*\*/i);
  assert.match(skill, /do \*\*not\*\* treat non-zero exit alone as .CMI absent|not treat non-zero exit alone as/i);
  assert.match(skill, /preserve the diagnostic/i);
  assert.match(skill, /blocked/i);
  assert.match(skill, /not\*\* empty evidence|NOT\*\* empty|not empty evidence/i);
  assert.match(skill, /Do \*\*not\*\* treat unreadable\/corrupt evidence as empty|not convert to empty|do not convert to empty/i);
  assert.match(skill, /never be fabricated|must \*\*never\*\* be fabricated|Health must \*\*never\*\* be fabricated/i);
  assert.match(skill, /do not invent healthy|do not invent healthy/i);
});

test('Skill surfaces recommendations without auto-execution', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /recommended next safe action|Recommended next safe action/i);
  assert.match(skill, /explicit follow-up requiring user\/agent authorization|do not execute/i);
  assert.match(skill, /do not auto-execute|Do not execute|must not be executed|do not execute that recommendation/i);
});

test('Skill does not claim npm distribution or runtime auto-discovery', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /npm may deliver this Skill artifact|does not activate or install it into an agent runtime|npm installation does not activate/i);
  assert.match(skill, /not in the published package files list|repository-only/i);
  assert.match(skill, /runtime discovery has been validated|not.*runtime discovery|Claim Codex or Grok runtime discovery/i);
  assert.doesNotMatch(skill, /automatically discovered by Codex|automatically discovered by Grok|native Skill loader activates/i);
  const doc = await read(skillsDocPath);
  assert.match(doc, /cmi-evidence-health/);
  assert.match(doc, /no native Skill runtime or loader/i);
  assert.match(doc, /ships Skill artifacts|npm package ships Skill artifacts|includes the `skills\/` tree|npm installation does not activate Skills/i);
});

test('package.json files ships skills tree without auto-activation claims', async () => {
  const manifest = JSON.parse(await read(path.join(repositoryRoot, 'package.json')));
  assert.ok(Array.isArray(manifest.files), 'package.json.files must remain an explicit array');
  assert.ok(manifest.files.includes('skills'), 'package.json files must include skills for distribution');
  const skill = await read(skillPath);
  assert.match(skill, /does not activate|does not activate or install|npm installation does not activate/i);
  assert.doesNotMatch(skill, /auto-installs Skills into agent runtime|automatically installs Skills into/i);
});

test('Skill states purpose, triggers, non-triggers, and thin-adapter boundary', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /## 1\. Purpose/);
  assert.match(skill, /## 2\. Appropriate trigger/);
  assert.match(skill, /## 3\. Non-triggers/);
  assert.match(skill, /thin orchestration contract|thin adapter/i);
  assert.match(skill, /does \*\*not\*\* reimplement health computation/i);
  assert.match(skill, /ordinary project question|every ordinary project question/i);
  assert.match(skill, /cmi-ambient-brief/);
  assert.match(skill, /cmi-continue/);
});
