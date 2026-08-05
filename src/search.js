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

function termFrequency(text) {
  const tokens = normalize(text).match(/[a-z0-9_./-]{2,}/g) || [];
  const frequencies = new Map();
  for (const token of tokens) if (!STOP.has(token)) frequencies.set(token, (frequencies.get(token) || 0) + 1);
  return frequencies;
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
      const dependents = (graph.reverseDependents[node.path] || []).join(', ');
      return {
        source: 'project-graph.json',
        title: `File ${node.path}`,
        text: `Language: ${node.language}\nWorkspace: ${node.workspace || 'unassigned'}\nSymbols: ${symbols || 'none'}\nLocal imports: ${localImports || 'none'}\nDependents: ${dependents || 'none'}\nExternal imports: ${externalImports || 'none'}`,
        metadata: { path: node.path, symbols: node.symbols, workspace: node.workspace, dependents: graph.reverseDependents[node.path] || [] },
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

function workspaceMatches(chunk, workspaceQuery) {
  if (!workspaceQuery) return true;
  const needle = normalize(workspaceQuery);
  const workspace = normalize(chunk.metadata?.workspace || '');
  const pathValue = normalize(chunk.metadata?.path || '');
  if (chunk.kind === 'graph') return workspace.includes(needle) || pathValue === needle || pathValue.startsWith(`${needle}/`);
  const sources = chunk.metadata?.sources || [];
  if (!sources.length) return true;
  return sources.some((source) => normalize(source).startsWith(`${needle}/`) || normalize(source) === needle);
}

export async function searchMemory(root, query, limit = 6, options = {}) {
  const terms = tokenize(query);
  if (!terms.length) return [];
  const chunks = (await loadMemory(root)).filter((chunk) => workspaceMatches(chunk, options.workspace));
  if (!chunks.length) return [];
  const documentFrequencies = new Map();
  const frequencies = chunks.map((chunk) => {
    const frequency = termFrequency(`${chunk.title}\n${chunk.text}`);
    for (const term of new Set(frequency.keys())) documentFrequencies.set(term, (documentFrequencies.get(term) || 0) + 1);
    return frequency;
  });
  const phrase = normalize(terms.join(' '));
  const workspaceNeedle = normalize(options.workspace || '');

  return chunks.map((chunk, index) => {
    const haystack = normalize(`${chunk.title}\n${chunk.text}`);
    const normalizedTitle = normalize(chunk.title);
    const frequency = frequencies[index];
    let score = chunk.source === 'decisions.md' ? 0.8 : chunk.source === 'mistakes.md' ? 0.6 : 0;
    for (const term of terms) {
      const tf = frequency.get(term) || 0;
      if (tf) {
        const idf = Math.log(1 + chunks.length / (1 + (documentFrequencies.get(term) || 0)));
        score += (1 + Math.log(tf)) * (1 + idf);
      }
      if (normalizedTitle.includes(term)) score += 2.5;
      if (chunk.kind === 'graph' && chunk.metadata?.symbols?.some((symbol) => normalize(symbol.name) === term)) score += 6;
      if (chunk.kind === 'graph' && normalize(chunk.metadata?.path || '').endsWith(term)) score += 2;
    }
    if (phrase && haystack.includes(phrase)) score += 4;
    if (workspaceNeedle && normalize(chunk.metadata?.workspace || '').includes(workspaceNeedle)) score += 3;
    if (chunk.metadata?.dependents?.length) score += Math.min(2, Math.log2(1 + chunk.metadata.dependents.length));
    return { ...chunk, score: Number(score.toFixed(3)) };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, Math.max(1, Math.min(30, limit)));
}

export async function buildContextPack(root, query, limit = 8, options = {}) {
  const results = await searchMemory(root, query, limit, options);
  const decisions = results.filter((item) => item.source === 'decisions.md');
  const risks = results.filter((item) => item.source === 'mistakes.md');
  const files = results.filter((item) => item.kind === 'graph');
  return {
    query,
    workspace: options.workspace || null,
    summary: {
      results: results.length,
      decisions: decisions.length,
      risks: risks.length,
      files: files.length,
    },
    results,
  };
}

export function formatResults(results) {
  if (!results.length) return 'No relevant project knowledge found.';
  return results.map((item, index) => {
    const sources = item.metadata?.sources?.length ? ` · sources ${item.metadata.sources.join(', ')}` : '';
    const workspace = item.metadata?.workspace ? ` · workspace ${item.metadata.workspace}` : '';
    return `## ${index + 1}. ${item.title}\nSource: ${item.source} · score ${item.score}${workspace}${sources}\n\n${item.text}`;
  }).join('\n\n');
}
