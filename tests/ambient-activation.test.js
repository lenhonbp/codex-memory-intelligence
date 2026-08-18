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
async function installLocalCmi(root, packageJson = {}) {
  const packageRoot = path.join(root, 'node_modules', 'codex-memory-intelligence');
  await fs.mkdir(path.join(packageRoot, 'src'), { recursive: true });
  await fs.writeFile(path.join(packageRoot, 'src', 'cli-entry.js'), '#!/usr/bin/env node\n');
  await fs.writeFile(path.join(packageRoot, 'src', 'mcp-entry.js'), '#!/usr/bin/env node\n');
  await fs.writeFile(path.join(packageRoot, 'package.json'), `${JSON.stringify({
    name: 'codex-memory-intelligence',
    version: '0.14.0-next.local',
    bin: { cmi: 'src/cli-entry.js', 'cmi-mcp': 'src/mcp-entry.js' },
    ...packageJson,
  }, null, 2)}\n`);
  return packageRoot;
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
  assert.match(config1, /command = "npx"/);
  assert.match(config1, /--package=codex-memory-intelligence/);
  assert.match(agents1, /If the requested work is complete, complete the Change/i);
  assert.match(agents1, /keep the Change active/i);
  assert.doesNotMatch(agents1, /then complete the change record and finalize the session/i);
  assert.match(agents1, /short prompt does not imply a trivial task/i);
  assert.match(agents1, /create or update the live checklist at `.agent\/todo\.md` before substantive implementation/i);
  assert.match(agents1, /Keep it small and evolving/i);
  assert.match(agents1, /Work constraint-first/i);
  assert.match(agents1, /discovery → implementation → focused verification → broader repository verification → diff review/i);
  assert.match(agents1, /exact failure → identify the false assumption → update the checklist → make the smallest correction → run the narrowest decisive retry → run the broader regression checks/i);
  assert.match(agents1, /source edit is not completion/i);
  assert.match(agents1, /Verification must be proportional to risk/i);
  assert.match(agents1, /implementation, focused verification, repository verification, CI, external\/live verification, and release readiness/i);
  assert.match(agents1, /ephemeral working state.*not durable CMI memory/i);
  assert.match(agents1, /git check-ignore --no-index -q -- \.agent\/todo\.md/i);
  assert.match(agents1, /If it is not ignored, do not write the file or describe it as ephemeral/i);
  await activateProject(root, { agent: 'codex' });
  assert.equal(await fs.readFile(path.join(root, 'AGENTS.md'), 'utf8'), agents1);
  assert.equal(await fs.readFile(path.join(root, '.codex', 'config.toml'), 'utf8'), config1);
});

