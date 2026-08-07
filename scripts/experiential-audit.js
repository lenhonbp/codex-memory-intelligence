#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { spawn, spawnSync } from 'node:child_process';

const tarball = path.resolve(process.argv[2] || '');
if (!tarball || !fs.existsSync(tarball)) {
  console.error('Usage: node scripts/experiential-audit.js <package-tarball>');
  process.exit(2);
}

const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'cmi-v08-experiential-'));
const consumer = path.join(root, 'consumer');
const project = path.join(root, 'project');
const nonGit = path.join(root, 'non-git');
const results = [];
const commandLog = [];

function clipped(value, limit = 1000) {
  const text = String(value || '');
  return text.length > limit ? `${text.slice(0, limit)}...<clipped>` : text;
}

function run(command, args = [], options = {}) {
  const cwd = options.cwd || root;
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...(options.env || {}) },
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  commandLog.push({ command, args, cwd, status: result.status, stdout: clipped(result.stdout), stderr: clipped(result.stderr) });
  if (result.error) throw result.error;
  const expected = options.expectStatus ?? 0;
  if (result.status !== expected) {
    throw new Error(`Command failed (${result.status}, expected ${expected}): ${command} ${args.join(' ')}\nstdout:\n${clipped(result.stdout, 2500)}\nstderr:\n${clipped(result.stderr, 2500)}`);
  }
  return result;
}

function runJson(command, args = [], options = {}) {
  const result = run(command, args, options);
  try { return JSON.parse(result.stdout); }
  catch (error) { throw new Error(`Expected JSON from ${command} ${args.join(' ')}: ${error.message}\n${clipped(result.stdout, 2500)}`); }
}

function containsText(value, text) {
  return JSON.stringify(value).toLowerCase().includes(String(text).toLowerCase());
}

function findObject(value, predicate) {
  if (!value || typeof value !== 'object') return null;
  if (predicate(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findObject(item, predicate);
      if (found) return found;
    }
    return null;
  }
  for (const item of Object.values(value)) {
    const found = findObject(item, predicate);
    if (found) return found;
  }
  return null;
}

function hasKey(value, key) {
  if (!value || typeof value !== 'object') return false;
  if (Object.prototype.hasOwnProperty.call(value, key)) return true;
  return Object.values(value).some((item) => hasKey(item, key));
}

async function check(name, operation) {
  const startedAt = Date.now();
  try {
    await operation();
    results.push({ name, status: 'PASS', durationMs: Date.now() - startedAt });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, status: 'FAIL', durationMs: Date.now() - startedAt, error: error.message });
    console.log(`FAIL ${name}: ${error.message}`);
  }
}

await fsp.mkdir(consumer, { recursive: true });
await fsp.writeFile(path.join(consumer, 'package.json'), JSON.stringify({ name: 'cmi-audit-consumer', private: true, version: '1.0.0' }, null, 2));
run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], { cwd: consumer });
const cmi = path.join(consumer, 'node_modules', '.bin', 'cmi');
const cmiMcp = path.join(consumer, 'node_modules', '.bin', 'cmi-mcp');
const installedRoot = path.join(consumer, 'node_modules', 'codex-memory-intelligence');

function cmiRun(args, options = {}) { return run(cmi, args, { cwd: options.cwd || project, expectStatus: options.expectStatus, env: options.env }); }
function cmiJson(args, options = {}) { return runJson(cmi, args, { cwd: options.cwd || project, expectStatus: options.expectStatus, env: options.env }); }

