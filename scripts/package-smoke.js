import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';

const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run this script through npm.');
const runNpm = (args, cwd = process.cwd()) => execFileSync(process.execPath, [npmCli, ...args], { cwd, encoding: 'utf8', stdio: ['ignore','pipe','inherit'] }).trim();
const removePath = (target) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      fs.rmSync(target, { recursive: true, force: true, maxRetries: 2, retryDelay: 250 });
      return;
    } catch (error) {
      if (!['EBUSY', 'EPERM', 'ENOTEMPTY'].includes(error.code) || attempt === 4) {
        if (['EBUSY', 'EPERM', 'ENOTEMPTY'].includes(error.code)) {
          console.warn(`Package smoke cleanup skipped for ${target}: ${error.code}`);
          return;
        }
        throw error;
      }
    }
  }
};
const packed = JSON.parse(runNpm(['pack','--json','--ignore-scripts']));
const archive = path.resolve(packed[0].filename);
const prefix = fs.mkdtempSync(path.join(os.tmpdir(), 'cmi-package-'));
const requiredFiles = ['package.json', 'README.md', 'LICENSE', 'SECURITY.md', 'CHANGELOG.md', 'src/cli.js', 'src/mcp.js', 'src/portable-evidence.js', 'src/provenance.js', 'schemas/config.schema.json'];
const forbiddenPattern = /(^|\/)(?:\.codex-memory|\.empirical-studies|\.git|node_modules)(?:\/|$)|(?:\.tgz$|(?:^|\/)\.env(?:\.|$))/i;
const packagedFiles = new Set((packed[0].files || []).map((entry) => entry.path));
if (path.basename(archive) !== `${packageJson.name}-${packageJson.version}.tgz`) throw new Error(`Unexpected package filename: ${path.basename(archive)}`);
for (const file of requiredFiles) if (!packagedFiles.has(file)) throw new Error(`Packed candidate is missing required file: ${file}`);
const forbiddenFiles = [...packagedFiles].filter((file) => path.isAbsolute(file) || file.split('/').some((part) => part === '..') || forbiddenPattern.test(file));
if (forbiddenFiles.length) throw new Error(`Packed candidate contains forbidden files: ${forbiddenFiles.join(', ')}`);
try {
  runNpm(['install','--global','--prefix',prefix,archive,'--ignore-scripts']);
  const executable = process.platform === 'win32' ? path.join(prefix, 'cmi.cmd') : path.join(prefix, 'bin', 'cmi');
  const mcpExecutable = process.platform === 'win32' ? path.join(prefix, 'cmi-mcp.cmd') : path.join(prefix, 'bin', 'cmi-mcp');
  const runExecutable = (args, options = {}) => execFileSync(executable, args, { encoding: 'utf8', shell: process.platform === 'win32', ...options });
  const runJson = (args, cwd) => JSON.parse(runExecutable([...args, '--json'], { cwd }));
  const runExpectedFailure = (args, cwd) => {
    const result = spawnSync(executable, [...args, '--json'], { cwd, encoding: 'utf8', shell: process.platform === 'win32' });
    if (result.status === 0) throw new Error(`Expected installed command to fail: cmi ${args.join(' ')}`);
    return { result, value: JSON.parse(result.stdout || result.stderr) };
  };
  const version = runExecutable(['--version']).trim();
  if (version !== packageJson.version) throw new Error(`Unexpected installed version: ${version}; expected ${packageJson.version}`);
  const provenance = JSON.parse(runExecutable(['provenance', '--json']));
  if (provenance.observed.packageName !== packageJson.name || provenance.observed.packageVersion !== packageJson.version) throw new Error('Installed package provenance did not resolve its own package metadata.');
  if (!provenance.observed.packageRoot || provenance.observed.sourceCheckout || provenance.observed.installKind !== 'global-package') throw new Error('Installed package provenance was not classified as an external package installation.');
  if (provenance.observed.scriptPath === path.join(process.cwd(), 'src', 'cli-entry.js')) throw new Error('Installed package provenance resolved the source checkout instead of the packed install.');
  runExecutable(['--help'], { stdio: 'ignore' });
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'cmi-package-project-'));
  const bundleParent = fs.mkdtempSync(path.join(os.tmpdir(), 'cmi-package-bundle-parent-'));
  const bundle = path.join(bundleParent, 'bundle');
  const relocated = fs.mkdtempSync(path.join(os.tmpdir(), 'cmi-package-relocated-'));
  const mismatch = fs.mkdtempSync(path.join(os.tmpdir(), 'cmi-package-mismatch-'));
  const historical = fs.mkdtempSync(path.join(os.tmpdir(), 'cmi-package-historical-'));
  try {
    fs.writeFileSync(path.join(project, 'package.json'), '{"name":"packed-smoke-project","private":true}\n');
    const uninitializedStatus = runExpectedFailure(['status'], project);
    if (uninitializedStatus.result.status !== 2 || uninitializedStatus.value.evidenceHealth?.state !== 'uninitialized') throw new Error('Installed uninitialized status did not preserve the actionable blocked contract.');
    const uninitializedDoctor = runExpectedFailure(['doctor'], project);
    if (uninitializedDoctor.result.status !== 1) throw new Error('Installed uninitialized doctor did not fail closed.');
    runExecutable(['init'], { cwd: project, stdio: 'ignore' });
    runExecutable(['scan'], { cwd: project, stdio: 'ignore' });
    const status = runJson(['status'], project);
    const doctor = runJson(['doctor'], project);
    if (status.evidenceHealth?.state !== 'healthy' || doctor.healthy !== true) throw new Error('Installed init/scan did not produce healthy status and doctor output.');
    runJson(['search', 'packed'], project);
    runJson(['context', 'packed'], project);
    runJson(['impact', 'src/cli.js'], project);
    const projectProvenance = runJson(['provenance'], project);
    if (projectProvenance.observed.packageVersion !== packageJson.version || projectProvenance.observed.installKind !== 'global-package') throw new Error('Installed project commands reported incorrect executable provenance.');

    const frozen = runJson(['evidence', 'freeze', bundle], project);
    if (!['frozen', 'exact'].includes(frozen.state) || frozen.manifest?.cmi?.version !== packageJson.version) throw new Error('Installed portable freeze did not bind the candidate version.');
    const inspected = runJson(['evidence', 'inspect', bundle], project);
    if (inspected.identity?.digest !== frozen.identity?.digest) throw new Error('Installed portable inspect did not verify the frozen identity.');
    const manifestText = fs.readFileSync(path.join(bundle, 'manifest.json'), 'utf8');
    const manifest = JSON.parse(manifestText);
    if (manifest.evidence.files.some((entry) => path.isAbsolute(entry.path) || entry.path.includes('..'))) throw new Error('Portable manifest contains an unsafe absolute or escaping artifact path.');

    const rebound = runJson(['evidence', 'rebind', bundle], project);
    if (!rebound.provenance && !fs.existsSync(path.join(project, '.codex-memory', 'portable-provenance.json'))) throw new Error('Installed rebind did not record portable provenance.');

    fs.cpSync(project, relocated, { recursive: true });
    fs.rmSync(path.join(relocated, '.codex-memory'), { recursive: true, force: true });
    const restored = runJson(['evidence', 'restore', bundle], relocated);
    if (!String(restored.state || '').startsWith('compatible-') && restored.state !== 'exact') throw new Error(`Installed relocation restore returned unexpected state: ${restored.state}`);

    fs.cpSync(project, mismatch, { recursive: true });
    fs.rmSync(path.join(mismatch, '.codex-memory'), { recursive: true, force: true });
    fs.appendFileSync(path.join(mismatch, 'package.json'), ' ');
    runExpectedFailure(['evidence', 'restore', bundle], mismatch);
    if (fs.existsSync(path.join(mismatch, '.codex-memory'))) throw new Error('Installed portable mismatch wrote destination evidence.');

    const configPath = path.join(project, '.codex-memory', 'config.json');
    const configBytes = fs.readFileSync(configPath);
    const futureConfig = JSON.parse(configBytes);
    futureConfig.version = 999;
    fs.writeFileSync(configPath, `${JSON.stringify(futureConfig, null, 2)}\n`);
    const futureStatus = runExpectedFailure(['status'], project);
    if (!/future|unsupported|blocked/i.test(JSON.stringify(futureStatus.value))) throw new Error('Installed future configuration did not fail closed.');
    if (fs.readFileSync(configPath, 'utf8') === configBytes.toString('utf8')) throw new Error('Future configuration fixture was not changed for the smoke test.');
    fs.writeFileSync(configPath, configBytes);

    const futureMemoryPath = path.join(project, '.codex-memory', 'memory.md');
    const currentMemoryBytes = fs.readFileSync(futureMemoryPath);
    fs.writeFileSync(futureMemoryPath, fs.readFileSync(path.join(process.cwd(), 'tests', 'fixtures', 'compatibility', 'future', 'memory.md')));
    const futureMemoryBefore = fs.readFileSync(futureMemoryPath);
    runExpectedFailure(['search', 'future'], project);
    runExpectedFailure(['remember', 'fact', 'must not overwrite future memory'], project);
    assert.deepEqual(fs.readFileSync(futureMemoryPath), futureMemoryBefore, 'Future memory bytes changed during installed-package smoke.');
    fs.writeFileSync(futureMemoryPath, currentMemoryBytes);

    const graphPath = path.join(project, '.codex-memory', 'project-graph.json');
    const indexPath = path.join(project, '.codex-memory', 'project-index.json');
    const graphBytes = fs.readFileSync(graphPath);
    const indexBytes = fs.readFileSync(indexPath);
    for (const file of [graphPath, indexPath]) {
      const future = JSON.parse(fs.readFileSync(file, 'utf8'));
      future.schemaVersion = 999;
      fs.writeFileSync(file, `${JSON.stringify(future, null, 2)}\n`);
    }
    const futureGraphBytes = fs.readFileSync(graphPath);
    const futureIndexBytes = fs.readFileSync(indexPath);
    runExpectedFailure(['scan'], project);
    assert.deepEqual(fs.readFileSync(graphPath), futureGraphBytes, 'Future graph bytes changed during installed-package smoke.');
    assert.deepEqual(fs.readFileSync(indexPath), futureIndexBytes, 'Future index bytes changed during installed-package smoke.');
    fs.writeFileSync(graphPath, graphBytes);
    fs.writeFileSync(indexPath, indexBytes);

    const historicalRoot = path.join(process.cwd(), 'tests', 'fixtures', 'compatibility');
    fs.writeFileSync(path.join(historical, 'package.json'), '{"name":"historical-packed-smoke","private":true}\n');
    fs.mkdirSync(path.join(historical, 'src'));
    fs.writeFileSync(path.join(historical, 'src', 'policy.js'), 'export const policy = true;\n');
    fs.mkdirSync(path.join(historical, '.codex-memory'), { recursive: true });
    for (const file of ['config.json', 'memory.md', 'agent-instructions.md', 'project-index.json', 'project-graph.json']) fs.copyFileSync(path.join(historicalRoot, 'v0.5.0', file), path.join(historical, '.codex-memory', file));
    for (const file of ['decisions.md', 'mistakes.md']) fs.writeFileSync(path.join(historical, '.codex-memory', file), '');
    fs.mkdirSync(path.join(historical, '.codex-memory', 'sessions'), { recursive: true });
    fs.copyFileSync(path.join(historicalRoot, 'v0.8.0', 'sessions', '33333333-3333-4333-8333-333333333333.json'), path.join(historical, '.codex-memory', 'sessions', '33333333-3333-4333-8333-333333333333.json'));
    fs.copyFileSync(path.join(historicalRoot, 'v0.9.0', 'findings.json'), path.join(historical, '.codex-memory', 'findings.json'));
    fs.mkdirSync(path.join(historical, '.codex-memory', 'evaluations'), { recursive: true });
    fs.copyFileSync(path.join(historicalRoot, 'v0.9.1', 'evaluations', '55555555-5555-4555-8555-555555555555.json'), path.join(historical, '.codex-memory', 'evaluations', '55555555-5555-4555-8555-555555555555.json'));
    const durableHistoricalFiles = ['config.json', 'memory.md', 'agent-instructions.md', 'decisions.md', 'mistakes.md', 'sessions/33333333-3333-4333-8333-333333333333.json', 'findings.json', 'evaluations/55555555-5555-4555-8555-555555555555.json'];
    const historicalBefore = new Map(durableHistoricalFiles.map((file) => [file, fs.readFileSync(path.join(historical, '.codex-memory', file))]));
    runExecutable(['init'], { cwd: historical, stdio: 'ignore' });
    runExecutable(['scan'], { cwd: historical, stdio: 'ignore' });
    for (const [file, bytes] of historicalBefore) assert.deepEqual(fs.readFileSync(path.join(historical, '.codex-memory', file)), bytes, `Historical durable bytes changed for ${file}.`);
    if (JSON.parse(fs.readFileSync(path.join(historical, '.codex-memory', 'project-graph.json'), 'utf8')).schemaVersion === 3) throw new Error('Installed historical scan did not rebuild the obsolete graph.');
    if (fs.readFileSync(path.join(historical, '.codex-memory', 'memory.md'), 'utf8').includes('"schemaVersion"')) throw new Error('Installed historical scan promoted legacy memory metadata.');
    const historicalSession = runJson(['session', 'show', '33333333-3333-4333-8333-333333333333'], historical);
    const historicalFindings = runJson(['finding', 'list'], historical);
    const historicalEvaluations = runJson(['evaluate', 'list'], historical);
    if (historicalSession.id !== '33333333-3333-4333-8333-333333333333' || historicalFindings.findings?.length !== 1 || historicalEvaluations.records?.length !== 1) throw new Error('Installed historical session/finding/evaluation records were not readable.');

    const initialize = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'package-smoke', version: '1' } } });
    const initialized = JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
    const listTools = JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    const runMcpList = (writeEnabled) => {
      const result = spawnSync(mcpExecutable, [], { cwd: project, input: `${initialize}\n${initialized}\n${listTools}\n`, encoding: 'utf8', shell: process.platform === 'win32', timeout: 5000, env: { ...process.env, CMI_WRITE_ENABLED: writeEnabled ? '1' : '0' } });
      if (result.status !== 0 && !result.error) throw new Error(`Installed MCP tools/list failed: ${result.stderr}`);
      if (result.error && result.error.code !== 'ETIMEDOUT') throw new Error(`Installed MCP tools/list failed: ${result.error.message}`);
      const responses = result.stdout.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
      const tools = responses.find((entry) => entry.id === 2)?.result?.tools;
      if (!tools) throw new Error(`Installed MCP tools/list produced no response: ${result.stdout}`);
      return tools;
    };
    const safeTools = runMcpList(false).map((tool) => tool.name);
    if (safeTools.includes('freeze_portable_evidence') || safeTools.includes('rebind_portable_evidence') || safeTools.includes('remember_project_knowledge')) throw new Error('Installed MCP safe mode exposed mutation tools.');
    const writeTools = runMcpList(true).map((tool) => tool.name);
    for (const tool of ['freeze_portable_evidence', 'rebind_portable_evidence', 'remember_project_knowledge']) if (!writeTools.includes(tool)) throw new Error(`Installed MCP write mode omitted ${tool}.`);
  } finally {
    removePath(project);
    removePath(relocated);
    removePath(mismatch);
    removePath(historical);
    removePath(bundle);
    removePath(bundleParent);
  }
  console.log(`Package smoke test passed for ${path.basename(archive)}: clean install, CLI, provenance, portable evidence, historical compatibility, future-version fail-closed, and MCP safe/write gates.`);
} finally {
  removePath(prefix);
  removePath(archive);
}
