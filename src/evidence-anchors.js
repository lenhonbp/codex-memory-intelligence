const PATH_LINE = /(?:^|\s)([A-Za-z0-9_./@+-]+\.[A-Za-z0-9]+):(\d+)(?:-(\d+))?(?=$|[\s,;).])/g;
const PREFIX = /^(source|symbol|feature|commit|verification):(.+)$/i;

function compact(value, limit = 500) {
  const clean = String(value || '').trim();
  if (!clean) return null;
  return clean.length <= limit ? clean : clean.slice(0, limit);
}

function normalizePath(value) {
  const clean = compact(value);
  if (!clean) return null;
  return clean.replace(/\\/g, '/').replace(/^\.\//, '');
}

function anchorKey(anchor) {
  return [anchor.path || '', anchor.startLine || '', anchor.endLine || '', anchor.symbol || '', anchor.feature || '', anchor.commit || ''].join('|');
}

export function normalizeEvidenceAnchor(anchor = {}) {
  const path = normalizePath(anchor.path);
  const startLine = Number.isInteger(anchor.startLine) && anchor.startLine > 0 ? anchor.startLine : null;
  const endLine = Number.isInteger(anchor.endLine) && anchor.endLine >= (startLine || 1) ? anchor.endLine : startLine;
  return {
    path,
    startLine,
    endLine,
    symbol: compact(anchor.symbol, 200),
    feature: compact(anchor.feature, 200),
    commit: compact(anchor.commit, 100),
  };
}

export function extractEvidenceAnchors(input = {}) {
  const evidence = Array.isArray(input.evidence) ? input.evidence : [];
  const relatedFiles = Array.isArray(input.relatedFiles) ? input.relatedFiles : [];
  const detail = compact(input.detail, 4000) || '';
  const anchors = [];
  let symbol = null;
  let feature = null;
  let commit = null;

  for (const raw of evidence) {
    const value = compact(raw);
    if (!value) continue;
    const prefixed = value.match(PREFIX);
    if (!prefixed) continue;
    const [, kind, payload] = prefixed;
    if (kind.toLowerCase() === 'symbol') symbol = compact(payload, 200);
    if (kind.toLowerCase() === 'feature') feature = compact(payload, 200);
    if (kind.toLowerCase() === 'commit') commit = compact(payload, 100);
    if (kind.toLowerCase() === 'source') {
      const match = payload.match(/^(.+?):(\d+)(?:-(\d+))?$/);
      if (match) anchors.push(normalizeEvidenceAnchor({ path: match[1], startLine: Number(match[2]), endLine: Number(match[3] || match[2]) }));
      else anchors.push(normalizeEvidenceAnchor({ path: payload }));
    }
  }

  for (const text of [detail, ...evidence.map(String)]) {
    PATH_LINE.lastIndex = 0;
    let match;
    while ((match = PATH_LINE.exec(text))) anchors.push(normalizeEvidenceAnchor({ path: match[1], startLine: Number(match[2]), endLine: Number(match[3] || match[2]) }));
  }

  for (const file of relatedFiles) anchors.push(normalizeEvidenceAnchor({ path: file }));

  const seen = new Set();
  return anchors.filter((anchor) => anchor.path).map((anchor) => ({ ...anchor, symbol: anchor.symbol || symbol, feature: anchor.feature || feature, commit: anchor.commit || commit })).filter((anchor) => {
    const key = anchorKey(anchor);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);
}

export function verificationStateForFinding(finding = {}) {
  if (finding.state === 'resolved') return 'resolved';
  if (finding.verificationState && ['suspected', 'observed', 'established'].includes(finding.verificationState)) return finding.verificationState;
  if (['verification-failed', 'session-blocker'].includes(finding.category)) return 'established';
  if (finding.evidenceType === 'observed') return 'observed';
  return 'suspected';
}

export function formatEvidenceAnchor(anchor = {}) {
  const normalized = normalizeEvidenceAnchor(anchor);
  if (!normalized.path) return '';
  const line = normalized.startLine ? `:${normalized.startLine}${normalized.endLine && normalized.endLine !== normalized.startLine ? `-${normalized.endLine}` : ''}` : '';
  const extras = [normalized.symbol ? `symbol ${normalized.symbol}` : null, normalized.feature ? `feature ${normalized.feature}` : null, normalized.commit ? `commit ${normalized.commit}` : null].filter(Boolean);
  return `${normalized.path}${line}${extras.length ? ` · ${extras.join(' · ')}` : ''}`;
}
