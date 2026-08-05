import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { explainIgnore, scanProject } from '../src/core.js';

test('default hidden policy keeps GitHub guidance but excludes sensitive hidden paths', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-hidden-'));
  try {
    await fs.mkdir(path.join(root, '.github', 'workflows'), { recursive: true });
    await fs.writeFile(path.join(root, '.github', 'workflows', 'ci.yml'), 'name: CI\n');
    await fs.writeFile(path.join(root, '.env'), 'SECRET=do-not-index\n');
    await fs.mkdir(path.join(root, 'src', '.private'), { recursive: true });
    await fs.writeFile(path.join(root, 'src', '.private', 'hidden.js'), 'export const hidden = true;\n');
    await fs.writeFile(path.join(root, 'index.js'), 'export const visible = true;\n');

    assert.equal((await explainIgnore(root, '.github', { directory: true })).ignored, false);
    assert.equal((await explainIgnore(root, '.github/workflows', { directory: true })).ignored, false);
    assert.equal((await explainIgnore(root, '.env')).ignored, true);
    assert.equal((await explainIgnore(root, 'src/.private', { directory: true })).ignored, true);

    const scan = await scanProject(root);
    assert.ok(scan.config.includes('.github/workflows/ci.yml'));
    assert.equal(scan.graph.sourceFiles, 1);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
