import fs from 'node:fs/promises';
import path from 'node:path';

const MAX_FILE_BYTES = 256_000;
const MAX_SIGNALS = 25;
const MAX_TEXT = 320;
const MAX_DISCOVERED_FILES = 24;
const SEARCH_DIRECTORIES = ['', 'docs', 'docs/context-pack'];
const CANDIDATES = [
  'ROADMAP.md',
  'TODO.md',
  'BACKLOG.md',
  'PLAN.md',
  'PROJECT_PLAN.md',
  'docs/CURRENT_PRIORITIES.md',
  'docs/ROADMAP.md',
  'docs/TODO.md',
  'docs/BACKLOG.md',
  'docs/PLAN.md',
  'docs/IMPLEMENTATION_PLAN.md',
  'docs/context-pack/CURRENT_PRIORITIES.md',
];
const PLANNING_NAME = /(?:^|[_\-.])(roadmap|todo|backlog|plan|planning|priorit(?:y|ies)|milestone|next)(?:[_\-.]|$)/i;
const CONTINUATION_HEADING = /\b(now|next|current|priority|priorities|active|in progress|in-progress|todo|remaining|follow[- ]?up|action items?|backlog|milestone)\b/i;
const DEFERRED_HEADING = /\b(later|future|idea|ideas|optional|parking lot)\b/i;

function slash(value) { return String(value || '').replace(/\\/g, '/'); }
function boundedText(value) { return String(value || '').trim().replace(/\s+/g, ' ').slice(0, MAX_TEXT); }
function unique(values) { return [...new Set((values || []).filter(Boolean))]; }
function insideRoot(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
function sourcePriority(relativePath) {
  const base = path.basename(relativePath).toLowerCase();
  if (/current[_\-.]?priorit|next/.test(base)) return 5;
  if (/todo/.test(base)) return 4;
  if (/roadmap/.test(base)) return 3;
  if (/backlog/.test(base)) return 2;
  if (/implementation[_\-.]?plan|project[_\-.]?plan/.test(base)) return 2;
  if (/plan/.test(base)) return 1;
  return 0;
}
async function readPlanningFile(root, relativePath) {
  const target = path.resolve(root, relativePath);
  if (!insideRoot(root, target)) return null;
  let handle;
  try {
    handle = await fs.open(target, 'r');
    const [openedStat, pathStat] = await Promise.all([
      handle.stat(),
      fs.lstat(target),
    ]);
    const sameFile = openedStat.dev === pathStat.dev && openedStat.ino === pathStat.ino;
    if (!openedStat.isFile() || pathStat.isSymbolicLink() || !sameFile || openedStat.size > MAX_FILE_BYTES) return null;
    return await handle.readFile('utf8');
  } catch { return null; }
  finally {
    if (handle) {
      try { await handle.close(); } catch { /* best-effort close */ }
    }
  }
}
async function discoverPlanningFiles(root) {
  const found = [...CANDIDATES];
  for (const relativeDirectory of SEARCH_DIRECTORIES) {
    const directory = path.resolve(root, relativeDirectory || '.');
    if (!insideRoot(root, directory)) continue;
    let entries = [];
    try { entries = await fs.readdir(directory, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (!entry.isFile() || !/\.md$/i.test(entry.name) || !PLANNING_NAME.test(entry.name)) continue;
      found.push(slash(path.posix.join(slash(relativeDirectory), entry.name)).replace(/^\//, ''));
    }
  }
  return unique(found)
    .sort((a, b) => sourcePriority(b) - sourcePriority(a) || a.localeCompare(b))
    .slice(0, MAX_DISCOVERED_FILES);
}
function sectionPriority(section) {
  const text = String(section || '');
  if (/\b(now|next|current|priority|priorities|active|in progress|in-progress|todo|remaining|follow[- ]?up|action items?)\b/i.test(text)) return 4;
  if (/\b(backlog|milestone)\b/i.test(text)) return 2;
  if (DEFERRED_HEADING.test(text)) return -2;
  return 0;
}
function continuationSection(section, documentTitle) {
  return CONTINUATION_HEADING.test(String(section || '')) || CONTINUATION_HEADING.test(String(documentTitle || ''));
}
function signal(relativePath, index, section, text, type, confidence, fileOrder, extraScore = 0) {
  return {
    id: `planning:${slash(relativePath)}:${index + 1}`,
    type,
    path: slash(relativePath),
    line: index + 1,
    section,
    text,
    evidenceType: 'observed',
    confidence,
    advisory: true,
    score: sectionPriority(section) * 100 + sourcePriority(relativePath) * 25 + extraScore - fileOrder * 2 - index / 1000,
  };
}
function parsePlanningFile(relativePath, content, fileOrder) {
  const output = [];
  let section = null;
  let documentTitle = null;
  const lines = String(content || '').split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const heading = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (heading) {
      section = boundedText(heading[1]);
      if (!documentTitle) documentTitle = section;
      continue;
    }

    const checkbox = line.match(/^\s*[-*+]\s+\[\s\]\s+(.+?)\s*$/i);
    if (checkbox) {
      const text = boundedText(checkbox[1]);
      if (text) output.push(signal(relativePath, index, section, text, 'unchecked-markdown-task', 'medium', fileOrder, 500));
      continue;
    }
    if (/^\s*[-*+]\s+\[[xX]\]\s+/.test(line)) continue;

    const explicit = line.match(/^\s*(?:[-*+]\s*)?(?:TODO|NEXT|ACTION|FOLLOW[- ]?UP)\s*[:\-]\s*(.+?)\s*$/i);
    if (explicit) {
      const text = boundedText(explicit[1]);
      if (text) output.push(signal(relativePath, index, section, text, 'explicit-planning-marker', 'medium', fileOrder, 450));
      continue;
    }

    if (!continuationSection(section, documentTitle) || DEFERRED_HEADING.test(String(section || ''))) continue;
    const listItem = line.match(/^\s*(?:\d+[.)]|[-*+])\s+(.+?)\s*$/);
    if (!listItem) continue;
    const text = boundedText(listItem[1]);
    if (!text || /^https?:\/\//i.test(text)) continue;
    output.push(signal(relativePath, index, section, text, 'planning-list-item', 'low', fileOrder, 10));
  }
  return output;
}

export async function getPlanningSignals(root, options = {}) {
  const limit = Math.max(1, Math.min(MAX_SIGNALS, Number(options.limit) || 10));
  const signals = [];
  const candidates = await discoverPlanningFiles(root);
  for (let index = 0; index < candidates.length; index += 1) {
    const relativePath = candidates[index];
    const content = await readPlanningFile(root, relativePath);
    if (content === null) continue;
    signals.push(...parsePlanningFile(relativePath, content, index));
  }
  signals.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path) || a.line - b.line);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    signals: signals.slice(0, limit).map(({ score, ...item }) => item),
    totalDetected: signals.length,
    truncated: signals.length > limit,
    inspectedFiles: candidates.length,
    policy: 'Planning tasks, explicit planning markers, and list items under current/next/priority-style planning sections are observed planning evidence, not proof of current business priority. Explicit unchecked tasks/markers carry stronger planning evidence than ordinary list items; checked tasks are excluded. Non-checkbox list items are lower-confidence review candidates. CMI recommends reviewing planning evidence only after stronger unresolved evidence is addressed.',
  };
}
