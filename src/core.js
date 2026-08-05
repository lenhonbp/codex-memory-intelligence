import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildProjectGraph } from './graph.js';
import { checkStaleMemory, sourceFingerprints } from './stale.js';

const exec = promisify(execFile);
const MEMORY_DIR = '.codex-memory';
const IGNORE = new Set(['.git','node_modules','dist','build','.next','.cache','coverage','.wrangler','.turbo','.vercel','.DS_Store']);
const DEFAULT_CONFIG = {
  version: 2,
  maxFileBytes: 1_000_000,
  maxSourceBytes: 512_000,
  maxGraphFiles: 5_000,
  staleAfterDays: 90,
  includeHidden: false,
};
const EXT_LANGUAGE = new Map([
  ['.js','JavaScript'],['.mjs','JavaScript'],['.cjs','JavaScript'],['.jsx','JavaScript'],
  ['.ts','TypeScript'],['.tsx','TypeScript'],['.py','Python'],['.go','Go'],['.rs','Rust'],
  ['.java','Java'],['.kt','Kotlin'],['.php','PHP'],['.rb','Ruby'],['.swift','Swift'],
  ['.vue','Vue'],['.svelte','Svelte'],['.css','CSS'],['.scss','SCSS'],['.html','HTML'],
  ['.sql','SQL'],['.md','Markdown'],['.json','JSON'],['.yaml','YAML'],['.yml','YAML'],
]);

export async function exists(filePath) {
  try { await fs.access(filePath); return true; } catch { return false; }
}

export async function ensureDir(directoryPath) { await fs.mkdir(directoryPath, { recursive: true }); }
export async function writeIfMissing(filePath, content) { if (!(await exists(filePath))) await fs.writeFile(filePath, content, 'utf8'); }

export async function initProject(root) {
  const directory = path.join(root, MEMORY_DIR);
  await ensureDir(path.join(directory, 'snapshots'));
  await writeIfMissing(path.join(directory, 'memory.md'), '# Project Memory\n\nDurable facts, conventions, constraints, and operational knowledge.\n');
  await writeIfMissing(path.join(directory, 'decisions.md'), '# Architecture Decisions\n\nRecord the context, decision, and consequences.\n');
  await writeIfMissing(path.join(directory, 'mistakes.md'), '# Mistakes and Lessons\n\nRecord failures, root causes, fixes, and prevention rules.\n');
  await writeIfMissing(path.join(directory, 'architecture.md'), '# Project Architecture\n\nRun `cmi scan` to refresh this file.\n');
  await writeIfMissing(path.join(directory, 'agent-instructions.md'), `# Agent Instructions\n\n1. Search project memory before broad repository exploration.\n2. Check memory health before relying on old decisions.\n3. Read decisions before architectural changes.\n4. Run impact analysis before changing shared files or symbols.\n5. Read mistakes before risky operations or deployment.\n6. Store only durable knowledge, never secrets or temporary logs.\n7. Refresh project intelligence after structural changes.\n`);
  const configPath = path.join(directory, 'config.json');
  let currentConfig = {};
  try { currentConfig = JSON.parse(await fs.readFile(configPath, 'utf8')); } catch {}
  const migratedConfig = { ...DEFAULT_CONFIG, ...currentConfig, version: DEFAULT_CONFIG.version };
  if (!(await exists(configPath)) || JSON.stringify(currentConfig) !== JSON.stringify(migratedConfig)) {
    await fs.writeFile(configPath, JSON.stringify(migratedConfig, null, 2) + '\n', 'utf8');
  }
  return directory;
}

export async function readConfig(root) {
  try {
    const custom = JSON.parse(await fs.readFile(path.join(root, MEMORY_DIR, 'config.json'), 'utf8'));
    return { ...DEFAULT_CONFIG, ...custom, version: Math.max(DEFAULT_CONFIG.version, Number(custom.version) || 0) };
  } catch { return { ...DEFAULT_CONFIG }; }
}

