import { extractEvidenceAnchors, formatEvidenceAnchor, verificationStateForFinding } from './evidence-anchors.js';
import { formatSessionReport, formatSessionAssessment, formatHandoff } from './session-intelligence.js';

function relatedChangeIds(finding) {
  const ids = [];
  for (const evidence of finding?.evidence || []) {
    const match = String(evidence).match(/^change:([0-9a-f-]+)$/i);
    if (match) ids.push(match[1]);
  }
  if (finding?.category === 'active-change') {
    const target = String(finding.key || '').replace(/^active-change:/, '');
    if (/^[0-9a-f-]{8,}$/i.test(target)) ids.push(target);
  }
  return [...new Set(ids)];
}

function evidenceAction(finding, actions) {
  return (actions || []).find((item) => (item.relatedFindingIds || []).includes(finding.id))?.action || null;
}

export function formatEvidenceAddresses(findings, actions = []) {
  const all = (findings || []).filter(Boolean);
  if (!all.length) return '';
  const shown = all.slice(0, 12);
  const rows = shown.map((finding) => {
    const records = [finding.id ? `finding ${finding.id}` : null, ...relatedChangeIds(finding).map((id) => `change ${id}`)].filter(Boolean);
    const files = (finding.relatedFiles || []).slice(0, 8);
    const anchors = extractEvidenceAnchors(finding).slice(0, 4).map(formatEvidenceAnchor).filter(Boolean);
    const action = evidenceAction(finding, actions);
    const lines = [`- [${finding.severity || 'info'}] ${finding.title || finding.category || 'Finding'}`];
    if (records.length) lines.push(`  Record: ${records.join(' · ')}`);
    if (files.length) lines.push(`  Files: ${files.join(', ')}${(finding.relatedFiles || []).length > files.length ? ` (+${finding.relatedFiles.length - files.length} more)` : ''}`);
    if (anchors.length) lines.push(`  Source: ${anchors.join('; ')}`);
    lines.push(`  Evidence: ${finding.evidenceType || 'inferred'} · confidence ${finding.confidence || 'low'} · ${verificationStateForFinding(finding)}`);
    if (action) lines.push(`  Action: ${action}`);
    return lines.join('\n');
  });
  if (all.length > shown.length) rows.push(`- ${all.length - shown.length} more finding(s) omitted from the bounded human view; use structured/JSON output for the full evidence inventory.`);
  return rows.join('\n');
}

function withEvidenceAddresses(text, findings, actions = []) {
  const addresses = formatEvidenceAddresses(findings, actions);
  return addresses ? `${text}\n\n## Evidence addresses\n${addresses}` : text;
}

export function formatSessionRecordWithEvidence(record) {
  if (record.status !== 'closed') return formatSessionReport(record);
  const findings = record.close?.openFindings || record.close?.findings || [];
  return withEvidenceAddresses(formatSessionReport(record), findings, record.close?.recommendations || []);
}

export function formatSessionAssessmentWithEvidence(result) {
  return withEvidenceAddresses(formatSessionAssessment(result), result.findings || [], result.recommendations || []);
}

export function formatSessionHandoffWithEvidence(handoff) {
  return withEvidenceAddresses(formatHandoff(handoff), handoff.openFindings || [], handoff.nextActions || []);
}
