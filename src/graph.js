import fs from 'node:fs/promises';
import path from 'node:path';

const SOURCE_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx',
  '.py', '.go', '.rs', '.java', '.kt', '.php', '.rb', '.swift',
  '.vue', '.svelte',
]);

const JS_EXTENSIONS = ['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx'];

function slash(value) {
  return value.split(path.sep).join('/');
}

function sourceLanguage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (JS_EXTENSIONS.includes(ext)) return ext.includes('t') ? 'TypeScript' : 'JavaScript';
  return ({
    '.py': 'Python', '.go': 'Go', '.rs': 'Rust', '.java': 'Java', '.kt': 'Kotlin',
    '.php': 'PHP', '.rb': 'Ruby', '.swift': 'Swift', '.vue': 'Vue', '.svelte': 'Svelte',
  })[ext] || 'Other';
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
  const imports = [];
  for (const match of content.matchAll(/(?:^|\s)["']([^"']+)["']/gm)) imports.push(match[1]);
  return imports;
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
  if (ext === '.rs') return [...content.matchAll(/^\s*(?:use|mod)\s+([^;{]+)/gm)].map((match) => match[1].trim());
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
      match = line.match(/^\s*(export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/);
      if (match) add(lineNumber, match[2], 'function', Boolean(match[1]));
      match = line.match(/^\s*(export\s+)?(?:default\s+)?class\s+([A-Za-z_$][\w$]*)/);
      if (match) add(lineNumber, match[2], 'class', Boolean(match[1]));
      match = line.match(/^\s*(export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/);
      if (match) add(lineNumber, match[2], 'variable', Boolean(match[1]));
      match = line.match(/^\s*export\s+(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/);
      if (match) add(lineNumber, match[1], 'type', true);
    } else if (ext === '.py') {
      match = line.match(/^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/);
      if (match) add(lineNumber, match[1], 'function');
      match = line.match(/^\s*class\s+([A-Za-z_]\w*)/);
      if (match) add(lineNumber, match[1], 'class');
    } else if (ext === '.go') {
      match = line.match(/^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/);
      if (match) add(lineNumber, match[1], 'function', /^[A-Z]/.test(match[1]));
      match = line.match(/^\s*type\s+([A-Za-z_]\w*)\s+/);
      if (match) add(lineNumber, match[1], 'type', /^[A-Z]/.test(match[1]));
    } else if (ext === '.rs') {
      match = line.match(/^\s*(pub\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)/);
      if (match) add(lineNumber, match[2], 'function', Boolean(match[1]));
      match = line.match(/^\s*(pub\s+)?(?:struct|enum|trait)\s+([A-Za-z_]\w*)/);
      if (match) add(lineNumber, match[2], 'type', Boolean(match[1]));
    } else {
      match = line.match(/^\s*(?:public\s+|private\s+|protected\s+)?(?:class|interface|enum|struct)\s+([A-Za-z_]\w*)/);
      if (match) add(lineNumber, match[1], 'type');
      match = line.match(/^\s*(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:async\s+)?(?:function|def|func)\s+([A-Za-z_]\w*)/);
      if (match) add(lineNumber, match[1], 'function');
    }
  }
  return output.slice(0, 500);
}

function resolveJavaScriptImport(fromFile, specifier, sourcePaths) {
  if (!specifier.startsWith('.')) return null;
  const base = slash(path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier)));
  const candidates = [base];
  if (!path.posix.extname(base)) {
    for (const ext of JS_EXTENSIONS) candidates.push(`${base}${ext}`);
    for (const ext of JS_EXTENSIONS) candidates.push(`${base}/index${ext}`);
    candidates.push(`${base}.json`);
  }
  return candidates.find((candidate) => sourcePaths.has(candidate)) || null;
}

function resolvePythonImport(fromFile, specifier, sourcePaths) {
  if (!specifier.startsWith('.')) return null;
  const dots = specifier.match(/^\.+/)?.[0].length || 0;
  const moduleName = specifier.slice(dots).replaceAll('.', '/');
  let directory = path.posix.dirname(fromFile);
  for (let index = 1; index < dots; index += 1) directory = path.posix.dirname(directory);
  const base = path.posix.normalize(path.posix.join(directory, moduleName));
  const candidates = [`${base}.py`, `${base}/__init__.py`];
  return candidates.find((candidate) => sourcePaths.has(candidate)) || null;
}

function resolveImport(fromFile, specifier, sourcePaths) {
  const ext = path.extname(fromFile).toLowerCase();
  if (JS_EXTENSIONS.includes(ext) || ext === '.vue' || ext === '.svelte') return resolveJavaScriptImport(fromFile, specifier, sourcePaths);
  if (ext === '.py') return resolvePythonImport(fromFile, specifier, sourcePaths);
  return null;
}

