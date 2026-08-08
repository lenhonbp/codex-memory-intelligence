import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildProjectGraph, loadProjectGraph } from './graph.js';
import { checkStaleMemory, sourceFingerprints } from './stale.js';
import { resolveProjectFile } from './paths.js';
import { ensureSafeMemoryRoot, safeEnsureMemoryDir, safeReadMemoryFile, safeReadMemoryJson, safeWriteMemoryFile, safeAppendMemoryFile, safeListMemoryDir, DEFAULT_MAX_GENERATED_CACHE_BYTES } from './storage.js';
import { looksSensitive } from './sensitive.js';
import { createIgnoreMatcher, explainIgnore as explainIgnoreRule } from './ignore.js';
import { detectWorkspaces, formatWorkspaces } from './workspaces.js';
import { loadMemory } from './search.js';
import { withMemoryWriteLock } from './memory-lock.js';
import { VERSION } from './version.js';
import { buildEvidenceHealth } from './evidence-health.js';

const exec = promisify(execFile);
const MEMORY_DIR = '.codex-memory';
const DEFAULT_CONFIG = {
  version: 4,
  maxFileBytes: 1_000_000,
  maxSourceBytes: 512_000,
  maxGraphFiles: 5_000,
  staleAfterDays: 90,
  includeHidden: false,
  incrementalScan: true,
  workspaceDetection: true,
  ignorePatterns: [],
};
const EXT_LANGUAGE = new Map([
  ['.js','JavaScript'],['.mjs','JavaScript'],['.cjs','JavaScript'],['.jsx','JavaScript'],
  ['.ts','TypeScript'],['.tsx','TypeScript'],['.py','Python'],['.go','Go'],['.rs','Rust'],
  ['.java','Java'],['.kt','Kotlin'],['.php','PHP'],['.rb','Ruby'],['.swift','Swift'],
  ['.vue','Vue'],['.svelte','Svelte'],['.css','CSS'],['.scss','SCSS'],['.html','HTML'],
  ['.sql','SQL'],['.md','Markdown'],['.json','JSON'],['.yaml','YAML'],['.yml','YAML'],
]);

export async function exists(filePath) { try { await fs.access(filePath); return true; } catch { return false; } }
export async function ensureDir(directoryPath) { await fs.mkdir(directoryPath, { recursive: true }); }
export async function writeIfMissing(filePath, content) { if (!(await exists(filePath))) await fs.writeFile(filePath, content, 'utf8'); }

function normalizeConfig(current = {}) {
  const ignorePatterns = Array.isArray(current.ignorePatterns) ? current.ignorePatterns.map(String) : [];
  return {
    ...DEFAULT_CONFIG,
    ...current,
    ignorePatterns,
    version: Math.max(DEFAULT_CONFIG.version, Number(current.version) || 0),
  };
}

export async function initProject(root) {
  const directory = await ensureSafeMemoryRoot(root, { create: true });
  await safeEnsureMemoryDir(root, 'snapshots');
  await safeWriteMemoryFile(root, 'memory.md', '# Project Memory\n\nDurable facts, conventions, constraints, and operational knowledge.\n', { ifMissing: true });
  await safeWriteMemoryFile(root, 'decisions.md', '# Architecture Decisions\n\nRecord the context, decision, and consequences.\n', { ifMissing: true });
  await safeWriteMemoryFile(root, 'mistakes.md', '# Mistakes and Lessons\n\nRecord failures, root causes, fixes, and prevention rules.\n', { ifMissing: true });
  await safeWriteMemoryFile(root, 'architecture.md', '# Project Architecture\n\nRun `cmi scan` to refresh this file.\n', { ifMissing: true });
  await safeWriteMemoryFile(root, 'agent-instructions.md', '# Agent Instructions\n\n1. Search project memory before broad repository exploration.\n2. Check memory health before relying on old decisions.\n3. Read decisions before architectural changes.\n4. Run impact analysis before changing shared files or symbols.\n5. Read mistakes before risky operations or deployment.\n6. Store only durable knowledge, never secrets or temporary logs.\n7. Refresh project intelligence after structural changes.\n8. Use workspace-scoped search in monorepositories.\n9. Treat MCP durable-memory mutations as opt-in operations that require review.\n', { ifMissing: true });
  await safeWriteMemoryFile(root, '.gitignore', 'project-graph.json\nproject-index.json\nsnapshots/\n', { ifMissing: true });
  const currentConfig = await safeReadMemoryJson(root, 'config.json', { optional: true }) || {};
  const migratedConfig = normalizeConfig(currentConfig);
  if (JSON.stringify(currentConfig) !== JSON.stringify(migratedConfig)) {
    await safeWriteMemoryFile(root, 'config.json', JSON.stringify(migratedConfig, null, 2) + '\n');
  } else if (!(await safeReadMemoryFile(root, 'config.json', { optional: true }))) {
    await safeWriteMemoryFile(root, 'config.json', JSON.stringify(migratedConfig, null, 2) + '\n');
  }
  return directory;
}

