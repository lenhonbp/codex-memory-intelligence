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

test('top-level CLI rejects unknown short options instead of treating them as positional input', async () => {
  const root = await fixture();

  assertCliError(await run(['search', 'main', '-x'], root), /Unknown option for search: -x/i);
  assertCliError(await run(['status', '-x'], root), /Unknown option for status: -x/i);
  assertCliError(await run(['change', 'show', 'deadbeef', '-x'], root), /Unknown option for change: -x/i);

  const jsonError = await run(['status', '-x', '--json'], root);
  assert.equal(jsonError.code, 1);
  const lines = jsonError.stderr.trim().split(/\r?\n/);
  assert.equal(lines.length, 1);
  const payload = JSON.parse(lines[0]);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, 'CMI_CLI_ERROR');
  assert.match(payload.error.message, /Unknown option for status: -x/i);
});

test('single-value top-level flags reject duplicate values while repeatable evidence flags remain valid', async () => {
  const root = await fixture();

  assertCliError(await run(['search', 'main', '--workspace', '.', '--workspace', 'src'], root), /--workspace may be specified only once/i);
  assertCliError(await run(['change', 'list', '--status', 'active', '--status', 'completed'], root), /--status may be specified only once/i);
  assertCliError(await run(['activate', '--agent', 'codex', '--agent', 'generic'], root), /--agent may be specified only once/i);

  const remembered = await run(['remember', 'fact', 'repeatable source evidence', '--source', 'package.json', '--source', 'src/main.js'], root);
  assert.equal(remembered.code, 0, remembered.stderr);
  assert.match(remembered.stdout, /2 source\(s\)/i);
});

test('fixed-arity top-level commands reject extra positional arguments before touching durable state', async () => {
  const root = await fixture();

  assertCliError(await run(['explain-ignore', 'src/main.js', 'extra'], root), /Usage: cmi explain-ignore/i);
  assertCliError(await run(['change', 'observe', 'deadbeef', 'extra'], root), /Usage: cmi change observe/i);
  assertCliError(await run(['change', 'complete', 'deadbeef', 'extra'], root), /Usage: cmi change complete/i);
  assertCliError(await run(['change', 'show', 'deadbeef', 'extra'], root), /Usage: cmi change show/i);
  assertCliError(await run(['change', 'list', 'extra'], root), /Usage: cmi change list/i);
  assertCliError(await run(['memory-state', 'deadbeef', 'active', 'extra', '--reason', 'review'], root), /Usage: cmi memory-state/i);
  assertCliError(await run(['refresh-memory', 'all', 'extra'], root), /Usage: cmi refresh-memory/i);
});
