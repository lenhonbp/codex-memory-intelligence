import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const skillPath = path.join(repositoryRoot, 'skills', 'cmi-activate', 'SKILL.md');
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

test('cmi-activate Skill file exists', async () => {
  assert.equal((await fs.stat(skillPath)).isFile(), true);
});

test('Skill frontmatter name and explicit activation description', async () => {
  const skill = await read(skillPath);
  const fm = parseSkillFrontmatter(skill);
  assert.equal(fm.fields.name, 'cmi-activate');
  assert.equal(fm.fields.name, skillDirectoryName);
  const { description } = fm.fields;
  assert.ok(description.length > 0 && description.length <= 1024);
  assert.match(description, /activat/i);
  assert.match(description, /Use only when|explicitly asks/i);
  assert.match(description, /CLI-only|no MCP activation/i);
  assert.match(description, /activation is not Skill installation|not Skill installation/i);
  assert.match(description, /npm install does not deliver|does not deliver or activate/i);
});

test('Skill is CLI-only activate with codex|generic agents', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /no\*\* dedicated MCP activation tool|no dedicated MCP activation tool|There is currently \*\*no\*\* dedicated MCP activation tool/i);
  assert.match(skill, /Do \*\*not\*\* invent one|Do not invent one/i);
  assert.match(
    skill,
    /node\s+"\.\/node_modules\/codex-memory-intelligence\/src\/cli-entry\.js"\s+activate\s+--agent\s+codex\s+--json/,
  );
  assert.match(
    skill,
    /node\s+"\.\/node_modules\/codex-memory-intelligence\/src\/cli-entry\.js"\s+activate\s+--agent\s+generic\s+--json/,
  );
  assert.match(skill, /codex/);
  assert.match(skill, /generic/);
  assert.match(skill, /Do \*\*not\*\* invent agent values|Do not invent/i);
  assert.match(skill, /grok|claude|cursor|vscode/i);
  assert.doesNotMatch(skill, /Tool name:\s*`activate/);
  assert.doesNotMatch(skill, /npx\s+cmi\b/);
});

test('Skill discloses mutation scope and fails closed on conflicts', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /not\*\* read-only|not read-only/i);
  assert.match(skill, /\.codex-memory/);
  assert.match(skill, /AGENTS\.md/);
  assert.match(skill, /\.codex\/config\.toml/);
  assert.match(skill, /ACTIVATION_BLOCKED/);
  assert.match(skill, /partial managed markers|duplicated managed markers|malformed managed/i);
  assert.match(skill, /unmanaged existing `\[mcp_servers\.cmi\]`|unmanaged existing/i);
  assert.match(skill, /Do not manually edit around it|Do not attempt to repair/i);
});

test('Skill states activation is not Skill installation', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /Activation is not Skill installation|does \*\*NOT\*\* mean/i);
  assert.match(skill, /install Skills|copy Skills|discover Skills|load Skills/i);
  assert.match(skill, /~\/\.codex\/skills|~\/\.grok\/skills|~\/\.agents\/skills/);
  assert.match(skill, /Do not claim Codex will discover repository `skills\/`/i);
  assert.match(skill, /Mission 1\.8|later mission/i);
});

test('Skill preserves Codex restart and client trust limitations', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /NEW\*\* Codex run\/session|NEW Codex run\/session|new Codex run\/session/i);
  assert.match(skill, /already-running agent session automatically reloads|Do not claim the already-running/i);
  assert.match(skill, /project trust|cannot force a client/i);
});

test('Skill permission boundary excludes Skill install and unrelated mutations', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /does \*\*NOT\*\* authorize|does NOT authorize/i);
  assert.match(skill, /Skill installation/i);
  assert.match(skill, /memory promotion/i);
  assert.match(skill, /Change completion/i);
  assert.match(skill, /finding resolution/i);
  assert.match(skill, /CMI_LOCAL_INTERFACE_UNAVAILABLE/);
});

test('Skill does not claim npm/runtime auto-discovery via activation', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /does not deliver or activate|Claim npm package install delivers/i);
  assert.doesNotMatch(skill, /activation enables Skill auto-discovery automatically by default/i);
  const doc = await read(skillsDocPath);
  assert.match(doc, /cmi-activate/);
  assert.match(doc, /no native Skill runtime or loader/i);
  assert.match(doc, /Planned Skill inventory implemented|all eight planned/i);
});

test('package.json files does not ship skills', async () => {
  const manifest = JSON.parse(await read(path.join(repositoryRoot, 'package.json')));
  for (const entry of manifest.files) {
    const n = String(entry).replace(/\\/g, '/').replace(/\/+$/, '');
    assert.notEqual(n, 'skills');
    assert.ok(!n.startsWith('skills/'));
  }
});

test('Skill is explicit-trigger only and thin adapter', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /ONLY\*\* when the user explicitly|Use \*\*ONLY\*\* when/i);
  assert.match(skill, /ordinary project question/i);
  assert.match(skill, /thin orchestration adapter|thin orchestration/i);
  assert.match(skill, /cmi-work-session|cmi-change-loop/);
});
