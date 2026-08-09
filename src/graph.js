import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { resolveProjectFile, slash } from './paths.js';
import { workspaceForPath } from './workspaces.js';
import { createIgnoreMatcher } from './ignore.js';
import { safeReadMemoryJson, DEFAULT_MAX_GENERATED_CACHE_BYTES } from './storage.js';
import { inspectProjectConfig } from './config.js';

const SOURCE_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx',
  '.py', '.go', '.rs', '.java', '.kt', '.php', '.rb', '.swift',
  '.vue', '.svelte',
]);
const JS_EXTENSIONS = ['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx'];
export const GRAPH_PARSER_VERSION = 4;
export const GRAPH_SCHEMA_VERSION = 4;
export const PROJECT_INDEX_SCHEMA_VERSION = 5;
const FRESHNESS_VERSION = 1;
export const RESOLVER_INPUT = /(^|\/)(?:tsconfig(?:\.[^/]+)?|jsconfig)\.json$|(^|\/)go\.mod$|(^|\/)Cargo\.toml$/;
export const WORKSPACE_INPUT = /(^|\/)(?:package\.json|pnpm-workspace\.yaml|go\.work|go\.mod|Cargo\.toml)$/;
const DEFAULT_SCAN_CONFIG = {
  maxFileBytes: 1_000_000,
  maxSourceBytes: 512_000,
  maxGraphFiles: 5_000,
  includeHidden: false,
  workspaceDetection: true,
  ignorePatterns: [],
};

function sourceLanguage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (JS_EXTENSIONS.includes(ext)) return ext.includes('t') ? 'TypeScript' : 'JavaScript';
  return ({ '.py':'Python','.go':'Go','.rs':'Rust','.java':'Java','.kt':'Kotlin','.php':'PHP','.rb':'Ruby','.swift':'Swift','.vue':'Vue','.svelte':'Svelte' })[ext] || 'Other';
}

function javascriptCodeMask(content) {
  const mask = new Uint8Array(content.length);
  let state = 'code';
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];
    if (state === 'code') {
      if (char === '/' && next === '/') { state = 'line-comment'; index += 1; continue; }
      if (char === '/' && next === '*') { state = 'block-comment'; index += 1; continue; }
      if (char === "'") { state = 'single'; continue; }
      if (char === '"') { state = 'double'; continue; }
      if (char === '`') { state = 'template'; continue; }
      mask[index] = 1;
      continue;
    }
    if (state === 'line-comment') {
      if (char === '\n') { state = 'code'; mask[index] = 1; }
      continue;
    }
    if (state === 'block-comment') {
      if (char === '*' && next === '/') { state = 'code'; index += 1; }
      continue;
    }
    if (char === '\\') { index += 1; continue; }
    if ((state === 'single' && char === "'") || (state === 'double' && char === '"') || (state === 'template' && char === '`')) state = 'code';
  }
  return mask;
}

