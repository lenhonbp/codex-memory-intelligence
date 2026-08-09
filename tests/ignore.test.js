import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { explainIgnore, scanProject } from '../src/core.js';

const exec = promisify(execFile);
const cli = fileURLToPath(new URL('../src/cli-entry.js', import.meta.url));

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

test('scanner and explain-ignore lock symlink files and directories without following targets', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-ignore-symlink-'));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-ignore-outside-'));
  try {
    await fs.mkdir(path.join(root, 'src'), { recursive: true });
    await fs.mkdir(path.join(root, 'real-directory'), { recursive: true });
    await fs.mkdir(path.join(root, 'node_modules'), { recursive: true });
    await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ type: 'module' }));
    await fs.writeFile(path.join(root, 'src', 'target.js'), 'export const target = true;\n');
    await fs.writeFile(path.join(root, 'src', 'ordinary.js'), 'export const ordinary = true;\n');
    await fs.writeFile(path.join(root, 'real-directory', 'nested.js'), 'export const nested = true;\n');
    await fs.writeFile(path.join(root, 'node_modules', 'dependency.js'), 'export const dependency = true;\n');
    await fs.writeFile(path.join(root, '.env'), 'IGNORED=true\n');
    await fs.writeFile(path.join(root, 'custom-ignored.log'), 'ignored\n');
    await fs.writeFile(path.join(outside, 'outside.js'), 'export const outside = true;\n');
    await fs.writeFile(path.join(root, '.cmiignore'), [
      '!src/inside-link.js',
      '!src/outside-link.js',
      '!linked-directory',
      '*.log',
      '*.tmp',
      '!keep.tmp',
      '',
    ].join('\n'));

    try {
      await fs.symlink(path.join(root, 'src', 'target.js'), path.join(root, 'src', 'inside-link.js'), 'file');
      await fs.symlink(path.join(outside, 'outside.js'), path.join(root, 'src', 'outside-link.js'), 'file');
      await fs.symlink(outside, path.join(root, 'linked-directory'), process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error?.code)) {
        context.skip(`Symlink creation is unavailable on this runner (${error.code}).`);
        return;
      }
      throw error;
    }

    const scan = await scanProject(root);
    assert.equal(scan.graph.sourceFiles, 3);
    assert.equal(scan.ignore.symlinks, 3);

    for (const [candidate, directory] of [
      ['src/inside-link.js', false],
      ['src/outside-link.js', false],
      ['linked-directory', true],
      ['linked-directory/outside.js', false],
    ]) {
      const decision = await explainIgnore(root, candidate, { directory });
      assert.equal(decision.ignored, true, candidate);
      assert.equal(decision.locked, true, candidate);
      assert.equal(decision.source, 'built-in', candidate);
      assert.equal(decision.pattern, 'symbolic link', candidate);
      assert.match(decision.reason, /link target was not followed/i, candidate);
    }

    await assert.rejects(
      () => explainIgnore(root, 'linked-directory/../src/ordinary.js'),
      (error) => error?.code === 'CMI_IGNORE_PATH_INVALID',
    );

    const cliResult = await exec(process.execPath, [cli, 'explain-ignore', 'src/outside-link.js', '--json'], { cwd: root, encoding: 'utf8' });
    const cliDecision = JSON.parse(cliResult.stdout);
    assert.equal(cliDecision.ignored, true);
    assert.equal(cliDecision.locked, true);
    assert.equal(cliDecision.pattern, 'symbolic link');

    const ordinary = await explainIgnore(root, 'src/ordinary.js');
    assert.equal(ordinary.ignored, false);
    assert.equal(ordinary.reason, 'No ignore rule matched.');

    const missingIgnored = await explainIgnore(root, 'future.tmp');
    assert.equal(missingIgnored.ignored, true);
    assert.equal(missingIgnored.source, '.cmiignore');
    assert.equal(missingIgnored.pattern, '*.tmp');
    assert.notEqual(missingIgnored.locked, true);

    const missingIncluded = await explainIgnore(root, 'keep.tmp');
    assert.equal(missingIncluded.ignored, false);
    assert.match(missingIncluded.reason, /Re-included by .cmiignore/);
    assert.notEqual(missingIncluded.pattern, 'symbolic link');

    const builtIn = await explainIgnore(root, 'node_modules/dependency.js');
    assert.equal(builtIn.ignored, true);
    assert.equal(builtIn.locked, true);
    assert.equal(builtIn.pattern, 'node_modules');

    const hidden = await explainIgnore(root, '.env');
    assert.equal(hidden.ignored, true);
    assert.equal(hidden.locked, true);
    assert.equal(hidden.pattern, 'hidden path');

    const custom = await explainIgnore(root, 'custom-ignored.log');
    assert.equal(custom.ignored, true);
    assert.equal(custom.source, '.cmiignore');
    assert.equal(custom.pattern, '*.log');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  }
});

test('explain-ignore rejects paths outside the selected project before inspection', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-ignore-boundary-'));
  const outside = path.join(path.dirname(root), 'outside-ignore-candidate.js');
  try {
    await fs.writeFile(path.join(root, 'ordinary.js'), 'export const ordinary = true;\n');
    await fs.writeFile(outside, 'export const outside = true;\n');

    await assert.rejects(
      () => explainIgnore(root, '../outside-ignore-candidate.js'),
      (error) => error?.code === 'CMI_IGNORE_PATH_INVALID',
    );
    await assert.rejects(
      () => explainIgnore(root, outside),
      (error) => error?.code === 'CMI_IGNORE_PATH_OUTSIDE',
    );

    const inside = await explainIgnore(root, path.join(root, 'ordinary.js'));
    assert.equal(inside.ignored, false);
    assert.equal(inside.path, 'ordinary.js');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outside, { force: true });
  }
});
