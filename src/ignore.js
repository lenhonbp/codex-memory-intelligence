import fs from 'node:fs/promises';
import path from 'node:path';
import { slash } from './paths.js';

const BUILTIN_NAMES = new Set([
  '.git', '.codex-memory', 'node_modules', 'dist', 'build', '.next', '.cache',
  'coverage', '.wrangler', '.turbo', '.vercel', '.DS_Store',
]);
const ROOT_HIDDEN_ALLOW = new Set(['.github', '.cmiignore']);

function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function globBody(pattern) {
  let output = '';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === '*') {
      if (pattern[index + 1] === '*') {
        while (pattern[index + 1] === '*') index += 1;
        if (pattern[index + 1] === '/') {
          index += 1;
          output += '(?:.*/)?';
        } else output += '.*';
      } else output += '[^/]*';
    } else if (char === '?') output += '[^/]';
    else output += escapeRegex(char);
  }
  return output;
}

export function normalizeIgnorePath(value) {
  return slash(String(value || '')).replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+$/, '');
}

export function parseIgnoreRules(content, source = '.cmiignore') {
  const rules = [];
  const lines = String(content || '').split(/\r?\n/);
  for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
    let raw = lines[lineNumber].trim();
    if (!raw || raw.startsWith('#')) continue;
    if (raw.startsWith('\\#') || raw.startsWith('\\!')) raw = raw.slice(1);
    let negated = false;
    if (raw.startsWith('!')) {
      negated = true;
      raw = raw.slice(1);
    }
    const directoryOnly = raw.endsWith('/');
    const anchored = raw.startsWith('/');
    const pattern = normalizeIgnorePath(raw);
    if (!pattern) continue;
    const containsSlash = pattern.includes('/');
    const body = globBody(pattern);
    const prefix = anchored || containsSlash ? '^' : '(?:^|.*/)';
    const suffix = directoryOnly ? '(?:/.*)?$' : '$';
    rules.push({
      source,
      line: lineNumber + 1,
      raw: lines[lineNumber],
      pattern,
      negated,
      directoryOnly,
      regex: new RegExp(`${prefix}${body}${suffix}`),
    });
  }
  return rules;
}

function builtinReason(relative, includeHidden) {
  const segments = normalizeIgnorePath(relative).split('/').filter(Boolean);
  const builtin = segments.find((segment) => BUILTIN_NAMES.has(segment));
  if (builtin) return { ignored: true, locked: true, source: 'built-in', pattern: builtin, reason: `Built-in generated or dependency path: ${builtin}` };
  const hiddenIndex = segments.findIndex((segment) => segment.startsWith('.'));
  const allowedRootHidden = hiddenIndex === 0 && ROOT_HIDDEN_ALLOW.has(segments[0]);
  if (!includeHidden && hiddenIndex >= 0 && !allowedRootHidden) {
    return { ignored: true, locked: true, source: 'built-in', pattern: 'hidden path', reason: 'Hidden paths are excluded unless includeHidden is enabled; .github and .cmiignore remain available by default.' };
  }
  return null;
}

export async function createIgnoreMatcher(root, config = {}) {
  let fileContent = '';
  try { fileContent = await fs.readFile(path.join(root, '.cmiignore'), 'utf8'); } catch {}
  const fileRules = parseIgnoreRules(fileContent, '.cmiignore');
  const configRules = parseIgnoreRules((config.ignorePatterns || []).join('\n'), '.codex-memory/config.json');
  const rules = [...fileRules, ...configRules];

  function explain(candidate, isDirectory = false) {
    const relative = normalizeIgnorePath(candidate);
    const builtIn = builtinReason(relative, Boolean(config.includeHidden));
    if (builtIn) return { ...builtIn, path: relative };
    let decision = { ignored: false, source: null, pattern: null, reason: 'No ignore rule matched.', path: relative };
    for (const rule of rules) {
      if (rule.directoryOnly && !isDirectory && !relative.includes('/')) continue;
      if (!rule.regex.test(relative)) continue;
      decision = {
        ignored: !rule.negated,
        source: rule.source,
        line: rule.line,
        pattern: rule.pattern,
        reason: `${rule.negated ? 'Re-included' : 'Ignored'} by ${rule.source}:${rule.line} (${rule.raw.trim()}).`,
        path: relative,
      };
    }
    return decision;
  }

  return {
    rules,
    shouldIgnore(candidate, isDirectory = false) { return explain(candidate, isDirectory).ignored; },
    explain,
  };
}

export async function explainIgnore(root, candidate, options = {}) {
  const matcher = await createIgnoreMatcher(root, options.config || {});
  return matcher.explain(candidate, Boolean(options.directory));
}