test('activation keeps todo state ephemeral while preserving user-owned ignore policy byte-for-byte', async () => {
  const root = await rootFixture();
  const userIgnore = '# User-owned rules\ndist/\n!.agent/keep.md\n';
  await fs.writeFile(path.join(root, '.gitignore'), userIgnore);
  await git(root, ['init']);

  await activateProject(root, { agent: 'codex' });
  const first = await fs.readFile(path.join(root, '.gitignore'), 'utf8');
  assert.ok(first.startsWith(userIgnore));
  assert.match(first, /# cmi-managed:todo-ignore-start\n\.agent\/todo\.md\n# cmi-managed:todo-ignore-end\n$/);
  assert.equal(first.split('# cmi-managed:todo-ignore-start').length - 1, 1);
  assert.doesNotMatch(first, /^\.agent\/$/m);

  await fs.mkdir(path.join(root, '.agent'));
  await fs.writeFile(path.join(root, '.agent', 'todo.md'), '# transient\n');
  await fs.writeFile(path.join(root, '.agent', 'keep.md'), '# user-owned\n');
  assert.equal(await git(root, ['status', '--short', '--', '.agent/todo.md']), '');
  assert.match(await git(root, ['status', '--short', '--', '.agent/keep.md']), /\.agent\/keep\.md/);

  await activateProject(root, { agent: 'codex' });
  assert.equal(await fs.readFile(path.join(root, '.gitignore'), 'utf8'), first);
});

test('activation repairs a later todo negation without silently claiming ephemeral state', async () => {
  const root = await rootFixture();
  const userIgnore = '# User-owned rules\ndist/\n';
  await fs.writeFile(path.join(root, '.gitignore'), userIgnore);
  await git(root, ['init']);

  await activateProject(root, { agent: 'codex' });
  await fs.appendFile(path.join(root, '.gitignore'), '!.agent/**\n');
  await fs.mkdir(path.join(root, '.agent'));
  await fs.writeFile(path.join(root, '.agent', 'todo.md'), '# transient\n');
  assert.match(await git(root, ['status', '--short', '--', '.agent/todo.md']), /\.agent\/todo\.md/);

  const repaired = await activateProject(root, { agent: 'codex' });
  const next = await fs.readFile(path.join(root, '.gitignore'), 'utf8');
  assert.ok(next.startsWith(`${userIgnore}!.agent/**\n`));
  assert.match(next, /# cmi-managed:todo-ignore-start\n\.agent\/todo\.md\n# cmi-managed:todo-ignore-end\n$/);
  assert.equal(next.split('# cmi-managed:todo-ignore-start').length - 1, 1);
  assert.equal(await git(root, ['status', '--short', '--', '.agent/todo.md']), '');
  assert.equal(repaired.integrations.find((item) => item.path === '.gitignore')?.effectiveGitIgnore, 'verified');

  await activateProject(root, { agent: 'codex' });
  assert.equal(await fs.readFile(path.join(root, '.gitignore'), 'utf8'), next);
});

test('activation binds Codex MCP to the exact project-local CMI package', async () => {
  const root = await rootFixture();
  await installLocalCmi(root);

  await activateProject(root, { agent: 'codex' });
  const config = await fs.readFile(path.join(root, '.codex', 'config.toml'), 'utf8');
  const agents = await fs.readFile(path.join(root, 'AGENTS.md'), 'utf8');
  assert.match(config, /command = "node"/);
  assert.match(config, /args = \["\.\/node_modules\/codex-memory-intelligence\/src\/mcp-entry\.js"\]/);
  assert.doesNotMatch(config, /npx|--package=codex-memory-intelligence/);
  assert.doesNotMatch(config, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(agents, /node "\.\/node_modules\/codex-memory-intelligence\/src\/cli-entry\.js" ambient/);

  await activateProject(root, { agent: 'codex' });
  assert.equal(await fs.readFile(path.join(root, '.codex', 'config.toml'), 'utf8'), config);
});

test('activation fails safely instead of falling back when a local CMI candidate is malformed', async () => {
  const root = await rootFixture();
  await installLocalCmi(root, { bin: { cmi: 'src/cli-entry.js' } });

  await assert.rejects(
    activateProject(root, { agent: 'codex' }),
    /local CMI package identity or executable metadata is invalid.*not fall back/i,
  );
  await assert.rejects(fs.access(path.join(root, 'AGENTS.md')));
  await assert.rejects(fs.access(path.join(root, '.codex', 'config.toml')));
  await assert.rejects(fs.access(path.join(root, '.codex-memory')));
});

test('activation teaches a truthful bounded CMI Provenance Mark contract', async () => {
  const root = await rootFixture();
  await fs.writeFile(path.join(root, 'AGENTS.md'), '# Repository-owned instructions\n\nKeep this content.\n');
  await activateProject(root, { agent: 'codex' });
  const first = await fs.readFile(path.join(root, 'AGENTS.md'), 'utf8');

  assert.match(first, /Keep this content/);
  assert.match(first, /### CMI Provenance/);
  assert.match(first, /CMI-assisted workflow.*Durable session evidence recorded by Codex Memory Intelligence/);
  assert.match(first, /only when a real durable CMI Session was successfully created and finalized/i);
  assert.match(first, /actual observed full Session ID/i);
  assert.match(first, /only when an actual associated Change record exists and its ID was observed/i);
  assert.match(first, /Never fabricate, infer, or substitute IDs/i);
  assert.match(first, /CMI operating contract applied/);
  assert.match(first, /Durable CMI evidence: not recorded/);
  assert.match(first, /Never turn an unavailable or failed lifecycle into the evidence-tracked form/i);
  assert.match(first, /replace the complete existing block instead of appending another/i);
  assert.match(first, /Do not create or update a PR solely to add the mark/i);
  assert.equal(first.split('<!-- cmi-provenance:start -->').length - 1, 1);
  assert.equal(first.split('<!-- cmi-provenance:end -->').length - 1, 1);

  await activateProject(root, { agent: 'codex' });
  assert.equal(await fs.readFile(path.join(root, 'AGENTS.md'), 'utf8'), first);
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
  assert.ok(brief.workflow.some((item) => /keep it active and finalize only the session/i.test(item)));
  assert.equal(after.entries.facts, before.entries.facts);
  assert.equal(after.entries.decisions, before.entries.decisions);
  assert.equal(after.entries.mistakes, before.entries.mistakes);
});
