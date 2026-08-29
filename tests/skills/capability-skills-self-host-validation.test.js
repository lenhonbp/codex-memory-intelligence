import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const executionRoot = path.join(
  repositoryRoot,
  'evaluation',
  'capability-skills',
  'executions',
  '2026-08-29-gpt-5.6-sol',
);

async function read(rel) {
  return (await fs.readFile(path.join(repositoryRoot, rel), 'utf8')).replace(/\r\n/g, '\n');
}

async function manifest() {
  return JSON.parse(await fs.readFile(path.join(executionRoot, 'manifest.json'), 'utf8'));
}

test('self-host execution is exact-revision, named-runtime, and explicitly non-portability proof', async () => {
  const record = await manifest();
  assert.equal(record.schemaVersion, 1);
  assert.equal(record.executionType, 'self-host-controlled');
  assert.equal(record.subjectRevision, '516c7d1c9afa3e9eaa2f83f9505adeed104255a0');
  assert.equal(record.runtime.product, 'ChatGPT');
  assert.equal(record.runtime.model, 'GPT-5.6 Sol');
  assert.equal(record.runtime.runtimeSkillDiscoveryObserved, false);
  assert.equal(record.review.independent, false);
  assert.match(record.scopeLimit, /do not establish Codex, Manus, Grok, Claude, or universal runtime compatibility\/discovery/i);
  assert.match(record.aggregate.claim, /self-host controlled condition only/i);
  assert.match(record.aggregate.claim, /runtime Skill discovery remain not-assessed/i);
});

test('self-host manifest covers all four capability scenarios with exact Skill and scenario identities', async () => {
  const record = await manifest();
  const expected = new Map([
    ['cmi-solution-discovery', ['0fbd956b521bc83a58b7af7de4d6b2727d485938', '193f14dd1808440f0ead24e64593f34a95308d4c']],
    ['cmi-skill-discovery', ['566f5afaaa925669f894dc59b0d7386c738178b6', 'b9247917171179ff022cdae89c5152492d92736e']],
    ['cmi-skill-authoring', ['9f7dcb25b5b675b40e371e16a9a26b41e017e627', '90f63c6f3a9b3b05fb0130fd8d270aa591ca47ab']],
    ['cmi-output-quality-review', ['471f9240acbc395e061de861d6ca23ad562ef3ad', '2a8552a62360e5d2dc8b8cd089add1d57fc36fe8']],
  ]);

  assert.equal(record.records.length, expected.size);
  for (const item of record.records) {
    const identity = expected.get(item.skill);
    assert.ok(identity, `unexpected capability record: ${item.skill}`);
    assert.equal(item.skillBlobSha, identity[0]);
    assert.equal(item.scenarioBlobSha, identity[1]);
    assert.equal(item.result, 'PASS');
    assert.ok(item.observedEvidence.length > 0);
    assert.deepEqual(item.prohibitedActionsObserved, []);
  }
  assert.deepEqual(record.aggregate, {
    pass: 4,
    partial: 0,
    fail: 0,
    blocked: 0,
    claim: record.aggregate.claim,
  });
});

test('solution-discovery PASS stays bounded to local subset reuse rather than general YAML capability', async () => {
  const record = await manifest();
  const item = record.records.find((entry) => entry.skill === 'cmi-solution-discovery');
  assert.equal(item.disposition, 'reuse');
  assert.match(item.output, /current two-field Skill contract tests/i);
  assert.match(item.output, /not a recommendation to use the helper as a general YAML parser/i);
  assert.match(item.unresolved.join('\n'), /General YAML parsing behavior is not assessed/i);
});

test('skill-discovery PASS inspects an exact external artifact but does not install or authorize it', async () => {
  const record = await manifest();
  const item = record.records.find((entry) => entry.skill === 'cmi-skill-discovery');
  assert.equal(item.classification, 'compatible');
  assert.match(item.observedEvidence.join('\n'), /afa8da942115f2961fdbfa80807ea0b232ff6c00/);
  assert.match(item.output, /candidate for bounded evaluation, not adoption/i);
  assert.match(item.unresolved.join('\n'), /Runtime Skill discovery is not observed/i);
  assert.match(item.unresolved.join('\n'), /Adoption\/install\/activation is not authorized/i);
});

test('authoring replay removes vendor paths and keeps publication behind a separate authority/runtime boundary', async () => {
  const source = await read('evaluation/capability-skills/fixtures/vendor-specific-source-skill.md');
  const output = await read('evaluation/capability-skills/executions/2026-08-29-gpt-5.6-sol/artifacts/portable-publish-helper.md');
  assert.match(source, /\/home\/ubuntu/);
  assert.match(source, /CLAUDE_PLUGIN_ROOT/);
  assert.doesNotMatch(output, /\/home\/ubuntu|CLAUDE_PLUGIN_ROOT/);
  assert.match(output, /separately authorized runtime-specific workflow/i);
  assert.match(output, /does not prove that any agent runtime discovers or activates it automatically/i);
  assert.match(output, /not-run.*blocked.*reported.*observed/i);
});

test('output-quality replay preserves evidence, verification, lifecycle, blocker, and identifiers', async () => {
  const source = await read('evaluation/capability-skills/fixtures/output-quality-input.md');
  const output = await read('evaluation/capability-skills/executions/2026-08-29-gpt-5.6-sol/artifacts/output-quality-edited.md');
  for (const token of [
    '516c7d1c9afa3e9eaa2f83f9505adeed104255a0',
    'chg-demo-001',
    'finding-demo-002',
    'tests/skills/capability-skills-contract.test.js#frontmatter',
    'node --test tests/skills/capability-skills-contract.test.js',
  ]) {
    assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(output, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(output, /Inferred:/);
  assert.match(output, /Reported verification:/);
  assert.match(output, /CI was not run/i);
  assert.match(output, /remains partial/i);
  assert.match(output, /remains blocked/i);
  assert.match(output, /release readiness is not assessed/i);
});