function parseJavaScriptImports(content) {
  const imports = [];
  const codeMask = javascriptCodeMask(content);
  const pattern = /(?:\bimport\s+(?:[^'";]*?\s+from\s+)?|\bexport\s+[^'";]*?\s+from\s+|\bimport\s*\(\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;
  for (const match of content.matchAll(pattern)) if (codeMask[match.index]) imports.push(match[1]);
  return imports;
}

function parsePythonImports(content) {
  const imports = [];
  for (const line of content.split('\n')) {
    let match = line.match(/^\s*from\s+([.\w]+)\s+import\s+(.+)/);
    if (match) {
      const module = match[1];
      if (/^\.+$/.test(module)) {
        const names = match[2].replace(/[()]/g, '').split(',').map((value) => value.trim().split(/\s+as\s+/)[0]).filter((value) => /^[A-Za-z_]\w*$/.test(value));
        for (const name of names) imports.push(`${module}${name}`);
      } else imports.push(module);
    }
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
        const substituted = target.replaceAll('*', capture);
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
  for (let length = segments.length; length >= 1; length -= 1) {
    const base = path.posix.join(baseDirectory, ...segments.slice(0, length));
    const resolved = resolveFromCandidates([`${base}.rs`, `${base}/mod.rs`], sourcePaths);
    if (resolved) return resolved;
  }
  return null;
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

function normalizedScanConfig(config = {}) {
  return {
    maxFileBytes: Number(config.maxFileBytes) || DEFAULT_SCAN_CONFIG.maxFileBytes,
    maxSourceBytes: Number(config.maxSourceBytes) || DEFAULT_SCAN_CONFIG.maxSourceBytes,
    maxGraphFiles: Number(config.maxGraphFiles) || DEFAULT_SCAN_CONFIG.maxGraphFiles,
    includeHidden: Boolean(config.includeHidden),
    workspaceDetection: config.workspaceDetection !== false,
    ignorePatterns: Array.isArray(config.ignorePatterns) ? config.ignorePatterns.map(String) : [],
  };
}

function hashValue(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

function hashRecords(records, includeFingerprint = true) {
  const lines = [...records]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((record) => includeFingerprint ? `${record.path}:${record.fingerprint || ''}` : record.path);
  return hashValue(lines.join('\n'));
}

async function ignoreFileFingerprint(root) {
  try {
    const stat = await fs.lstat(path.join(root, '.cmiignore'));
    if (!stat.isFile() || stat.isSymbolicLink()) return 'unsafe';
    return `${stat.size}:${Math.trunc(stat.mtimeMs)}:${Math.trunc(stat.ctimeMs)}`;
  } catch (error) {
    return error?.code === 'ENOENT' ? null : 'unreadable';
  }
}

async function buildFreshnessDescriptor(root, fileRecords, config = {}) {
  const normalized = normalizedScanConfig(config);
  const sourceCandidates = fileRecords.filter((file) => SOURCE_EXTENSIONS.has(path.extname(file.path).toLowerCase()) && file.size <= normalized.maxSourceBytes);
  const resolverInputs = fileRecords.filter((file) => RESOLVER_INPUT.test(file.path));
  const workspaceInputs = fileRecords.filter((file) => WORKSPACE_INPUT.test(file.path));
  return {
    version: FRESHNESS_VERSION,
    sourceSetCount: sourceCandidates.length,
    sourceSetHash: hashRecords(sourceCandidates, false),
    resolverInputsHash: hashRecords(resolverInputs, true),
    workspaceInputsHash: hashRecords(workspaceInputs, true),
    scanConfigHash: hashValue(normalized),
    ignoreFileFingerprint: await ignoreFileFingerprint(root),
  };
}

async function discoverGraphFileRecords(root, config = {}) {
  const normalized = normalizedScanConfig(config);
  const matcher = await createIgnoreMatcher(root, normalized);
  const records = [];
  let unreadable = 0;
  let unsafeSymlinks = 0;
  async function visit(current) {
    let entries;
    try { entries = await fs.readdir(current, { withFileTypes: true }); }
    catch { unreadable += 1; return; }
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      const relative = slash(path.relative(root, absolute));
      if (matcher.shouldIgnore(relative, entry.isDirectory())) continue;
      if (entry.isSymbolicLink()) { unsafeSymlinks += 1; continue; }
      let stat;
      try { stat = await fs.lstat(absolute); }
      catch { unreadable += 1; continue; }
      if (stat.isSymbolicLink()) { unsafeSymlinks += 1; continue; }
      if (stat.isDirectory()) await visit(absolute);
      else if (stat.isFile() && stat.size <= normalized.maxFileBytes) records.push({
        path: relative,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        fingerprint: `${stat.size}:${Math.trunc(stat.mtimeMs)}:${Math.trunc(stat.ctimeMs)}`,
      });
    }
  }
  await visit(root);
  return { records, unreadable, unsafeSymlinks };
}

export async function buildProjectGraph(root, fileRecords, config = {}, options = {}) {
  const started = performance.now();
  const maxGraphFiles = Number(config.maxGraphFiles) || 5_000;
  const maxSourceBytes = Number(config.maxSourceBytes) || 512_000;
  const candidates = fileRecords.filter((file) => SOURCE_EXTENSIONS.has(path.extname(file.path).toLowerCase()) && file.size <= maxSourceBytes);
  const sources = candidates.slice(0, maxGraphFiles);
  const sourcePaths = new Set(sources.map((file) => file.path));
  const previous = options.previousGraph?.schemaVersion === GRAPH_SCHEMA_VERSION
    && options.previousGraph?.parserVersion === GRAPH_PARSER_VERSION
    ? new Map(options.previousGraph.nodes.map((node) => [node.path, node]))
    : new Map();
  const resolvers = await loadResolvers(root, fileRecords);
  const freshness = await buildFreshnessDescriptor(root, fileRecords, config);
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
    schemaVersion: GRAPH_SCHEMA_VERSION,
    parserVersion: GRAPH_PARSER_VERSION,
    generatedAt: new Date().toISOString(),
    freshness,
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
  try { return await safeReadMemoryJson(root, 'project-graph.json', { optional: true, maxBytes: DEFAULT_MAX_GENERATED_CACHE_BYTES }); } catch { return null; }
}

function versionState(value, supported) {
  if (!Number.isInteger(value)) return 'unknown';
  if (value === supported) return 'current';
  return value > supported ? 'unsupported' : 'obsolete';
}

function combinedGraphFormat(graph) {
  if (!graph) return { state: 'missing', schemaVersion: null, parserVersion: null };
  const schemaVersion = Number.isInteger(graph.schemaVersion) ? graph.schemaVersion : null;
  const parserVersion = Number.isInteger(graph.parserVersion) ? graph.parserVersion : null;
  const schemaState = versionState(schemaVersion, GRAPH_SCHEMA_VERSION);
  const parserState = versionState(parserVersion, GRAPH_PARSER_VERSION);
  const state = [schemaState, parserState].includes('unsupported')
    ? 'unsupported'
    : [schemaState, parserState].includes('obsolete')
      ? 'obsolete'
      : [schemaState, parserState].includes('unknown')
        ? 'unknown'
        : 'current';
  return { state, schemaVersion, parserVersion, schemaState, parserState };
}

export async function inspectGeneratedFormats(root, suppliedGraph = undefined) {
  const graph = suppliedGraph === undefined ? await loadProjectGraph(root) : suppliedGraph;
  const index = await safeReadMemoryJson(root, 'project-index.json', { optional: true, maxBytes: DEFAULT_MAX_GENERATED_CACHE_BYTES }).catch(() => null);
  const graphFormat = combinedGraphFormat(graph);
  const indexVersion = Number.isInteger(index?.schemaVersion) ? index.schemaVersion : null;
  const indexState = index ? versionState(indexVersion, PROJECT_INDEX_SCHEMA_VERSION) : 'missing';
  const unsupported = graphFormat.state === 'unsupported' || indexState === 'unsupported';
  const unsupportedParts = [
    graphFormat.state === 'unsupported' ? `project graph schema/parser ${graphFormat.schemaVersion ?? 'unknown'}/${graphFormat.parserVersion ?? 'unknown'}` : null,
    indexState === 'unsupported' ? `project index schema ${indexVersion ?? 'unknown'}` : null,
  ].filter(Boolean);
  const reason = unsupported
    ? `Generated intelligence is newer than this CMI version (${unsupportedParts.join(', ')}). Normal scan is blocked; use a compatible/newer CMI version, or preserve and explicitly remove the unsupported generated files before rebuilding.`
    : null;
  return {
    state: unsupported ? 'unsupported' : 'supported',
    current: graphFormat.state === 'current' && indexState === 'current',
    scanAllowed: !unsupported,
    code: unsupported ? 'CMI_GENERATED_VERSION_UNSUPPORTED' : null,
    reason,
    graph: graphFormat,
    index: { state: indexState, schemaVersion: indexVersion, available: Boolean(index) },
  };
}

export async function assertGeneratedFormatsWritable(root) {
  const compatibility = await inspectGeneratedFormats(root);
  if (compatibility.scanAllowed) return compatibility;
  const error = new Error(compatibility.reason);
  error.code = compatibility.code;
  error.details = compatibility;
  throw error;
}

function graphFingerprintMatches(stat, fingerprint) {
  if (!stat || typeof fingerprint !== 'string') return false;
  const [size, mtimeMs, ctimeMs] = fingerprint.split(':').map(Number);
  if (![size, mtimeMs, ctimeMs].every(Number.isFinite)) return false;
  return stat.size === size && Math.trunc(stat.mtimeMs) === mtimeMs && Math.trunc(stat.ctimeMs) === ctimeMs;
}

export async function inspectProjectGraphHealth(root, suppliedGraph = null) {
  const graph = suppliedGraph || await loadProjectGraph(root);
  const [configuration, generated] = await Promise.all([
    inspectProjectConfig(root),
    inspectGeneratedFormats(root, graph),
  ]);
  const scanAllowed = configuration.usable && generated.scanAllowed;
  const blockedReason = !configuration.usable ? configuration.reason : generated.reason;
  if (!graph) return {
    available: false,
    totalNodes: 0,
    freshNodes: 0,
    staleNodes: 0,
    missingNodes: 0,
    truncated: false,
    current: false,
    complete: false,
    healthy: false,
    state: scanAllowed ? 'missing' : 'unsupported',
    formatStatus: 'missing',
    rebuildRequired: false,
    scanAllowed,
    blockedReason,
    generatedState: generated.state,
    configurationState: configuration.state,
  };
  const schemaVersion = generated.graph.schemaVersion;
  const formatStatus = generated.graph.state;
  let freshNodes = 0;
  let staleNodes = 0;
  let missingNodes = 0;
  for (const node of graph.nodes || []) {
    let stat = null;
    try { stat = await fs.lstat(path.join(root, node.path)); } catch {}
    if (!stat?.isFile() || stat.isSymbolicLink()) { missingNodes += 1; continue; }
    if (!graphFingerprintMatches(stat, node.fingerprint)) { staleNodes += 1; continue; }
    freshNodes += 1;
  }

  let currentFreshness = null;
  let discoveryUnreadable = 0;
  let freshnessError = null;
  try {
    if (!configuration.usable) throw Object.assign(new Error(configuration.reason), { code: configuration.code });
    const discovery = await discoverGraphFileRecords(root, configuration.config);
    discoveryUnreadable = discovery.unreadable;
    currentFreshness = await buildFreshnessDescriptor(root, discovery.records, configuration.config);
  } catch (error) {
    freshnessError = error?.code || 'CMI_GRAPH_FRESHNESS_FAILED';
  }
  const storedFreshness = graph.freshness?.version === FRESHNESS_VERSION ? graph.freshness : null;
  const freshnessUnknown = !storedFreshness || !currentFreshness || Boolean(freshnessError);
  const sourceSetChanged = Boolean(storedFreshness && currentFreshness && (storedFreshness.sourceSetHash !== currentFreshness.sourceSetHash || storedFreshness.sourceSetCount !== currentFreshness.sourceSetCount));
  const resolverInputsChanged = Boolean(storedFreshness && currentFreshness && storedFreshness.resolverInputsHash !== currentFreshness.resolverInputsHash);
  const workspaceInputsChanged = Boolean(storedFreshness && currentFreshness && storedFreshness.workspaceInputsHash !== currentFreshness.workspaceInputsHash);
  const scanConfigChanged = Boolean(storedFreshness && currentFreshness && (storedFreshness.scanConfigHash !== currentFreshness.scanConfigHash || storedFreshness.ignoreFileFingerprint !== currentFreshness.ignoreFileFingerprint));
  const discoveryChanged = freshnessUnknown || sourceSetChanged || resolverInputsChanged || workspaceInputsChanged || scanConfigChanged || discoveryUnreadable > 0;
  const truncated = Boolean(graph.summary?.truncated);
  const current = scanAllowed && formatStatus === 'current' && staleNodes === 0 && missingNodes === 0 && !discoveryChanged;
  const complete = !truncated;
  const healthy = current && complete;
  const state = !scanAllowed ? 'unsupported' : !current ? 'stale' : !complete ? 'incomplete' : 'healthy';
  const rebuildRequired = scanAllowed && ['obsolete', 'unknown'].includes(formatStatus);
  return {
    available: true,
    totalNodes: (graph.nodes || []).length,
    freshNodes,
    staleNodes,
    missingNodes,
    truncated,
    current,
    complete,
    healthy,
    state,
    schemaVersion,
    formatStatus,
    parserVersion: generated.graph.parserVersion,
    rebuildRequired,
    scanAllowed,
    blockedReason,
    generatedState: generated.state,
    configurationState: configuration.state,
    formatReason: !scanAllowed
      ? blockedReason
      : formatStatus === 'obsolete'
        ? `Project graph format ${schemaVersion}/${generated.graph.parserVersion ?? 'unknown'} is obsolete; rebuild generated intelligence with cmi scan.`
        : formatStatus === 'unknown'
          ? 'Project graph format is missing or unknown; rebuild generated intelligence with cmi scan.'
          : null,
    sourceSetChanged,
    resolverInputsChanged,
    workspaceInputsChanged,
    scanConfigChanged,
    freshnessUnknown,
    discoveryUnreadable,
    freshnessError,
  };
}

export async function impactAnalysis(root, target, maxDepth = 3) {
  const graph = await loadProjectGraph(root);
  const graphHealth = await inspectProjectGraphHealth(root, graph);
  if (!graph) return {
    found: false,
    blocked: true,
    reason: graphHealth.scanAllowed === false ? graphHealth.blockedReason : 'Project graph is missing. Run cmi scan.',
    graphHealth,
    recommendedAction: { command: graphHealth.scanAllowed === false ? null : 'cmi scan', reason: graphHealth.scanAllowed === false ? graphHealth.blockedReason : 'Build the project graph before relying on impact analysis.' },
  };
  if (!graphHealth.current) return {
    found: false,
    blocked: true,
    reason: graphHealth.rebuildRequired
      ? graphHealth.formatReason
      : 'Project graph is stale or repository discovery inputs changed. Run cmi scan before relying on impact analysis.',
    graphHealth,
    recommendedAction: {
      command: graphHealth.scanAllowed === false ? null : 'cmi scan',
      reason: graphHealth.scanAllowed === false
        ? graphHealth.blockedReason || graphHealth.formatReason
        : graphHealth.rebuildRequired ? graphHealth.formatReason : 'Source fingerprints, source set, resolver/workspace inputs, or scan configuration no longer match the stored graph.',
    },
  };
  const warnings = graphHealth.complete ? [] : ['Impact coverage is incomplete because the project graph is truncated.'];
  const query = String(target || '').trim().toLowerCase();
  if (!query) throw new Error('Impact target cannot be empty');
  const fileMatches = graph.nodes.filter((node) => node.path.toLowerCase() === query || node.path.toLowerCase().endsWith(`/${query}`) || node.path.toLowerCase().includes(query));
  const symbolMatches = graph.nodes.flatMap((node) => node.symbols.filter((symbol) => symbol.name.toLowerCase() === query || symbol.name.toLowerCase().includes(query)).map((symbol) => ({ ...symbol, path: node.path, workspace: node.workspace })));
  const seeds = [...new Set([...fileMatches.map((node) => node.path), ...symbolMatches.map((symbol) => symbol.path)])];
  if (!seeds.length) return { found: false, target, reason: graphHealth.complete ? 'No matching file or symbol in the current graph.' : 'No matching file or symbol in the incomplete project graph.', graphHealth, warnings };
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
  return { found: true, target, matchedFiles: fileMatches.map((node) => node.path), matchedSymbols: symbolMatches.slice(0, 50), directDependents: levels[0]?.files || [], affectedFiles, affectedWorkspaces, levels, graphHealth, warnings, evidenceStatus: graphHealth.complete ? 'current' : 'incomplete' };
}

export function formatImpact(result) {
  const warnings = result.warnings?.length ? `\n\n## Evidence warnings\n${result.warnings.map((warning) => `- ${warning}`).join('\n')}` : '';
  if (!result.found) return `${result.reason}${warnings}`;
  const symbolText = result.matchedSymbols.length ? result.matchedSymbols.map((item) => `- ${item.name} (${item.kind}) in \`${item.path}:${item.line}\``).join('\n') : '- None';
  const levelText = result.levels.length ? result.levels.map((level) => `### Depth ${level.depth}\n${level.files.map((file) => `- \`${file}\``).join('\n')}`).join('\n\n') : 'No dependent files found.';
  const workspaceText = result.affectedWorkspaces?.length ? result.affectedWorkspaces.map((workspace) => `- ${workspace}`).join('\n') : '- None detected';
  return `# Impact analysis: ${result.target}\n\nEvidence: ${result.evidenceStatus || 'current'}${warnings}\n\n## Matched files\n${result.matchedFiles.map((file) => `- \`${file}\``).join('\n') || '- None'}\n\n## Matched symbols\n${symbolText}\n\n## Affected workspaces\n${workspaceText}\n\n## Dependents\n${levelText}`;
}
