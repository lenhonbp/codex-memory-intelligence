import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { scanProject } from '../src/core.js';
import { startSession, assessSession, closeSession } from '../src/session-intelligence.js';
import { buildClosingIntelligence } from '../src/closing-intelligence.js';

const execFileAsync = promisify(execFile);

async function committedFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-graph-field-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ type: 'module' }));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'service.js'), 'export function service() { return true; }\n');
  await scanProject(root);
  try {
    await execFileAsync('git', ['init'], { cwd: root });
    await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
    await execFileAsync('git', ['config', 'user.name', 'CMI Field Test'], { cwd: root });
    await execFileAsync('git', ['add', '.'], { cwd: root });
    await execFileAsync('git', ['commit', '-m', 'Initial'], { cwd: root });
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  return root;
}

test('committed source-only mutation on a clean worktree is an expected graph refresh reminder', async () => {
  const root = await committedFixture();
  if (!root) return;

  const session = await startSession(root, 'implement a normal source change');
  assert.equal(session.start.project.graph.current, true);

  await fs.writeFile(path.join(root, 'src', 'service.js'), 'export function service() { return false; }\n');
  await execFileAsync('git', ['add', 'src/service.js'], { cwd: root });
  await execFileAsync('git', ['commit', '-m', 'Change service behavior'], { cwd: root });

  const status = await execFileAsync('git', ['status', '--porcelain'], { cwd: root });
  assert.equal(status.stdout.trim(), '');

  const live = await assessSession(root, session.id);
  assert.equal(live.current.project.graph.current, false);
  assert.deepEqual(live.scope.newDirtyPaths, []);
  assert.deepEqual(live.scope.committedPaths, ['src/service.js']);

  const drift = live.findings.find((item) => item.category === 'graph-drift');
  assert.ok(drift);
  assert.equal(drift.severity, 'low');
  assert.ok(drift.evidence.includes('session-source-mutation'));
  assert.deepEqual(drift.relatedFiles, ['src/service.js']);
  assert.ok(live.recommendations.some((item) => item.priority === 'P3' && /cmi scan/i.test(item.action)));

  await closeSession(root, session.id, { outcome: 'succeeded', files: ['src/service.js'], notes: ['Source change and verification are complete.'] });
  const closing = await buildClosingIntelligence(root, session.id);
  const closingDrift = closing.alerts.find((item) => item.kind === 'graph-drift');
  assert.ok(closingDrift);
  assert.equal(closingDrift.severity, 'reminder');
  assert.equal(closingDrift.violationEstablished, false);
  assert.ok(closingDrift.evidence.includes('session-source-mutation'));
});
