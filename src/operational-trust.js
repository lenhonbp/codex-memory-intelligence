import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ensureSafeMemoryRoot } from './storage.js';
import { looksSensitive, SECRET_GUARD_DESCRIPTION } from './sensitive.js';

const execFileAsync = promisify(execFile);
const MEMORY_DIR = '.codex-memory';
const MAX_SCAN_FILES = 2_000;
const MAX_SCAN_FILE_BYTES = 1_000_000;
const MAX_SCAN_TOTAL_BYTES = 32 * 1024 * 1024;
const MAX_EXPORT_BYTES = 16 * 1024 * 1024;
const REQUIRED_IGNORE_RULES = ['project-graph.json', 'project-index.json', 'snapshots/'];

export const OPERATIONAL_TRUST_SCHEMA_VERSION = 1;
export const OPERATIONAL_TRUST_POLICY = 'Durable .codex-memory records may be reviewed and shared intentionally. Generated or transient CMI state must remain untracked, and a clean bounded secret scan is required before sharing CMI state or exported evidence.';

function slash(value) { return String(value || '').replace(/\\/g, '/'); }
function cmiPath(relative) { return `${MEMORY_DIR}/${slash(relative)}`; }
function generatedOrTransient(relative) {
  const normalized = slash(relative).replace(/^\.\//, '');
  return normalized === 'project-graph.json'
    || normalized === 'project-index.json'
    || normalized === 'snapshots'
    || normalized.startsWith('snapshots/')
    || /(?:^|\/)[^/]+\.(?:lock|tmp|bak)$/i.test(normalized);
}
function check(code, pathValue, detail) { return { code, path: pathValue, detail }; }

async function runGit(root, args) {
  const result = await execFileAsync('git', args, { cwd: root, encoding: 'utf8', timeout: 5_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
  return String(result.stdout || '');
}

async function trackedMemoryFiles(root) {
  let top;
  try { top = (await runGit(root, ['rev-parse', '--show-toplevel'])).trim(); }
  catch { return { available: false, tracked: [], reason: 'Git repository metadata is unavailable; CMI cannot verify which project-memory files would be shared through Git.' }; }
  const projectRelative = slash(path.relative(top, path.resolve(root)));
  if (projectRelative.startsWith('../') || path.isAbsolute(projectRelative)) return { available: false, tracked: [], reason: 'Project root is outside the detected Git worktree.' };
  const scope = projectRelative && projectRelative !== '.' ? `${projectRelative}/${MEMORY_DIR}` : MEMORY_DIR;
  let output;
  try { output = await runGit(top, ['ls-files', '-z', '--', scope]); }
  catch { return { available: false, tracked: [], reason: 'Git tracked-file inventory could not be read.' }; }
  const prefix = `${scope}/`;
  const tracked = output.split('\0').filter(Boolean).map(slash).map((entry) => entry === scope ? '' : entry.startsWith(prefix) ? entry.slice(prefix.length) : entry).filter(Boolean).sort();
  return { available: true, tracked, reason: null };
}

async function readStableText(target, maxBytes) {
  const before = await fs.lstat(target);
  if (before.isSymbolicLink() || !before.isFile()) throw new Error('unsafe-entry');
  if (before.size > maxBytes) throw new Error('oversized');
  const noFollow = typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0;
  let handle;
  let usedNoFollow = Boolean(noFollow);
  try { handle = await fs.open(target, fsConstants.O_RDONLY | noFollow); }
  catch (error) {
    if (!noFollow || !['EINVAL', 'ENOTSUP'].includes(error?.code)) throw error;
    usedNoFollow = false;
    handle = await fs.open(target, fsConstants.O_RDONLY);
  }
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.size > maxBytes || opened.dev !== before.dev || opened.ino !== before.ino) throw new Error('read-race');
    if (!usedNoFollow) {
      const current = await fs.lstat(target);
      if (current.isSymbolicLink() || !current.isFile() || current.dev !== opened.dev || current.ino !== opened.ino) throw new Error('read-race');
    }
    const bytes = await handle.readFile();
    if (bytes.byteLength > maxBytes) throw new Error('oversized');
    const after = await handle.stat();
    if (after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs) throw new Error('read-race');
    const text = bytes.toString('utf8');
    if (!Buffer.from(text, 'utf8').equals(bytes)) throw new Error('non-text');
    return { text, bytes: bytes.byteLength };
  } finally { await handle?.close().catch(() => {}); }
}

async function readIgnorePolicy(memoryRoot) {
  const target = path.join(memoryRoot, '.gitignore');
  try {
    const value = await readStableText(target, 64 * 1024);
    const rules = value.text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
    return { present: true, safe: true, missing: REQUIRED_IGNORE_RULES.filter((rule) => !rules.includes(rule)) };
  } catch (error) {
    if (error?.code === 'ENOENT') return { present: false, safe: true, missing: [...REQUIRED_IGNORE_RULES] };
    return { present: true, safe: false, missing: [...REQUIRED_IGNORE_RULES] };
  }
}

async function scanDirectory(memoryRoot) {
  const findings = [];
  const incomplete = [];
  let filesScanned = 0;
  let bytesScanned = 0;

  async function walk(current) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      const relative = slash(path.relative(memoryRoot, full));
      if (generatedOrTransient(relative)) continue;
      if (entry.isSymbolicLink()) { findings.push(check('CMI_TRUST_UNSAFE_ENTRY', cmiPath(relative), 'Symbolic links are not allowed inside share-candidate CMI state.')); continue; }
      if (entry.isDirectory()) { await walk(full); continue; }
      if (!entry.isFile()) { findings.push(check('CMI_TRUST_UNSAFE_ENTRY', cmiPath(relative), 'Unsupported filesystem entry inside share-candidate CMI state.')); continue; }
      if (filesScanned >= MAX_SCAN_FILES) { incomplete.push(check('CMI_TRUST_SCAN_LIMIT', cmiPath(relative), `Secret scan exceeded ${MAX_SCAN_FILES} files.`)); return; }
      try {
        const value = await readStableText(full, MAX_SCAN_FILE_BYTES);
        if (bytesScanned + value.bytes > MAX_SCAN_TOTAL_BYTES) { incomplete.push(check('CMI_TRUST_SCAN_LIMIT', cmiPath(relative), `Secret scan exceeded ${MAX_SCAN_TOTAL_BYTES} bytes.`)); return; }
        filesScanned += 1;
        bytesScanned += value.bytes;
        if (looksSensitive(value.text)) findings.push(check('CMI_TRUST_SENSITIVE_CONTENT', cmiPath(relative), `Credential-like content detected. ${SECRET_GUARD_DESCRIPTION}`));
      } catch (error) {
        const code = error?.message === 'oversized' ? 'CMI_TRUST_OVERSIZED_FILE' : 'CMI_TRUST_UNSCANNABLE_FILE';
        incomplete.push(check(code, cmiPath(relative), 'File could not be completely scanned for accidental credentials.'));
      }
    }
  }

  await walk(memoryRoot);
  return {
    state: findings.length ? 'blocked' : incomplete.length ? 'degraded' : 'clean',
    complete: incomplete.length === 0,
    filesScanned,
    bytesScanned,
    findings,
    incomplete,
    guard: SECRET_GUARD_DESCRIPTION,
  };
}