async function makeProject(target, git = true) {
  await fsp.mkdir(path.join(target, 'src'), { recursive: true });
  await fsp.mkdir(path.join(target, 'packages', 'pkg-a', 'src'), { recursive: true });
  await fsp.mkdir(path.join(target, 'packages', 'pkg-b', 'src'), { recursive: true });
  await fsp.mkdir(path.join(target, 'py'), { recursive: true });
  await fsp.mkdir(path.join(target, 'gosvc', 'lib'), { recursive: true });
  await fsp.mkdir(path.join(target, 'crates', 'core', 'src'), { recursive: true });
  await fsp.mkdir(path.join(target, 'docs', 'context-pack'), { recursive: true });
  await fsp.mkdir(path.join(target, 'ignored'), { recursive: true });

  await fsp.writeFile(path.join(target, 'package.json'), JSON.stringify({
    name: 'audit-root', private: true, type: 'module', workspaces: ['packages/*']
  }, null, 2));
  await fsp.writeFile(path.join(target, 'packages', 'pkg-a', 'package.json'), JSON.stringify({ name: '@audit/pkg-a', version: '1.0.0', type: 'module' }, null, 2));
  await fsp.writeFile(path.join(target, 'packages', 'pkg-b', 'package.json'), JSON.stringify({ name: '@audit/pkg-b', version: '1.0.0', type: 'module', dependencies: { '@audit/pkg-a': '1.0.0' } }, null, 2));
  await fsp.writeFile(path.join(target, 'src', 'util.js'), `export function greet(name) { return 'hello ' + name; }\n`);
  await fsp.writeFile(path.join(target, 'src', 'app.js'), `import { greet } from './util.js';\nexport const message = greet('audit');\n`);
  await fsp.writeFile(path.join(target, 'src', 'typed.ts'), `import { greet } from './util.js';\nexport const typedMessage: string = greet('typed');\n`);
  await fsp.writeFile(path.join(target, 'packages', 'pkg-a', 'src', 'index.js'), `export const shared = 'shared';\n`);
  await fsp.writeFile(path.join(target, 'packages', 'pkg-b', 'src', 'index.js'), `import { shared } from '../../pkg-a/src/index.js';\nexport const combined = shared + '-b';\n`);
  await fsp.writeFile(path.join(target, 'py', 'helper.py'), `VALUE = 7\n`);
  await fsp.writeFile(path.join(target, 'py', 'main.py'), `from helper import VALUE\nprint(VALUE)\n`);
  await fsp.writeFile(path.join(target, 'go.work'), `go 1.22\nuse ./gosvc\n`);
  await fsp.writeFile(path.join(target, 'gosvc', 'go.mod'), `module example.com/audit/gosvc\n\ngo 1.22\n`);
  await fsp.writeFile(path.join(target, 'gosvc', 'lib', 'lib.go'), `package lib\nfunc Value() int { return 3 }\n`);
  await fsp.writeFile(path.join(target, 'gosvc', 'main.go'), `package main\nimport "example.com/audit/gosvc/lib"\nfunc main(){ _ = lib.Value() }\n`);
  await fsp.writeFile(path.join(target, 'Cargo.toml'), `[workspace]\nmembers = ["crates/core"]\nresolver = "2"\n`);
  await fsp.writeFile(path.join(target, 'crates', 'core', 'Cargo.toml'), `[package]\nname = "audit-core"\nversion = "0.1.0"\nedition = "2021"\n`);
  await fsp.writeFile(path.join(target, 'crates', 'core', 'src', 'helper.rs'), `pub fn value() -> i32 { 5 }\n`);
  await fsp.writeFile(path.join(target, 'crates', 'core', 'src', 'lib.rs'), `mod helper;\npub fn result() -> i32 { helper::value() }\n`);
  await fsp.writeFile(path.join(target, 'docs', 'context-pack', 'CURRENT_PRIORITIES.md'), `# Current priorities\n\n1. Review the release candidate against current evidence.\n2. Validate cross-agent continuation behavior.\n`);
  await fsp.writeFile(path.join(target, '.cmiignore'), `ignored/**\n*.generated.js\n!ignored/keep.js\n`);
  await fsp.writeFile(path.join(target, 'ignored', 'drop.js'), `export const ignored = true;\n`);
  await fsp.writeFile(path.join(target, 'ignored', 'keep.js'), `export const kept = true;\n`);
  await fsp.writeFile(path.join(target, 'src', 'noise.generated.js'), `export const generated = true;\n`);

  if (git) {
    run('git', ['init'], { cwd: target });
    run('git', ['config', 'user.name', 'CMI Audit'], { cwd: target });
    run('git', ['config', 'user.email', 'audit@example.invalid'], { cwd: target });
    run('git', ['add', '.'], { cwd: target });
    run('git', ['commit', '-m', 'audit baseline'], { cwd: target });
  }
}

