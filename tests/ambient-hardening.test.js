import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { activateProject } from '../src/activation.js';
import { classifyAmbientIntent } from '../src/ambient-intelligence.js';
import { initProject, scanProject } from '../src/core.js';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-ambient-hardening-'));
  await fs.writeFile(path.join(root, 'package.json'), '{"name":"ambient-hardening","type":"module"}\n');
  return root;
}

async function exists(target) {
  return fs.stat(target).then(() => true).catch(() => false);
}

test('Vietnamese change request beginning with non-ASCII text routes as mutation', () => {
  assert.equal(classifyAmbientIntent('Đổi màu nút chiến đấu').intent, 'mutate');
});

test('activation preflights unmanaged Codex conflict before writing AGENTS or CMI state', async () => {
  const root = await fixture();
  await fs.mkdir(path.join(root, '.codex'));
  const configPath = path.join(root, '.codex', 'config.toml');
  const existing = '[mcp_servers.cmi]\ncommand = "custom-cmi"\n';
  await fs.writeFile(configPath, existing);

  await assert.rejects(
    activateProject(root, { agent: 'codex' }),
    /unmanaged.*mcp_servers\.cmi/i,
  );

  assert.equal(await fs.readFile(configPath, 'utf8'), existing);
  assert.equal(await exists(path.join(root, 'AGENTS.md')), false);
  assert.equal(await exists(path.join(root, '.codex-memory')), false);
});

test('activation refuses unsupported generated evidence before writing agent integration', async () => {
  const root = await fixture();
  await initProject(root);
  await scanProject(root);

  const graphPath = path.join(root, '.codex-memory', 'project-graph.json');
  const graph = JSON.parse(await fs.readFile(graphPath, 'utf8'));
  graph.schemaVersion = 999;
  const futureBytes = `${JSON.stringify(graph, null, 2)}\n`;
  await fs.writeFile(graphPath, futureBytes);

  await assert.rejects(
    activateProject(root, { agent: 'codex' }),
    (error) => error?.code === 'CMI_GENERATED_VERSION_UNSUPPORTED' || /unsupported|future/i.test(String(error?.message || '')),
  );

  assert.equal(await fs.readFile(graphPath, 'utf8'), futureBytes);
  assert.equal(await exists(path.join(root, 'AGENTS.md')), false);
  assert.equal(await exists(path.join(root, '.codex', 'config.toml')), false);
});

test('activation rejects a symlinked Codex integration parent before project mutation', async (t) => {
  const root = await fixture();
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-ambient-outside-'));
  try {
    await fs.symlink(outside, path.join(root, '.codex'), process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error?.code)) {
      t.skip(`Symlink creation is unavailable on this runner: ${error.code}`);
      return;
    }
    throw error;
  }

  await assert.rejects(
    activateProject(root, { agent: 'codex' }),
    /unsafe integration parent/i,
  );

  assert.equal(await exists(path.join(root, 'AGENTS.md')), false);
  assert.equal(await exists(path.join(root, '.codex-memory')), false);
  assert.equal(await exists(path.join(outside, 'config.toml')), false);
});
