import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const skillPath = path.join(repositoryRoot, 'skills', 'cmi-continue', 'SKILL.md');
const skillDirectoryName = path.basename(path.dirname(skillPath));
const skillsDocPath = path.join(repositoryRoot, 'docs', 'SKILLS.md');

async function read(filePath) {
  return (await fs.readFile(filePath, 'utf8')).replace(/\r\n/g, '\n');
}

/**
 * Minimal local YAML frontmatter parser for required Skill fields only.
 * Does not install a YAML dependency; supports simple `key: value` lines.
 */
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

test('cmi-continue Skill file exists', async () => {
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
  assert.equal(name, 'cmi-continue');
  assert.equal(name, skillDirectoryName, 'name must match parent directory');
  assert.ok(name.length <= 64, 'name must be <= 64 characters');
  assert.match(name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'name must be lowercase letters/numbers/hyphens without leading/trailing/consecutive hyphens');

  assert.equal(typeof description, 'string');
  assert.ok(description.length > 0, 'description must be non-empty');
  assert.ok(description.length <= 1024, `description must be <= 1024 characters (got ${description.length})`);

  assert.match(description, /handoff|continuation|resume|unfinished/i);
  assert.match(description, /Use when|continue|resume|làm tiếp|pick up/i);
  assert.match(description, /read-only/i);
  assert.match(description, /does not auto-apply|not auto-apply|external tooling may select/i);
  assert.match(description, /does not start sessions|does not start sessions or Changes/i);
  assert.match(description, /npm may deliver this Skill artifact|does not activate or install it into an agent runtime|npm installation does not activate/i);
  assert.doesNotMatch(description, /CMI automatically|auto-applies Skills|native Skill loader/i);
  assert.doesNotMatch(description, /write-enabled|enables durable writes|mutates memory/i);
  assert.doesNotMatch(description, /Codex runtime validated|Grok runtime validated|runtime discovery (is |has been )?validated/i);
});

test('Skill documents primary get_session_handoff MCP contract without invented fields', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /Tool name:\s*`get_session_handoff`/);
  const schema = extractJsonSchemaAfterTool(skill, 'get_session_handoff');
  assert.deepEqual(Object.keys(schema), ['id']);
  assert.equal(schema.id, 'string');
  assert.match(skill, /optional/i);
  assert.match(skill, /no workspace argument|Do \*\*not\*\* invent `workspace`|Do \*\*not\*\* invent `workspace`/i);
  assert.doesNotMatch(skill, /"workspace"\s*:/);
  assert.doesNotMatch(skill, /"path"\s*:/);
  assert.doesNotMatch(skill, /"projectRoot"\s*:/);
  assert.doesNotMatch(skill, /"branch"\s*:/);
  assert.doesNotMatch(skill, /"write"\s*:/);
  assert.doesNotMatch(skill, /"resume"\s*:/);
  assert.doesNotMatch(skill, /"sessionStatus"\s*:/);
});

test('Skill requires current-evidence re-check via get_repository_baseline with empty schema', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /re-check current repository evidence|Current-evidence re-check|current repository evidence/i);
  assert.match(skill, /Tool name:\s*`get_repository_baseline`/);
  const schema = extractJsonSchemaAfterTool(skill, 'get_repository_baseline');
  assert.deepEqual(schema, {});
  assert.match(skill, /historical durable continuation evidence|historical continuation evidence/i);
  assert.match(skill, /not interchangeable|are \*\*not interchangeable\*\*/i);
  assert.match(skill, /Prefer current baseline|prefer current baseline|Prefer current observable evidence/i);
});

