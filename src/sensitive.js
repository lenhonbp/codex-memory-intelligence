function shannonEntropy(value) {
  const text = String(value || '');
  if (!text) return 0;
  const counts = new Map();
  for (const char of text) counts.set(char, (counts.get(char) || 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / text.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

function credentialLike(value) {
  const token = String(value || '');
  if (token.length < 20 || token.length > 500 || /\s/.test(token)) return false;
  if (/^[0-9a-f]{40,64}$/i.test(token)) return false;
  if (/^[0-9a-f-]{32,36}$/i.test(token)) return false;
  const classes = [/[a-z]/.test(token), /[A-Z]/.test(token), /\d/.test(token), /[-_+/=.]/.test(token)].filter(Boolean).length;
  return classes >= 3 && shannonEntropy(token) >= 3.5;
}

export function looksSensitive(value) {
  const text = String(value || '');
  if (!text) return false;
  if (/-----BEGIN [A-Z ]*(?:PRIVATE KEY|OPENSSH PRIVATE KEY)-----/.test(text)) return true;
  if (/\b(?:api[_ -]?key|password|passwd|secret|client[_ -]?secret|access[_ -]?token|refresh[_ -]?token|auth(?:orization)?|credential)\s*[:=]\s*\S{6,}/i.test(text)) return true;
  if (/\bBearer\s+[A-Za-z0-9._~+\/-]{16,}={0,2}\b/i.test(text)) return true;
  if (/\b[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/i.test(text)) return true;
  if (/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/.test(text)) return true;
  if (/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/.test(text)) return true;
  if (/\bAIza[0-9A-Za-z_-]{30,}\b/.test(text)) return true;
  if (/\b(?:ghp|gho|ghu|ghs|ghr|github_pat|glpat|npm_|xox[baprs]|sk_live|rk_live)[-_A-Za-z0-9]{12,}\b/.test(text)) return true;
  for (const match of text.matchAll(/\b(?:token|secret|key|credential)\b[^\n]{0,24}?([A-Za-z0-9_+\/.=-]{20,})/gi)) {
    if (credentialLike(match[1])) return true;
  }
  return false;
}

export const SECRET_GUARD_DESCRIPTION = 'Best-effort accidental-secret detection only; not a DLP or security boundary.';
