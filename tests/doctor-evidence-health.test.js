import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { doctor, scanProject } from '../src/core.js';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-doctor-health-'));
  await fs.writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'index.js'), 'export const ready = true;\n');
  await scanProject(root);
  return root;
}

test('doctor fails when durable memory is blocked', async () => {
  const root = await fixture();
  await fs.writeFile(path.join(root, '.codex-memory', 'memory.md'), `# Project Memory\n${'x'.repeat(1_000_100)}`);

  const report = await doctor(root);
  assert.equal(report.healthy, false);
  assert.equal(report.checks.find((check) => check.name === 'memory-health')?.status, 'fail');
  assert.equal(report.checks.find((check) => check.name === 'evidence-health')?.status, 'fail');
});

test('doctor fails when graph freshness is blocked', async () => {
  const root = await fixture();
  await fs.writeFile(path.join(root, 'src', 'new.js'), 'export const addedAfterScan = true;\n');

  const report = await doctor(root);
  assert.equal(report.healthy, false);
  assert.equal(report.checks.find((check) => check.name === 'graph-health')?.status, 'fail');
  assert.equal(report.checks.find((check) => check.name === 'evidence-health')?.status, 'fail');
});