test('Skill treats list_change_records as bounded inventory only, not lifecycle proof for omitted IDs', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /Tool name:\s*`list_change_records`/);
  const schema = extractJsonSchemaAfterTool(skill, 'list_change_records');
  assert.equal(schema.status, 'active');
  assert.ok(Object.keys(schema).every((key) => ['status', 'limit'].includes(key)));
  if (Object.hasOwn(schema, 'limit')) {
    assert.equal(typeof schema.limit, 'number');
    assert.ok(schema.limit >= 1 && schema.limit <= 100);
  }
  assert.match(skill, /bounded/i);
  assert.match(skill, /Absence from this bounded list is NOT lifecycle proof|not lifecycle proof|omitted IDs are \*\*not\*\* proven inactive|Omitted IDs are not proven inactive/i);
  assert.doesNotMatch(
    skill,
    /If a handoff Change is no longer present in the current active list[\s\S]{0,80}no longer active/i,
  );
  assert.doesNotMatch(
    skill,
    /absent from the current active list, report them as historical only/i,
  );
  assert.match(
    skill,
    /node\s+"\.\/node_modules\/codex-memory-intelligence\/src\/cli-entry\.js"\s+change\s+list\s+--status\s+active\s+--json/,
  );
});

test('Skill re-checks each historical handoff.activeChanges entry via get_change_record', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /Tool name:\s*`get_change_record`/);
  const schema = extractJsonSchemaAfterTool(skill, 'get_change_record');
  assert.deepEqual(Object.keys(schema), ['id']);
  assert.equal(schema.id, 'string');
  assert.match(skill, /`id` is \*\*required\*\*|`id` is required/i);
  assert.match(skill, /each relevant|For \*\*each\*\* relevant|for each relevant/i);
  assert.match(skill, /handoff\.activeChanges|handoff `activeChanges`/i);
  assert.match(skill, /get_change_record` is the decisive|decisive read surface|Decisive per-Change/i);
  assert.match(skill, /status` == `active`|status` == `active`|== `active`/);
  assert.match(skill, /currently active/i);
  assert.match(skill, /status` == `completed`|== `completed`/);
  assert.match(skill, /historical\/stale|now \*\*completed\*\*|now completed/i);
  assert.match(skill, /UNKNOWN|unknown/i);
  assert.match(skill, /Lookup fails|lookup fails|record unavailable|evidence blocked/i);
  assert.match(skill, /Do \*\*not\*\* infer terminal state|do not infer terminal/i);
  assert.match(skill, /Do \*\*not\*\* infer active state merely from the historical handoff|merely from the historical handoff/i);
  assert.match(
    skill,
    /node\s+"\.\/node_modules\/codex-memory-intelligence\/src\/cli-entry\.js"\s+change\s+show\s+<id-or-prefix>\s+--json/,
  );
  assert.doesNotMatch(skill, /start_change_record|observe_change_record|complete_change_record/);
});

test('Skill re-reads open findings with valid list_project_findings schema and blocked-evidence rule', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /Tool name:\s*`list_project_findings`/);
  const schema = extractJsonSchemaAfterTool(skill, 'list_project_findings');
  assert.equal(schema.state, 'open');
  assert.ok(Object.keys(schema).every((key) => ['state', 'limit'].includes(key)));
  if (Object.hasOwn(schema, 'limit')) {
    assert.equal(typeof schema.limit, 'number');
    assert.ok(schema.limit >= 1 && schema.limit <= 200);
  }
  assert.match(skill, /blocked evidence|blocked\/unsafe findings|blocked findings/i);
  assert.match(skill, /Do \*\*not\*\* convert blocked findings evidence into “no findings\.”|Do \*\*not\*\* convert blocked|not convert blocked/i);
  assert.doesNotMatch(skill, /set_project_finding_state/);
  assert.match(skill, /Tool name:\s*`get_project_finding`/);
  const detailSchema = extractJsonSchemaAfterTool(skill, 'get_project_finding');
  assert.deepEqual(Object.keys(detailSchema), ['id']);
  assert.equal(detailSchema.id, 'string');
});

