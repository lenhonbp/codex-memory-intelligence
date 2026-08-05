import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initProject, scanProject, remember, snapshot, status } from '../src/core.js';
import { searchMemory, tokenize } from '../src/search.js';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-'));
  await fs.writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  await fs.writeFile(path.join(root, 'wrangler.toml'), 'name = "demo"');
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'src', 'index.js'), 'console.log(1)');
  return root;
}

test('initializes and builds project intelligence', async () => {
  const root = await fixture();
  await initProject(root);
  const scan = await scanProject(root);
  assert.equal(scan.files, 3);
  assert.ok(scan.stack.includes('Node.js'));
  assert.ok(scan.stack.includes('Cloudflare Workers/Pages'));
  assert.equal(scan.schemaVersion, 2);
  assert.ok(scan.languages.some((item) => item.language === 'JavaScript'));

  const config = JSON.parse(await fs.readFile(path.join(root, '.codex-memory', 'config.json'), 'utf8'));
  assert.equal(config.version, 1);
});

test('stores and retrieves durable project memory', async () => {
  const root = await fixture();
  await remember(root, 'decision', 'Use D1 migrations for every production schema change.');
  await remember(root, 'mistake', 'Direct production schema edits caused drift; always deploy migrations.');
  const results = await searchMemory(root, 'production database migration', 4);
  assert.ok(results.length >= 1);
  assert.ok(results.some((item) => /migration/i.test(item.text)));

  const projectStatus = await status(root);
  assert.equal(projectStatus.entries.decisions, 1);
  assert.equal(projectStatus.entries.mistakes, 1);
});

test('rejects likely credentials from memory', async () => {
  const root = await fixture();
  await assert.rejects(() => remember(root, 'fact', 'API key is abc123'), /secret/i);
});

test('creates snapshots even outside a git repository', async () => {
  const root = await fixture();
  const name = await snapshot(root, 'before-change');
  assert.match(name, /before-change/);
  const projectStatus = await status(root);
  assert.equal(projectStatus.snapshots, 1);
});

test('tokenizer is case and accent insensitive', () => {
  assert.deepEqual(tokenize('Quyết định D1 Migration'), ['quyet', 'dinh', 'd1', 'migration']);
});
