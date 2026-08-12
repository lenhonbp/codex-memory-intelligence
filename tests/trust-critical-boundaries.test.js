import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { safeReadMemoryFile, safeWriteMemoryFile } from '../src/storage.js';
import { resolveProjectFile } from '../src/paths.js';
import { collectExecutableProvenance } from '../src/provenance.js';
import { detectWorkspaces, workspaceForPath } from '../src/workspaces.js';

async function fixture(prefix = 'cmi-trust-boundary-') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture', private: true }));
  return root;
}

test('failed overwrite removes temporary artifacts and preserves the prior durable value', async (t) => {
  const root = await fixture('cmi-storage-overwrite-');
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await safeWriteMemoryFile(root, 'state/value.txt', 'original');

  await assert.rejects(
    () => safeWriteMemoryFile(root, 'state/value.txt', 'replacement', { encoding: 'definitely-not-an-encoding' }),
    /encoding/i,
  );

  assert.equal(await safeReadMemoryFile(root, 'state/value.txt'), 'original');
  const entries = await fs.readdir(path.join(root, '.codex-memory', 'state'));
  assert.deepEqual(entries, ['value.txt']);
});

test('failed ifMissing write removes the incomplete durable target', async (t) => {
  const root = await fixture('cmi-storage-if-missing-');
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  await assert.rejects(
    () => safeWriteMemoryFile(root, 'records/new.json', '{}', { ifMissing: true, encoding: 'definitely-not-an-encoding' }),
    /encoding/i,
  );

  assert.equal(await safeReadMemoryFile(root, 'records/new.json', { optional: true }), null);
  assert.deepEqual(await fs.readdir(path.join(root, '.codex-memory', 'records')), []);
});

test('durable storage rejects traversal, POSIX absolute, and Windows absolute paths', async (t) => {
  const root = await fixture('cmi-storage-paths-');
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  for (const unsafe of ['../escape.json', '/tmp/escape.json', 'C:\\temp\\escape.json']) {
    await assert.rejects(() => safeWriteMemoryFile(root, unsafe, 'nope'), /unsafe cmi storage/i);
  }
});

test('project source resolution requires project-relative paths even when absolute input stays inside root', async (t) => {
  const root = await fixture('cmi-source-relative-');
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'src'));
  const file = path.join(root, 'src', 'main.js');
  await fs.writeFile(file, 'export const main = true;\n');

  assert.equal((await resolveProjectFile(root, 'src/main.js')).ok, true);
  const absolute = await resolveProjectFile(root, file);
  assert.equal(absolute.ok, false);
  assert.equal(absolute.code, 'absolute');
  assert.equal((await resolveProjectFile(root, '../outside.js')).code, 'outside');
  assert.equal((await resolveProjectFile(root, 'C:\\outside\\file.js')).code, 'absolute');
  assert.equal((await resolveProjectFile(root, '\\\\server\\share\\file.js')).code, 'absolute');
});

test('workspace discovery ignores caller-supplied paths that escape the project', async (t) => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-workspace-containment-'));
  const root = path.join(parent, 'project');
  const outside = path.join(parent, 'outside-workspace');
  await fs.mkdir(root);
  await fs.mkdir(outside);
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'root', workspaces: ['../outside-workspace'] }));
  await fs.writeFile(path.join(outside, 'package.json'), JSON.stringify({ name: 'must-not-be-read' }));

  const report = await detectWorkspaces(root, [
    { path: 'package.json' },
    { path: '../outside-workspace/package.json' },
  ]);

  assert.equal(report.count, 1);
  assert.equal(report.workspaces[0].name, 'root');
  assert.ok(!report.workspaces.some((workspace) => workspace.name === 'must-not-be-read'));
});

