import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initProject, scanProject, remember, snapshot, status } from '../src/core.js';

test('initializes, scans, remembers, snapshots, and reports status', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-'));
  await fs.writeFile(path.join(root, 'package.json'), '{}');
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'src', 'index.js'), 'console.log(1)');

  await initProject(root);
  const scan = await scanProject(root);
  assert.equal(scan.files, 2);
  assert.deepEqual(scan.stack, ['Node.js/JavaScript']);

  await remember(root, 'decision', 'Use ESM');
  const decisions = await fs.readFile(
    path.join(root, '.codex-memory', 'decisions.md'),
    'utf8',
  );
  assert.match(decisions, /Use ESM/);

  const snapshotName = await snapshot(root, 'before-change');
  assert.match(snapshotName, /before-change/);

  const projectStatus = await status(root);
  assert.equal(projectStatus.initialized, true);
  assert.equal(projectStatus.snapshots, 1);
});