async function walk(root, config, current = root, output = []) {
  const entries = await fs.readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORE.has(entry.name) || entry.name === MEMORY_DIR || (!config.includeHidden && entry.name.startsWith('.') && current !== root)) continue;
    const fullPath = path.join(current, entry.name);
    const relativePath = path.relative(root, fullPath).split(path.sep).join('/');
    if (entry.isDirectory()) await walk(root, config, fullPath, output);
    else {
      const stat = await fs.stat(fullPath).catch(() => null);
      if (stat && stat.size <= config.maxFileBytes) output.push({ path: relativePath, size: stat.size, modifiedAt: stat.mtime.toISOString() });
    }
  }
  return output;
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
  if (has('go.mod')) stack.push('Go');
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
  const pattern = /(^|\/)(package\.json|wrangler\.(toml|jsonc?)|tsconfig.*\.json|vite\.config\.[^.]+|next\.config\.[^.]+|Dockerfile|docker-compose.*\.ya?ml|README\.md|AGENTS\.md|CLAUDE\.md|\.github\/workflows\/[^/]+)$/i;
  return paths.filter((file) => pattern.test(file)).slice(0, 50);
}

export async function scanProject(root) {
  await initProject(root);
  const config = await readConfig(root);
  const fileRecords = await walk(root, config);
  const paths = fileRecords.map((file) => file.path).sort();
  const stack = detectStack(paths);
  const languages = summarizeLanguages(fileRecords);
  const directories = topDirectories(fileRecords);
  const entryCandidates = paths.filter((file) => /(^|\/)(index|main|app|server|worker|cli)\.(js|mjs|cjs|ts|tsx|py|go|rs)$/.test(file)).slice(0, 30);
  const configFiles = importantFiles(paths);
  const generatedAt = new Date().toISOString();
  const hash = crypto.createHash('sha256').update(paths.map((filePath) => `${filePath}:${fileRecords.find((file) => file.path === filePath)?.size}`).join('\n')).digest('hex');
  const graph = await buildProjectGraph(root, fileRecords, config);
  const manifest = {
    schemaVersion: 3,
    generatedAt,
    root: path.basename(root),
    files: paths.length,
    bytes: fileRecords.reduce((sum, file) => sum + file.size, 0),
    stack,
    languages,
    topDirectories: directories.map(([directory, files]) => ({ directory, files })),
    entryCandidates,
    config: configFiles,
    graph: graph.summary,
    hubs: graph.hubs.slice(0, 10),
    hash,
  };

  const graphSummary = `- Source files analyzed: ${graph.summary.sourceFiles}\n- Local import edges: ${graph.summary.localEdges}\n- Symbols indexed: ${graph.summary.symbols}\n- External dependencies observed: ${graph.summary.externalDependencies}`;
  const hubs = graph.hubs.filter((item) => item.dependents > 0).slice(0, 10);
  const markdown = `# Project Architecture\n\nGenerated: ${generatedAt}\nIndex: \`${hash.slice(0, 12)}\`\n\n## Detected stack\n${stack.length ? stack.map((item) => `- ${item}`).join('\n') : '- Unknown'}\n\n## Languages and formats\n${languages.map((item) => `- ${item.language}: ${item.files} files, ${item.bytes} bytes`).join('\n') || '- None'}\n\n## Repository shape\n${directories.map(([directory, count]) => `- \`${directory}\`: ${count} files`).join('\n')}\n\n## Likely entry points\n${entryCandidates.map((item) => `- \`${item}\``).join('\n') || '- None detected'}\n\n## Important configuration and guidance\n${configFiles.map((item) => `- \`${item}\``).join('\n') || '- None detected'}\n\n## Graph intelligence\n${graphSummary}\n\n### Shared or high-impact files\n${hubs.length ? hubs.map((item) => `- \`${item.path}\`: ${item.dependents} dependents, ${item.imports} local imports, ${item.symbols} symbols`).join('\n') : '- No shared modules detected'}\n\n## Agent operating context\n- Indexed files: ${manifest.files}\n- Indexed bytes: ${manifest.bytes}\n- Search durable knowledge with \`cmi search "query"\`.\n- Check affected files with \`cmi impact "file-or-symbol"\`.\n- Check outdated knowledge with \`cmi stale\`.\n- Update this index after dependencies, folders, entry points, or shared APIs change.\n`;
  await fs.writeFile(path.join(root, MEMORY_DIR, 'architecture.md'), markdown, 'utf8');
  await fs.writeFile(path.join(root, MEMORY_DIR, 'project-index.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  await fs.writeFile(path.join(root, MEMORY_DIR, 'project-graph.json'), JSON.stringify(graph, null, 2) + '\n', 'utf8');
  return manifest;
}

function looksSensitive(text) {
  return /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)
    || /\b(?:api[_ -]?key|password|secret|access[_ -]?token|refresh[_ -]?token)\s*[:=]\s*\S{6,}/i.test(text)
    || /\b(?:sk|ghp|github_pat|xox[baprs])-[-A-Za-z0-9_]{12,}\b/.test(text);
}

