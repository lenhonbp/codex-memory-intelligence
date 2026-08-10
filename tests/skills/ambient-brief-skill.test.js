import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAmbientTaskBrief } from '../../src/ambient-intelligence.js';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const skillPath = path.join(repositoryRoot, 'skills', 'cmi-ambient-brief', 'SKILL.md');
const skillsDocPath = path.join(repositoryRoot, 'docs', 'SKILLS.md');

async function read(filePath) {
  return fs.readFile(filePath, 'utf8');
}

test('cmi-ambient-brief Skill file exists', async () => {
  const stat = await fs.stat(skillPath);
  assert.equal(stat.isFile(), true);
});

test('docs/SKILLS.md exists and describes repository-only non-published PoC', async () => {
  const doc = await read(skillsDocPath);
  assert.match(doc, /no native Skill runtime or loader/i);
  assert.match(doc, /repository-level reusable Skill contract PoC/i);
  assert.match(doc, /not published to npm|not listed in `package\.json`|Do not claim that installing/i);
  assert.match(doc, /Non-goals/i);
  assert.match(doc, /Issue #41/);
  assert.match(doc, /repository-level reusable Skill contract PoC/i);
  assert.match(doc, /\*\*not\*\* published to npm consumers|npm distribution of the `skills\/` tree/i);
  assert.match(doc, /Do not claim that installing .* from npm delivers Skills/i);
});

test('package.json published files list does not ship the skills tree', async () => {
  const manifestPath = path.join(repositoryRoot, 'package.json');
  const manifest = JSON.parse(await read(manifestPath));
  assert.ok(Array.isArray(manifest.files), 'package.json.files must remain an explicit array');
  const published = manifest.files;
  for (const entry of published) {
    const normalized = String(entry).replace(/\\/g, '/').replace(/\/+$/, '');
    assert.notEqual(normalized, 'skills');
    assert.ok(
      !normalized.startsWith('skills/'),
      `published files must not include skills path: ${entry}`,
    );
  }
});

test('Skill names get_ambient_task_brief and documents MCP request-only schema', async () => {
  const skill = await read(skillPath);
  const mcpSection = skill.match(/## 5\. Exact existing MCP invocation\n([\s\S]*?)(?=\n## 6\.)/)?.[1];
  assert.ok(mcpSection, 'Skill must document a dedicated MCP invocation section');

  const toolNames = [...mcpSection.matchAll(/^\s*-\s*Tool name:\s*`([^`]+)`\s*$/gim)].map((match) => match[1]);
  assert.deepEqual(toolNames, ['get_ambient_task_brief']);

  const schemaBlock = mcpSection.match(/```json\s*([\s\S]*?)\s*```/i);
  assert.ok(schemaBlock, 'Skill must document the MCP request schema as JSON');
  const schema = JSON.parse(schemaBlock[1]);
  assert.deepEqual(Object.keys(schema), ['request']);
  assert.equal(schema.request, 'string');

  assert.match(mcpSection, /Call only this tool with only the `request` field/i);
  assert.match(skill, /no workspace argument/i);
  assert.doesNotMatch(mcpSection, /"workspace"\s*:/i);
  const documentedAmbientTools = [...mcpSection.matchAll(/`((?:get|ambient)_[a-z0-9_]+)`/gi)].map((match) => match[1]);
  assert.deepEqual([...new Set(documentedAmbientTools)], ['get_ambient_task_brief']);
});

test('Skill documents exact project-local CLI fallback and rejects PATH-only / npx registry fallback', async () => {
  const skill = await read(skillPath);
  assert.match(
    skill,
    /node\s+"\.\/node_modules\/codex-memory-intelligence\/src\/cli-entry\.js"\s+ambient\s+"<user request>"\s+--json/,
  );
  assert.match(skill, /bare `cmi` command PATH failure alone is \*\*not\*\* evidence/i);
  assert.match(skill, /Do \*\*not\*\* use registry `npx`/i);
  assert.doesNotMatch(skill, /npx\s+cmi\s+ambient/);
  assert.doesNotMatch(skill, /fallback[^\n]*\bcmi\b[^\n]*only/i);
});

test('Skill is strictly read-only and forbids session/change/closing mutation and fabricated CLEAN', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /strictly read-only/i);
  assert.match(skill, /must \*\*not\*\*/i);
  for (const forbidden of [
    'start a work session',
    'start a Change',
    'close or finalize a session',
    'scan the project',
    'refresh memory',
    'write findings',
    'write evaluations',
    'mutate `.codex-memory`',
    'synthesize Closing Intelligence',
  ]) {
    assert.match(skill, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }
  assert.match(skill, /fabricate CLEAN|emit or fabricate a CLEAN|Never fabricate CLEAN/i);
  assert.match(skill, /Do \*\*not\*\* append a `### CMI Intelligence`/i);
  assert.doesNotMatch(skill, /cmi session start/i);
  assert.doesNotMatch(skill, /cmi change start/i);
  assert.doesNotMatch(skill, /finalize_work_session/i);
  assert.doesNotMatch(skill, /start_change_record/i);
});

test('Skill states purpose, triggers, non-triggers, failure behavior, and lifecycle relationship', async () => {
  const skill = await read(skillPath);
  assert.match(skill, /## 1\. Purpose/);
  assert.match(skill, /## 2\. Appropriate trigger/);
  assert.match(skill, /## 3\. Non-triggers/);
  assert.match(skill, /## 4\. Inputs/);
  assert.match(skill, /## 5\. Exact existing MCP invocation/);
  assert.match(skill, /## 6\. Exact local CLI fallback/);
  assert.match(skill, /## 7\. Read-only boundary/);
  assert.match(skill, /## 8\. Evidence \/ provenance rules/);
  assert.match(skill, /## 9\. Failure behavior/);
  assert.match(skill, /## 10\. What it must never do/);
  assert.match(skill, /## 11\. Expected result handling/);
  assert.match(skill, /## 12\. Relationship to later session/);
  assert.match(skill, /not automatically applied by activation/i);
  assert.match(skill, /Empty `request` is an invalid invocation/i);
  assert.match(skill, /Ambient Intelligence is unavailable/i);
  assert.match(skill, /Session completion remains independent from Change completion/i);
});

test('Skill does not copy core implementation details (no intent regex tables)', async () => {
  const skill = await read(skillPath);
  assert.doesNotMatch(skill, /\blàm\s+tiếp\b/);
  assert.doesNotMatch(skill, /CONTINUE\s*=/);
  assert.doesNotMatch(skill, /MUTATE\s*=/);
  assert.doesNotMatch(skill, /classifyAmbientIntent/);
  assert.doesNotMatch(skill, /prepareChangeBrief/);
  assert.doesNotMatch(skill, /buildContextPack/);
});

test('existing Ambient executable surface remains authoritative for empty request', async () => {
  await assert.rejects(
    () => buildAmbientTaskBrief(repositoryRoot, '   '),
    /Ambient task request cannot be empty/,
  );
});

test('existing Ambient executable surface returns schemaVersion 1 brief for a simple request', async () => {
  const brief = await buildAmbientTaskBrief(repositoryRoot, 'review ambient skill contract');
  assert.equal(brief.schemaVersion, 1);
  assert.equal(brief.request, 'review ambient skill contract');
  assert.ok(brief.classification);
  assert.ok(['continue', 'mutate', 'review', 'investigate', 'unknown'].includes(brief.classification.intent));
  assert.ok(brief.project);
  assert.ok(Array.isArray(brief.workflow));
  assert.match(String(brief.policy || ''), /advisory/i);
});
