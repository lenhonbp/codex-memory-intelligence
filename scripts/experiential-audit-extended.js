#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { spawn, spawnSync } from 'node:child_process';

const tarball = path.resolve(process.argv[2] || '');
if (!fs.existsSync(tarball)) throw new Error('Package tarball is required.');
const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'cmi-v08-extended-'));
const consumer = path.join(root, 'consumer');
const project = path.join(root, 'project');
const outside = path.join(root, 'outside.js');
const results = [];
let commands = 0;

function run(command, args = [], options = {}) {
  commands += 1;
  const result = spawnSync(command, args, { cwd: options.cwd || root, env: { ...process.env, ...(options.env || {}) }, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, windowsHide: true });
  if (result.error) throw result.error;
  const expected = options.expect ?? 0;
  if (result.status !== expected) throw new Error(`${command} ${args.join(' ')} exited ${result.status}, expected ${expected}\nstdout=${result.stdout}\nstderr=${result.stderr}`);
  return result;
}
function json(command, args, options = {}) { return JSON.parse(run(command, args, options).stdout); }
async function check(name, fn) {
  try { await fn(); results.push({ name, status: 'PASS' }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, status: 'FAIL', error: error.message }); console.log(`FAIL ${name}: ${error.message}`); }
}
function includes(value, needle) { return JSON.stringify(value).toLowerCase().includes(String(needle).toLowerCase()); }

await fsp.mkdir(consumer, { recursive: true });
await fsp.writeFile(path.join(consumer, 'package.json'), JSON.stringify({ name: 'extended-consumer', private: true, version: '1.0.0' }));
run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], { cwd: consumer });
const cmi = path.join(consumer, 'node_modules', '.bin', 'cmi');
const cmiMcp = path.join(consumer, 'node_modules', '.bin', 'cmi-mcp');
function c(args, opts = {}) { return run(cmi, args, { cwd: opts.cwd || project, expect: opts.expect, env: opts.env }); }
function cj(args, opts = {}) { return json(cmi, args, { cwd: opts.cwd || project, expect: opts.expect, env: opts.env }); }

await fsp.mkdir(path.join(project, 'packages', 'alpha', 'src'), { recursive: true });
await fsp.mkdir(path.join(project, 'packages', 'beta', 'src'), { recursive: true });
await fsp.mkdir(path.join(project, 'docs'), { recursive: true });
await fsp.writeFile(path.join(project, 'package.json'), JSON.stringify({ name: 'extended-root', private: true, type: 'module', workspaces: ['packages/*'] }, null, 2));
await fsp.writeFile(path.join(project, 'packages', 'alpha', 'package.json'), JSON.stringify({ name: '@extended/alpha', version: '1.0.0', type: 'module' }));
await fsp.writeFile(path.join(project, 'packages', 'beta', 'package.json'), JSON.stringify({ name: '@extended/beta', version: '1.0.0', type: 'module' }));
await fsp.writeFile(path.join(project, 'packages', 'alpha', 'src', 'index.js'), `export const SHARED_AUDIT_TOKEN = 'alpha-only';\nexport const ALPHA_SYMBOL = 1;\n`);
await fsp.writeFile(path.join(project, 'packages', 'beta', 'src', 'index.js'), `export const SHARED_AUDIT_TOKEN = 'beta-only';\nexport const BETA_SYMBOL = 2;\n`);
await fsp.writeFile(path.join(project, 'docs', 'ROADMAP.md'), `# Next\n\n- [x] Completed task must not be selected.\n- [ ] Unchecked continuation candidate.\n`);
await fsp.writeFile(outside, `export const OUTSIDE_SECRET_MARKER = true;\n`);
try { await fsp.symlink(outside, path.join(project, 'src-link.js')); } catch {}
run('git', ['init'], { cwd: project });
run('git', ['config', 'user.name', 'CMI Audit'], { cwd: project });
run('git', ['config', 'user.email', 'audit@example.invalid'], { cwd: project });
run('git', ['add', '.'], { cwd: project });
run('git', ['commit', '-m', 'extended baseline'], { cwd: project });

