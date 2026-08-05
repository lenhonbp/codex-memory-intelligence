import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveProjectFile, slash } from './paths.js';
import { workspaceForPath } from './workspaces.js';

const SOURCE_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx',
  '.py', '.go', '.rs', '.java', '.kt', '.php', '.rb', '.swift',
  '.vue', '.svelte',
]);
const JS_EXTENSIONS = ['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx'];
const PARSER_VERSION = 3;

function sourceLanguage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (JS_EXTENSIONS.includes(ext)) return ext.includes('t') ? 'TypeScript' : 'JavaScript';
  return ({ '.py':'Python','.go':'Go','.rs':'Rust','.java':'Java','.kt':'Kotlin','.php':'PHP','.rb':'Ruby','.swift':'Swift','.vue':'Vue','.svelte':'Svelte' })[ext] || 'Other';
}

function parseJavaScriptImports(content) {
  const imports = [];
  const pattern = /(?:\bimport\s+(?:[^'";]*?\s+from\s+)?|\bexport\s+[^'";]*?\s+from\s+|\bimport\s*\(\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;
  for (const match of content.matchAll(pattern)) imports.push(match[1]);
  return imports;
}

function parsePythonImports(content) {
  const imports = [];
  for (const line of content.split('\n')) {
    let match = line.match(/^\s*from\s+([.\w]+)\s+import\s+/);
    if (match) imports.push(match[1]);
    match = line.match(/^\s*import\s+([\w.]+)/);
    if (match) imports.push(match[1]);
  }
  return imports;
}

function parseQuotedImports(content) {
  return [...content.matchAll(/(?:^|\s)["']([^"']+)["']/gm)].map((match) => match[1]);
}

function parseImports(filePath, content) {
  const ext = path.extname(filePath).toLowerCase();
  if (JS_EXTENSIONS.includes(ext) || ext === '.vue' || ext === '.svelte') return parseJavaScriptImports(content);
  if (ext === '.py') return parsePythonImports(content);
  if (ext === '.go') {
    const block = content.match(/import\s*\(([^)]*)\)/s)?.[1] || '';
    const single = [...content.matchAll(/^\s*import\s+(?:\w+\s+)?["']([^"']+)["']/gm)].map((match) => match[1]);
    return [...single, ...parseQuotedImports(block)];
  }
  if (ext === '.rs') {
    const output = [];
    for (const match of content.matchAll(/^\s*(?:pub\s+)?mod\s+([A-Za-z_]\w*)\s*;/gm)) output.push(`mod:${match[1]}`);
    for (const match of content.matchAll(/^\s*use\s+([^;{]+)/gm)) output.push(match[1].trim());
    return output;
  }
  return [];
}

function parseSymbols(filePath, content) {
  const ext = path.extname(filePath).toLowerCase();
  const output = [];
  const lines = content.split('\n');
  const add = (line, name, kind, exported = false) => {
    if (!name || output.some((item) => item.name === name && item.kind === kind)) return;
    output.push({ name, kind, exported, line });
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNumber = index + 1;
    let match;
    if (JS_EXTENSIONS.includes(ext) || ext === '.vue' || ext === '.svelte') {
      match = line.match(/^\s*(export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/); if (match) add(lineNumber, match[2], 'function', Boolean(match[1]));
      match = line.match(/^\s*(export\s+)?(?:default\s+)?class\s+([A-Za-z_$][\w$]*)/); if (match) add(lineNumber, match[2], 'class', Boolean(match[1]));
      match = line.match(/^\s*(export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/); if (match) add(lineNumber, match[2], 'function', Boolean(match[1]));
      match = line.match(/^\s*(export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/); if (match) add(lineNumber, match[2], 'variable', Boolean(match[1]));
      match = line.match(/^\s*export\s+(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/); if (match) add(lineNumber, match[1], 'type', true);
    } else if (ext === '.py') {
      match = line.match(/^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/); if (match) add(lineNumber, match[1], 'function');
      match = line.match(/^\s*class\s+([A-Za-z_]\w*)/); if (match) add(lineNumber, match[1], 'class');
    } else if (ext === '.go') {
      match = line.match(/^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/); if (match) add(lineNumber, match[1], 'function', /^[A-Z]/.test(match[1]));
      match = line.match(/^\s*type\s+([A-Za-z_]\w*)\s+/); if (match) add(lineNumber, match[1], 'type', /^[A-Z]/.test(match[1]));
    } else if (ext === '.rs') {
      match = line.match(/^\s*(pub\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)/); if (match) add(lineNumber, match[2], 'function', Boolean(match[1]));
      match = line.match(/^\s*(pub\s+)?(?:struct|enum|trait)\s+([A-Za-z_]\w*)/); if (match) add(lineNumber, match[2], 'type', Boolean(match[1]));
      match = line.match(/^\s*(pub\s+)?mod\s+([A-Za-z_]\w*)/); if (match) add(lineNumber, match[2], 'module', Boolean(match[1]));
    } else {
      match = line.match(/^\s*(?:public\s+|private\s+|protected\s+)?(?:class|interface|enum|struct)\s+([A-Za-z_]\w*)/); if (match) add(lineNumber, match[1], 'type');
      match = line.match(/^\s*(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:async\s+)?(?:function|def|func)\s+([A-Za-z_]\w*)/); if (match) add(lineNumber, match[1], 'function');
    }
  }
  return output.slice(0, 500);
}

function fileCandidates(base) {
  const candidates = [base];
  if (!path.posix.extname(base)) {
    for (const ext of JS_EXTENSIONS) candidates.push(`${base}${ext}`);
    for (const ext of JS_EXTENSIONS) candidates.push(`${base}/index${ext}`);
    candidates.push(`${base}.json`);
  }
  return candidates;
}

function resolveFromCandidates(candidates, sourcePaths) {
  return candidates.find((candidate) => sourcePaths.has(candidate)) || null;
}

function resolveJavaScriptImport(fromFile, specifier, sourcePaths, aliasConfigs) {
  if (specifier.startsWith('.')) {
    const base = slash(path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier)));
    return resolveFromCandidates(fileCandidates(base), sourcePaths);
  }
  const applicable = aliasConfigs
    .filter((config) => fromFile === config.directory || fromFile.startsWith(`${config.directory}/`) || config.directory === '.')
    .sort((a, b) => b.directory.length - a.directory.length);
  for (const config of applicable) {
    for (const [alias, targets] of Object.entries(config.paths)) {
      const star = alias.indexOf('*');
      const prefix = star >= 0 ? alias.slice(0, star) : alias;
      const suffix = star >= 0 ? alias.slice(star + 1) : '';
      if (star < 0 && specifier !== alias) continue;
      if (star >= 0 && (!specifier.startsWith(prefix) || !specifier.endsWith(suffix))) continue;
      const capture = star >= 0 ? specifier.slice(prefix.length, specifier.length - suffix.length) : '';
      for (const target of targets) {
        const substituted = target.replace('*', capture);
        const base = slash(path.posix.normalize(path.posix.join(config.directory, config.baseUrl, substituted)));
        const resolved = resolveFromCandidates(fileCandidates(base), sourcePaths);
        if (resolved) return resolved;
      }
    }
  }
  return null;
}

function resolvePythonImport(fromFile, specifier, sourcePaths) {
  if (specifier.startsWith('.')) {
    const dots = specifier.match(/^\.+/)?.[0].length || 0;
    const moduleName = specifier.slice(dots).replaceAll('.', '/');
    let directory = path.posix.dirname(fromFile);
    for (let index = 1; index < dots; index += 1) directory = path.posix.dirname(directory);
    const base = path.posix.normalize(path.posix.join(directory, moduleName));
    return resolveFromCandidates([`${base}.py`, `${base}/__init__.py`], sourcePaths);
  }
  const modulePath = specifier.replaceAll('.', '/');
  const direct = resolveFromCandidates([`${modulePath}.py`, `${modulePath}/__init__.py`, `src/${modulePath}.py`, `src/${modulePath}/__init__.py`], sourcePaths);
  if (direct) return direct;
  const suffixes = [`/${modulePath}.py`, `/${modulePath}/__init__.py`];
  const matches = [...sourcePaths].filter((candidate) => suffixes.some((suffix) => candidate.endsWith(suffix)));
  return matches.length === 1 ? matches[0] : null;
}

function resolveGoImport(specifier, sourcePaths, goModules) {
  for (const module of goModules) {
    if (specifier !== module.name && !specifier.startsWith(`${module.name}/`)) continue;
    const suffix = specifier === module.name ? '' : specifier.slice(module.name.length + 1);
    const directory = slash(path.posix.join(module.directory, suffix));
    const files = [...sourcePaths].filter((candidate) => path.posix.dirname(candidate) === directory && candidate.endsWith('.go') && !candidate.endsWith('_test.go')).sort();
    if (files.length) return files[0];
  }
  return null;
}

function resolveRustImport(fromFile, specifier, sourcePaths, crateRoots) {
  const directory = path.posix.dirname(fromFile);
  if (specifier.startsWith('mod:')) {
    const name = specifier.slice(4);
    return resolveFromCandidates([`${directory}/${name}.rs`, `${directory}/${name}/mod.rs`], sourcePaths);
  }
  let baseDirectory = directory;
  let rest = specifier;
  if (specifier.startsWith('crate::')) {
    const crate = crateRoots.filter((root) => fromFile.startsWith(`${root}/`) || root === '.').sort((a, b) => b.length - a.length)[0] || '.';
    baseDirectory = crate === '.' ? 'src' : `${crate}/src`;
    rest = specifier.slice('crate::'.length);
  } else if (specifier.startsWith('self::')) rest = specifier.slice('self::'.length);
  else if (specifier.startsWith('super::')) { baseDirectory = path.posix.dirname(directory); rest = specifier.slice('super::'.length); }
  else return null;
  const segments = rest.split('::').filter(Boolean);
  if (!segments.length) return null;
  const base = path.posix.join(baseDirectory, ...segments);
  return resolveFromCandidates([`${base}.rs`, `${base}/mod.rs`], sourcePaths);
}

function isLocalSyntax(filePath, specifier, resolvers) {
  const ext = path.extname(filePath).toLowerCase();
  if (specifier.startsWith('.')) return true;
  if (ext === '.rs' && /^(?:mod:|crate::|self::|super::)/.test(specifier)) return true;
  if ((JS_EXTENSIONS.includes(ext) || ext === '.vue' || ext === '.svelte') && resolvers.aliasPrefixes.some((prefix) => specifier.startsWith(prefix))) return true;
  if (ext === '.go' && resolvers.goModules.some((module) => specifier === module.name || specifier.startsWith(`${module.name}/`))) return true;
  return false;
}

async function parseJsonc(filePath) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return JSON.parse(text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/,\s*([}\]])/g, '$1'));
  } catch { return null; }
}

