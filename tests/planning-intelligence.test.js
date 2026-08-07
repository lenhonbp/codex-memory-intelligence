import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getPlanningSignals } from '../src/planning-intelligence.js';

test('planning intelligence returns unchecked tasks with source lines and does not treat them as commands', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-planning-'));
  await fs.writeFile(path.join(root, 'ROADMAP.md'), [
    '# Current priorities',
    '',
    '- [x] Already complete',
    '- [ ] Validate session handoff on a real repository',
    '',
    '# Future ideas',
    '',
    '- [ ] Add optional compiler adapters',
    '',
  ].join('\n'));
  const result = await getPlanningSignals(root, { limit: 10 });
  assert.equal(result.totalDetected, 2);
  assert.equal(result.signals[0].text, 'Validate session handoff on a real repository');
  assert.equal(result.signals[0].path, 'ROADMAP.md');
  assert.equal(result.signals[0].line, 4);
  assert.equal(result.signals[0].evidenceType, 'observed');
  assert.equal(result.signals[0].advisory, true);
  assert.match(result.policy, /not proof of current business priority/i);
});

test('planning intelligence ignores oversized and symlinked planning files', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-planning-safe-'));
  await fs.writeFile(path.join(root, 'TODO.md'), 'x'.repeat(256_001));
  const outside = path.join(os.tmpdir(), `cmi-planning-outside-${Date.now()}.md`);
  await fs.writeFile(outside, '- [ ] Outside task\n');
  try {
    await fs.symlink(outside, path.join(root, 'ROADMAP.md'));
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) { context.skip('Symlinks are unavailable on this runner.'); return; }
    throw error;
  }
  const result = await getPlanningSignals(root);
  assert.equal(result.totalDetected, 0);
  await fs.rm(outside, { force: true });
});
