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

function tokens(text) {
  return (normalize(text).match(/[a-z0-9_./-]{2,}/g) || []).filter((token) => !STOP.has(token));
}

export function tokenize(text) {
  return [...new Set(tokens(text))];
}

function termFrequency(text) {
  const values = tokens(text);
  const frequencies = new Map();
  for (const token of values) frequencies.set(token, (frequencies.get(token) || 0) + 1);
  return { frequencies, length: values.length };
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

async function resolveWorkspaceScope(root, workspaceQuery) {
  if (!workspaceQuery) return null;
  const needle = normalize(workspaceQuery);
  let workspaces = [];
  try {
    const index = JSON.parse(await fs.readFile(path.join(root, '.codex-memory', 'project-index.json'), 'utf8'));
    workspaces = index.workspaces?.workspaces || [];
  } catch {}
  const exact = workspaces.filter((workspace) => [workspace.id, workspace.name, workspace.path].some((value) => normalize(value || '') === needle));
  const matches = exact.length ? exact : workspaces.filter((workspace) => [workspace.id, workspace.name, workspace.path].some((value) => normalize(value || '').includes(needle)));
  return {
    query: workspaceQuery,
    needle,
    ids: new Set(matches.map((workspace) => normalize(workspace.id))),
    paths: new Set(matches.map((workspace) => normalize(workspace.path)).filter((value) => value && value !== '.')),
    matched: matches.map((workspace) => ({ id: workspace.id, name: workspace.name, path: workspace.path, ecosystem: workspace.ecosystem })),
  };
}

function workspaceMatches(chunk, scope) {
  if (!scope) return true;
  const workspace = normalize(chunk.metadata?.workspace || '');
  const pathValue = normalize(chunk.metadata?.path || '');
  const pathMatches = [...scope.paths].some((workspacePath) => pathValue === workspacePath || pathValue.startsWith(`${workspacePath}/`));
  if (chunk.kind === 'graph') return scope.ids.has(workspace) || pathMatches || (!scope.matched.length && (workspace.includes(scope.needle) || pathValue === scope.needle || pathValue.startsWith(`${scope.needle}/`)));
  const sources = chunk.metadata?.sources || [];
  if (!sources.length) return true;
  return sources.some((source) => {
    const normalizedSource = normalize(source);
    return [...scope.paths].some((workspacePath) => normalizedSource === workspacePath || normalizedSource.startsWith(`${workspacePath}/`))
      || (!scope.matched.length && (normalizedSource === scope.needle || normalizedSource.startsWith(`${scope.needle}/`)));
  });
}

export async function searchMemory(root, query, limit = 6, options = {}) {
  const terms = tokenize(query);
  if (!terms.length) return [];
  const workspaceScope = await resolveWorkspaceScope(root, options.workspace);
  const chunks = (await loadMemory(root)).filter((chunk) => workspaceMatches(chunk, workspaceScope));
  if (!chunks.length) return [];
  const documentFrequencies = new Map();
  const documents = chunks.map((chunk) => {
    const document = termFrequency(`${chunk.title}\n${chunk.text}`);
    for (const term of new Set(document.frequencies.keys())) documentFrequencies.set(term, (documentFrequencies.get(term) || 0) + 1);
    return document;
  });
  const averageLength = Math.max(1, documents.reduce((sum, document) => sum + document.length, 0) / documents.length);
  const phrase = normalize(terms.join(' '));
  const k1 = 1.2;
  const b = 0.75;

  return chunks.map((chunk, index) => {
    const haystack = normalize(`${chunk.title}\n${chunk.text}`);
    const normalizedTitle = normalize(chunk.title);
    const document = documents[index];
    let score = chunk.source === 'decisions.md' ? 0.8 : chunk.source === 'mistakes.md' ? 0.6 : 0;
    for (const term of terms) {
      const tf = document.frequencies.get(term) || 0;
      if (tf) {
        const df = documentFrequencies.get(term) || 0;
        const idf = Math.log(1 + ((chunks.length - df + 0.5) / (df + 0.5)));
        const normalizedTf = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (document.length / averageLength)));
        score += idf * normalizedTf;
      }
      if (normalizedTitle.includes(term)) score += 2.5;
      if (chunk.kind === 'graph' && chunk.metadata?.symbols?.some((symbol) => normalize(symbol.name) === term)) score += 6;
      if (chunk.kind === 'graph' && normalize(chunk.metadata?.path || '').endsWith(term)) score += 2;
    }
    if (phrase && haystack.includes(phrase)) score += 4;
    if (workspaceScope?.ids.has(normalize(chunk.metadata?.workspace || ''))) score += 3;
    if (chunk.metadata?.dependents?.length) score += Math.min(2, Math.log2(1 + chunk.metadata.dependents.length));
    return { ...chunk, score: Number(score.toFixed(3)) };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, Math.max(1, Math.min(30, limit)));
}

export async function buildContextPack(root, query, limit = 8, options = {}) {
  const results = await searchMemory(root, query, limit, options);
  const decisions = results.filter((item) => item.source === 'decisions.md');
  const risks = results.filter((item) => item.source === 'mistakes.md');
  const files = results.filter((item) => item.kind === 'graph');
  const globalKnowledge = results.filter((item) => item.kind !== 'graph' && !['decisions.md', 'mistakes.md'].includes(item.source));
  const estimatedCharacters = results.reduce((sum, item) => sum + item.title.length + item.text.length, 0);
  return {
    query,
    workspace: options.workspace || null,
    summary: {
      results: results.length,
      decisions: decisions.length,
      risks: risks.length,
      files: files.length,
      estimatedTokens: Math.ceil(estimatedCharacters / 4),
    },
    recommendedFiles: files.map((item) => item.metadata?.path).filter(Boolean),
    affectedWorkspaces: [...new Set(files.map((item) => item.metadata?.workspace).filter(Boolean))],
    sections: { decisions, risks, files, globalKnowledge },
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