test('Skill preserves severity for current findings and treats handoff P0/P1 as historical only', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /severity/i);
  assert.match(skill, /preserve returned severity|CMI-provided \*\*severity\*\*|carries CMI-provided \*\*severity\*\*/i);
  assert.match(skill, /not\*\* automatically P0\/P1|not automatically P0\/P1|not.*inherently.*P0\/P1/i);
  assert.doesNotMatch(skill, /open \*\*P0\/P1\*\* project-risk findings|current open P0\/P1 findings|open P0\/P1 findings/i);
  assert.match(skill, /historical continuation recommendation|HISTORICAL continuation recommendation|historical.*recommendation/i);
  assert.match(skill, /nextAction|nextActions/);
  assert.match(skill, /must \*\*not\*\* be called a freshly recomputed|not be called a freshly recomputed|freshly recomputed current P0\/P1/i);
  assert.doesNotMatch(skill, /priorityFor/);
  // Forbid implementation-style mappings; allow explicit "do not map …" instructions.
  assert.doesNotMatch(skill, /severity\s*:\s*['"]P[0-3]|if\s*\([^)]*severity[^)]*\)\s*(?:return|=>)\s*['"]P[0-3]/);
  assert.doesNotMatch(skill, /severityMap\s*=|categoryToPriority\s*=|severityToPriority\s*=/);
  assert.match(skill, /do \*\*not\*\* map severity or category to P0\/P1|severity-to-P0\/P1 mapping|do \*\*not\*\* map severity/i);
});

test('Skill preserves session completion != Change completion and activeChanges carryover', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /Session completion is independent from Change completion|session completion.*Change completion|SESSION COMPLETION.*CHANGE COMPLETION/i);
  assert.match(skill, /activeChanges/);
  assert.match(skill, /completedChanges/);
  assert.match(skill, /not interchangeable/i);
  assert.match(skill, /closed session may coexist with an unfinished|Do \*\*not\*\* interpret “session closed” as “Change completed\.”/i);
  assert.match(skill, /unfinished.*Change|active unfinished Change|current active Changes/i);
});

test('Skill is strictly read-only and forbids lifecycle mutation tool prescriptions', async () => {
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
    'set_project_memory_state',
    'scan_project_intelligence',
    'capture_project_evaluation',
    'review_project_evaluation',
  ]) {
    assert.doesNotMatch(skill, new RegExp(forbidden));
  }
  assert.match(skill, /must \*\*not\*\*/i);
  assert.match(skill, /start a work session/i);
  assert.match(skill, /start a Change/i);
  assert.match(skill, /enable CMI write mode/i);
  assert.doesNotMatch(skill, /mcp-config --write/);
  assert.doesNotMatch(skill, /CMI_WRITE_ENABLED=1/);
});

test('Skill forbids fabricated CLEAN and Closing Intelligence synthesis', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /fabricate a CLEAN|fabricate CLEAN|Never fabricate CLEAN/i);
  assert.match(skill, /synthesize Closing Intelligence/i);
  assert.match(skill, /Do \*\*not\*\* append a `### CMI Intelligence`/i);
  assert.doesNotMatch(skill, /get_closing_intelligence/);
});

