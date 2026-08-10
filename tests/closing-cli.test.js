import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scanProject } from '../src/core.js';

const cli = fileURLToPath(new URL('../src/cli-entry.js', import.meta.url));

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-closing-cli-'));
  await fs.writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'src', 'task.js'), 'export const task = true;\n');
  await scanProject(root);
  return root;
}

function run(root, args) {
  return execFileSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
}

test('human session close appends branded Closing Intelligence and standalone closing JSON remains machine-readable', async () => {
  const root = await fixture();
  run(root, ['session', 'start', 'inspect retry behavior']);
  const closed = run(root, ['session', 'close', 'latest', '--blocker', 'Retry ownership remains unresolved.']);
  assert.match(closed, /### CMI Intelligence/);
  assert.match(closed, /BLOCKER/);
  assert.match(closed, /Next:/);

  const closing = JSON.parse(run(root, ['session', 'closing', 'latest', '--json']));
  assert.equal(closing.state, 'blocker');
  assert.ok(Array.isArray(closing.alerts));
  assert.ok(closing.alerts.length >= 1 && closing.alerts.length <= 3);
});

test('closing fails closed when health evidence exists without a durable closed session', async () => {
  const root = await fixture();
  assert.throws(
    () => run(root, ['session', 'closing', 'latest', '--json']),
    (error) => /No closed CMI session exists for Closing Intelligence/i.test(String(error.stderr || '')),
  );
});

test('local exact CLI preserves partial Change progress as active across session close, then permits completion', async () => {
  const root = await fixture();
  const session = JSON.parse(run(root, ['session', 'start', 'implement task checkpoint', '--json']));
  const change = JSON.parse(run(root, ['change', 'start', 'task checkpoint implementation', '--json']));
  const partial = JSON.parse(run(root, ['change', 'complete', change.id, '--outcome', 'partial', '--file', 'src/task.js', '--verify', 'task unit=passed', '--json']));
  assert.equal(partial.status, 'active');
  assert.equal(partial.progress.outcome, 'partial');
  const closed = JSON.parse(run(root, ['session', 'close', session.id, '--outcome', 'partial', '--note', 'Paused before final integration for review.', '--json']));
  assert.ok(closed.close.handoff.activeChanges.some((item) => item.id === change.id));
  assert.ok(!closed.close.handoff.completedChanges.some((item) => item.id === change.id));
  const closing = JSON.parse(run(root, ['session', 'closing', session.id, '--json']));
  assert.equal(closing.counts.blocker, 0);
  assert.ok(closing.alerts.some((item) => item.relatedChangeIds.includes(change.id) && item.severity === 'reminder'));
  const completed = JSON.parse(run(root, ['change', 'complete', change.id, '--outcome', 'succeeded', '--verify', 'task integration=passed', '--json']));
  assert.equal(completed.status, 'completed');
  assert.equal(completed.completion.outcome, 'succeeded');
});