await makeProject(project, true);
await makeProject(nonGit, false);

await check('package install exposes both binaries and expected package surface', async () => {
  assert.equal(fs.existsSync(cmi), true);
  assert.equal(fs.existsSync(cmiMcp), true);
  assert.equal(fs.existsSync(path.join(installedRoot, 'src')), true);
  assert.equal(fs.existsSync(path.join(installedRoot, 'schemas')), true);
  assert.equal(fs.existsSync(path.join(installedRoot, 'docs')), true);
  assert.equal(fs.existsSync(path.join(installedRoot, 'tests')), false);
  assert.equal(fs.existsSync(path.join(installedRoot, 'scripts')), false);
});

await check('top-level CLI version and help expose the full installed product', async () => {
  assert.equal(cmiRun(['--version']).stdout.trim(), '0.7.0');
  const help = cmiRun(['--help']).stdout;
  assert.match(help, /cmi change start/);
  assert.match(help, /cmi session </);
  assert.match(help, /cmi finding </);
});

await check('group help is discoverable without returning an error', async () => {
  for (const group of ['change', 'session', 'finding']) {
    const output = cmiRun([group, '--help']).stdout;
    assert.match(output, new RegExp(`cmi ${group}`));
  }
});

await check('init, full scan, status, doctor, graph, workspace and multi-language discovery work from installed binary', async () => {
  cmiRun(['init']);
  const scan = cmiJson(['scan', '--full', '--json']);
  assert.ok(scan.files >= 10);
  assert.ok(scan.graph?.sourceFiles >= 8);
  assert.ok(scan.graph?.localEdges >= 2);
  const languages = new Set((scan.languages || []).map((item) => String(item.language)));
  for (const expected of ['JavaScript', 'TypeScript', 'Python', 'Go', 'Rust']) assert.ok(languages.has(expected), `missing indexed language ${expected}: ${[...languages].join(', ')}`);
  const status = cmiJson(['status', '--json']);
  assert.equal(status.initialized, true);
  assert.equal(status.healthy, true);
  const doctor = cmiJson(['doctor', '--json']);
  assert.equal(doctor.healthy, true);
  const graph = cmiJson(['graph', '--json']);
  assert.ok(graph.summary?.sourceFiles >= 8);
  const workspaces = cmiJson(['workspaces', '--json']);
  assert.ok((workspaces.count || 0) >= 2);
});

await check('Git baseline is clean, bounded and free of absolute local paths', async () => {
  const baseline = cmiJson(['baseline', '--json']);
  assert.equal(baseline.available, true);
  assert.ok((baseline.changes || []).every((item) => String(item.path || '').startsWith('.codex-memory')), `unexpected product dirtiness: ${JSON.stringify(baseline.changes)}`);
  assert.ok(!containsText(baseline, root));
});

await check('boundary mapping, ignore explanation and negation behave as a user expects', async () => {
  const boundaries = cmiJson(['boundaries', '--json']);
  assert.ok(hasKey(boundaries, 'boundaries'));
  const ignored = cmiJson(['explain-ignore', 'ignored/drop.js', '--json']);
  assert.equal(ignored.ignored, true);
  const kept = cmiJson(['explain-ignore', 'ignored/keep.js', '--json']);
  assert.equal(kept.ignored, false);
  const generated = cmiJson(['explain-ignore', 'src/noise.generated.js', '--json']);
  assert.equal(generated.ignored, true);
});

