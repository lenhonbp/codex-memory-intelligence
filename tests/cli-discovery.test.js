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

test('unknown options fail instead of being silently ignored', async () => {
  const root = await fixture();
  const result = await run(['scan', '--bogus'], root);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /unknown option/i);
  assert.equal(await fs.stat(path.join(root, '.codex-memory')).then(() => true).catch(() => false), false);
});

test('JSON mode emits one machine-readable error object', async () => {
  const root = await fixture();
  const result = await run(['search', '--json'], root);
  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
  const parsed = JSON.parse(result.stderr.trim());
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error.code, 'CMI_CLI_ERROR');
  assert.match(parsed.error.message, /usage: cmi search/i);
});

test('status and doctor expose uninitialized recovery and trust-critical exit codes', async () => {
  const root = await fixture();
  let result = await run(['status'], root);
  assert.equal(result.code, 2);
  assert.match(result.stdout, /Memory is not initialized/i);
  assert.match(result.stdout, /Next safe action: cmi init/i);

  result = await run(['status', '--json'], root);
  assert.equal(result.code, 2);
  const status = JSON.parse(result.stdout);
  assert.equal(status.evidenceHealth.state, 'uninitialized');
  assert.equal(status.evidenceHealth.capabilities.graphContext, 'blocked');

  result = await run(['doctor'], root);
  assert.equal(result.code, 1);
  assert.match(result.stdout, /CMI .* blocked/i);
  assert.match(result.stdout, /Run cmi init, then cmi scan/i);
});

test('blocked impact is structured success output with a nonzero blocked exit code', async () => {
  const root = await fixture();
  const result = await run(['impact', 'src/a.js', '--json'], root);
  assert.equal(result.code, 2);
  assert.equal(result.stderr, '');
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.blocked, true);
  assert.equal(parsed.found, false);
});