export async function readConfig(root) {
  const current = await safeReadMemoryJson(root, 'config.json', { optional: true });
  return normalizeConfig(current || {});
}

async function walk(root, config, matcher, current = root, output = [], stats = { ignored: 0, symlinks: 0, tooLarge: 0, unreadable: 0 }) {
  let entries;
  try { entries = await fs.readdir(current, { withFileTypes: true }); }
  catch { stats.unreadable += 1; return { files: output, stats }; }
  for (const entry of entries) {
    const fullPath = path.join(current, entry.name);
    const relativePath = path.relative(root, fullPath).split(path.sep).join('/');
    if (matcher.shouldIgnore(relativePath, entry.isDirectory())) { stats.ignored += 1; continue; }
    if (entry.isSymbolicLink()) { stats.symlinks += 1; continue; }
    let stat;
    try { stat = await fs.lstat(fullPath); } catch { stats.unreadable += 1; continue; }
    if (stat.isSymbolicLink()) { stats.symlinks += 1; continue; }
    if (stat.isDirectory()) await walk(root, config, matcher, fullPath, output, stats);
    else if (stat.isFile()) {
      if (stat.size > config.maxFileBytes) { stats.tooLarge += 1; continue; }
      output.push({
        path: relativePath,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        fingerprint: `${stat.size}:${Math.trunc(stat.mtimeMs)}:${Math.trunc(stat.ctimeMs)}`,
      });
    }
  }
  return { files: output, stats };
}

function detectStack(paths) {
  const has = (value) => paths.includes(value);
  const stack = [];
  if (has('wrangler.toml') || has('wrangler.json') || has('wrangler.jsonc')) stack.push('Cloudflare Workers/Pages');
  if (has('package.json')) stack.push('Node.js');
  if (has('tsconfig.json')) stack.push('TypeScript');
  if (has('vite.config.js') || has('vite.config.ts')) stack.push('Vite');
  if (paths.some((value) => /next\.config\./.test(value))) stack.push('Next.js');
  if (paths.some((value) => /astro\.config\./.test(value))) stack.push('Astro');
  if (has('bun.lock') || has('bun.lockb')) stack.push('Bun');
  if (has('package-lock.json')) stack.push('npm');
  if (has('pnpm-lock.yaml')) stack.push('pnpm');
  if (has('yarn.lock')) stack.push('Yarn');
  if (has('requirements.txt') || has('pyproject.toml')) stack.push('Python');
  if (has('Cargo.toml')) stack.push('Rust');
  if (has('go.mod') || has('go.work')) stack.push('Go');
  if (has('Dockerfile') || paths.some((value) => /docker-compose.*\.ya?ml/.test(value))) stack.push('Docker');
  return stack;
}