async function loadResolvers(root, fileRecords) {
  const aliasConfigs = [];
  for (const file of fileRecords.filter((record) => /(^|\/)(?:tsconfig(?:\.[^/]+)?|jsconfig)\.json$/.test(record.path))) {
    const data = await parseJsonc(path.join(root, file.path));
    const paths = data?.compilerOptions?.paths;
    if (!paths || typeof paths !== 'object') continue;
    aliasConfigs.push({
      directory: path.posix.dirname(file.path) || '.',
      baseUrl: String(data.compilerOptions.baseUrl || '.').replace(/\\/g, '/'),
      paths: Object.fromEntries(Object.entries(paths).map(([key, value]) => [key, Array.isArray(value) ? value : [value]])),
    });
  }
  const goModules = [];
  for (const file of fileRecords.filter((record) => record.path === 'go.mod' || record.path.endsWith('/go.mod'))) {
    try {
      const text = await fs.readFile(path.join(root, file.path), 'utf8');
      const name = text.match(/^\s*module\s+([^\s]+)\s*$/m)?.[1];
      if (name) goModules.push({ name, directory: path.posix.dirname(file.path) || '.' });
    } catch {}
  }
  const crateRoots = fileRecords.filter((record) => record.path === 'Cargo.toml' || record.path.endsWith('/Cargo.toml')).map((record) => path.posix.dirname(record.path) || '.');
  const aliasPrefixes = aliasConfigs.flatMap((config) => Object.keys(config.paths).map((alias) => alias.split('*')[0])).filter(Boolean);
  return { aliasConfigs, aliasPrefixes, goModules, crateRoots };
}

