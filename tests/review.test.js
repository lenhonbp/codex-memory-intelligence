import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanProject, explainIgnore } from '../src/core.js';
import { searchMemory, buildContextPack } from '../src/search.js';

test('escaped leading ignore markers stay literal', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-ignore-literal-'));
  await fs.writeFile(path.join(root, '.cmiignore'), '\\!literal.txt\n\\#literal.txt\n');
  await fs.writeFile(path.join(root, '!literal.txt'), 'ignored');
  await fs.writeFile(path.join(root, '#literal.txt'), 'ignored');

  const bang = await explainIgnore(root, '!literal.txt');
  const hash = await explainIgnore(root, '#literal.txt');
  assert.equal(bang.ignored, true);
  assert.equal(bang.pattern, '!literal.txt');
  assert.equal(hash.ignored, true);
  assert.equal(hash.pattern, '#literal.txt');
});

test('workspace package names scope retrieval and enrich context packs', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-workspace-name-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ private: true, workspaces: ['packages/*'] }));
  for (const [folder, name] of [['alpha', '@example/alpha'], ['beta', '@example/beta']]) {
    await fs.mkdir(path.join(root, 'packages', folder), { recursive: true });
    await fs.writeFile(path.join(root, 'packages', folder, 'package.json'), JSON.stringify({ name }));
    await fs.writeFile(path.join(root, 'packages', folder, 'index.js'), `export function shared${folder}() {}\n`);
  }

  await scanProject(root);
  const results = await searchMemory(root, 'shared', 10, { workspace: '@example/alpha' });
  assert.ok(results.some((item) => item.metadata?.path === 'packages/alpha/index.js'));
  assert.ok(!results.some((item) => item.metadata?.path === 'packages/beta/index.js'));

  const pack = await buildContextPack(root, 'shared', 10, { workspace: '@example/alpha' });
  assert.ok(pack.summary.estimatedTokens > 0);
  assert.deepEqual(pack.recommendedFiles, ['packages/alpha/index.js']);
  assert.deepEqual(pack.affectedWorkspaces, ['node:packages/alpha']);
  assert.equal(pack.sections.files.length, 1);
});