await check('unchanged incremental scan reuses parsed source nodes', async () => {
  const full = cj(['scan', '--full', '--json']);
  assert.ok(full.graph?.parsedFiles > 0);
  const incremental = cj(['scan', '--json']);
  assert.equal(incremental.graph?.parsedFiles, 0);
  assert.equal(incremental.graph?.reusedFiles, incremental.graph?.sourceFiles);
  const rebuilt = cj(['scan', '--full', '--json']);
  assert.ok(rebuilt.graph?.parsedFiles > 0);
  assert.equal(rebuilt.graph?.reusedFiles, 0);
});

await check('workspace-scoped retrieval does not leak sibling workspace graph context', async () => {
  const alpha = cj(['search', 'SHARED_AUDIT_TOKEN', '--workspace', '@extended/alpha', '--json']);
  assert.ok(includes(alpha, 'packages/alpha/src/index.js'));
  assert.equal(includes(alpha, 'packages/beta/src/index.js'), false);
  const beta = cj(['context', 'SHARED_AUDIT_TOKEN', '--workspace', '@extended/beta', '--json']);
  assert.ok(includes(beta, 'packages/beta/src/index.js'));
  assert.equal(includes(beta, 'packages/alpha/src/index.js'), false);
});

await check('symlinked source outside project is skipped from scan evidence', async () => {
  const scan = cj(['scan', '--full', '--json']);
  if (fs.existsSync(path.join(project, 'src-link.js'))) assert.ok((scan.ignore?.symlinks || 0) >= 1);
  const graph = cj(['graph', '--json']);
  assert.equal(includes(graph, 'OUTSIDE_SECRET_MARKER'), false);
  assert.equal(includes(graph, 'src-link.js'), false);
});

let replacementPrefix = null;
await check('memory supersession preserves history and removes superseded knowledge from default retrieval', async () => {
  const oldOut = c(['remember', 'decision', 'AUDIT_OLD_POLICY_331a']).stdout;
  const newOut = c(['remember', 'decision', 'AUDIT_NEW_POLICY_7bd2']).stdout;
  const oldPrefix = oldOut.match(/[0-9a-f]{8}/i)?.[0];
  replacementPrefix = newOut.match(/[0-9a-f]{8}/i)?.[0];
  assert.ok(oldPrefix && replacementPrefix);
  c(['memory-state', oldPrefix, 'superseded', '--reason', 'Replaced during extended audit.', '--changed-by', 'audit', '--superseded-by', replacementPrefix]);
  const current = cj(['search', 'AUDIT_OLD_POLICY_331a', '--json']);
  assert.equal(includes(current, 'AUDIT_OLD_POLICY_331a'), false);
  const history = cj(['search', 'AUDIT_OLD_POLICY_331a', '--include-inactive', '--json']);
  assert.ok(includes(history, 'AUDIT_OLD_POLICY_331a'));
  assert.ok(includes(history, 'superseded'));
});

await check('bulk reviewed refresh skips inactive memory and explicit CLI safety gate rejects bulk-refresh without write', async () => {
  c(['refresh-memory', 'all', '--reviewed-by', 'audit', '--reason', 'Extended audit bulk refresh.']);
  const stale = cj(['stale', '--json']);
  assert.ok((stale.counts?.inactive || 0) >= 1);
  const blocked = c(['mcp-config', '--bulk-refresh'], { expect: 1 });
  assert.match(blocked.stderr, /requires --write/i);
});

await check('completed change records are immutable through observe workflow', async () => {
  const started = cj(['change', 'start', 'Extended immutability audit', '--json']);
  cj(['change', 'complete', started.id, '--outcome', 'succeeded', '--verify', 'manual=passed', '--json']);
  const result = c(['change', 'observe', started.id, '--json'], { expect: 1 });
  assert.match(`${result.stdout}\n${result.stderr}`, /completed|immutable|active/i);
});