function resolveImport(fromFile, specifier, sourcePaths, resolvers) {
  const ext = path.extname(fromFile).toLowerCase();
  if (JS_EXTENSIONS.includes(ext) || ext === '.vue' || ext === '.svelte') return resolveJavaScriptImport(fromFile, specifier, sourcePaths, resolvers.aliasConfigs);
  if (ext === '.py') return resolvePythonImport(fromFile, specifier, sourcePaths);
  if (ext === '.go') return resolveGoImport(specifier, sourcePaths, resolvers.goModules);
  if (ext === '.rs') return resolveRustImport(fromFile, specifier, sourcePaths, resolvers.crateRoots);
  return null;
}

export async function buildProjectGraph(root, fileRecords, config = {}, options = {}) {
  const started = performance.now();
  const maxGraphFiles = Number(config.maxGraphFiles) || 5_000;
  const maxSourceBytes = Number(config.maxSourceBytes) || 512_000;
  const candidates = fileRecords.filter((file) => SOURCE_EXTENSIONS.has(path.extname(file.path).toLowerCase()) && file.size <= maxSourceBytes);
  const sources = candidates.slice(0, maxGraphFiles);
  const sourcePaths = new Set(sources.map((file) => file.path));
  const previous = options.previousGraph?.parserVersion === PARSER_VERSION ? new Map(options.previousGraph.nodes.map((node) => [node.path, node])) : new Map();
  const resolvers = await loadResolvers(root, fileRecords);
  const nodes = [];
  let skippedUnsafeFiles = 0;
  let parsedFiles = 0;
  let reusedFiles = 0;
  for (const file of sources) {
    const fingerprint = file.fingerprint || `${file.size}:${file.modifiedAt}`;
    const cached = previous.get(file.path);
    let rawImports;
    let symbols;
    let language;
    if (cached?.fingerprint === fingerprint && Array.isArray(cached.rawImports) && Array.isArray(cached.symbols)) {
      rawImports = cached.rawImports;
      symbols = cached.symbols;
      language = cached.language;
      reusedFiles += 1;
    } else {
      const resolvedFile = await resolveProjectFile(root, file.path);
      if (!resolvedFile.ok) { skippedUnsafeFiles += 1; continue; }
      let content = '';
      try { content = await fs.readFile(resolvedFile.absolute, 'utf8'); } catch { continue; }
      rawImports = [...new Set(parseImports(file.path, content))];
      symbols = parseSymbols(file.path, content);
      language = sourceLanguage(file.path);
      parsedFiles += 1;
    }
    const workspace = workspaceForPath(file.path, options.workspaceReport);
    nodes.push({ path: file.path, language, size: file.size, modifiedAt: file.modifiedAt, fingerprint, workspace: workspace?.id || null, rawImports, imports: [], symbols });
  }

  for (const node of nodes) {
    node.imports = node.rawImports.map((specifier) => {
      const resolved = resolveImport(node.path, specifier, sourcePaths, resolvers);
      const localSyntax = isLocalSyntax(node.path, specifier, resolvers);
      return { specifier, resolved, external: !resolved && !localSyntax, unresolved: !resolved && localSyntax };
    });
  }

  const reverseDependents = {};
  for (const node of nodes) for (const item of node.imports) if (item.resolved) { reverseDependents[item.resolved] ||= []; reverseDependents[item.resolved].push(node.path); }
  for (const dependents of Object.values(reverseDependents)) dependents.sort();
  const localEdges = nodes.reduce((sum, node) => sum + node.imports.filter((item) => item.resolved).length, 0);
  const externalDependencies = [...new Set(nodes.flatMap((node) => node.imports.filter((item) => item.external).map((item) => item.specifier)))].sort();
  const unresolvedImports = nodes.reduce((sum, node) => sum + node.imports.filter((item) => item.unresolved).length, 0);
  const symbolCount = nodes.reduce((sum, node) => sum + node.symbols.length, 0);
  const workspaceByFile = new Map(nodes.map((node) => [node.path, node.workspace]));
  const crossWorkspaceEdges = nodes.reduce((sum, node) => sum + node.imports.filter((item) => item.resolved && node.workspace && workspaceByFile.get(item.resolved) && workspaceByFile.get(item.resolved) !== node.workspace).length, 0);
  const hubs = nodes.map((node) => ({ path: node.path, workspace: node.workspace, dependents: reverseDependents[node.path]?.length || 0, imports: node.imports.filter((item) => item.resolved).length, symbols: node.symbols.length })).sort((a, b) => b.dependents - a.dependents || b.imports - a.imports).slice(0, 20);
  const removedFiles = [...previous.keys()].filter((filePath) => !sourcePaths.has(filePath)).length;
  const durationMs = Number((performance.now() - started).toFixed(2));
  return {
    schemaVersion: 3,
    parserVersion: PARSER_VERSION,
    generatedAt: new Date().toISOString(),
    summary: {
      sourceFiles: nodes.length,
      localEdges,
      externalDependencies: externalDependencies.length,
      unresolvedImports,
      symbols: symbolCount,
      skippedUnsafeFiles,
      parsedFiles,
      reusedFiles,
      removedFiles,
      incremental: previous.size > 0,
      crossWorkspaceEdges,
      durationMs,
      truncated: candidates.length > maxGraphFiles,
    },
    externalDependencies,
    hubs,
    reverseDependents,
    nodes,
  };
}