test('Skill remains a thin adapter without duplicated CMI routing/ranking implementation', async () => {
  const skill = await read(skillPath);
  // Natural-language trigger phrases are allowed; forbid implementation-style routing tables/APIs.
  assert.doesNotMatch(skill, /CONTINUE\s*=/);
  assert.doesNotMatch(skill, /MUTATE\s*=/);
  assert.doesNotMatch(skill, /classifyAmbientIntent/);
  assert.doesNotMatch(skill, /prepareChangeBrief/);
  assert.doesNotMatch(skill, /buildContextPack/);
  assert.doesNotMatch(skill, /priority\s*=\s*\{/);
  assert.doesNotMatch(skill, /function\s+rank/);
  assert.doesNotMatch(skill, /new RegExp\(/);
  assert.doesNotMatch(skill, /priorityFor/);
  assert.match(skill, /Do not invent ranking|do not recompute P0\/P1|No custom recomputation|CMI executable output remains authoritative/i);
});

test('Skill documents exact project-local CLI fallbacks and rejects PATH-only / npx registry fallback', async () => {
  const skill = await read(skillPath);
  assert.match(
    skill,
    /node\s+"\.\/node_modules\/codex-memory-intelligence\/src\/cli-entry\.js"\s+session\s+handoff\s+--json/,
  );
  assert.match(
    skill,
    /node\s+"\.\/node_modules\/codex-memory-intelligence\/src\/cli-entry\.js"\s+baseline\s+--json/,
  );
  assert.match(
    skill,
    /node\s+"\.\/node_modules\/codex-memory-intelligence\/src\/cli-entry\.js"\s+change\s+list\s+--status\s+active\s+--json/,
  );
  assert.match(
    skill,
    /node\s+"\.\/node_modules\/codex-memory-intelligence\/src\/cli-entry\.js"\s+change\s+show\s+<id-or-prefix>\s+--json/,
  );
  assert.match(
    skill,
    /node\s+"\.\/node_modules\/codex-memory-intelligence\/src\/cli-entry\.js"\s+finding\s+list\s+--status\s+open\s+--json/,
  );
  assert.match(skill, /bare `cmi` command PATH failure alone is \*\*not\*\* evidence/i);
  assert.match(skill, /Do \*\*not\*\* use registry `npx`/i);
  assert.doesNotMatch(skill, /npx\s+cmi\s+/);
  assert.doesNotMatch(skill, /\/Users\//);
  assert.doesNotMatch(skill, /C:\\\\/);
});

test('package.json files ships skills tree without auto-activation claims', async () => {
  const manifest = JSON.parse(await read(path.join(repositoryRoot, 'package.json')));
  assert.ok(Array.isArray(manifest.files), 'package.json.files must remain an explicit array');
  assert.ok(manifest.files.includes('skills'), 'package.json files must include skills for distribution');
  const skill = await read(skillPath);
  assert.match(skill, /does not activate|does not activate or install|npm installation does not activate/i);
  assert.doesNotMatch(skill, /auto-installs Skills into agent runtime|automatically installs Skills into/i);
});

test('docs/SKILLS.md lists cmi-continue as implemented while preserving boundaries and exact CLI commands', async () => {
  const doc = await read(skillsDocPath);
  assert.match(doc, /no native Skill runtime or loader/i);
  assert.match(doc, /cmi-continue/);
  assert.match(doc, /### `cmi-continue`/);
  assert.match(doc, /skills\/cmi-continue\/SKILL\.md/);
  assert.match(doc, /strictly \*\*read-only\*\*|strictly \*\*read-only\*\*|Classification:\*\* strictly \*\*read-only\*\*/i);
  assert.match(doc, /session completion remains independent from Change completion/i);
  assert.match(doc, /list_change_records/);
  assert.match(doc, /get_change_record/);
  assert.match(doc, /bounded inventory|absence from that list is not lifecycle proof/i);
  assert.match(doc, /activation still does \*\*not\*\* automatically discover|does \*\*not\*\* automatically discover or apply Skills/i);
  assert.match(doc, /edge concerns/i);
  assert.match(doc, /Do not claim that this repository has proven Codex or Grok runtime/i);
  assert.match(doc, /ships Skill artifacts|includes the `skills\/` tree|package\.json` `files`|npm installation does not activate Skills/i);
  assert.match(doc, /Future candidates \(not implemented\)/i);
  assert.doesNotMatch(doc, /Future candidates[\s\S]*`cmi-continue`/);
  assert.match(doc, /`cmi-evidence-health`/);
  assert.match(doc, /`cmi-ambient-brief`/);
  assert.doesNotMatch(doc, /…\s*baseline/);
  assert.doesNotMatch(doc, /…\s*finding/);
  assert.doesNotMatch(doc, /…\s*change/);
  assert.match(
    doc,
    /node "\.\/node_modules\/codex-memory-intelligence\/src\/cli-entry\.js" baseline --json/,
  );
  assert.match(
    doc,
    /node "\.\/node_modules\/codex-memory-intelligence\/src\/cli-entry\.js" change list --status active --json/,
  );
  assert.match(
    doc,
    /node "\.\/node_modules\/codex-memory-intelligence\/src\/cli-entry\.js" change show <id-or-prefix> --json/,
  );
  assert.match(
    doc,
    /node "\.\/node_modules\/codex-memory-intelligence\/src\/cli-entry\.js" finding list --status open --json/,
  );
  assert.match(doc, /historical recommendation|historical.*nextAction|severity, not recomputed P0\/P1/i);
});