function summarizeLanguages(files) {
  const counts = new Map();
  for (const file of files) {
    const language = EXT_LANGUAGE.get(path.extname(file.path).toLowerCase()) || 'Other';
    const current = counts.get(language) || { files: 0, bytes: 0 };
    current.files += 1;
    current.bytes += file.size;
    counts.set(language, current);
  }
  return [...counts.entries()].map(([language, value]) => ({ language, ...value })).sort((a, b) => b.bytes - a.bytes).slice(0, 15);
}

function topDirectories(files) {
  const counts = new Map();
  for (const file of files) {
    const first = file.path.split('/')[0];
    counts.set(first, (counts.get(first) || 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 20);
}

function importantFiles(paths) {
  const pattern = /(^|\/)(package\.json|pnpm-workspace\.yaml|go\.work|go\.mod|Cargo\.toml|pyproject\.toml|wrangler\.(toml|jsonc?)|tsconfig.*\.json|jsconfig\.json|vite\.config\.[^.]+|next\.config\.[^.]+|Dockerfile|docker-compose.*\.ya?ml|README\.md|AGENTS\.md|CLAUDE\.md|\.cmiignore|\.github\/workflows\/[^/]+)$/i;
  return paths.filter((file) => pattern.test(file)).slice(0, 80);
}

function architectureMarkdown(manifest, graph, workspaces, directories, configFiles) {
  const graphSummary = [
    `- Source files analyzed: ${graph.summary.sourceFiles}`,
    `- Parsed this scan: ${graph.summary.parsedFiles}`,
    `- Reused from previous scan: ${graph.summary.reusedFiles}`,
    `- Local import edges: ${graph.summary.localEdges}`,
    `- Cross-workspace edges: ${graph.summary.crossWorkspaceEdges}`,
    `- Symbols indexed: ${graph.summary.symbols}`,
    `- External dependencies observed: ${graph.summary.externalDependencies}`,
    `- Unresolved local imports: ${graph.summary.unresolvedImports}`,
    `- Scan duration: ${graph.summary.durationMs} ms`,
  ].join('\n');
  const hubs = graph.hubs.filter((item) => item.dependents > 0).slice(0, 10);
  const workspaceSection = workspaces.count ? formatWorkspaces(workspaces).replace(/^# Project workspaces\n\n/, '') : '- No configured workspaces detected';
  return `# Project Architecture\n\nGenerated: ${manifest.generatedAt}\nIndex: \`${manifest.hash.slice(0, 12)}\`\n\n## Detected stack\n${manifest.stack.length ? manifest.stack.map((item) => `- ${item}`).join('\n') : '- Unknown'}\n\n## Workspaces\n${workspaceSection}\n\n## Languages and formats\n${manifest.languages.map((item) => `- ${item.language}: ${item.files} files, ${item.bytes} bytes`).join('\n') || '- None'}\n\n## Repository shape\n${directories.map(([directory, count]) => `- \`${directory}\`: ${count} files`).join('\n')}\n\n## Likely entry points\n${manifest.entryCandidates.map((item) => `- \`${item}\``).join('\n') || '- None detected'}\n\n## Important configuration and guidance\n${configFiles.map((item) => `- \`${item}\``).join('\n') || '- None detected'}\n\n## Graph intelligence\n${graphSummary}\n\n### Shared or high-impact files\n${hubs.length ? hubs.map((item) => `- \`${item.path}\`: ${item.dependents} dependents, ${item.imports} local imports, ${item.symbols} symbols${item.workspace ? `, workspace ${item.workspace}` : ''}`).join('\n') : '- No shared modules detected'}\n\n## Ignore and safety summary\n- Ignored entries: ${manifest.ignore.ignored}\n- Symbolic links skipped: ${manifest.ignore.symlinks}\n- Oversized files skipped: ${manifest.ignore.tooLarge}\n- Unreadable entries skipped: ${manifest.ignore.unreadable}\n- Custom ignore rules: ${manifest.ignore.rules}\n\n## Agent operating context\n- Indexed files: ${manifest.files}\n- Indexed bytes: ${manifest.bytes}\n- Search durable knowledge with \`cmi search "query"\`.\n- Scope monorepo retrieval with \`cmi context "query" --workspace name-or-path\`.\n- Check affected files and workspaces with \`cmi impact "file-or-symbol"\`.\n- Explain exclusions with \`cmi explain-ignore path\`.\n- Update this index after dependencies, folders, entry points, or shared APIs change.\n`;
}

export async function scanProject(root, options = {}) {
  const started = performance.now();
  await initProject(root);
  const config = await readConfig(root);
  const matcher = await createIgnoreMatcher(root, config);
  const walked = await walk(root, config, matcher);
  const fileRecords = walked.files;
  const paths = fileRecords.map((file) => file.path).sort();
  const stack = detectStack(paths);
  const languages = summarizeLanguages(fileRecords);
  const directories = topDirectories(fileRecords);
  const entryCandidates = paths.filter((file) => /(^|\/)(index|main|app|server|worker|cli|lib)\.(js|mjs|cjs|ts|tsx|py|go|rs)$/.test(file)).slice(0, 40);
  const configFiles = importantFiles(paths);
  const generatedAt = new Date().toISOString();
  const fingerprintMap = new Map(fileRecords.map((file) => [file.path, file.fingerprint]));
  const hash = crypto.createHash('sha256').update(paths.map((filePath) => `${filePath}:${fingerprintMap.get(filePath)}`).join('\n')).digest('hex');
  const workspaceReport = config.workspaceDetection ? await detectWorkspaces(root, fileRecords) : { schemaVersion: 1, count: 0, byEcosystem: {}, workspaces: [] };
  const previousGraph = !options.full && config.incrementalScan ? await loadProjectGraph(root) : null;
  const graph = await buildProjectGraph(root, fileRecords, config, { previousGraph, workspaceReport });
  const manifest = {
    schemaVersion: 5,
    generatedAt,
    root: path.basename(root),
    files: paths.length,
    bytes: fileRecords.reduce((sum, file) => sum + file.size, 0),
    stack,
    languages,
    topDirectories: directories.map(([directory, files]) => ({ directory, files })),
    entryCandidates,
    config: configFiles,
    workspaces: workspaceReport,
    ignore: { ...walked.stats, rules: matcher.rules.length },
    graph: graph.summary,
    hubs: graph.hubs.slice(0, 10),
    durationMs: Number((performance.now() - started).toFixed(2)),
    hash,
  };
  await safeWriteMemoryFile(root, 'architecture.md', architectureMarkdown(manifest, graph, workspaceReport, directories, configFiles));
  await safeWriteMemoryFile(root, 'project-index.json', JSON.stringify(manifest, null, 2) + '\n');
  await safeWriteMemoryFile(root, 'project-graph.json', JSON.stringify(graph, null, 2) + '\n');
  return manifest;
}

async function normalizeSources(root, sources) {
  const output = [];
  for (const source of sources || []) {
    const resolved = await resolveProjectFile(root, source);
    if (!resolved.ok) throw new Error(resolved.reason);
    if (!output.includes(resolved.relative)) output.push(resolved.relative);
  }
  return output;
}

export async function remember(root, type, text, options = {}) {
  await initProject(root);
  const fileName = { fact: 'memory.md', decision: 'decisions.md', mistake: 'mistakes.md' }[type];
  if (!fileName) throw new Error('Type must be fact, decision, or mistake');
  const clean = String(text || '').trim();
  if (!clean) throw new Error('Memory text cannot be empty');
  if (looksSensitive(clean)) throw new Error('Memory appears to contain a secret. Store a reference, not the credential.');
  const sources = await normalizeSources(root, options.sources || []);
  const index = await safeReadMemoryJson(root, 'project-index.json', { optional: true });
  const createdAt = new Date().toISOString();
  const metadata = { schemaVersion: 1, id: crypto.randomUUID(), type, createdAt, sources, sourceHashes: await sourceFingerprints(root, sources), projectHash: index?.hash || null, lifecycle: { state: 'active' } };
  await withMemoryWriteLock(root, () => safeAppendMemoryFile(root, fileName, `\n## ${createdAt}\n\n<!-- cmi-meta:${JSON.stringify(metadata)} -->\n\n${clean}\n`));
  return metadata;
}

async function git(root, args) { try { return (await exec('git', args, { cwd: root, maxBuffer: 4_000_000 })).stdout.trim(); } catch { return ''; } }

export async function snapshot(root, label = 'snapshot') {
  await initProject(root);
  const data = { createdAt: new Date().toISOString(), label, branch: await git(root, ['branch','--show-current']), status: await git(root, ['status','--short']), diffStat: await git(root, ['diff','--stat']), stagedDiffStat: await git(root, ['diff','--cached','--stat']), head: await git(root, ['rev-parse','--short','HEAD']) };
  const safeLabel = label.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '') || 'snapshot';
  const fileName = `${Date.now()}-${safeLabel}.json`;
  await safeWriteMemoryFile(root, `snapshots/${fileName}`, JSON.stringify(data, null, 2) + '\n');
  return fileName;
}