test('workspace discovery skips malformed matched manifests instead of inventing fallback workspaces', async (t) => {
  const root = await fixture('cmi-workspace-malformed-');
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'root', workspaces: ['packages/*'] }));
  await fs.mkdir(path.join(root, 'packages', 'broken'), { recursive: true });
  await fs.writeFile(path.join(root, 'packages', 'broken', 'package.json'), '{not-json');

  const report = await detectWorkspaces(root, [
    { path: 'package.json' },
    { path: 'packages/broken/package.json' },
  ]);

  assert.equal(report.count, 1);
  assert.equal(report.workspaces[0].path, '.');
});

test('npm and pnpm declarations of the same workspace remain deterministically deduplicated', async (t) => {
  const root = await fixture('cmi-workspace-dedupe-');
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'root', workspaces: ['packages/*'] }));
  await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
  await fs.mkdir(path.join(root, 'packages', 'app'), { recursive: true });
  await fs.writeFile(path.join(root, 'packages', 'app', 'package.json'), JSON.stringify({ name: '@fixture/app' }));

  const report = await detectWorkspaces(root, [
    { path: 'package.json' },
    { path: 'pnpm-workspace.yaml' },
    { path: 'packages/app/package.json' },
  ]);

  assert.equal(report.count, 2);
  assert.equal(report.workspaces.filter((workspace) => workspace.path === 'packages/app').length, 1);
});

test('workspace path matching chooses the deepest bounded workspace', () => {
  const report = {
    workspaces: [
      { id: 'node:.', ecosystem: 'node', path: '.', name: 'root' },
      { id: 'node:packages/app', ecosystem: 'node', path: 'packages/app', name: 'app' },
      { id: 'node:packages/app/plugins/x', ecosystem: 'node', path: 'packages/app/plugins/x', name: 'plugin' },
    ],
  };
  assert.equal(workspaceForPath('packages/app/plugins/x/src/index.js', report)?.name, 'plugin');
  assert.equal(workspaceForPath('packages/app/src/index.js', report)?.name, 'app');
});

test('unattributed cmi executable on PATH lowers provenance confidence and is explicitly ambiguous', async (t) => {
  const root = await fixture('cmi-provenance-path-');
  const bin = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-provenance-bin-'));
  const executable = path.join(bin, process.platform === 'win32' ? 'cmi.cmd' : 'cmi');
  await fs.writeFile(executable, process.platform === 'win32' ? '@echo off\r\n' : '#!/bin/sh\n');
  const previousPath = process.env.PATH;
  t.after(async () => {
    process.env.PATH = previousPath;
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(bin, { recursive: true, force: true });
  });
  process.env.PATH = bin;

  const result = await collectExecutableProvenance({ projectRoot: root });
  assert.equal(result.observed.packageName, 'codex-memory-intelligence');
  assert.equal(result.ambiguity.ambiguous, true);
  assert.equal(result.confidence, 'medium');
  assert.ok(result.ambiguity.diagnostics.some((item) => /PATH executable named cmi differs.*no package provenance/i.test(item)));
});

test('cmi executable on PATH owned by another package is never presented as high-confidence provenance', async (t) => {
  const root = await fixture('cmi-provenance-other-package-');
  const bin = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-provenance-other-bin-'));
  await fs.writeFile(path.join(bin, 'package.json'), JSON.stringify({ name: 'other-cmi-like-tool', version: '9.9.9' }));
  const executable = path.join(bin, process.platform === 'win32' ? 'cmi.cmd' : 'cmi');
  await fs.writeFile(executable, process.platform === 'win32' ? '@echo off\r\n' : '#!/bin/sh\n');
  const previousPath = process.env.PATH;
  t.after(async () => {
    process.env.PATH = previousPath;
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(bin, { recursive: true, force: true });
  });
  process.env.PATH = bin;

  const result = await collectExecutableProvenance({ projectRoot: root });
  assert.equal(result.ambiguity.ambiguous, true);
  assert.notEqual(result.confidence, 'high');
  assert.ok(result.ambiguity.diagnostics.some((item) => /associated with another package/i.test(item)));
});