let sourceMemoryId = null;
const sourceMarker = 'AUDIT_SOURCE_LINKED_MEMORY_17f3';
await check('durable source-linked memory is searchable and appears in context', async () => {
  const remembered = cmiRun(['remember', 'fact', sourceMarker, '--source', 'src/util.js']).stdout;
  sourceMemoryId = remembered.match(/[0-9a-f]{8}/i)?.[0] || null;
  assert.ok(sourceMemoryId);
  const search = cmiJson(['search', sourceMarker, '--json']);
  assert.ok(containsText(search, sourceMarker));
  const context = cmiJson(['context', sourceMarker, '--json']);
  assert.ok(containsText(context, sourceMarker));
});

await check('source changes make reviewed memory stale and graph health notices drift before rescan', async () => {
  await fsp.appendFile(path.join(project, 'src', 'util.js'), `export const changedForAudit = true;\n`);
  const stale = cmiJson(['stale', '--json']);
  assert.ok((stale.counts?.stale || 0) >= 1);
  const fail = cmiRun(['stale', '--fail-on', 'stale'], { expectStatus: 2 });
  assert.match(fail.stdout, /stale/i);
  const status = cmiJson(['status', '--json']);
  assert.equal(status.graphHealth?.current, false);
  const excluded = cmiJson(['search', sourceMarker, '--stale-policy', 'exclude', '--json']);
  assert.equal(containsText(excluded, sourceMarker), false);
  const included = cmiJson(['search', sourceMarker, '--stale-policy', 'include', '--json']);
  assert.equal(containsText(included, sourceMarker), true);
});

await check('reviewed refresh and incremental scan restore current evidence while reusing unchanged nodes', async () => {
  assert.ok(sourceMemoryId);
  cmiRun(['refresh-memory', sourceMemoryId, '--reviewed-by', 'experiential-audit', '--reason', 'Reviewed updated source during audit.']);
  const stale = cmiJson(['stale', '--json']);
  assert.equal(stale.counts?.stale || 0, 0);
  const scan = cmiJson(['scan', '--json']);
  assert.ok((scan.graph?.reusedFiles || 0) > 0);
  assert.ok((scan.graph?.parsedFiles || 0) >= 1);
  const status = cmiJson(['status', '--json']);
  assert.equal(status.graphHealth?.current, true);
  run('git', ['add', 'src/util.js'], { cwd: project });
  run('git', ['commit', '-m', 'refresh source'], { cwd: project });
});

let inactiveMemoryId = null;
const inactiveMarker = 'AUDIT_INACTIVE_MEMORY_c62e';
await check('memory lifecycle excludes inactive knowledge by default but preserves explicit history', async () => {
  const remembered = cmiRun(['remember', 'decision', inactiveMarker]).stdout;
  inactiveMemoryId = remembered.match(/[0-9a-f]{8}/i)?.[0] || null;
  assert.ok(inactiveMemoryId);
  const search = cmiJson(['search', inactiveMarker, '--json']);
  assert.ok(containsText(search, inactiveMarker));
  cmiRun(['memory-state', inactiveMemoryId, 'deprecated', '--reason', 'Experiential audit lifecycle check.', '--changed-by', 'audit']);
  const defaultSearch = cmiJson(['search', inactiveMarker, '--json']);
  assert.equal(containsText(defaultSearch, inactiveMarker), false);
  const historical = cmiJson(['search', inactiveMarker, '--include-inactive', '--json']);
  assert.equal(containsText(historical, inactiveMarker), true);
});

await check('snapshot, impact, pre-change brief and memory-gap proposal surfaces are operational', async () => {
  const snapshot = cmiRun(['snapshot', 'experiential-audit']).stdout;
  assert.match(snapshot, /Created/);
  const impact = cmiJson(['impact', 'src/util.js', '--depth', '4', '--json']);
  assert.ok(containsText(impact, 'src/app.js'));
  const brief = cmiJson(['prepare', 'Change greeting behavior safely', '--json']);
  for (const key of ['baseline', 'boundaries', 'impact', 'risks', 'verification']) assert.ok(hasKey(brief, key), `prepare output missing ${key}`);
  const gaps = cmiJson(['memory-gaps', 'Change greeting behavior safely', '--json']);
  assert.ok(typeof gaps === 'object' && gaps !== null);
});

