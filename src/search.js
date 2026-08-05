import fs from 'node:fs/promises';
import path from 'node:path';

const MEMORY_FILES = ['memory.md', 'decisions.md', 'mistakes.md', 'architecture.md', 'agent-instructions.md'];
const STOP = new Set(['the','and','for','with','that','this','from','into','cua','cho','voi','nhung','mot','cac','trong','duoc']);

export function tokenize(text) {
  return [...new Set(String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-z0-9_./-]{2,}/g) || [])]
    .filter((token) => !STOP.has(token));
}

function sections(content, source) {
  const lines = content.split('\n');
  const output = [];
  let title = source;
  let body = [];
  const flush = () => {
    const text = body.join('\n').trim();
    if (text) output.push({ source, title, text });
    body = [];
  };
  for (const line of lines) {
    if (/^#{1,3}\s+/.test(line)) {
      flush();
      title = line.replace(/^#+\s+/, '').trim();
    } else body.push(line);
  }
  flush();
  return output;
}

export async function loadMemory(root) {
  const dir = path.join(root, '.codex-memory');
  const chunks = [];
  for (const file of MEMORY_FILES) {
    try {
      chunks.push(...sections(await fs.readFile(path.join(dir, file), 'utf8'), file));
    } catch {}
  }
  return chunks;
}

export async function searchMemory(root, query, limit = 6) {
  const terms = tokenize(query);
  if (!terms.length) return [];
  const chunks = await loadMemory(root);
  return chunks.map((chunk) => {
    const haystack = `${chunk.title}\n${chunk.text}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    let score = 0;
    for (const term of terms) {
      const matches = haystack.split(term).length - 1;
      if (matches) score += 1 + Math.log2(1 + matches);
      if (chunk.title.toLowerCase().includes(term)) score += 2;
    }
    if (haystack.includes(terms.join(' '))) score += 4;
    return { ...chunk, score: Number(score.toFixed(3)) };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, Math.max(1, Math.min(20, limit)));
}

export function formatResults(results) {
  if (!results.length) return 'No relevant project memory found.';
  return results.map((item, index) => `## ${index + 1}. ${item.title}\nSource: ${item.source} · score ${item.score}\n\n${item.text}`).join('\n\n');
}
