import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../src/cli-entry.js', import.meta.url));

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-cli-discovery-'));
  await fs.writeFile(path.join(root, 'package.json'), '{"type":"module"}');
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

test('top-level help exposes session and finding command groups', async () => {
  const root = await fixture();
  const result = await run(['--help'], root);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /cmi session <start\|observe\|status\|close\|show\|list\|handoff>/);
  assert.match(result.stdout, /cmi finding <list\|show\|state>/);
});

test('change, session, and finding group help exit successfully', async () => {
  const root = await fixture();
  for (const group of ['change', 'session', 'finding']) {
    const result = await run([group, '--help'], root);
    assert.equal(result.code, 0, `${group} help failed: ${result.stderr}`);
    assert.match(result.stdout, new RegExp(`cmi ${group}`));
  }
});

test('mcp-config uses the session-aware MCP entrypoint in safe and write modes', async () => {
  const root = await fixture();
  let result = await run(['mcp-config'], root);
  assert.equal(result.code, 0);
  let config = JSON.parse(result.stdout).mcpServers['codex-memory-intelligence'];
  assert.equal(path.basename(config.args[0]), 'mcp-entry.js');
  assert.equal(config.env.CMI_WRITE_ENABLED, '0');
  assert.notEqual(config.env.CMI_ALLOW_BULK_REFRESH, '1');

  result = await run(['mcp-config', '--write', '--bulk-refresh'], root);
  assert.equal(result.code, 0);
  config = JSON.parse(result.stdout).mcpServers['codex-memory-intelligence'];
  assert.equal(path.basename(config.args[0]), 'mcp-entry.js');
  assert.equal(config.env.CMI_WRITE_ENABLED, '1');
  assert.equal(config.env.CMI_ALLOW_BULK_REFRESH, '1');
});

test('mcp-config refuses bulk refresh without explicit write permission', async () => {
  const root = await fixture();
  const result = await run(['mcp-config', '--bulk-refresh'], root);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /requires --write/i);
});
