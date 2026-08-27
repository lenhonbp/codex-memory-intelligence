import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const skillRelativePath = 'skills/cmi-agent-operating-system/SKILL.md';
const skillPath = path.join(repositoryRoot, skillRelativePath);
const templateNames = [
  'orientation-checklist.md',
  'evidence-ledger.md',
  'verification-matrix.md',
  'truthful-handoff.md',
];

async function read(rel) {
  return (await fs.readFile(path.join(repositoryRoot, rel), 'utf8')).replace(/\r\n/g, '\n');
}

function frontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, 'SKILL.md must start with YAML frontmatter');
  const fields = {};
  for (const line of match[1].split('\n')) {
    const index = line.indexOf(':');
    if (index > 0) fields[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return fields;
}

test('core Agent OS Skill contains the complete contract section set', async () => {
  const skill = await read(skillRelativePath);
  const requiredSections = [
    '## 1. Name and purpose',
    '## 2. Appropriate triggers',
    '## 3. Non-triggers',
    '## 4. Non-goals',
    '## 5. Required inputs',
    '## 6. Authority and authorization boundary',
    '## 7. Core operating loop',
    '## 8. Evidence vocabulary',
    '## 9. Phase-by-phase rules',
    '## 10. CMI surface mapping',
    '## 11. Verification ladder',
    '## 12. Failure and recovery behavior',
    '## 13. Completion criteria',
    '## 14. Handoff template',
    '## 15. Short usage example',
    '## 16. Claims prohibited without evidence',
  ];
  for (const section of requiredSections) assert.match(skill, new RegExp(`^${section.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`, 'm'), `missing ${section}`);
  for (const phase of ['Orient', 'Observe', 'Capture Evidence', 'Diagnose', 'Prioritize', 'Implement', 'Verify', 'Reflect', 'Handoff']) {
    assert.match(skill, new RegExp(`^### ${phase}$`, 'm'), `missing phase ${phase}`);
  }
});

test('core Skill frontmatter, template references and internal links are valid', async () => {
  const skill = await read(skillRelativePath);
  const fields = frontmatter(skill);
  assert.equal(fields.name, 'cmi-agent-operating-system');
  assert.ok(fields.description.length > 0 && fields.description.length <= 1024);
  for (const name of templateNames) {
    const templatePath = path.join(repositoryRoot, 'skills/cmi-agent-operating-system/templates', name);
    assert.equal((await fs.stat(templatePath)).isFile(), true, `missing template ${name}`);
    assert.match(skill, new RegExp(`templates/${name.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}`));
  }
  const links = [...skill.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1]);
  for (const link of links) {
    if (/^(?:https?:|mailto:|#)/i.test(link)) continue;
    const target = path.resolve(path.dirname(skillPath), link);
    assert.equal(target.startsWith(path.join(repositoryRoot, 'skills/cmi-agent-operating-system')), true, `link escapes Skill directory: ${link}`);
    assert.ok(await fs.stat(target), `broken internal link: ${link}`);
  }
});

test('core Skill preserves evidence and lifecycle boundary claims', async () => {
  const skill = await read(skillRelativePath);
  for (const phrase of [
    'does not implement CMI memory',
    'does not create a native Skill runtime',
    'Session closure does not complete a partial Change',
    'local check does not imply CI',
    'do not fabricate IDs',
    'not-enough-evidence',
    'reported-verification',
    'observed-command',
  ]) {
    assert.match(skill, new RegExp(phrase.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&'), 'i'), `missing boundary: ${phrase}`);
  }
  assert.match(skill, /CMI remains authoritative/i);
  assert.match(skill, /Do not publish, deploy, push, submit or create external side effects/i);
  assert.match(skill, /automatically write[\s\S]{0,120}durable memory|do not automatically call memory mutation surfaces/i);
  assert.match(skill, /Domain-specific .* remain bounded|domain-specific game/i);
  assert.doesNotMatch(skill, /native Skill loader implementation|new memory database|automatic memory writer/i);
});

test('supporting templates preserve separate verification and authorization statuses', async () => {
  const [orientation, ledger, matrix, handoff] = await Promise.all(templateNames.map((name) => read(`skills/cmi-agent-operating-system/templates/${name}`)));
  assert.match(orientation, /Goal and actor|Authority boundary|Acceptance and evidence/i);
  assert.match(ledger, /Evidence vocabulary|Claim ledger|Verification provenance|Promotion guardrail/i);
  for (const level of ['Focused/local', 'Repository', 'CI', 'External/live', 'Release readiness']) assert.match(matrix, new RegExp(level.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')));
  assert.match(handoff, /Objective|Accomplished|Decisions|Verification|Active lifecycle|Open findings|Next actions|Guardrails/i);
  assert.match(matrix, /External action.*not-run/i);
  assert.match(handoff, /Session closure does not complete a partial Change/i);
});

// These helpers model the adapter contract only. They are not CMI runtime integration or serializer implementations.
function mapAgentOsEvidence({ label, address, authoritativeReview = false, command }) {
  if (label === 'needs-evidence') return { taskStatus: 'needs-evidence' };
  if (label === 'not-enough-evidence') return { claimState: 'not-enough-evidence' };
  if (!address) return { claimState: 'not-enough-evidence' };
  if (label === 'reported-verification') return { provenance: 'reported' };
  if (label === 'observed-command') return {
    evidenceType: 'observed',
    provenance: 'observed-command',
    command,
  };
  if (label === 'fact') return authoritativeReview
    ? { evidenceType: 'reviewed' }
    : { claimState: 'not-enough-evidence' };
  if (label === 'observation') return { evidenceType: 'observed' };
  if (label === 'inference') return { evidenceType: 'inferred' };
  return { claimState: 'not-enough-evidence' };
}

function closeSessionWithoutCompletingChange({ sessionStatus, changeStatus }) {
  return { sessionStatus: 'closed', changeStatus };
}

function keepVerificationLevelsIndependent(matrix) {
  return {
    focused: matrix.focused ?? 'not-run',
    repository: matrix.repository ?? 'not-run',
    CI: matrix.CI ?? 'not-observed',
    'external/live': matrix['external/live'] ?? 'not-observed',
    release: matrix.release ?? 'not-assessed',
  };
}

function authorizeExternalAction({ explicitAuthorization = false }) {
  return explicitAuthorization;
}

test('adapter contract maps Agent OS labels without collapsing layers', () => {
  assert.deepEqual(mapAgentOsEvidence({ label: 'observation', address: 'file.md:10' }), { evidenceType: 'observed' });
  assert.deepEqual(mapAgentOsEvidence({ label: 'inference', address: 'finding:F-1' }), { evidenceType: 'inferred' });
  assert.deepEqual(mapAgentOsEvidence({ label: 'fact', address: 'review.md:4' }), { claimState: 'not-enough-evidence' });
  assert.deepEqual(mapAgentOsEvidence({ label: 'fact', address: 'review.md:4', authoritativeReview: true }), { evidenceType: 'reviewed' });
  assert.deepEqual(mapAgentOsEvidence({ label: 'needs-evidence' }), { taskStatus: 'needs-evidence' });
  assert.deepEqual(mapAgentOsEvidence({ label: 'not-enough-evidence' }), { claimState: 'not-enough-evidence' });
  assert.equal(mapAgentOsEvidence({ label: 'not-enough-evidence' }).evidenceType, undefined);
  assert.equal(mapAgentOsEvidence({ label: 'needs-evidence' }).provenance, undefined);
});

test('reported verification stays reported and observed commands retain metadata', () => {
  assert.deepEqual(mapAgentOsEvidence({ label: 'reported-verification', address: 'handoff.md:20' }), { provenance: 'reported' });
  assert.equal(mapAgentOsEvidence({ label: 'reported-verification', address: 'handoff.md:20' }).evidenceType, undefined);
  const observed = mapAgentOsEvidence({
    label: 'observed-command',
    address: 'terminal:run-1',
    command: { command: 'npm test', exitCode: 0, observedAt: '2026-08-27T00:00:00Z' },
  });
  assert.equal(observed.evidenceType, 'observed');
  assert.equal(observed.provenance, 'observed-command');
  assert.deepEqual(observed.command, { command: 'npm test', exitCode: 0, observedAt: '2026-08-27T00:00:00Z' });
});

test('missing evidence address is a gap, not reviewed or observed evidence', () => {
  const missing = mapAgentOsEvidence({ label: 'observation' });
  assert.deepEqual(missing, { claimState: 'not-enough-evidence' });
  assert.equal(missing.evidenceType, undefined);
  assert.deepEqual(mapAgentOsEvidence({ label: 'fact', address: '' }), { claimState: 'not-enough-evidence' });
});

test('Session close preserves an active Change and verification levels stay independent', () => {
  assert.deepEqual(closeSessionWithoutCompletingChange({ sessionStatus: 'open', changeStatus: 'active' }), {
    sessionStatus: 'closed',
    changeStatus: 'active',
  });
  const levels = keepVerificationLevelsIndependent({ focused: 'verified', repository: 'verified' });
  assert.equal(levels.focused, 'verified');
  assert.equal(levels.repository, 'verified');
  assert.equal(levels.CI, 'not-observed');
  assert.equal(levels['external/live'], 'not-observed');
  assert.equal(levels.release, 'not-assessed');
});

test('recommendation, severity, package and local test do not authorize external action', () => {
  assert.equal(authorizeExternalAction({}), false);
  assert.equal(authorizeExternalAction({ explicitAuthorization: false }), false);
  assert.equal(authorizeExternalAction({ explicitAuthorization: true }), true);
});