export async function buildProjectGraph(root, fileRecords, config = {}) {
  const maxGraphFiles = Number(config.maxGraphFiles) || 5_000;
  const maxSourceBytes = Number(config.maxSourceBytes) || 512_000;
  const sources = fileRecords
    .filter((file) => SOURCE_EXTENSIONS.has(path.extname(file.path).toLowerCase()) && file.size <= maxSourceBytes)
    .slice(0, maxGraphFiles);
  const sourcePaths = new Set(sources.map((file) => file.path));
  const nodes = [];

  for (const file of sources) {
    let content = '';
    try { content = await fs.readFile(path.join(root, file.path), 'utf8'); } catch { continue; }
    const imports = [...new Set(parseImports(file.path, content))].map((specifier) => {
      const resolved = resolveImport(file.path, specifier, sourcePaths);
      const localSyntax = specifier.startsWith('.') || specifier.startsWith('crate::') || specifier.startsWith('self::') || specifier.startsWith('super::');
      return { specifier, resolved, external: !resolved && !localSyntax, unresolved: !resolved && localSyntax };
    });
    nodes.push({
      path: file.path,
      language: sourceLanguage(file.path),
      size: file.size,
      modifiedAt: file.modifiedAt,
      imports,
      symbols: parseSymbols(file.path, content),
    });
  }

  const reverseDependents = {};
  for (const node of nodes) {
    for (const item of node.imports) {
      if (!item.resolved) continue;
      reverseDependents[item.resolved] ||= [];
      reverseDependents[item.resolved].push(node.path);
    }
  }
  for (const dependents of Object.values(reverseDependents)) dependents.sort();

  const localEdges = nodes.reduce((sum, node) => sum + node.imports.filter((item) => item.resolved).length, 0);
  const externalDependencies = [...new Set(nodes.flatMap((node) => node.imports.filter((item) => item.external).map((item) => item.specifier)))].sort();
  const unresolvedImports = nodes.reduce((sum, node) => sum + node.imports.filter((item) => item.unresolved).length, 0);
  const symbolCount = nodes.reduce((sum, node) => sum + node.symbols.length, 0);
  const hubs = nodes
    .map((node) => ({ path: node.path, dependents: reverseDependents[node.path]?.length || 0, imports: node.imports.filter((item) => item.resolved).length, symbols: node.symbols.length }))
    .sort((a, b) => b.dependents - a.dependents || b.imports - a.imports)
    .slice(0, 20);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    summary: {
      sourceFiles: nodes.length,
      localEdges,
      externalDependencies: externalDependencies.length,
      unresolvedImports,
      symbols: symbolCount,
      truncated: sources.length >= maxGraphFiles,
    },
    externalDependencies,
    hubs,
    reverseDependents,
    nodes,
  };
}

export async function loadProjectGraph(root) {
  try { return JSON.parse(await fs.readFile(path.join(root, '.codex-memory', 'project-graph.json'), 'utf8')); }
  catch { return null; }
}

export async function impactAnalysis(root, target, maxDepth = 3) {
  const graph = await loadProjectGraph(root);
  if (!graph) return { found: false, reason: 'Project graph is missing. Run cmi scan.' };
  const query = String(target || '').trim().toLowerCase();
  if (!query) throw new Error('Impact target cannot be empty');
  const fileMatches = graph.nodes.filter((node) => node.path.toLowerCase() === query || node.path.toLowerCase().endsWith(`/${query}`) || node.path.toLowerCase().includes(query));
  const symbolMatches = graph.nodes.flatMap((node) => node.symbols.filter((symbol) => symbol.name.toLowerCase() === query || symbol.name.toLowerCase().includes(query)).map((symbol) => ({ ...symbol, path: node.path })));
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

  return {
    found: true,
    target,
    matchedFiles: fileMatches.map((node) => node.path),
    matchedSymbols: symbolMatches.slice(0, 50),
    directDependents: levels[0]?.files || [],
    affectedFiles: levels.flatMap((level) => level.files),
    levels,
  };
}

export function formatImpact(result) {
  if (!result.found) return result.reason;
  const symbolText = result.matchedSymbols.length
    ? result.matchedSymbols.map((item) => `- ${item.name} (${item.kind}) in \`${item.path}:${item.line}\``).join('\n')
    : '- None';
  const levelText = result.levels.length
    ? result.levels.map((level) => `### Depth ${level.depth}\n${level.files.map((file) => `- \`${file}\``).join('\n')}`).join('\n\n')
    : 'No dependent files found.';
  return `# Impact analysis: ${result.target}\n\n## Matched files\n${result.matchedFiles.map((file) => `- \`${file}\``).join('\n') || '- None'}\n\n## Matched symbols\n${symbolText}\n\n## Dependents\n${levelText}`;
}
