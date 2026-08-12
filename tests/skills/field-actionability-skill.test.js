import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const closingSkillPath = path.join(repositoryRoot, 'skills', 'cmi-closing', 'SKILL.md');
const workSessionSkillPath = path.join(repositoryRoot, 'skills', 'cmi-work-session', 'SKILL.md');

async function read(filePath) {
  return (await fs.readFile(filePath, 'utf8')).replace(/\r\n/g, '\n');
}

test('cmi-closing preserves runtime, file, record, scope, and actionability fields', async () => {
  const skill = await read(closingSkillPath);
  assert.match(skill, /runtime version/i);
  assert.match(skill, /findingId/);
  assert.match(skill, /relatedChangeIds/);
  assert.match(skill, /relatedFiles/);
  assert.match(skill, /scopeRelation/);
  assert.match(skill, /evidence anchors/i);
  assert.match(skill, /recommended action/i);
  assert.match(skill, /Do not replace concrete paths with only a count/i);
  assert.match(skill, /historical-project/);
  assert.match(skill, /P3 historical follow-up/i);
});

test('cmi-work-session finalization cannot summarize concrete Closing paths into vague counts', async () => {
  const skill = await read(workSessionSkillPath);
  assert.match(skill, /runtime name\/version/i);
  assert.match(skill, /concrete `relatedFiles` paths/i);
  assert.match(skill, /`findingId` and `relatedChangeIds`/i);
  assert.match(skill, /`scopeRelation`/i);
  assert.match(skill, /evidence anchors/i);
  assert.match(skill, /`recommendedAction`/i);
  assert.match(skill, /do not summarize it only as “N paths escaped scope”/i);
  assert.match(skill, /where is the issue, which durable record produced it, and what should I inspect next/i);
});
