import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(projectRoot, 'src', 'cli.js');
const mcpPath = path.join(projectRoot, 'src', 'mcp.js');

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-interface-'));
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  await fs.writeFile(path.join(root, 'src', 'shared.js'), 'export function shared() { return 1; }\n');
  await fs.writeFile(path.join(root, 'src', 'index.js'), "import { shared } from './shared.js';\nshared();\n");
  return root;
}

test('CLI scans, records source-linked memory, and reports impact', async () => {
  const root = await fixture();
  const scan = await exec(process.execPath, [cliPath, 'scan', '--json'], { cwd: root });
  const manifest = JSON.parse(scan.stdout);
  assert.equal(manifest.graph.localEdges, 1);

  const remembered = await exec(process.execPath, [cliPath, 'remember', 'decision', 'Shared API remains stable.', '--source', 'src/shared.js'], { cwd: root });
  assert.match(remembered.stdout, /Memory updated/);

  const impact = await exec(process.execPath, [cliPath, 'impact', 'shared', '--json'], { cwd: root });
  const result = JSON.parse(impact.stdout);
  assert.equal(result.found, true);
  assert.ok(result.directDependents.includes('src/index.js'));
});

test('MCP exposes graph, impact, and stale-memory tools over JSON lines', async (context) => {
  const root = await fixture();
  await exec(process.execPath, [cliPath, 'scan'], { cwd: root });
  const child = spawn(process.execPath, [mcpPath], {
    cwd: root,
    env: { ...process.env, CMI_PROJECT_ROOT: root },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  context.after(() => child.kill());

  let buffer = '';
  const pending = new Map();
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    while (buffer.includes('\n')) {
      const index = buffer.indexOf('\n');
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      pending.get(message.id)?.(message);
      pending.delete(message.id);
    }
  });

  const request = (id, method, params = {}) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`MCP timeout for ${method}`)), 3_000);
    pending.set(id, (message) => { clearTimeout(timer); resolve(message); });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });

  const initialized = await request(1, 'initialize', { protocolVersion: '2025-06-18' });
  assert.equal(initialized.result.serverInfo.version, '0.3.0');
  const listed = await request(2, 'tools/list');
  const names = listed.result.tools.map((tool) => tool.name);
  assert.ok(names.includes('analyze_project_impact'));
  assert.ok(names.includes('check_stale_memory'));

  const impact = await request(3, 'tools/call', { name: 'analyze_project_impact', arguments: { target: 'shared' } });
  assert.equal(impact.result.structuredContent.found, true);
});