function normalizeSources(root, sources) {
  return [...new Set((sources || []).map((source) => {
    const absolute = path.resolve(root, String(source));
    const relative = path.relative(root, absolute);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Source must be inside the project: ${source}`);
    return relative.split(path.sep).join('/');
  }))];
}

export async function remember(root, type, text, options = {}) {
  await initProject(root);
  const fileName = { fact: 'memory.md', decision: 'decisions.md', mistake: 'mistakes.md' }[type];
  if (!fileName) throw new Error('Type must be fact, decision, or mistake');
  const clean = String(text || '').trim();
  if (!clean) throw new Error('Memory text cannot be empty');
  if (looksSensitive(clean)) throw new Error('Memory appears to contain a secret. Store a reference, not the credential.');
  const sources = normalizeSources(root, options.sources || []);
  for (const source of sources) if (!(await exists(path.join(root, source)))) throw new Error(`Referenced source does not exist: ${source}`);
  let index = null;
  try { index = JSON.parse(await fs.readFile(path.join(root, MEMORY_DIR, 'project-index.json'), 'utf8')); } catch {}
  const createdAt = new Date().toISOString();
  const metadata = {
    id: crypto.randomUUID(),
    type,
    createdAt,
    sources,
    sourceHashes: await sourceFingerprints(root, sources),
    projectHash: index?.hash || null,
  };
  await fs.appendFile(path.join(root, MEMORY_DIR, fileName), `\n## ${createdAt}\n\n<!-- cmi-meta:${JSON.stringify(metadata)} -->\n\n${clean}\n`, 'utf8');
  return metadata;
}

async function git(root, args) {
  try { return (await exec('git', args, { cwd: root, maxBuffer: 4_000_000 })).stdout.trim(); } catch { return ''; }
}

export async function snapshot(root, label = 'snapshot') {
  await initProject(root);
  const data = { createdAt: new Date().toISOString(), label, branch: await git(root, ['branch','--show-current']), status: await git(root, ['status','--short']), diffStat: await git(root, ['diff','--stat']), stagedDiffStat: await git(root, ['diff','--cached','--stat']), head: await git(root, ['rev-parse','--short','HEAD']) };
  const safeLabel = label.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '') || 'snapshot';
  const fileName = `${Date.now()}-${safeLabel}.json`;
  await fs.writeFile(path.join(root, MEMORY_DIR, 'snapshots', fileName), JSON.stringify(data, null, 2) + '\n', 'utf8');
  return fileName;
}

async function countEntries(filePath) {
  try { return (await fs.readFile(filePath, 'utf8')).split('\n').filter((line) => /^## \d{4}-/.test(line)).length; } catch { return 0; }
}

export async function status(root) {
  const directory = path.join(root, MEMORY_DIR);
  if (!(await exists(directory))) return { initialized: false };
  let index = null;
  let graph = null;
  try { index = JSON.parse(await fs.readFile(path.join(directory, 'project-index.json'), 'utf8')); } catch {}
  try { graph = JSON.parse(await fs.readFile(path.join(directory, 'project-graph.json'), 'utf8')); } catch {}
  const snapshots = await fs.readdir(path.join(directory, 'snapshots')).catch(() => []);
  const entries = {
    facts: await countEntries(path.join(directory, 'memory.md')),
    decisions: await countEntries(path.join(directory, 'decisions.md')),
    mistakes: await countEntries(path.join(directory, 'mistakes.md')),
  };
  const memoryHealth = await checkStaleMemory(root);
  return {
    initialized: true,
    healthy: Boolean(index && graph && memoryHealth.counts.stale === 0),
    index,
    graph: graph?.summary || null,
    entries,
    memoryHealth: memoryHealth.counts,
    snapshots: snapshots.length,
  };
}
