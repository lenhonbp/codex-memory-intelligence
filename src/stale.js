import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const MEMORY_FILES = ['memory.md', 'decisions.md', 'mistakes.md'];
const META_PATTERN = /<!--\s*cmi-meta:(\{.*?\})\s*-->/;

async function readJson(filePath) {
  try { return JSON.parse(await fs.readFile(filePath, 'utf8')); } catch { return null; }
}

function safeProjectPath(root, source) {
  const absolute = path.resolve(root, String(source));
  const relative = path.relative(root, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return absolute;
}

async function hashFile(filePath) {
  try {
    const content = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch { return null; }
}

export async function sourceFingerprints(root, sources = []) {
  const output = {};
  for (const source of sources) {
    const normalized = String(source).split(path.sep).join('/').replace(/^\.\//, '');
    const safePath = safeProjectPath(root, normalized);
    output[normalized] = safePath ? await hashFile(safePath) : null;
  }
  return output;
}

function parseEntries(content, file) {
  const headings = [...content.matchAll(/^##\s+(\d{4}-[^\n]+)$/gm)];
  return headings.map((heading, index) => {
    const start = heading.index;
    const end = headings[index + 1]?.index ?? content.length;
    const section = content.slice(start, end).trim();
    const metaMatch = section.match(META_PATTERN);
    let metadata = null;
    try { metadata = metaMatch ? JSON.parse(metaMatch[1]) : null; } catch {}
    const text = section
      .replace(/^##[^\n]*\n?/, '')
      .replace(META_PATTERN, '')
      .trim();
    return { file, heading: heading[1], text, metadata, start, end };
  });
}

export async function loadTrackedMemory(root) {
  const directory = path.join(root, '.codex-memory');
  const entries = [];
  for (const file of MEMORY_FILES) {
    try {
      const content = await fs.readFile(path.join(directory, file), 'utf8');
      entries.push(...parseEntries(content, file));
    } catch {}
  }
  return entries;
}

export async function checkStaleMemory(root) {
  const directory = path.join(root, '.codex-memory');
  const index = await readJson(path.join(directory, 'project-index.json'));
  const config = await readJson(path.join(directory, 'config.json')) || {};
  const staleAfterDays = Number(config.staleAfterDays) || 90;
  const now = Date.now();
  const entries = await loadTrackedMemory(root);
  const results = [];

  for (const entry of entries) {
    const meta = entry.metadata;
    if (!meta) {
      results.push({ id: null, file: entry.file, heading: entry.heading, text: entry.text, status: 'untracked', reasons: ['Entry predates metadata tracking. Refresh it to establish a baseline.'] });
      continue;
    }

    const reasons = [];
    let status = 'fresh';
    const sources = Array.isArray(meta.sources) ? meta.sources : [];
    if (sources.length) {
      for (const source of sources) {
        const safePath = safeProjectPath(root, source);
        if (!safePath) {
          status = 'stale';
          reasons.push(`Referenced source escapes the project: ${source}`);
          continue;
        }
        const currentHash = await hashFile(safePath);
        const previousHash = meta.sourceHashes?.[source] ?? null;
        if (!currentHash) {
          status = 'stale';
          reasons.push(`Referenced source is missing: ${source}`);
        } else if (!previousHash || currentHash !== previousHash) {
          status = 'stale';
          reasons.push(`Referenced source changed: ${source}`);
        }
      }
    } else if (!meta.projectHash && index?.hash) {
      status = 'review';
      reasons.push('Memory has no project baseline. Refresh it after review.');
    } else if (meta.projectHash && index?.hash && meta.projectHash !== index.hash) {
      status = 'review';
      reasons.push('Project structure changed since this memory was recorded.');
    }

    const baseline = Date.parse(meta.reviewedAt || meta.createdAt || entry.heading);
    const ageDays = Number.isFinite(baseline) ? Math.floor((now - baseline) / 86_400_000) : null;
    if (status === 'fresh' && ageDays !== null && ageDays > staleAfterDays) {
      status = 'review';
      reasons.push(`Memory has not been reviewed for ${ageDays} days.`);
    }

    results.push({
      id: meta.id || null,
      type: meta.type || entry.file.replace('.md', ''),
      file: entry.file,
      heading: entry.heading,
      text: entry.text,
      sources,
      ageDays,
      status,
      reasons,
    });
  }

  const counts = { fresh: 0, stale: 0, review: 0, untracked: 0 };
  for (const item of results) counts[item.status] += 1;
  return { generatedAt: new Date().toISOString(), projectHash: index?.hash || null, staleAfterDays, counts, entries: results };
}

export async function refreshMemory(root, selector = 'all') {
  const directory = path.join(root, '.codex-memory');
  const index = await readJson(path.join(directory, 'project-index.json'));
  let updated = 0;

  for (const file of MEMORY_FILES) {
    const filePath = path.join(directory, file);
    let content;
    try { content = await fs.readFile(filePath, 'utf8'); } catch { continue; }
    const entries = parseEntries(content, file).reverse();
    let next = content;

    for (const entry of entries) {
      const meta = entry.metadata;
      if (meta && selector !== 'all' && !String(meta.id || '').startsWith(selector)) continue;
      if (!meta && selector !== 'all') continue;
      const refreshed = {
        ...(meta || {
          id: crypto.randomUUID(),
          type: ({ 'memory.md': 'fact', 'decisions.md': 'decision', 'mistakes.md': 'mistake' })[file],
          createdAt: entry.heading,
          sources: [],
        }),
        sourceHashes: await sourceFingerprints(root, meta?.sources || []),
        projectHash: index?.hash || meta?.projectHash || null,
        reviewedAt: new Date().toISOString(),
      };
      const section = next.slice(entry.start, entry.end);
      const marker = `<!-- cmi-meta:${JSON.stringify(refreshed)} -->`;
      const replacement = meta
        ? section.replace(META_PATTERN, marker)
        : section.replace(/^##[^\n]*\n?/, (heading) => `${heading}\n${marker}\n`);
      next = `${next.slice(0, entry.start)}${replacement}${next.slice(entry.end)}`;
      updated += 1;
    }
    if (next !== content) await fs.writeFile(filePath, next, 'utf8');
  }

  return { selector, updated };
}

export function formatStaleReport(report) {
  const header = `# Memory health\n\n- Fresh: ${report.counts.fresh}\n- Stale: ${report.counts.stale}\n- Review: ${report.counts.review}\n- Untracked: ${report.counts.untracked}`;
  const attention = report.entries.filter((entry) => entry.status !== 'fresh');
  if (!attention.length) return `${header}\n\nAll tracked memory is current.`;
  return `${header}\n\n## Needs attention\n${attention.map((entry) => {
    const id = entry.id ? `\`${entry.id.slice(0, 8)}\`` : '`untracked`';
    const reasons = entry.reasons.map((reason) => `  - ${reason}`).join('\n');
    return `- ${id} **${entry.status}** · ${entry.file} · ${entry.text.slice(0, 120)}\n${reasons}`;
  }).join('\n')}`;
}
