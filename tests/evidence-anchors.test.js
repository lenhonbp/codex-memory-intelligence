import test from 'node:test';
import assert from 'node:assert/strict';
import { extractEvidenceAnchors, formatEvidenceAnchor, normalizeEvidenceAnchor, verificationStateForFinding } from '../src/evidence-anchors.js';

test('normalizes project-relative evidence anchors', () => {
  assert.deepEqual(normalizeEvidenceAnchor({ path: './src/ui/Hud.tsx', startLine: 14, endLine: 22, symbol: 'CombatHud', feature: 'player-surface', commit: 'abc123' }), {
    path: 'src/ui/Hud.tsx', startLine: 14, endLine: 22, symbol: 'CombatHud', feature: 'player-surface', commit: 'abc123',
  });
});

test('extracts line, symbol, feature, and commit anchors from portable evidence syntax', () => {
  const anchors = extractEvidenceAnchors({
    detail: 'Default UI exposed diagnostics at src/app/CombatHud.tsx:142-167.',
    evidence: ['source:src/app/CombatHud.tsx:142-167', 'symbol:CombatDiagnostics', 'feature:player-surface', 'commit:abe3613'],
    relatedFiles: ['src/app/CombatHud.tsx'],
  });
  assert.equal(anchors[0].path, 'src/app/CombatHud.tsx');
  assert.equal(anchors[0].startLine, 142);
  assert.equal(anchors[0].endLine, 167);
  assert.equal(anchors[0].symbol, 'CombatDiagnostics');
  assert.equal(anchors[0].feature, 'player-surface');
  assert.equal(anchors[0].commit, 'abe3613');
  assert.match(formatEvidenceAnchor(anchors[0]), /src\/app\/CombatHud\.tsx:142-167/);
  assert.match(formatEvidenceAnchor(anchors[0]), /symbol CombatDiagnostics/);
});

test('keeps source observation distinct from established violation', () => {
  assert.equal(verificationStateForFinding({ state: 'open', category: 'consistency-rule', evidenceType: 'reviewed' }), 'suspected');
  assert.equal(verificationStateForFinding({ state: 'open', category: 'unexpected-impact', evidenceType: 'observed' }), 'observed');
  assert.equal(verificationStateForFinding({ state: 'open', category: 'verification-failed', evidenceType: 'observed' }), 'established');
  assert.equal(verificationStateForFinding({ state: 'resolved', category: 'verification-failed', evidenceType: 'observed' }), 'resolved');
});
