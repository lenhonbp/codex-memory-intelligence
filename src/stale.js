import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { resolveProjectFile } from './paths.js';
import { withMemoryWriteLock } from './memory-lock.js';
import { safeReadMemoryFile, safeReadMemoryJson, safeWriteMemoryFile } from './storage.js';

const MEMORY_FILES = ['memory.md', 'decisions.md', 'mistakes.md'];
const META_PATTERN = /<!--\s*cmi-meta:(\{.*?\})\s*-->/;
const LIFECYCLE_STATES = new Set(['active', 'deprecated', 'rejected', 'superseded']);
async function hashResolvedFile(filePath) { try { return crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex'); } catch { return null; } }

export async function sourceFingerprints(root, sources = []) {
  const output = {};
  for (const source of sources) {
    const normalized = String(source).split(path.sep).join('/').replace(/^\.\//, '');
    const resolved = await resolveProjectFile(root, normalized);
    output[normalized] = resolved.ok ? await hashResolvedFile(resolved.absolute) : null;
  }
  return output;
}
function parseEntries(content, file) {
  const headings = [...content.matchAll(/^##\s+(\d{4}-[^\n]+)$/gm)];
  return headings.map((heading, index) => {
    const start = heading.index;
    const end = headings[index + 1]?.index ?? content.length;
    const section = content.slice(start, end).trim();
    const metaMatch = section.match(META_PATTERN);
    let metadata = null;
    try { metadata = metaMatch ? JSON.parse(metaMatch[1]) : null; } catch {}
    const text = section.replace(/^##[^\n]*\n?/, '').replace(META_PATTERN, '').trim();
    return { file, heading: heading[1], text, metadata, start, end };
  });
}
function lifecycleOf(metadata) {
  const state = String(metadata?.lifecycle?.state || 'active').trim().toLowerCase();
  return {
    state: LIFECYCLE_STATES.has(state) ? state : 'active',
    changedAt: metadata?.lifecycle?.changedAt || null,
    changedBy: metadata?.lifecycle?.changedBy || null,
    reason: metadata?.lifecycle?.reason || null,
    supersededBy: metadata?.lifecycle?.supersededBy || null,
  };
}
function boundedText(value, fallback, limit) {
  const clean = String(value || fallback || '').trim();
  return clean.slice(0, limit);
}
async function uniqueTrackedEntry(root, selector) {
  const raw = String(selector || '').trim().toLowerCase();
  if (!raw || !/^[0-9a-f-]+$/.test(raw)) throw new Error('A valid memory ID or prefix is required.');
  const matches = (await loadTrackedMemory(root)).filter((entry) => {
    const id = String(entry.metadata?.id || '').toLowerCase();
    return id && (id === raw || id.startsWith(raw));
  });
  if (!matches.length) throw new Error(`No memory entry matches: ${selector}`);
  if (matches.length > 1) throw new Error(`Memory ID prefix is ambiguous: ${selector}`);
  return matches[0];
}
async function replaceMetadata(root, target, updater) {
  const filePath = path.join(root, '.codex-memory', target.file);
  const content = await safeReadMemoryFile(root, target.file);
  const entries = parseEntries(content, target.file);
  const current = entries.find((entry) => entry.metadata?.id === target.metadata?.id);
  if (!current) throw new Error(`Memory entry changed before mutation: ${target.metadata?.id || 'unknown'}`);
  const nextMetadata = await updater(current.metadata, current);
  const section = content.slice(current.start, current.end);
  const marker = `<!-- cmi-meta:${JSON.stringify(nextMetadata)} -->`;
  const replacement = section.replace(META_PATTERN, marker);
  const next = `${content.slice(0, current.start)}${replacement}${content.slice(current.end)}`;
  await safeWriteMemoryFile(root, target.file, next);
  return nextMetadata;
}
export async function loadTrackedMemory(root) {
  const directory = path.join(root, '.codex-memory');
  const entries = [];
  for (const file of MEMORY_FILES) try { entries.push(...parseEntries(await safeReadMemoryFile(root, file), file)); } catch {}
  return entries;
}
export async function checkStaleMemory(root) {
  const directory = path.join(root, '.codex-memory');
  const index = await safeReadMemoryJson(root, 'project-index.json', { optional: true });
  const config = await safeReadMemoryJson(root, 'config.json', { optional: true }) || {};
  const staleAfterDays = Number(config.staleAfterDays) || 90;
  const now = Date.now();
  const entries = await loadTrackedMemory(root);
  const results = [];
  for (const entry of entries) {
    const meta = entry.metadata;
    if (!meta) { results.push({ id: null, file: entry.file, heading: entry.heading, text: entry.text, status: 'untracked', lifecycleState: 'active', reasons: ['Entry predates metadata tracking. Refresh it to establish a baseline.'] }); continue; }
    const lifecycle = lifecycleOf(meta);
    if (lifecycle.state !== 'active') {
      const reason = lifecycle.reason ? ` ${lifecycle.reason}` : '';
      results.push({ id: meta.id || null, type: meta.type || entry.file.replace('.md', ''), file: entry.file, heading: entry.heading, text: entry.text, sources: Array.isArray(meta.sources) ? meta.sources : [], ageDays: null, status: 'inactive', lifecycleState: lifecycle.state, lifecycle, reasons: [`Memory is ${lifecycle.state}.${reason}`], reviewedBy: meta.reviewedBy || null, reviewReason: meta.reviewReason || null });
      continue;
    }
    const reasons = [];
    let status = 'fresh';
    const sources = Array.isArray(meta.sources) ? meta.sources : [];
    if (sources.length) {
      for (const source of sources) {
        const resolved = await resolveProjectFile(root, source);
        if (!resolved.ok) { status = 'stale'; reasons.push(resolved.reason); continue; }
        const currentHash = await hashResolvedFile(resolved.absolute);
        const previousHash = meta.sourceHashes?.[source] ?? null;
        if (!currentHash) { status = 'stale'; reasons.push(`Referenced source is unreadable: ${source}`); }
        else if (!previousHash || currentHash !== previousHash) { status = 'stale'; reasons.push(`Referenced source changed: ${source}`); }
      }
    } else if (!meta.projectHash && index?.hash) { status = 'review'; reasons.push('Memory has no project baseline. Refresh it after review.'); }
    else if (meta.projectHash && index?.hash && meta.projectHash !== index.hash) { status = 'review'; reasons.push('Project structure changed since this memory was recorded.'); }
    const baseline = Date.parse(meta.reviewedAt || meta.createdAt || entry.heading);
    const ageDays = Number.isFinite(baseline) ? Math.floor((now - baseline) / 86_400_000) : null;
    if (status === 'fresh' && ageDays !== null && ageDays > staleAfterDays) { status = 'review'; reasons.push(`Memory has not been reviewed for ${ageDays} days.`); }
    results.push({ id: meta.id || null, type: meta.type || entry.file.replace('.md', ''), file: entry.file, heading: entry.heading, text: entry.text, sources, ageDays, status, lifecycleState: 'active', lifecycle, reasons, reviewedBy: meta.reviewedBy || null, reviewReason: meta.reviewReason || null });
  }
  const counts = { fresh: 0, stale: 0, review: 0, untracked: 0, inactive: 0 };
  for (const item of results) counts[item.status] += 1;
  return { generatedAt: new Date().toISOString(), projectHash: index?.hash || null, staleAfterDays, counts, entries: results };
}
export async function refreshMemory(root, selector = 'all', options = {}) {
  return withMemoryWriteLock(root, async () => {
    const directory = path.join(root, '.codex-memory');
    const index = await safeReadMemoryJson(root, 'project-index.json', { optional: true });
    let updated = 0;
    const refreshedBy = boundedText(options.refreshedBy || options.reviewedBy, 'human', 100) || 'human';
    const refreshReason = boundedText(options.reason, 'Source fingerprints refreshed against the current project.', 500) || 'Source fingerprints refreshed against the current project.';
    const target = selector === 'all' ? null : await uniqueTrackedEntry(root, selector);
    if (target && lifecycleOf(target.metadata).state !== 'active') throw new Error(`Cannot refresh ${lifecycleOf(target.metadata).state} memory. Reactivate it explicitly first.`);
    for (const file of MEMORY_FILES) {
      const filePath = path.join(directory, file);
      let content;
      try { content = await safeReadMemoryFile(root, file); } catch { continue; }
      const entries = parseEntries(content, file).reverse();
      let next = content;
      for (const entry of entries) {
        const meta = entry.metadata;
        if (target && meta?.id !== target.metadata.id) continue;
        if (!target && meta && lifecycleOf(meta).state !== 'active') continue;
        const baseMetadata = meta || { id: crypto.randomUUID(), type: ({ 'memory.md': 'fact', 'decisions.md': 'decision', 'mistakes.md': 'mistake' })[file], createdAt: entry.heading, sources: [] };
        const refreshedAt = new Date().toISOString();
        const refreshed = { ...baseMetadata, schemaVersion: 1, lifecycle: baseMetadata.lifecycle || { state: 'active' }, sourceHashes: await sourceFingerprints(root, baseMetadata.sources || []), projectHash: index?.hash || baseMetadata.projectHash || null, sourceRefreshedAt: refreshedAt, sourceRefreshedBy: refreshedBy, sourceRefreshReason: refreshReason };
        const section = next.slice(entry.start, entry.end);
        const marker = `<!-- cmi-meta:${JSON.stringify(refreshed)} -->`;
        const replacement = meta ? section.replace(META_PATTERN, marker) : section.replace(/^##[^\n]*\n?/, (heading) => `${heading}\n${marker}\n`);
        next = `${next.slice(0, entry.start)}${replacement}${next.slice(entry.end)}`;
        updated += 1;
      }
      if (next !== content) await safeWriteMemoryFile(root, file, next);
    }
    if (selector !== 'all' && updated === 0) throw new Error(`No memory entry matches: ${selector}`);
    return { selector: target?.metadata?.id || selector, updated, refreshedBy, refreshReason, semanticReview: false };
  });
}
export async function setMemoryLifecycle(root, selector, state, options = {}) {
  return withMemoryWriteLock(root, async () => {
    const normalizedState = String(state || '').trim().toLowerCase();
    if (!LIFECYCLE_STATES.has(normalizedState)) throw new Error(`Memory lifecycle state must be one of: ${[...LIFECYCLE_STATES].join(', ')}.`);
    const reason = boundedText(options.reason, '', 500);
    if (!reason) throw new Error('Memory lifecycle changes require a review reason.');
    const changedBy = boundedText(options.changedBy, 'human', 100) || 'human';
    const target = await uniqueTrackedEntry(root, selector);
    let supersededBy = null;
    if (normalizedState === 'superseded') {
      if (!options.supersededBy) throw new Error('Superseded memory requires a replacement memory ID.');
      const replacement = await uniqueTrackedEntry(root, options.supersededBy);
      if (replacement.metadata.id === target.metadata.id) throw new Error('Memory cannot supersede itself.');
      if (lifecycleOf(replacement.metadata).state !== 'active') throw new Error('Replacement memory must be active.');
      supersededBy = replacement.metadata.id;
    }
    const changedAt = new Date().toISOString();
    const metadata = await replaceMetadata(root, target, async (meta) => ({
      ...meta,
      schemaVersion: 1,
      ...(normalizedState === 'active' ? { reviewedAt: changedAt, reviewedBy: changedBy, reviewReason: reason } : {}),
      lifecycle: {
        state: normalizedState,
        changedAt,
        changedBy,
        reason,
        ...(supersededBy ? { supersededBy } : {}),
      },
    }));
    return { id: metadata.id, state: normalizedState, changedAt, changedBy, reason, supersededBy };
  });
}
export function formatStaleReport(report) {
  const header = `# Memory health\n\n- Fresh: ${report.counts.fresh}\n- Stale: ${report.counts.stale}\n- Review: ${report.counts.review}\n- Untracked: ${report.counts.untracked}\n- Inactive: ${report.counts.inactive || 0}`;
  const attention = report.entries.filter((entry) => !['fresh', 'inactive'].includes(entry.status));
  const inactive = report.entries.filter((entry) => entry.status === 'inactive');
  const attentionSection = attention.length ? `\n\n## Needs attention\n${attention.map((entry) => { const id = entry.id ? `\`${entry.id.slice(0, 8)}\`` : '`untracked`'; const reasons = entry.reasons.map((reason) => `  - ${reason}`).join('\n'); return `- ${id} **${entry.status}** · ${entry.file} · ${entry.text.slice(0, 120)}\n${reasons}`; }).join('\n')}` : '\n\nAll active tracked memory is current.';
  const inactiveSection = inactive.length ? `\n\n## Inactive knowledge\n${inactive.map((entry) => `- \`${entry.id?.slice(0, 8) || 'unknown'}\` **${entry.lifecycleState}** · ${entry.file} · ${entry.text.slice(0, 120)}`).join('\n')}` : '';
  return `${header}${attentionSection}${inactiveSection}`;
}