export async function loadProjectGraph(root) {
  try { return JSON.parse(await fs.readFile(path.join(root, '.codex-memory', 'project-graph.json'), 'utf8')); } catch { return null; }
}

export async function impactAnalysis(root, target, maxDepth = 3) {
  const graph = await loadProjectGraph(root);
  if (!graph) return { found: false, reason: 'Project graph is missing. Run cmi scan.' };
  const query = String(target || '').trim().toLowerCase();
  if (!query) throw new Error('Impact target cannot be empty');
  const fileMatches = graph.nodes.filter((node) => node.path.toLowerCase() === query || node.path.toLowerCase().endsWith(`/${query}`) || node.path.toLowerCase().includes(query));
  const symbolMatches = graph.nodes.flatMap((node) => node.symbols.filter((symbol) => symbol.name.toLowerCase() === query || symbol.name.toLowerCase().includes(query)).map((symbol) => ({ ...symbol, path: node.path, workspace: node.workspace })));
  const seeds = [...new Set([...fileMatches.map((node) => node.path), ...symbolMatches.map((symbol) => symbol.path)])];
  if (!seeds.length) return { found: false, target, reason: 'No matching file or symbol in the current graph.' };
  const visited = new Set(seeds);
  let frontier = [...seeds];
  const levels = [];
  for (let depth = 1; depth <= Math.max(1, Math.min(8, maxDepth)); depth += 1) {
    const next = [...new Set(frontier.flatMap((file) => graph.reverseDependents[file] || []))].filter((file) => !visited.has(file));
    if (!next.length) break;
    for (const file of next) visited.add(file);
    levels.push({ depth, files: next.sort() });
    frontier = next;
  }
  const affectedFiles = levels.flatMap((level) => level.files);
  const workspaceMap = new Map(graph.nodes.map((node) => [node.path, node.workspace]));
  const affectedWorkspaces = [...new Set([...seeds, ...affectedFiles].map((file) => workspaceMap.get(file)).filter(Boolean))].sort();
  return { found: true, target, matchedFiles: fileMatches.map((node) => node.path), matchedSymbols: symbolMatches.slice(0, 50), directDependents: levels[0]?.files || [], affectedFiles, affectedWorkspaces, levels };
}

export function formatImpact(result) {
  if (!result.found) return result.reason;
  const symbolText = result.matchedSymbols.length ? result.matchedSymbols.map((item) => `- ${item.name} (${item.kind}) in \`${item.path}:${item.line}\``).join('\n') : '- None';
  const levelText = result.levels.length ? result.levels.map((level) => `### Depth ${level.depth}\n${level.files.map((file) => `- \`${file}\``).join('\n')}`).join('\n\n') : 'No dependent files found.';
  const workspaceText = result.affectedWorkspaces?.length ? result.affectedWorkspaces.map((workspace) => `- ${workspace}`).join('\n') : '- None detected';
  return `# Impact analysis: ${result.target}\n\n## Matched files\n${result.matchedFiles.map((file) => `- \`${file}\``).join('\n') || '- None'}\n\n## Matched symbols\n${symbolText}\n\n## Affected workspaces\n${workspaceText}\n\n## Dependents\n${levelText}`;
}
