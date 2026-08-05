import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const IGNORE = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  '.cache',
  'coverage',
  '.wrangler',
  '.DS_Store',
]);

export async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(directoryPath) {
  await fs.mkdir(directoryPath, { recursive: true });
}

export async function writeIfMissing(filePath, content) {
  if (!(await exists(filePath))) {
    await fs.writeFile(filePath, content, 'utf8');
  }
}

export async function initProject(root) {
  const directory = path.join(root, '.codex-memory');
  await ensureDir(path.join(directory, 'snapshots'));
  await writeIfMissing(
    path.join(directory, 'memory.md'),
    '# Project Memory\n\nDurable facts, conventions, and constraints.\n',
  );
  await writeIfMissing(
    path.join(directory, 'decisions.md'),
    '# Architecture Decisions\n\n',
  );
  await writeIfMissing(
    path.join(directory, 'mistakes.md'),
    '# Mistakes and Lessons\n\n',
  );
  await writeIfMissing(
    path.join(directory, 'architecture.md'),
    '# Project Architecture\n\nRun `cmi scan` to refresh this file.\n',
  );
  await writeIfMissing(
    path.join(directory, 'agent-instructions.md'),
    '# Agent Instructions\n\nBefore changing code, read memory.md, decisions.md, mistakes.md, and architecture.md. Update them when durable knowledge changes.\n',
  );
  return directory;
}

async function walk(root, current = root, output = []) {
  const entries = await fs.readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORE.has(entry.name) || entry.name === '.codex-memory') continue;
    const fullPath = path.join(current, entry.name);
    const relativePath = path.relative(root, fullPath);
    if (entry.isDirectory()) {
      await walk(root, fullPath, output);
    } else {
      output.push(relativePath);
    }
  }
  return output;
}

function detectStack(files) {
  const stack = [];
  if (files.includes('wrangler.toml')) stack.push('Cloudflare Workers/Pages');
  if (files.includes('package.json')) stack.push('Node.js/JavaScript');
  if (files.includes('bun.lock') || files.includes('bun.lockb')) stack.push('Bun');
  if (files.includes('package-lock.json')) stack.push('npm');
  if (files.includes('pnpm-lock.yaml')) stack.push('pnpm');
  if (files.includes('yarn.lock')) stack.push('Yarn');
  if (files.includes('requirements.txt') || files.includes('pyproject.toml')) stack.push('Python');
  if (files.includes('Cargo.toml')) stack.push('Rust');
  if (files.includes('go.mod')) stack.push('Go');
  return stack;
}

function topDirectories(files) {
  const counts = new Map();
  for (const file of files) {
    const firstSegment = file.split(path.sep)[0];
    counts.set(firstSegment, (counts.get(firstSegment) || 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 15);
}

export async function scanProject(root) {
  await initProject(root);
  const files = await walk(root);
  const stack = detectStack(files);
  const directories = topDirectories(files);
  const entryCandidates = files
    .filter((file) => /(^|\/)(index|main|app|server|worker|cli)\.(js|mjs|ts|tsx|py|go|rs)$/.test(file))
    .slice(0, 20);
  const config = files
    .filter((file) => /(package\.json|wrangler\.toml|tsconfig.*\.json|vite\.config|next\.config|Dockerfile|docker-compose|\.github\/workflows)/.test(file))
    .slice(0, 30);

  const markdown = `# Project Architecture

Generated: ${new Date().toISOString()}

## Detected stack
${stack.length ? stack.map((item) => `- ${item}`).join('\n') : '- Unknown'}

## Repository shape
${directories.map(([directory, count]) => `- \`${directory}\`: ${count} files`).join('\n')}

## Likely entry points
${entryCandidates.length ? entryCandidates.map((item) => `- \`${item}\``).join('\n') : '- None detected'}

## Important configuration
${config.length ? config.map((item) => `- \`${item}\``).join('\n') : '- None detected'}

## Agent context
- Total tracked source/config files: ${files.length}
- Read \`.codex-memory/memory.md\` for durable facts.
- Read \`.codex-memory/decisions.md\` before architectural changes.
- Read \`.codex-memory/mistakes.md\` before repeating risky operations.
`;

  await fs.writeFile(path.join(root, '.codex-memory', 'architecture.md'), markdown, 'utf8');

  const manifest = {
    generatedAt: new Date().toISOString(),
    files: files.length,
    stack,
    entryCandidates,
    config,
    hash: crypto.createHash('sha256').update(files.join('\n')).digest('hex'),
  };

  await fs.writeFile(
    path.join(root, '.codex-memory', 'project-index.json'),
    JSON.stringify(manifest, null, 2),
    'utf8',
  );

  return manifest;
}

export async function remember(root, type, text) {
  await initProject(root);
  const fileMap = {
    fact: 'memory.md',
    decision: 'decisions.md',
    mistake: 'mistakes.md',
  };
  const fileName = fileMap[type];
  if (!fileName) throw new Error('Type must be fact, decision, or mistake');
  const timestamp = new Date().toISOString();
  await fs.appendFile(
    path.join(root, '.codex-memory', fileName),
    `\n## ${timestamp}\n\n${text.trim()}\n`,
    'utf8',
  );
}

export async function snapshot(root, label = 'snapshot') {
  await initProject(root);

  const git = async (args) => {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    try {
      const result = await promisify(execFile)('git', args, {
        cwd: root,
        maxBuffer: 2_000_000,
      });
      return result.stdout.trim();
    } catch {
      return '';
    }
  };

  const data = {
    createdAt: new Date().toISOString(),
    label,
    branch: await git(['branch', '--show-current']),
    status: await git(['status', '--short']),
    diff: await git(['diff', '--stat']),
    head: await git(['rev-parse', '--short', 'HEAD']),
  };

  const safeLabel = label
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/^-|-$/g, '') || 'snapshot';
  const fileName = `${Date.now()}-${safeLabel}.json`;

  await fs.writeFile(
    path.join(root, '.codex-memory', 'snapshots', fileName),
    JSON.stringify(data, null, 2),
    'utf8',
  );

  return fileName;
}

export async function status(root) {
  const directory = path.join(root, '.codex-memory');
  if (!(await exists(directory))) return { initialized: false };

  let index = null;
  try {
    index = JSON.parse(
      await fs.readFile(path.join(directory, 'project-index.json'), 'utf8'),
    );
  } catch {
    // Index is optional until the first scan.
  }

  const snapshots = await fs
    .readdir(path.join(directory, 'snapshots'))
    .catch(() => []);

  return {
    initialized: true,
    index,
    snapshots: snapshots.length,
  };
}
