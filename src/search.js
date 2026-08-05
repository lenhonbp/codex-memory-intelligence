import fs from 'node:fs/promises';
import path from 'node:path';

const MEMORY_FILES = ['memory.md', 'decisions.md', 'mistakes.md', 'architecture.md', 'agent-instructions.md'];
const STOP = new Set(['the','and','for','with','that','this','from','into','cua','cho','voi','nhung','mot','cac','trong','duoc']);
const META_PATTERN = /<!--\s*cmi-meta:(\{.*?\})\s*-->/;

export function normalize(text) {
  return String(text)
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function tokenize(text) {
  return [...new Set(normalize(text).match(/[a-z0-9_./-]{2,}/g) || [])]
    .filter((token) => !STOP.has(token));
}

function sections(content, source) {
  const lines = content.split('\n');
  const output = [];
  let title = source;
  let body = [];
  const flush = () => {
    let text = body.join('\n').trim();
    if (!text) { body = []; return; }
    const metaMatch = text.match(META_PATTERN);
    let metadata = null;
    try { metadata = metaMatch ? JSON.parse(metaMatch[1]) : null; } catch {}
    text = text.replace(META_PATTERN, '').trim();
    if (text) output.push({ source, title, text, metadata, kind: 'memory' });
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

async function graphChunks(root) {
  try {
    const graph = JSON.parse(await fs.readFile(path.join(root, '.codex-memory', 'project-graph.json'), 'utf8'));
    return graph.nodes.map((node) => {
      const symbols = node.symbols.map((symbol) => `${symbol.name} (${symbol.kind}${symbol.exported ? ', exported' : ''})`).join(', ');
      const localImports = node.imports.filter((item) => item.resolved).map((item) => item.resolved).join(', ');
      const externalImports = node.imports.filter((item) => item.external).map((item) => item.specifier).join(', ');
      return {
        source: 'project-graph.json',
        title: `File ${node.path}`,
        text: `Language: ${node.language}\nSymbols: ${symbols || 'none'}\nLocal imports: ${localImports || 'none'}\nExternal imports: ${externalImports || 'none'}`,
        metadata: { path: node.path, symbols: node.symbols },
        kind: 'graph',
      };
    });
  } catch { return []; }
}

export async function loadMemory(root) {
  const directory = path.join(root, '.codex-memory');
  const chunks = [];
  for (const file of MEMORY_FILES) {
    try { chunks.push(...sections(await fs.readFile(path.join(directory, file), 'utf8'), file)); } catch {}
  }
  chunks.push(...await graphChunks(root));
  return chunks;
}

export async function searchMemory(root, query, limit = 6) {
  const terms = tokenize(query);
  if (!terms.length) return [];
  const chunks = await loadMemory(root);
  return chunks.map((chunk) => {
    const haystack = normalize(`${chunk.title}\n${chunk.text}`);
    const normalizedTitle = normalize(chunk.title);
    let score = chunk.source === 'decisions.md' ? 0.5 : chunk.source === 'mistakes.md' ? 0.35 : 0;
    for (const term of terms) {
      const matches = haystack.split(term).length - 1;
      if (matches) score += 1 + Math.log2(1 + matches);
      if (normalizedTitle.includes(term)) score += 2;
      if (chunk.kind === 'graph' && chunk.metadata?.symbols?.some((symbol) => normalize(symbol.name) === term)) score += 5;
    }
    if (haystack.includes(terms.join(' '))) score += 4;
    return { ...chunk, score: Number(score.toFixed(3)) };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, Math.max(1, Math.min(20, limit)));
}

export function formatResults(results) {
  if (!results.length) return 'No relevant project knowledge found.';
  return results.map((item, index) => {
    const sources = item.metadata?.sources?.length ? ` · sources ${item.metadata.sources.join(', ')}` : '';
    return `## ${index + 1}. ${item.title}\nSource: ${item.source} · score ${item.score}${sources}\n\n${item.text}`;
  }).join('\n\n');
}