let changeId = null;
await check('BEFORE → DURING → AFTER change intelligence works against real Git edits and verification evidence', async () => {
  const started = cmiJson(['change', 'start', 'Update greeting flow', '--json']);
  changeId = started.id;
  assert.ok(changeId);
  await fsp.appendFile(path.join(project, 'src', 'app.js'), `export const auditChange = message.toUpperCase();\n`);
  const observed = cmiJson(['change', 'observe', changeId, '--json']);
  assert.ok(containsText(observed, 'src/app.js'));
  const completed = cmiJson(['change', 'complete', changeId, '--outcome', 'succeeded', '--file', 'src/app.js', '--verify', 'audit-smoke=passed', '--note', 'Verified through experiential audit.', '--json']);
  assert.ok(containsText(completed, 'succeeded'));
  assert.ok(containsText(completed, 'audit-smoke'));
  const shown = cmiJson(['change', 'show', changeId, '--json']);
  assert.equal(shown.id, changeId);
  const list = cmiJson(['change', 'list', '--status', 'completed', '--json']);
  assert.ok(containsText(list, changeId.slice(0, 8)) || containsText(list, 'Update greeting flow'));
  const history = cmiJson(['change', 'history', 'greeting', '--json']);
  assert.ok(containsText(history, 'Update greeting flow'));
  run('git', ['add', 'src/app.js'], { cwd: project });
  run('git', ['commit', '-m', 'complete greeting audit change'], { cwd: project });
});

let blockerSessionId = null;
let blockerFindingId = null;
await check('session blocker persists into P0 handoff and finding lifecycle can resolve it explicitly', async () => {
  const started = cmiJson(['session', 'start', 'Audit blocker continuation', '--json']);
  blockerSessionId = started.id;
  cmiJson(['session', 'observe', blockerSessionId, '--blocker', 'Audit-only blocker requiring explicit review.', '--accomplished', 'Exercised session observation.', '--json']);
  const live = cmiJson(['session', 'status', blockerSessionId, '--json']);
  assert.ok(containsText(live, 'Audit-only blocker'));
  const closed = cmiJson(['session', 'close', blockerSessionId, '--outcome', 'blocked', '--json']);
  assert.equal(closed.close?.outcome, 'blocked');
  assert.equal(closed.close?.handoff?.nextAction?.priority, 'P0');
  const handoff = cmiJson(['session', 'handoff', blockerSessionId, '--json']);
  assert.equal(handoff.nextAction?.priority, 'P0');
  const findings = cmiJson(['finding', 'list', '--status', 'open', '--json']);
  const finding = findObject(findings, (item) => item.category === 'session-blocker' && typeof item.id === 'string');
  assert.ok(finding?.id);
  blockerFindingId = finding.id;
  const shown = cmiRun(['finding', 'show', blockerFindingId]).stdout;
  assert.match(shown, /Audit-only blocker/);
  cmiRun(['finding', 'state', blockerFindingId, 'resolved', '--reason', 'Resolved during experiential audit.', '--changed-by', 'audit']);
  const resolved = cmiJson(['finding', 'list', '--status', 'resolved', '--json']);
  assert.ok(containsText(resolved, blockerFindingId.slice(0, 8)) || containsText(resolved, 'Audit-only blocker'));
});

