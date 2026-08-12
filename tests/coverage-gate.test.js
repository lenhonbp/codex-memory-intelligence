import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

test('coverage command enforces the validated global line and branch floors', async () => {
  const pkg = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const command = pkg.scripts?.['test:coverage'] || '';
  assert.match(command, /--experimental-test-coverage/);
  assert.match(command, /--test-coverage-include=["']?src\/\*\*\/\*\.js/);
  assert.match(command, /--test-coverage-lines=94(?:\s|$)/);
  assert.match(command, /--test-coverage-branches=75(?:\s|$)/);
});

test('CI exposes a dedicated coverage gate instead of a report-only coverage job', async () => {
  const workflow = await fs.readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(workflow, /Coverage gate · 94% lines \/ 75% branches/);
  assert.match(workflow, /run: npm run test:coverage/);
  assert.doesNotMatch(workflow, /Coverage baseline/);
});
