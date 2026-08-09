import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { activateProject } from '../src/activation.js';
import { classifyAmbientIntent, buildAmbientTaskBrief } from '../src/ambient-intelligence.js';
import { initProject, scanProject, status } from '../src/core.js';
import { loadProjectGraph } from '../src/graph.js';
import { getRepositoryBaseline } from '../src/advisor.js';
import { startSession, closeSession } from '../src/session-intelligence.js';

const exec = promisify(execFile);
async function rootFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-ambient-'));
  await fs.writeFile(path.join(root, 'package.json'), '{"name":"ambient","type":"module"}\n');
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'src', 'main.ts'), "import './style.css';\nexport const run = () => 'ok';\n");
  await fs.writeFile(path.join(root, 'src', 'style.css'), 'body { margin: 0; }\n');
  return root;
}
async function git(root, args) { return (await exec('git', args, { cwd: root, encoding: 'utf8' })).stdout.trim(); }
async function commitBaseline(root) {
  await git(root, ['init']);
  await git(root, ['config', 'user.email', 'test@example.com']);
  await git(root, ['config', 'user.name', 'CMI Test']);
  await git(root, ['add', '-A']);
  await git(root, ['commit', '-m', 'baseline']);
}

test('short natural requests get conservative deterministic routing', () => {
  assert.equal(classifyAmbientIntent('Sửa lỗi boss không nhận damage').intent, 'mutate');
  assert.equal(classifyAmbientIntent('Làm tiếp đi').intent, 'continue');
  assert.equal(classifyAmbientIntent('Cái này ổn chưa?').intent, 'review');
  assert.equal(classifyAmbientIntent('Kiểm tra vì sao combat sai').intent, 'investigate');
  assert.equal(classifyAmbientIntent('combat').intent, 'unknown');
});

test('activation preserves user instructions and is byte-idempotent', async () => {
  const root = await rootFixture();
  await fs.writeFile(path.join(root, 'AGENTS.md'), '# Team instructions\n\nKeep this text.\n');
  const first = await activateProject(root, { agent: 'codex' });
  assert.equal(first.activated, true);
  const agents1 = await fs.readFile(path.join(root, 'AGENTS.md'), 'utf8');
  const config1 = await fs.readFile(path.join(root, '.codex', 'config.toml'), 'utf8');
  assert.match(agents1, /Keep this text/);
  assert.match(agents1, /cmi-managed:start/);
  assert.match(config1, /\[mcp_servers\.cmi\]/);
  assert.match(config1, /CMI_WRITE_ENABLED = "1"/);
  await activateProject(root, { agent: 'codex' });
  assert.equal(await fs.readFile(path.join(root, 'AGENTS.md'), 'utf8'), agents1);
  assert.equal(await fs.readFile(path.join(root, '.codex', 'config.toml'), 'utf8'), config1);
});

test('unchanged scan keeps tracked architecture bytes stable and classifies CSS as non-code local', async () => {
  const root = await rootFixture();
  await initProject(root);
  const first = await scanProject(root);
  const architecture1 = await fs.readFile(path.join(root, '.codex-memory', 'architecture.md'), 'utf8');
  const second = await scanProject(root);
  const architecture2 = await fs.readFile(path.join(root, '.codex-memory', 'architecture.md'), 'utf8');
  assert.equal(architecture2, architecture1);
  assert.equal(first.graph.unresolvedImports, 0);
  assert.equal(second.graph.unresolvedImports, 0);
  assert.equal(second.graph.nonCodeDependencies, 1);
  const graph = await loadProjectGraph(root);
  const main = graph.nodes.find((node) => node.path === 'src/main.ts');
  assert.equal(main.imports[0].nonCodeTarget, 'src/style.css');
  assert.equal(main.imports[0].dependencyKind, 'non-code-local');
});

test('repository baseline distinguishes raw Git dirtiness from product scope', async () => {
  const root = await rootFixture();
  await scanProject(root);
  await commitBaseline(root);
  await fs.mkdir(path.join(root, '.codex-memory', 'sessions'), { recursive: true });
  await fs.writeFile(path.join(root, '.codex-memory', 'sessions', 'probe.json'), '{}\n');
  const baseline = await getRepositoryBaseline(root);
  assert.equal(baseline.clean, true);
  assert.equal(baseline.rawClean, false);
  assert.equal(baseline.cmiInternalChangesOmitted, 1);
  assert.equal(baseline.rawChanges.some((item) => item.path.startsWith('.codex-memory/sessions/')), true);
});

test('active sessions stay ignored while closed sessions materialize as durable reviewable evidence', async () => {
  const root = await rootFixture();
  await scanProject(root);
  await commitBaseline(root);
  const record = await startSession(root, 'investigate combat behavior');
  assert.equal(await git(root, ['status', '--porcelain']), '');
  await closeSession(root, record.id, { outcome: 'investigated', accomplished: ['Reviewed current behavior'] });
  const porcelain = await git(root, ['status', '--porcelain']);
  assert.match(porcelain, /\.codex-memory\/sessions\//);
  await assert.rejects(fs.access(path.join(root, '.codex-memory', 'snapshots', 'active-sessions', `${record.id}.json`)));
  assert.equal(JSON.parse(await fs.readFile(path.join(root, '.codex-memory', 'sessions', `${record.id}.json`), 'utf8')).status, 'closed');
});

test('ambient mutation brief supplies workflow without mutating durable memory', async () => {
  const root = await rootFixture();
  await activateProject(root, { agent: 'generic' });
  const before = await status(root);
  const brief = await buildAmbientTaskBrief(root, 'Sửa lỗi combat');
  const after = await status(root);
  assert.equal(brief.classification.intent, 'mutate');
  assert.ok(brief.workflow.some((item) => /Change Intelligence/i.test(item)));
  assert.equal(after.entries.facts, before.entries.facts);
  assert.equal(after.entries.decisions, before.entries.decisions);
  assert.equal(after.entries.mistakes, before.entries.mistakes);
});
