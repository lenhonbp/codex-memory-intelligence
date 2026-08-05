import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const MEMORY_DIR = '.codex-memory';
const IGNORE = new Set(['.git','node_modules','dist','build','.next','.cache','coverage','.wrangler','.turbo','.vercel','.DS_Store']);
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
  await writeIfMissing(path.join(directory, 'agent-instructions.md'), `# Agent Instructions\n\n1. Search project memory before broad repository exploration.\n2. Read decisions before architectural changes.\n3. Read mistakes before risky operations or deployment.\n4. Store only durable knowledge, never secrets or temporary logs.\n5. Refresh project intelligence after structural changes.\n`);
  await writeIfMissing(path.join(directory, 'config.json'), JSON.stringify({ version: 1, maxFileBytes: 1_000_000, includeHidden: false }, null, 2) + '\n');
  return directory;
}

async function readConfig(root) {
  try { return JSON.parse(await fs.readFile(path.join(root, MEMORY_DIR, 'config.json'), 'utf8')); }
  catch { return { version: 1, maxFileBytes: 1_000_000, includeHidden: false }; }
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
  if (paths.some((p) => /next\.config\./.test(p))) stack.push('Next.js');
  if (paths.some((p) => /astro\.config\./.test(p))) stack.push('Astro');
  if (has('bun.lock') || has('bun.lockb')) stack.push('Bun');
  if (has('package-lock.json')) stack.push('npm');
  if (has('pnpm-lock.yaml')) stack.push('pnpm');
  if (has('yarn.lock')) stack.push('Yarn');
  if (has('requirements.txt') || has('pyproject.toml')) stack.push('Python');
  if (has('Cargo.toml')) stack.push('Rust');
  if (has('go.mod')) stack.push('Go');
  if (has('Dockerfile') || paths.some((p) => /docker-compose.*\.ya?ml/.test(p))) stack.push('Docker');
  return stack;
}

function summarizeLanguages(files) {
  const counts = new Map();
  for (const file of files) {
    const language = EXT_LANGUAGE.get(path.extname(file.path).toLowerCase()) || 'Other';
    const current = counts.get(language) || { files: 0, bytes: 0 };
    current.files += 1; current.bytes += file.size; counts.set(language, current);
  }
  return [...counts.entries()].map(([language, value]) => ({ language, ...value })).sort((a, b) => b.bytes - a.bytes).slice(0, 15);
}

function topDirectories(files) {
  const counts = new Map();
  for (const file of files) { const first = file.path.split('/')[0]; counts.set(first, (counts.get(first) || 0) + 1); }
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
  const hash = crypto.createHash('sha256').update(paths.map((p) => `${p}:${fileRecords.find((f) => f.path === p)?.size}`).join('\n')).digest('hex');
  const manifest = { schemaVersion: 2, generatedAt, root: path.basename(root), files: paths.length, bytes: fileRecords.reduce((sum, f) => sum + f.size, 0), stack, languages, topDirectories: directories.map(([directory, files]) => ({ directory, files })), entryCandidates, config: configFiles, hash };

  const markdown = `# Project Architecture\n\nGenerated: ${generatedAt}\nIndex: \`${hash.slice(0, 12)}\`\n\n## Detected stack\n${stack.length ? stack.map((item) => `- ${item}`).join('\n') : '- Unknown'}\n\n## Languages and formats\n${languages.map((item) => `- ${item.language}: ${item.files} files, ${item.bytes} bytes`).join('\n') || '- None'}\n\n## Repository shape\n${directories.map(([directory, count]) => `- \`${directory}\`: ${count} files`).join('\n')}\n\n## Likely entry points\n${entryCandidates.map((item) => `- \`${item}\``).join('\n') || '- None detected'}\n\n## Important configuration and guidance\n${configFiles.map((item) => `- \`${item}\``).join('\n') || '- None detected'}\n\n## Agent operating context\n- Indexed files: ${manifest.files}\n- Indexed bytes: ${manifest.bytes}\n- Search durable knowledge with \`cmi search "query"\`.\n- Update this index after dependencies, folders, or entry points change.\n`;
  await fs.writeFile(path.join(root, MEMORY_DIR, 'architecture.md'), markdown, 'utf8');
  await fs.writeFile(path.join(root, MEMORY_DIR, 'project-index.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return manifest;
}

export async function remember(root, type, text) {
  await initProject(root);
  const fileName = { fact: 'memory.md', decision: 'decisions.md', mistake: 'mistakes.md' }[type];
  if (!fileName) throw new Error('Type must be fact, decision, or mistake');
  const clean = String(text || '').trim();
  if (!clean) throw new Error('Memory text cannot be empty');
  if (/api[_ -]?key|secret|password|private[_ -]?key/i.test(clean)) throw new Error('Memory appears to contain a secret. Store a reference, not the credential.');
  await fs.appendFile(path.join(root, MEMORY_DIR, fileName), `\n## ${new Date().toISOString()}\n\n${clean}\n`, 'utf8');
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
  try { index = JSON.parse(await fs.readFile(path.join(directory, 'project-index.json'), 'utf8')); } catch {}
  const snapshots = await fs.readdir(path.join(directory, 'snapshots')).catch(() => []);
  const entries = {
    facts: await countEntries(path.join(directory, 'memory.md')),
    decisions: await countEntries(path.join(directory, 'decisions.md')),
    mistakes: await countEntries(path.join(directory, 'mistakes.md')),
  };
  return { initialized: true, healthy: Boolean(index), index, entries, snapshots: snapshots.length };
}
