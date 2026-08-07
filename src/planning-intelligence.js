import fs from 'node:fs/promises';
import path from 'node:path';

const MAX_FILE_BYTES = 256_000;
const MAX_SIGNALS = 25;
const MAX_TEXT = 320;
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
];

function slash(value) { return String(value || '').replace(/\\/g, '/'); }
function boundedText(value) { return String(value || '').trim().replace(/\s+/g, ' ').slice(0, MAX_TEXT); }
function insideRoot(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
async function readPlanningFile(root, relativePath) {
  const target = path.resolve(root, relativePath);
  if (!insideRoot(root, target)) return null;
  try {
    const stat = await fs.lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_FILE_BYTES) return null;
    return await fs.readFile(target, 'utf8');
  } catch { return null; }
}
function sectionPriority(section) {
  const text = String(section || '').toLowerCase();
  if (/\b(now|next|current|priority|priorities|active|in progress|in-progress)\b/.test(text)) return 3;
  if (/\b(later|future|idea|ideas|backlog|optional)\b/.test(text)) return -1;
  return 0;
}
function parsePlanningFile(relativePath, content, fileOrder) {
  const output = [];
  let section = null;
  const lines = String(content || '').split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const heading = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (heading) { section = boundedText(heading[1]); continue; }
    const task = line.match(/^\s*[-*+]\s+\[\s\]\s+(.+?)\s*$/i);
    if (!task) continue;
    const text = boundedText(task[1]);
    if (!text) continue;
    output.push({
      id: `planning:${slash(relativePath)}:${index + 1}`,
      type: 'unchecked-markdown-task',
      path: slash(relativePath),
      line: index + 1,
      section,
      text,
      evidenceType: 'observed',
      confidence: 'medium',
      advisory: true,
      score: sectionPriority(section) * 100 - fileOrder * 10 - index / 1000,
    });
  }
  return output;
}

export async function getPlanningSignals(root, options = {}) {
  const limit = Math.max(1, Math.min(MAX_SIGNALS, Number(options.limit) || 10));
  const signals = [];
  for (let index = 0; index < CANDIDATES.length; index += 1) {
    const relativePath = CANDIDATES[index];
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
    policy: 'Unchecked planning tasks are observed planning evidence, not proof of current business priority. CMI recommends reviewing them only after stronger unresolved evidence is addressed.',
  };
}
