import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveProjectFile, slash } from './paths.js';

function safeRelative(value) {
  const raw = slash(String(value ?? '')).trim().replace(/^\.\//, '').replace(/\/+$/, '');
  if (!raw || raw.startsWith('/') || /^[A-Za-z]:\//.test(raw)) return null;
  const parts = raw.split('/').filter(Boolean);
  if (!parts.length || parts.some((part) => part === '..')) return null;
  return parts.join('/');
}

async function readText(root, relative) {
  const safe = safeRelative(relative);
  if (!safe) return null;
  const resolved = await resolveProjectFile(root, safe);
  if (!resolved.ok) return null;
  try { return await fs.readFile(resolved.absolute, 'utf8'); } catch { return null; }
}

async function readJson(root, relative) {
  const text = await readText(root, relative);
  if (text === null) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function normalize(value) {
  const next = slash(String(value || '')).replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+$/, '');
  return next || '.';
}

function patternRegex(pattern) {
  const normalized = normalize(pattern).replace(/^\.\//, '');
  let body = '';
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    if (char === '*') {
      if (normalized[index + 1] === '*') { index += 1; body += '.*'; }
      else body += '[^/]*';
    } else if (char === '?') body += '[^/]';
    else body += char.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
  }
  return new RegExp(`^${body}$`);
}

function expandPatterns(patterns, candidateDirectories) {
  const output = new Set();
  for (const rawPattern of patterns) {
    const text = String(rawPattern || '').trim();
    if (!text) continue;
    const negated = text.startsWith('!');
    const pattern = negated ? text.slice(1) : text;
    if (!safeRelative(pattern)) continue;
    const regex = patternRegex(pattern);
    for (const candidate of candidateDirectories) {
      if (!regex.test(candidate)) continue;
      if (negated) output.delete(candidate);
      else output.add(candidate);
    }
  }
  return [...output].sort();
}

function yamlWorkspacePatterns(content) {
  const output = [];
  let inPackages = false;
  for (const line of String(content || '').split(/\r?\n/)) {
    if (/^packages\s*:/.test(line.trim())) { inPackages = true; continue; }
    if (inPackages && /^\S/.test(line) && !/^\s*-/.test(line)) break;
    const match = line.match(/^\s*-\s*['"]?([^'"#]+?)['"]?\s*(?:#.*)?$/);
    if (inPackages && match) output.push(match[1].trim());
  }
  return output;
}

function cargoMembers(content) {
  const section = String(content || '').match(/\[workspace\]([\s\S]*?)(?:\n\[[^\]]+\]|$)/)?.[1] || '';
  const members = section.match(/members\s*=\s*\[([\s\S]*?)\]/)?.[1] || '';
  return [...members.matchAll(/["']([^"']+)["']/g)].map((match) => match[1]);
}

function goWorkMembers(content) {
  const output = [];
  const block = String(content || '').match(/use\s*\(([\s\S]*?)\)/)?.[1];
  if (block) for (const line of block.split(/\r?\n/)) {
    const value = line.trim().replace(/^['"]|['"]$/g, '');
    if (value && !value.startsWith('//')) output.push(value);
  }
  for (const match of String(content || '').matchAll(/^\s*use\s+([^\s/][^\r\n]*|\.\.?\/[^\r\n]+)$/gm)) output.push(match[1].trim().replace(/^['"]|['"]$/g, ''));
  return output;
}

function uniqueWorkspaces(items) {
  const map = new Map();
  for (const item of items) {
    const normalizedPath = normalize(item.path);
    const key = `${item.ecosystem}:${normalizedPath}`;
    if (!map.has(key)) map.set(key, { ...item, path: normalizedPath, id: `${item.ecosystem}:${normalizedPath}` });
  }
  return [...map.values()].sort((a, b) => a.path.localeCompare(b.path) || a.ecosystem.localeCompare(b.ecosystem));
}

export async function detectWorkspaces(root, fileRecords = []) {
  const filePaths = new Set(fileRecords.map((file) => safeRelative(file.path)).filter(Boolean));
  const packageManifests = [...filePaths].filter((value) => value === 'package.json' || value.endsWith('/package.json'));
  const packageDirectories = packageManifests.filter((value) => value !== 'package.json').map((value) => path.posix.dirname(value));
  const items = [];

  const rootPackage = filePaths.has('package.json') ? await readJson(root, 'package.json') : null;
  if (rootPackage) items.push({ name: rootPackage.name || path.basename(root), path: '.', ecosystem: 'node', manifest: 'package.json', private: Boolean(rootPackage.private), root: true });
  let npmPatterns = [];
  if (Array.isArray(rootPackage?.workspaces)) npmPatterns = [...rootPackage.workspaces];
  else if (Array.isArray(rootPackage?.workspaces?.packages)) npmPatterns = [...rootPackage.workspaces.packages];
  if (filePaths.has('pnpm-workspace.yaml')) npmPatterns.push(...yamlWorkspacePatterns(await readText(root, 'pnpm-workspace.yaml')));
  for (const directory of expandPatterns(npmPatterns, packageDirectories)) {
    const manifest = `${directory}/package.json`;
    const data = await readJson(root, manifest);
    if (!data) continue;
    items.push({ name: data.name || path.posix.basename(directory), path: directory, ecosystem: 'node', manifest, private: Boolean(data.private) });
  }

  if (filePaths.has('Cargo.toml')) {
    const rootCargo = await readText(root, 'Cargo.toml');
    const patterns = cargoMembers(rootCargo);
    if (patterns.length) items.push({ name: path.basename(root), path: '.', ecosystem: 'rust', manifest: 'Cargo.toml', root: true });
    const cargoDirectories = [...filePaths].filter((value) => value.endsWith('/Cargo.toml')).map((value) => path.posix.dirname(value));
    for (const directory of expandPatterns(patterns, cargoDirectories)) items.push({ name: path.posix.basename(directory), path: directory, ecosystem: 'rust', manifest: `${directory}/Cargo.toml` });
  }

  if (filePaths.has('go.work')) {
    for (const member of goWorkMembers(await readText(root, 'go.work'))) {
      const safeMember = safeRelative(member);
      if (!safeMember) continue;
      const directory = normalize(safeMember);
      if (filePaths.has(`${directory}/go.mod`)) items.push({ name: path.posix.basename(directory), path: directory, ecosystem: 'go', manifest: `${directory}/go.mod` });
    }
  } else if (filePaths.has('go.mod')) items.push({ name: path.basename(root), path: '.', ecosystem: 'go', manifest: 'go.mod', root: true });

  const workspaces = uniqueWorkspaces(items);
  const byEcosystem = {};
  for (const workspace of workspaces) byEcosystem[workspace.ecosystem] = (byEcosystem[workspace.ecosystem] || 0) + 1;
  return { schemaVersion: 1, count: workspaces.length, byEcosystem, workspaces };
}

export function workspaceForPath(filePath, workspaceReport) {
  const normalized = normalize(filePath);
  const candidates = (workspaceReport?.workspaces || []).filter((workspace) => workspace.path === '.' || normalized === workspace.path || normalized.startsWith(`${workspace.path}/`));
  return candidates.sort((a, b) => b.path.length - a.path.length)[0] || null;
}

export function formatWorkspaces(report) {
  if (!report?.workspaces?.length) return 'No configured workspaces detected.';
  return `# Project workspaces\n\n${report.workspaces.map((workspace) => `- **${workspace.name}** · ${workspace.ecosystem} · \`${workspace.path}\` · ${workspace.manifest}`).join('\n')}`;
}