await check('checked planning tasks stay excluded while unchecked candidate is surfaced after clean rescan', async () => {
  cj(['scan', '--json']);
  const session = cj(['session', 'start', 'Choose next project work', '--json']);
  const closed = cj(['session', 'close', session.id, '--outcome', 'investigated', '--json']);
  const action = closed.close?.handoff?.nextAction;
  assert.equal(action?.priority, 'P3');
  assert.ok(includes(action, 'Unchecked continuation candidate'));
  assert.equal(includes(action, 'Completed task must not be selected'), false);
});

await check('finding supersession is explicit and replacement-backed', async () => {
  const one = cj(['session', 'start', 'First finding source', '--json']);
  cj(['session', 'observe', one.id, '--blocker', 'FIRST_AUDIT_BLOCKER_6ee1', '--json']);
  cj(['session', 'close', one.id, '--outcome', 'blocked', '--json']);
  const two = cj(['session', 'start', 'Second finding source', '--json']);
  cj(['session', 'observe', two.id, '--blocker', 'SECOND_AUDIT_BLOCKER_aa42', '--json']);
  cj(['session', 'close', two.id, '--outcome', 'blocked', '--json']);
  const open = cj(['finding', 'list', '--status', 'open', '--json']);
  const first = open.findings.find((item) => includes(item, 'FIRST_AUDIT_BLOCKER_6ee1'));
  const second = open.findings.find((item) => includes(item, 'SECOND_AUDIT_BLOCKER_aa42'));
  assert.ok(first?.id && second?.id);
  c(['finding', 'state', first.id, 'superseded', '--reason', 'Replaced by more current audit blocker.', '--changed-by', 'audit', '--superseded-by', second.id]);
  const superseded = cj(['finding', 'show', first.id, '--json']);
  assert.equal(superseded.state, 'superseded');
  assert.equal(superseded.supersededBy, second.id);
});

function mcp() {
  const child = spawn(cmiMcp, [], { cwd: project, env: { ...process.env, CMI_PROJECT_ROOT: project }, stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map(); let id = 1; let stderr = '';
  child.stderr.on('data', (d) => { stderr += d.toString(); });
  const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  lines.on('line', (line) => { let msg; try { msg = JSON.parse(line); } catch { return; } const p = pending.get(String(msg.id)); if (p) { pending.delete(String(msg.id)); p(msg); } });
  const request = (method, params = {}) => new Promise((resolve, reject) => { const rid = id++; const timer = setTimeout(() => reject(new Error(`MCP timeout ${method}: ${stderr}`)), 5000); pending.set(String(rid), (msg) => { clearTimeout(timer); resolve(msg); }); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: rid, method, params }) + '\n'); });
  const notify = (method, params = {}) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  const close = async () => { lines.close(); if (child.exitCode !== null) return; const done = new Promise((r) => child.once('close', r)); child.kill(); await Promise.race([done, new Promise((r) => setTimeout(r, 1000))]); if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); };
  return { request, notify, close };
}

await check('MCP protocol fallback and initialization boundary behave predictably', async () => {
  const client = mcp();
  try {
    const before = await client.request('tools/list');
    assert.ok(before.error, 'tools/list before initialize should fail');
    const init = await client.request('initialize', { protocolVersion: '2099-01-01', capabilities: {}, clientInfo: { name: 'extended-audit', version: '1' } });
    assert.equal(init.result?.protocolVersion, '2025-11-25');
    client.notify('notifications/initialized');
    await new Promise((r) => setTimeout(r, 50));
    const tools = await client.request('tools/list');
    assert.ok((tools.result?.tools || []).length > 10);
    const invalidResource = await client.request('resources/read', { uri: 'cmi://project/not-real' });
    assert.ok(invalidResource.error || invalidResource.result?.isError);
  } finally { await client.close(); }
});

const failed = results.filter((item) => item.status === 'FAIL');
console.log('CMI_EXPERIENTIAL_EXTENDED=' + JSON.stringify({ checks: results.length, passed: results.length - failed.length, failed: failed.length, commands, failures: failed }));
if (failed.length) process.exitCode = 1;
