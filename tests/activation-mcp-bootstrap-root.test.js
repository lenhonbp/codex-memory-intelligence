import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { activateProject } from '../src/activation.js';
import { VERSION } from '../src/version.js';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-activation-mcp-'));
  await fs.writeFile(path.join(root, 'package.json'), '{"name":"consumer","type":"module"}\n');
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'src', 'main.js'), 'export const value = 1;\n');
  return root;
}

async function installLocalCmi(root) {
  const packageRoot = path.join(root, 'node_modules', 'codex-memory-intelligence');
  await fs.mkdir(path.join(packageRoot, 'src'), { recursive: true });
  await fs.writeFile(path.join(packageRoot, 'src', 'cli-entry.js'), '#!/usr/bin/env node\n');
  await fs.writeFile(path.join(packageRoot, 'src', 'mcp-entry.js'), '#!/usr/bin/env node\n');
  await fs.writeFile(path.join(packageRoot, 'package.json'), `${JSON.stringify({
    name: 'codex-memory-intelligence',
    version: VERSION,
    bin: { cmi: 'src/cli-entry.js', 'cmi-mcp': 'src/mcp-entry.js' },
  })}\n`);
}

test('registry fallback is non-interactive, version-pinned, and bound to the activated project root', async () => {
  const root = await fixture();
  await activateProject(root, { agent: 'codex' });

  const configPath = path.join(root, '.codex', 'config.toml');
  const config = await fs.readFile(configPath, 'utf8');
  const quotedRoot = JSON.stringify(path.resolve(root));

  assert.match(config, /command = "npx"/);
  assert.ok(config.includes(`args = ["--yes", "--package=codex-memory-intelligence@${VERSION}", "cmi-mcp"]`));
  assert.doesNotMatch(config, /"--no"/);
  assert.ok(config.includes(`cwd = ${quotedRoot}`));
  assert.ok(config.includes(`CMI_PROJECT_ROOT = ${quotedRoot}`));
  assert.match(config, /CMI_WRITE_ENABLED = "1"/);

  await activateProject(root, { agent: 'codex' });
  assert.equal(await fs.readFile(configPath, 'utf8'), config);
});

test('exact-local MCP keeps the local entrypoint while binding durable writes to the activated project root', async () => {
  const root = await fixture();
  await installLocalCmi(root);
  await activateProject(root, { agent: 'codex' });

  const config = await fs.readFile(path.join(root, '.codex', 'config.toml'), 'utf8');
  const quotedRoot = JSON.stringify(path.resolve(root));

  assert.match(config, /command = "node"/);
  assert.match(config, /args = \["\.\/node_modules\/codex-memory-intelligence\/src\/mcp-entry\.js"\]/);
  assert.doesNotMatch(config, /--package=codex-memory-intelligence/);
  assert.ok(config.includes(`cwd = ${quotedRoot}`));
  assert.ok(config.includes(`CMI_PROJECT_ROOT = ${quotedRoot}`));
  assert.match(config, /CMI_WRITE_ENABLED = "1"/);
});
