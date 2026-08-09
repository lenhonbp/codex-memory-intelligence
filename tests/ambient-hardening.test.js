import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { activateProject } from '../src/activation.js';
import { classifyAmbientIntent } from '../src/ambient-intelligence.js';

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