export async function inspectCmiSharingPolicy(root) {
  let memoryRoot;
  try { memoryRoot = await ensureSafeMemoryRoot(root, { create: false }); }
  catch (error) {
    return { state: 'blocked', gitAvailable: false, trackedFiles: 0, generatedTracked: [], ignorePolicy: { present: false, safe: false, missing: [...REQUIRED_IGNORE_RULES] }, reasons: [error.message] };
  }
  if (!memoryRoot) return { state: 'uninitialized', gitAvailable: false, trackedFiles: 0, generatedTracked: [], ignorePolicy: { present: false, safe: true, missing: [...REQUIRED_IGNORE_RULES] }, reasons: ['Project memory is not initialized.'] };
  const [git, ignorePolicy] = await Promise.all([trackedMemoryFiles(root), readIgnorePolicy(memoryRoot)]);
  const generatedTracked = git.tracked.filter(generatedOrTransient).map(cmiPath);
  const reasons = [];
  if (generatedTracked.length) reasons.push(`${generatedTracked.length} generated/transient CMI path(s) are tracked by Git.`);
  if (!git.available) reasons.push(git.reason);
  if (!ignorePolicy.safe) reasons.push('The internal .codex-memory/.gitignore could not be safely inspected.');
  else if (ignorePolicy.missing.length) reasons.push(`Internal ignore policy is missing: ${ignorePolicy.missing.join(', ')}.`);
  const state = generatedTracked.length || !ignorePolicy.safe ? 'blocked' : !git.available || ignorePolicy.missing.length ? 'degraded' : 'healthy';
  return { state, gitAvailable: git.available, trackedFiles: git.tracked.length, generatedTracked, ignorePolicy, reasons };
}