async function countEntries(root, relative) {
  try { return (await safeReadMemoryFile(root, relative)).split('\n').filter((line) => /^## \d{4}-/.test(line)).length; }
  catch { return 0; }
}

export async function status(root) {
  let directory = null;
  try { directory = await ensureSafeMemoryRoot(root, { create: false }); }
  catch (error) {
    const evidenceHealth = buildEvidenceHealth({ initialized: true, storageSafe: false, indexAvailable: false, graphHealth: null, memoryHealth: null });
    return { initialized: true, healthy: false, evidenceHealth, storageHealth: { safe: false, reason: error.message }, index: null, graph: null, graphHealth: null, workspaces: null, entries: null, memoryHealth: null, snapshots: 0 };
  }
  if (!directory) return { initialized: false, healthy: false, evidenceHealth: buildEvidenceHealth({ initialized: false, storageSafe: true, indexAvailable: false, graphHealth: null, memoryHealth: null }) };
  const index = await safeReadMemoryJson(root, 'project-index.json', { optional: true, maxBytes: DEFAULT_MAX_GENERATED_CACHE_BYTES }).catch(() => null);
  const graph = await safeReadMemoryJson(root, 'project-graph.json', { optional: true, maxBytes: DEFAULT_MAX_GENERATED_CACHE_BYTES }).catch(() => null);
  const snapshots = await safeListMemoryDir(root, 'snapshots').catch(() => []);
  const entries = { facts: await countEntries(root, 'memory.md'), decisions: await countEntries(root, 'decisions.md'), mistakes: await countEntries(root, 'mistakes.md') };
  const memoryHealth = await checkStaleMemory(root);
  const loaded = await loadMemory(root, { withHealth: true });
  const graphHealth = loaded.graphHealth;
  const evidenceHealth = buildEvidenceHealth({ initialized: true, storageSafe: true, indexAvailable: Boolean(index), graphHealth, memoryHealth: memoryHealth.counts });
  return {
    initialized: true,
    healthy: evidenceHealth.healthy,
    evidenceHealth,
    storageHealth: { safe: true },
    index,
    graph: graph?.summary || null,
    graphHealth,
    workspaces: index?.workspaces || null,
    entries,
    memoryHealth: memoryHealth.counts,
    snapshots: snapshots.length,
  };
}

export async function doctor(root) {
  const checks = [];
  const add = (name, statusValue, detail) => checks.push({ name, status: statusValue, detail });
  const major = Number(process.versions.node.split('.')[0]);
  add('node', major >= 22 ? 'pass' : 'fail', `Node.js ${process.versions.node}; version 22 or newer is required.`);
  let stat = null;
  try { stat = await fs.stat(root); } catch {}
  add('project-root', stat?.isDirectory() ? 'pass' : 'fail', stat?.isDirectory() ? path.resolve(root) : 'Project root does not exist or is not a directory.');
  try { await fs.access(root, fsConstants.R_OK | fsConstants.W_OK); add('project-access', 'pass', 'Project root is readable and writable.'); } catch { add('project-access', 'fail', 'Project root must be readable and writable.'); }
  let memoryRoot = null;
  let storageError = null;
  try { memoryRoot = await ensureSafeMemoryRoot(root, { create: false }); } catch (error) { storageError = error; }
  const initialized = Boolean(memoryRoot);
  add('storage-integrity', storageError ? 'fail' : initialized ? 'pass' : 'warn', storageError ? storageError.message : initialized ? '.codex-memory is a project-local non-symlink directory.' : 'Project memory is not initialized.');
  add('memory', initialized ? 'pass' : 'warn', initialized ? 'Project memory is initialized.' : 'Run cmi init to create project memory.');
  const gitVersion = await git(root, ['--version']);
  add('git', gitVersion ? 'pass' : 'warn', gitVersion || 'Git is unavailable; snapshots will contain limited metadata.');
  const config = await readConfig(root);
  const matcher = await createIgnoreMatcher(root, config);
  add('ignore-rules', 'pass', `${matcher.rules.length} custom ignore rule(s) loaded.`);
  if (initialized) {
    const projectStatus = await status(root);
    add('index', projectStatus.index && projectStatus.graph ? 'pass' : 'warn', projectStatus.index && projectStatus.graph ? 'Project index and graph are available.' : 'Run cmi scan to build project intelligence.');
    const graphBlocked = projectStatus.evidenceHealth?.domains?.graph?.state === 'blocked';
    add('graph-health', projectStatus.graphHealth?.healthy ? 'pass' : graphBlocked ? 'fail' : 'warn', projectStatus.graphHealth?.healthy ? 'Project graph is current and complete within configured coverage.' : graphBlocked ? `Project graph is blocked (${projectStatus.graphHealth?.staleNodes || 0} stale, ${projectStatus.graphHealth?.missingNodes || 0} missing, sourceSetChanged=${Boolean(projectStatus.graphHealth?.sourceSetChanged)}, resolverInputsChanged=${Boolean(projectStatus.graphHealth?.resolverInputsChanged)}). Run cmi scan before relying on graph/impact evidence.` : `Project graph is degraded (${projectStatus.graphHealth?.staleNodes || 0} stale, ${projectStatus.graphHealth?.missingNodes || 0} missing, truncated=${Boolean(projectStatus.graphHealth?.truncated)}). Run cmi scan or raise graph limits.`);
    const evidenceBlocked = projectStatus.evidenceHealth?.state === 'blocked' || projectStatus.evidenceHealth?.blocked === true;
    add('evidence-health', projectStatus.evidenceHealth?.healthy ? 'pass' : evidenceBlocked ? 'fail' : 'warn', projectStatus.evidenceHealth?.healthy ? 'Current project evidence is healthy.' : `Evidence state is ${projectStatus.evidenceHealth?.state || 'unknown'}; inspect status --json before relying on degraded or blocked evidence.`);
    const blockedMemory = Number(projectStatus.memoryHealth?.blocked || 0);
    const memoryCurrent = blockedMemory === 0 && projectStatus.memoryHealth?.stale === 0 && projectStatus.memoryHealth?.review === 0 && projectStatus.memoryHealth?.untracked === 0;
    add('memory-health', blockedMemory > 0 ? 'fail' : memoryCurrent ? 'pass' : 'warn', blockedMemory > 0 ? `${blockedMemory} durable memory source(s) are blocked and cannot be trusted. Repair or restore the affected memory file before retrieval or mutation.` : memoryCurrent ? 'Tracked memory is current.' : 'Run cmi stale to review memory health.');
    add('workspaces', 'pass', `${projectStatus.workspaces?.count || 0} configured workspace(s) detected.`);
  }
  return { version: VERSION, healthy: checks.every((check) => check.status !== 'fail'), checks };
}

export async function explainIgnore(root, candidate, options = {}) {
  const config = await readConfig(root);
  return explainIgnoreRule(root, candidate, { ...options, config });
}