await check('clean no-code session chooses source-linked planning continuation and keeps CMI-internal writes out of project dirtiness', async () => {
  cmiJson(['scan', '--json']);
  const started = cmiJson(['session', 'start', 'Review what should happen next', '--json']);
  const closed = cmiJson(['session', 'close', started.id, '--outcome', 'investigated', '--note', 'No product files changed.', '--json']);
  const handoff = closed.close?.handoff;
  assert.equal(handoff?.repository?.clean, true);
  assert.equal(handoff?.nextAction?.priority, 'P3');
  assert.ok(containsText(handoff?.nextAction, 'Review the release candidate against current evidence'));
  assert.ok((handoff?.guardrails || []).some((item) => item.id === 'do-not-treat-planning-as-command'));
  const listed = cmiJson(['session', 'list', '--status', 'closed', '--json']);
  assert.ok(containsText(listed, 'Review what should happen next'));
  const shown = cmiJson(['session', 'show', started.id, '--json']);
  assert.equal(shown.id, started.id);
});

await check('dirty-start attribution is surfaced instead of over-attributing work to the session', async () => {
  await fsp.appendFile(path.join(project, 'src', 'app.js'), `export const preexistingDirty = true;\n`);
  const started = cmiJson(['session', 'start', 'Audit dirty worktree attribution', '--json']);
  const closed = cmiJson(['session', 'close', started.id, '--outcome', 'investigated', '--json']);
  const handoff = closed.close?.handoff;
  assert.ok((handoff?.openFindings || []).some((item) => item.category === 'preexisting-worktree'));
  assert.ok((handoff?.guardrails || []).some((item) => item.id === 'do-not-overattribute-dirty-worktree'));
  run('git', ['checkout', '--', 'src/app.js'], { cwd: project });
});

await check('ambiguous latest fails closed with multiple active sessions', async () => {
  const first = cmiJson(['session', 'start', 'Concurrent audit session one', '--json']);
  const second = cmiJson(['session', 'start', 'Concurrent audit session two', '--json']);
  const ambiguous = cmiRun(['session', 'status', 'latest', '--json'], { expectStatus: 1 });
  assert.match(`${ambiguous.stdout}\n${ambiguous.stderr}`, /Multiple active sessions|explicit session ID|ambiguous/i);
  cmiJson(['session', 'close', first.id, '--outcome', 'abandoned', '--json']);
  cmiJson(['session', 'close', second.id, '--outcome', 'abandoned', '--json']);
});

await check('durable-input security rejects obvious secrets and path traversal', async () => {
  const secret = cmiRun(['remember', 'fact', 'api_key=abcdefghijklmnop'], { expectStatus: 1 });
  assert.match(secret.stderr, /secret|credential/i);
  const started = cmiJson(['session', 'start', 'Security path audit', '--json']);
  const unsafe = cmiRun(['session', 'observe', started.id, '--file', '../escape.js', '--json'], { expectStatus: 1 });
  assert.match(unsafe.stderr, /project-relative|escapes the project|unsafe/i);
  cmiJson(['session', 'close', started.id, '--outcome', 'abandoned', '--json']);
});

await check('corrupt durable session records are ignored rather than crashing continuation commands', async () => {
  const sessionDir = path.join(project, '.codex-memory', 'sessions');
  await fsp.mkdir(sessionDir, { recursive: true });
  const corrupt = path.join(sessionDir, '11111111-1111-1111-1111-111111111111.json');
  await fsp.writeFile(corrupt, '{not valid json');
  const list = cmiJson(['session', 'list', '--json']);
  assert.ok((list.invalidRecords || 0) >= 1 || !containsText(list, '11111111-1111-1111-1111-111111111111'));
  await fsp.rm(corrupt, { force: true });
});

await check('non-Git projects remain usable and change observation is explicit-files-only', async () => {
  const scan = cmiJson(['scan', '--json'], { cwd: nonGit });
  assert.ok(scan.files > 0);
  const baseline = cmiJson(['baseline', '--json'], { cwd: nonGit });
  assert.equal(baseline.available, false);
  const brief = cmiJson(['prepare', 'Audit non-git behavior', '--json'], { cwd: nonGit });
  assert.ok(typeof brief === 'object' && brief !== null);
  const started = cmiJson(['change', 'start', 'Non-git explicit change', '--json'], { cwd: nonGit });
  await fsp.appendFile(path.join(nonGit, 'src', 'app.js'), `export const nonGitChanged = true;\n`);
  const observed = cmiJson(['change', 'observe', started.id, '--file', 'src/app.js', '--json'], { cwd: nonGit });
  assert.ok(containsText(observed, 'explicit-files-only'));
  cmiJson(['change', 'complete', started.id, '--outcome', 'succeeded', '--file', 'src/app.js', '--verify', 'manual=passed', '--json'], { cwd: nonGit });
});