export async function scanCmiStateForSecrets(root) {
  let memoryRoot;
  try { memoryRoot = await ensureSafeMemoryRoot(root, { create: false }); }
  catch (error) { return { state: 'blocked', complete: false, filesScanned: 0, bytesScanned: 0, findings: [check('CMI_TRUST_STORAGE_UNSAFE', MEMORY_DIR, error.message)], incomplete: [], guard: SECRET_GUARD_DESCRIPTION }; }
  if (!memoryRoot) return { state: 'uninitialized', complete: false, filesScanned: 0, bytesScanned: 0, findings: [], incomplete: [], guard: SECRET_GUARD_DESCRIPTION };
  return scanDirectory(memoryRoot);
}

export async function assessOperationalTrust(root) {
  const [sharing, secretScan] = await Promise.all([inspectCmiSharingPolicy(root), scanCmiStateForSecrets(root)]);
  const uninitialized = sharing.state === 'uninitialized' || secretScan.state === 'uninitialized';
  const blocked = sharing.state === 'blocked' || secretScan.state === 'blocked';
  const degraded = sharing.state === 'degraded' || secretScan.state === 'degraded';
  const state = uninitialized ? 'uninitialized' : blocked ? 'blocked' : degraded ? 'degraded' : 'healthy';
  const recommendations = [];
  if (sharing.generatedTracked.length) recommendations.push({ id: 'untrack-generated-cmi-state', action: 'Review `git ls-files -- .codex-memory` and remove generated/transient CMI paths from the Git index without deleting reviewed durable knowledge.' });
  if (sharing.ignorePolicy.missing.length) recommendations.push({ id: 'repair-cmi-ignore-policy', action: `Restore the reviewed internal ignore rules: ${REQUIRED_IGNORE_RULES.join(', ')}.` });
  if (secretScan.findings.some((item) => item.code === 'CMI_TRUST_SENSITIVE_CONTENT')) recommendations.push({ id: 'remove-sensitive-cmi-content', action: 'Remove the credential from CMI state, rotate/revoke it if exposed, and store only a non-secret reference.' });
  if (secretScan.incomplete.length) recommendations.push({ id: 'complete-secret-scan', action: 'Reduce or review unscannable CMI files before sharing; a partial scan is not a clean sharing attestation.' });
  return {
    schemaVersion: OPERATIONAL_TRUST_SCHEMA_VERSION,
    state,
    healthy: state === 'healthy',
    readyToShare: state === 'healthy',
    sharing,
    secretScan,
    recommendations,
    policy: OPERATIONAL_TRUST_POLICY,
  };
}

export async function scanExportCandidate(filePath) {
  const raw = String(filePath || '').trim();
  if (!raw) throw new Error('Export candidate path is required.');
  const target = path.resolve(raw);
  let value;
  try { value = await readStableText(target, MAX_EXPORT_BYTES); }
  catch {
    return { schemaVersion: 1, state: 'blocked', safeToShare: false, file: path.basename(target), bytesScanned: 0, findings: [check('CMI_TRUST_EXPORT_UNSCANNABLE', path.basename(target), 'Export candidate is not a bounded stable UTF-8 regular file and cannot receive a clean sharing attestation.')], guard: SECRET_GUARD_DESCRIPTION };
  }
  const sensitive = looksSensitive(value.text);
  return {
    schemaVersion: 1,
    state: sensitive ? 'blocked' : 'clean',
    safeToShare: !sensitive,
    file: path.basename(target),
    bytesScanned: value.bytes,
    findings: sensitive ? [check('CMI_TRUST_EXPORT_SENSITIVE_CONTENT', path.basename(target), `Credential-like content detected. ${SECRET_GUARD_DESCRIPTION}`)] : [],
    guard: SECRET_GUARD_DESCRIPTION,
  };
}

export function formatOperationalTrust(result) {
  const lines = [
    `CMI Operational Trust · ${result.state}`,
    `Ready to share: ${result.readyToShare ? 'yes' : 'no'}`,
    `Git sharing: ${result.sharing.state} · tracked=${result.sharing.trackedFiles} · generatedTracked=${result.sharing.generatedTracked.length}`,
    `Secret scan: ${result.secretScan.state} · files=${result.secretScan.filesScanned} · bytes=${result.secretScan.bytesScanned}`,
  ];
  for (const item of [...result.secretScan.findings, ...result.secretScan.incomplete].slice(0, 20)) lines.push(`- ${item.code} ${item.path}: ${item.detail}`);
  for (const reason of result.sharing.reasons.slice(0, 10)) lines.push(`- sharing: ${reason}`);
  for (const item of result.recommendations.slice(0, 10)) lines.push(`Next: ${item.action}`);
  return lines.join('\n');
}
