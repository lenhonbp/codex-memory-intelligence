import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scanProject } from '../src/core.js';

const cli = fileURLToPath(new URL('../src/cli-entry.js', import.meta.url));

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-cli-branches-'));
  await fs.writeFile(path.join(root, 'package.json'), '{"name":"cli-branches","type":"module"}\n');
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'src', 'main.js'), 'export const main = true;\n');
  await scanProject(root);
  return root;
}

function run(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

function assertCliError(result, pattern) {
  assert.equal(result.code, 1);
  assert.match(result.stderr, pattern);
}

test('session, finding, and evaluate group help cover each dedicated CLI adapter', async () => {
  const root = await fixture();
  for (const [group, pattern] of [['session', /Track project work/i], ['finding', /persistent project findings/i], ['evaluate', /anonymized field evidence/i]]) {
    const result = await run([group, '--help'], root);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, pattern);
  }
});

test('session CLI validates missing goals, missing flag values, unknown options, and empty inventory', async () => {
  const root = await fixture();

  assertCliError(await run(['session', 'start'], root), /Usage: cmi session start/i);
  assertCliError(await run(['session', 'list', '--limit'], root), /--limit requires a value/i);
  assertCliError(await run(['session', 'list', '--bogus'], root), /Unknown option/i);

  const listed = await run(['session', 'list', '--json'], root);
  assert.equal(listed.code, 0, listed.stderr);
  assert.deepEqual(JSON.parse(listed.stdout).records, []);

  assertCliError(await run(['session', 'unknown'], root), /Usage: cmi session/i);
});

test('finding CLI covers empty list plus show/state usage and unknown action failures', async () => {
  const root = await fixture();

  const listed = await run(['finding', 'list', '--json'], root);
  assert.equal(listed.code, 0, listed.stderr);
  assert.deepEqual(JSON.parse(listed.stdout).findings || JSON.parse(listed.stdout).records || [], []);

  assertCliError(await run(['finding', 'show'], root), /finding|selector|id/i);
  assertCliError(await run(['finding', 'state'], root), /Usage: cmi finding state/i);
  assertCliError(await run(['finding', 'unknown'], root), /Usage: cmi finding/i);
});

test('evaluation CLI fails closed on missing required capture/review/export/import inputs', async () => {
  const root = await fixture();

  assertCliError(await run(['evaluate', 'capture'], root), /source-kind/i);
  assertCliError(await run(['evaluate', 'review'], root), /Usage: cmi evaluate review/i);
  assertCliError(await run(['evaluate', 'export'], root), /Usage: cmi evaluate export/i);
  assertCliError(await run(['evaluate', 'import'], root), /Usage: cmi evaluate import/i);
  assertCliError(await run(['evaluate', 'unknown'], root), /Usage: cmi evaluate/i);
});

test('top-level CLI validation covers missing arguments and invalid stale-policy branches', async () => {
  const root = await fixture();

  assertCliError(await run(['explain-ignore'], root), /Usage: cmi explain-ignore/i);
  assertCliError(await run(['prepare'], root), /Usage: cmi prepare/i);
  assertCliError(await run(['memory-gaps'], root), /Usage: cmi memory-gaps/i);
  assertCliError(await run(['impact'], root), /Usage: cmi impact/i);
  assertCliError(await run(['search', 'main', '--stale-policy', 'invalid'], root), /stale-policy must be/i);
  assertCliError(await run(['search', 'main', '--limit'], root), /--limit requires a value/i);
});