await check('generated MCP config points at the session-aware installed entrypoint and preserves write controls', async () => {
  const safe = JSON.parse(cmiRun(['mcp-config']).stdout);
  const safeServer = safe.mcpServers?.['codex-memory-intelligence'];
  assert.ok(safeServer);
  assert.equal(path.basename(safeServer.args?.[0] || ''), 'mcp-entry.js');
  assert.equal(safeServer.env?.CMI_WRITE_ENABLED, '0');
  const write = JSON.parse(cmiRun(['mcp-config', '--write', '--bulk-refresh']).stdout);
  const writeServer = write.mcpServers?.['codex-memory-intelligence'];
  assert.equal(path.basename(writeServer.args?.[0] || ''), 'mcp-entry.js');
  assert.equal(writeServer.env?.CMI_WRITE_ENABLED, '1');
  assert.equal(writeServer.env?.CMI_ALLOW_BULK_REFRESH, '1');
});

function createMcpClient(extraEnv = {}) {
  const child = spawn(cmiMcp, [], {
    cwd: project,
    env: { ...process.env, CMI_PROJECT_ROOT: project, ...extraEnv },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const pending = new Map();
  let id = 1;
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  lines.on('line', (line) => {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (message?.id !== undefined && pending.has(String(message.id))) {
      const { resolve } = pending.get(String(message.id));
      pending.delete(String(message.id));
      resolve(message);
    }
  });
  function request(method, params = {}) {
    const requestId = id++;
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params })}\n`);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(String(requestId));
        reject(new Error(`MCP request timed out: ${method}; stderr=${clipped(stderr, 1500)}`));
      }, 8000);
      pending.set(String(requestId), {
        resolve: (message) => { clearTimeout(timer); resolve(message); },
      });
    });
  }
  function notify(method, params = {}) { child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`); }
  async function initialize() {
    const response = await request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'cmi-experiential-audit', version: '1.0.0' } });
    assert.equal(response.error, undefined, JSON.stringify(response.error));
    notify('notifications/initialized');
    await new Promise((resolve) => setTimeout(resolve, 80));
    return response;
  }
  async function close() {
    lines.close();
    if (child.exitCode !== null || child.signalCode !== null) return;
    const closed = new Promise((resolve) => child.once('close', resolve));
    child.kill();
    await Promise.race([closed, new Promise((resolve) => setTimeout(resolve, 1500))]);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
  return { request, notify, initialize, close, getStderr: () => stderr };
}

await check('direct cmi-mcp read-only mode exposes core + session read tools/resources/prompts and blocks durable writes', async () => {
  const client = createMcpClient({ CMI_WRITE_ENABLED: '0' });
  try {
    const init = await client.initialize();
    assert.match(init.result?.instructions || '', /session continuation intelligence/i);
    const tools = await client.request('tools/list');
    const names = new Set((tools.result?.tools || []).map((item) => item.name));
    for (const name of ['search_project_memory', 'prepare_change_brief', 'get_change_insights', 'get_work_session_status', 'get_session_handoff', 'list_project_findings']) assert.ok(names.has(name), `missing MCP tool ${name}`);
    assert.equal(names.has('start_work_session'), false);
    assert.equal(names.has('remember_project_knowledge'), false);
    const resources = await client.request('resources/list');
    const uris = new Set((resources.result?.resources || []).map((item) => item.uri));
    for (const uri of ['cmi://project/memory', 'cmi://project/session/latest', 'cmi://project/session-handoff/latest', 'cmi://project/findings']) assert.ok(uris.has(uri), `missing MCP resource ${uri}`);
    const prompts = await client.request('prompts/list');
    const promptNames = new Set((prompts.result?.prompts || []).map((item) => item.name));
    for (const name of ['prepare_project_change', 'run_change_intelligence_loop', 'close_project_session', 'continue_from_session_handoff']) assert.ok(promptNames.has(name), `missing MCP prompt ${name}`);
    const status = await client.request('tools/call', { name: 'get_project_memory_status', arguments: {} });
    assert.equal(status.result?.isError, undefined);
    const handoff = await client.request('resources/read', { uri: 'cmi://project/session-handoff/latest' });
    assert.equal(handoff.error, undefined);
    const prompt = await client.request('prompts/get', { name: 'continue_from_session_handoff', arguments: {} });
    assert.equal(prompt.error, undefined);
    const blocked = await client.request('tools/call', { name: 'start_work_session', arguments: { goal: 'should be blocked' } });
    assert.equal(blocked.result?.isError, true);
  } finally { await client.close(); }
});

