import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanProject } from '../../src/core.js';
import { startChangeRecord, getChangeRecord } from '../../src/change-intelligence.js';
import { startSession, closeSession } from '../../src/session-intelligence.js';
import { formatEvidenceAddresses } from '../../src/session-evidence-view.js';
import {
  checkExternalActionAuthorization,
  normalizeAgentOsClaim,
  normalizeAgentOsEvidence,
  normalizeVerificationState,
  preserveLifecycleIndependence,
  validateAgentOsRuntimeSurface,
} from '../../src/agent-os-adapter.js';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const skillRelativePath = 'skills/cmi-agent-operating-system/SKILL.md';
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

async function runtimeFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-agent-os-runtime-'));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ type: 'module' }));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'service.js'), 'export function service() { return true; }\n');
  await scanProject(root);
  return root;
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
    const target = path.resolve(path.dirname(path.join(repositoryRoot, skillRelativePath)), link);
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

test('production adapter maps Agent OS evidence through CMI-native semantics', () => {
  assert.deepEqual(normalizeAgentOsEvidence({ label: 'observation', address: 'file.md:10' }), {
    evidenceType: 'observed', evidence: ['file.md:10'],
  });
  assert.deepEqual(normalizeAgentOsEvidence({ label: 'inference', address: 'finding:F-1' }), {
    evidenceType: 'inferred', evidence: ['finding:F-1'],
  });
  assert.deepEqual(normalizeAgentOsClaim({ label: 'fact', address: 'claim.md:4' }), {
    claimState: 'not-enough-evidence', evidence: ['claim.md:4'], missingEvidence: ['authoritative review evidence for fact'],
  });
  assert.equal(normalizeAgentOsEvidence({
    label: 'fact',
    address: 'claim.md:4',
    authoritativeReviewEvidence: { address: 'review.md:8', reviewedAt: '2026-08-27T00:00:00Z', reviewedBy: 'reviewer' },
  }).evidenceType, 'reviewed');
  assert.deepEqual(normalizeAgentOsEvidence({ label: 'needs-evidence' }), { taskStatus: 'needs-evidence' });
  assert.deepEqual(normalizeAgentOsEvidence({ label: 'not-enough-evidence' }), { claimState: 'not-enough-evidence' });
  assert.equal(normalizeAgentOsEvidence({ label: 'not-enough-evidence' }).evidenceType, undefined);
  assert.equal(normalizeAgentOsEvidence({ label: 'needs-evidence' }).provenance, undefined);
});

test('reported verification stays reported and observed commands retain metadata', () => {
  const reported = normalizeAgentOsEvidence({ label: 'reported-verification', address: 'handoff.md:20' });
  assert.deepEqual(reported, { provenance: 'reported', evidence: ['handoff.md:20'] });
  assert.equal(reported.evidenceType, undefined);

  const observed = normalizeAgentOsEvidence({
    label: 'observed-command',
    address: 'terminal:run-1',
    command: { command: 'npm test', exitCode: 0, observedAt: '2026-08-27T00:00:00Z', outputAddress: 'terminal:run-1:output' },
  });
  assert.equal(observed.evidenceType, 'observed');
  assert.equal(observed.provenance, 'observed-command');
  assert.deepEqual(observed.command, { command: 'npm test', exitCode: 0, observedAt: '2026-08-27T00:00:00Z', outputAddress: 'terminal:run-1:output' });
  assert.equal(normalizeAgentOsEvidence({ label: 'observed-command', address: 'terminal:run-1', command: { command: 'npm test' } }).claimState, 'not-enough-evidence');
});

test('missing evidence address is a gap, not reviewed or observed evidence', () => {
  const missing = normalizeAgentOsEvidence({ label: 'observation' });
  assert.equal(missing.claimState, 'not-enough-evidence');
  assert.equal(missing.evidenceType, undefined);
  assert.deepEqual(normalizeAgentOsEvidence({ label: 'fact', address: '' }), {
    claimState: 'not-enough-evidence', missingEvidence: ['evidence address'],
  });
  assert.deepEqual(normalizeVerificationState({ focused: 'verified', repository: 'verified' }), {
    focused: 'verified', repository: 'verified', CI: 'not-observed', 'external/live': 'not-observed', release: 'not-assessed',
  });
});

test('runtime Session and Change surfaces remain independent and validate through CMI contracts', async () => {
  const root = await runtimeFixture();
  const change = await startChangeRecord(root, 'keep runtime change active');
  const session = await startSession(root, 'inspect active change lifecycle');
  const closed = await closeSession(root, session.id, {
    outcome: 'investigated',
    notes: ['Session review finished without completing the active Change.'],
  });
  const persistedChange = await getChangeRecord(root, change.id);
  const lifecycle = preserveLifecycleIndependence({ session: closed, change: persistedChange });

  assert.equal(closed.status, 'closed');
  assert.equal(persistedChange.status, 'active');
  assert.deepEqual(lifecycle, {
    sessionStatus: 'closed', changeStatus: 'active', sessionValid: true, changeValid: true, independent: true,
  });
  assert.ok(closed.close.handoff.activeChanges.some((item) => item.id === change.id));

  const surface = validateAgentOsRuntimeSurface({
    session: closed,
    change: persistedChange,
    handoff: closed.close.handoff,
    finding: closed.close.openFindings[0],
    recommendation: closed.close.recommendations[0],
  });
  for (const contract of Object.values(surface)) {
    if (contract) assert.equal(contract.valid, true, JSON.stringify(contract));
  }

  const rendered = formatEvidenceAddresses(closed.close.openFindings, closed.close.recommendations);
  assert.match(rendered, /Record:/);
  assert.match(rendered, /Evidence: (observed|inferred) · confidence (high|medium|low)/);
  assert.match(rendered, new RegExp(change.id));
});

test('recommendation, severity, package and local test do not authorize external action', () => {
  assert.equal(checkExternalActionAuthorization({}), false);
  assert.equal(checkExternalActionAuthorization({ explicitAuthorization: false }), false);
  assert.equal(checkExternalActionAuthorization({ explicitAuthorization: true }), true);
});