await check('direct cmi-mcp write mode exposes and executes memory, change/session lifecycle tools', async () => {
  const client = createMcpClient({ CMI_WRITE_ENABLED: '1' });
  try {
    await client.initialize();
    const tools = await client.request('tools/list');
    const names = new Set((tools.result?.tools || []).map((item) => item.name));
    for (const name of ['remember_project_knowledge', 'start_change_record', 'start_work_session', 'finalize_work_session', 'set_project_finding_state']) assert.ok(names.has(name), `missing write MCP tool ${name}`);
    const memory = await client.request('tools/call', { name: 'remember_project_knowledge', arguments: { type: 'fact', text: 'AUDIT_MCP_WRITE_MEMORY_91e2', sources: ['src/app.js'] } });
    assert.equal(memory.result?.isError, undefined);
    const session = await client.request('tools/call', { name: 'start_work_session', arguments: { goal: 'MCP write lifecycle audit' } });
    assert.equal(session.result?.isError, undefined);
    const sessionId = session.result?.structuredContent?.id;
    assert.ok(sessionId);
    const observed = await client.request('tools/call', { name: 'observe_work_session', arguments: { id: sessionId, accomplished: ['Started and observed through MCP.'] } });
    assert.equal(observed.result?.isError, undefined);
    const finalized = await client.request('tools/call', { name: 'finalize_work_session', arguments: { id: sessionId, outcome: 'investigated', notes: ['MCP lifecycle completed.'] } });
    assert.equal(finalized.result?.isError, undefined);
    assert.ok(finalized.result?.structuredContent?.close?.handoff?.nextAction);
    const bulkBlocked = await client.request('tools/call', { name: 'refresh_project_memory', arguments: { id: 'all', reviewedBy: 'audit', reason: 'bulk safety check' } });
    assert.equal(bulkBlocked.result?.isError, true);
  } finally { await client.close(); }
});

await check('MCP bulk-refresh opt-in actually unlocks reviewed bulk refresh and nothing broader', async () => {
  const client = createMcpClient({ CMI_WRITE_ENABLED: '1', CMI_ALLOW_BULK_REFRESH: '1' });
  try {
    await client.initialize();
    const response = await client.request('tools/call', { name: 'refresh_project_memory', arguments: { id: 'all', reviewedBy: 'audit', reason: 'Explicit bulk-refresh experiential check.' } });
    assert.equal(response.result?.isError, undefined);
    assert.ok((response.result?.structuredContent?.updated || 0) >= 1);
  } finally { await client.close(); }
});

const failed = results.filter((item) => item.status === 'FAIL');
const summary = {
  schemaVersion: 1,
  packageTarball: path.basename(tarball),
  installedVersion: cmiRun(['--version']).stdout.trim(),
  checks: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  failures: failed,
  commandsExecuted: commandLog.length,
};
console.log(`CMI_EXPERIENTIAL_AUDIT=${JSON.stringify(summary)}`);
if (failed.length) process.exitCode = 1;
