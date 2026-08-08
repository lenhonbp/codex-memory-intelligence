import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { VERSION } from './version.js';
import { createIgnoreMatcher } from './ignore.js';
import { readConfig, status as getProjectStatus } from './core.js';
import { checkStaleMemory } from './stale.js';
import { collectExecutableProvenance, collectRepositoryProvenance } from './provenance.js';
import { ensureSafeMemoryRoot, safeWriteMemoryFile, DEFAULT_MAX_GENERATED_CACHE_BYTES } from './storage.js';
import { looksSensitive, SECRET_GUARD_DESCRIPTION } from './sensitive.js';

export const PORTABLE_SCHEMA_VERSION = 1;
export const PORTABLE_KIND = 'cmi-portable-evidence';
export const PORTABLE_PROVENANCE_FILE = 'portable-provenance.json';
export const MAX_PORTABLE_MANIFEST_BYTES = 2 * 1024 * 1024;
export const MAX_PORTABLE_ARTIFACT_BYTES = DEFAULT_MAX_GENERATED_CACHE_BYTES;
export const MAX_PORTABLE_ARTIFACTS = 20_000;
export const MAX_SOURCE_FILES = 20_000;
export const MAX_SOURCE_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_SOURCE_TOTAL_BYTES = 256 * 1024 * 1024;

const TRANSIENT_FILE = /(?:\.lock|\.tmp|\.bak)$/i;

function error(code, message, details = undefined) {
  const result = new Error(message);
  result.code = code;
  if (details !== undefined) result.details = details;
  return result;
}

function canonical(value) { return JSON.stringify(value); }
function digestBytes(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function digestText(value) { return `sha256:${digestBytes(value)}`; }
function nowIso() { return new Date().toISOString(); }

function normalizeRelative(value) {
  const raw = String(value || '').replace(/\\/g, '/');
  if (!raw || raw.startsWith('/') || /^[A-Za-z]:\//.test(raw)) throw error('CMI_PORTABLE_PATH_INVALID', `Portable path is not relative: ${value}`);
  const parts = raw.split('/').filter(Boolean);
  if (!parts.length || parts.some((item) => item === '.' || item === '..')) throw error('CMI_PORTABLE_PATH_INVALID', `Portable path escapes its bundle: ${value}`);
  return parts.join('/');
}

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function realpathOrNull(target) {
  try { return await fs.realpath(target); } catch { return null; }
}

async function noFollowOpen(target, flags) {
  const noFollow = typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0;
  try { return { handle: await fs.open(target, flags | noFollow), noFollow: Boolean(noFollow) }; }
  catch (openError) {
    if (!noFollow || !['EINVAL', 'ENOTSUP'].includes(openError?.code)) throw openError;
    return { handle: await fs.open(target, flags), noFollow: false };
  }
}

async function assertSafeParents(base, target, label) {
  const baseAbsolute = path.resolve(base);
  const targetAbsolute = path.resolve(target);
  if (!inside(baseAbsolute, targetAbsolute)) throw error('CMI_PORTABLE_PATH_INVALID', `${label} escapes its intended boundary.`);
  const relative = path.relative(baseAbsolute, targetAbsolute);
  const parts = relative.split(path.sep).filter(Boolean).slice(0, -1);
  let current = baseAbsolute;
  const baseReal = await realpathOrNull(baseAbsolute);
  if (!baseReal) throw error('CMI_PORTABLE_READ_FAILED', `Could not resolve the ${label} boundary safely.`);
  for (const part of parts) {
    current = path.join(current, part);
    let stat;
    try { stat = await fs.lstat(current); }
    catch (cause) { throw error('CMI_PORTABLE_READ_FAILED', `Could not inspect the ${label} parent path.`, { cause: cause?.code || 'unknown' }); }
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw error('CMI_PORTABLE_UNSAFE_PATH', `${label} contains an unsafe parent path.`);
    const realCurrent = await realpathOrNull(current);
    if (!realCurrent || !inside(baseReal, realCurrent)) throw error('CMI_PORTABLE_UNSAFE_PATH', `${label} resolves outside its intended boundary.`);
  }
}

async function readStableFile(target, maxBytes, label, base = path.dirname(target)) {
  await assertSafeParents(base, target, label);
  let before;
  try { before = await fs.lstat(target); }
  catch (cause) { throw error('CMI_PORTABLE_READ_FAILED', `Could not inspect ${label}.`, { cause: cause?.code || 'unknown' }); }
  if (before.isSymbolicLink() || !before.isFile()) throw error('CMI_PORTABLE_UNSAFE_PATH', `${label} must be a regular non-symlink file.`);
  if (before.size > maxBytes) throw error('CMI_PORTABLE_OVERSIZED', `${label} exceeds the ${maxBytes}-byte safety limit.`);
  let opened;
  try {
    opened = await noFollowOpen(target, fsConstants.O_RDONLY);
    const stat = await opened.handle.stat();
    if (!stat.isFile() || stat.size > maxBytes || before.dev !== stat.dev || before.ino !== stat.ino) throw error('CMI_PORTABLE_READ_RACE', `${label} changed while it was being read.`);
    if (!opened.noFollow) {
      const after = await fs.lstat(target);
      if (after.isSymbolicLink() || !after.isFile() || after.dev !== stat.dev || after.ino !== stat.ino) throw error('CMI_PORTABLE_READ_RACE', `${label} changed while it was being read.`);
    }
    const content = await opened.handle.readFile();
    if (content.byteLength > maxBytes) throw error('CMI_PORTABLE_OVERSIZED', `${label} exceeds the ${maxBytes}-byte safety limit after opening.`);
    return content;
  } catch (cause) {
    if (cause?.code?.startsWith?.('CMI_PORTABLE_')) throw cause;
    throw error('CMI_PORTABLE_READ_FAILED', `Could not safely read ${label}.`, { cause: cause?.code || 'unknown' });
  } finally { await opened?.handle?.close().catch(() => {}); }
}

async function ensureNoSymlinkDirectory(target, label) {
  let stat;
  try { stat = await fs.lstat(target); }
  catch (cause) { throw error('CMI_PORTABLE_READ_FAILED', `Could not inspect ${label}.`, { cause: cause?.code || 'unknown' }); }
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw error('CMI_PORTABLE_UNSAFE_PATH', `${label} must be a regular non-symlink directory.`);
}

async function walkDirectory(root, current, options, output = []) {
  let entries;
  try { entries = await fs.readdir(current, { withFileTypes: true }); }
  catch (cause) { throw error('CMI_PORTABLE_READ_FAILED', `Could not list ${path.relative(root, current) || '.'}.`, { cause: cause?.code || 'unknown' }); }
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const full = path.join(current, entry.name);
    const relative = path.relative(root, full).split(path.sep).join('/');
    if (options.skip?.(relative, entry)) continue;
    if (entry.isSymbolicLink()) throw error('CMI_PORTABLE_UNSAFE_PATH', `Symbolic links are not allowed in the portable boundary: ${relative}`);
    if (entry.isDirectory()) await walkDirectory(root, full, options, output);
    else if (entry.isFile()) output.push({ full, relative });
    else throw error('CMI_PORTABLE_UNSAFE_PATH', `Unsupported filesystem entry in the portable boundary: ${relative}`);
    if (output.length > (options.maxEntries || MAX_PORTABLE_ARTIFACTS)) throw error('CMI_PORTABLE_LIMIT', 'Portable evidence contains too many files.');
  }
  return output;
}

async function readTextForSecretCheck(content, label) {
  const text = content.toString('utf8');
  if (Buffer.from(text, 'utf8').equals(content) && looksSensitive(text)) {
    throw error('CMI_PORTABLE_SENSITIVE_CONTENT', `${label} appears to contain credential-like content; freeze stopped. ${SECRET_GUARD_DESCRIPTION}`);
  }
}

async function evidenceFiles(root) {
  const memory = await ensureSafeMemoryRoot(root, { create: false });
  if (!memory) throw error('CMI_EVIDENCE_UNINITIALIZED', 'Project memory is not initialized; run cmi init and cmi scan before freezing evidence.');
  const files = await walkDirectory(memory, memory, {
    maxEntries: MAX_PORTABLE_ARTIFACTS,
    skip: (relative, entry) => entry.isFile() && (relative === PORTABLE_PROVENANCE_FILE || TRANSIENT_FILE.test(relative)),
  });
  const artifacts = [];
  for (const file of files) {
    const content = await readStableFile(file.full, MAX_PORTABLE_ARTIFACT_BYTES, `.codex-memory/${file.relative}`, memory);
    await readTextForSecretCheck(content, `.codex-memory/${file.relative}`);
    artifacts.push({ path: `.codex-memory/${file.relative}`, size: content.byteLength, digest: digestText(content) });
  }
  artifacts.sort((left, right) => left.path.localeCompare(right.path));
  if (!artifacts.some((item) => item.path === '.codex-memory/memory.md') || !artifacts.some((item) => item.path === '.codex-memory/decisions.md') || !artifacts.some((item) => item.path === '.codex-memory/mistakes.md')) {
    throw error('CMI_EVIDENCE_INCOMPLETE', 'Portable freeze requires the three durable memory files: memory.md, decisions.md, and mistakes.md.');
  }
  return artifacts;
}

async function sourceFiles(root) {
  const config = await readConfig(root);
  const matcher = await createIgnoreMatcher(root, config);
  const files = await walkDirectory(root, root, {
    maxEntries: MAX_SOURCE_FILES,
    skip: (relative, entry) => matcher.shouldIgnore(relative, entry.isDirectory()),
  });
  let totalBytes = 0;
  const records = [];
  for (const file of files) {
    const content = await readStableFile(file.full, MAX_SOURCE_FILE_BYTES, file.relative, root);
    totalBytes += content.byteLength;
    if (totalBytes > MAX_SOURCE_TOTAL_BYTES) throw error('CMI_PORTABLE_LIMIT', `Source content exceeds the ${MAX_SOURCE_TOTAL_BYTES}-byte identity limit.`);
    records.push({ path: file.relative, size: content.byteLength, digest: digestText(content) });
  }
  records.sort((left, right) => left.path.localeCompare(right.path));
  const material = records.map((item) => `${item.path}\0${item.size}\0${item.digest}\n`).join('');
  return { algorithm: 'sha256', digest: digestText(material), fileCount: records.length, bytes: totalBytes };
}

function evidenceDigest(files) {
  return digestText(files.map((item) => `${item.path}\0${item.size}\0${item.digest}\n`).join(''));
}

function identityMaterial(manifest) {
  return {
    schemaVersion: manifest.schemaVersion,
    kind: manifest.kind,
    format: manifest.format,
    cmi: { version: manifest.cmi.version, sourceRevision: manifest.cmi.sourceRevision || null },
    project: {
      sourceIdentity: manifest.project.sourceIdentity,
      repository: manifest.project.repository,
      sourceRevision: manifest.project.sourceRevision,
      worktreeClean: manifest.project.worktreeClean,
    },
    evidence: {
      format: manifest.evidence.format,
      files: manifest.evidence.files,
      digest: manifest.evidence.digest,
    },
  };
}

function buildIdentityDigest(manifest) { return digestText(canonical(identityMaterial(manifest))); }

function assertManifestShape(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw error('CMI_PORTABLE_MANIFEST_INVALID', 'Portable manifest must be a JSON object.');
  if (manifest.schemaVersion !== PORTABLE_SCHEMA_VERSION || manifest.kind !== PORTABLE_KIND) throw error('CMI_PORTABLE_SCHEMA_UNSUPPORTED', `Unsupported portable manifest schema or kind (schema ${manifest.schemaVersion || 'unknown'}).`);
  const sourceIdentity = manifest.project?.sourceIdentity;
  const repository = manifest.project?.repository;
  if (manifest.format?.algorithm !== 'sha256' || manifest.format?.bundleLayout !== 'directory-v1' || manifest.format?.authenticated !== false || manifest.evidence?.format?.artifactRoot !== '.codex-memory' || manifest.evidence?.format?.storageSchemaVersion !== 1 || !manifest.evidence?.format?.reservedFiles?.includes(PORTABLE_PROVENANCE_FILE)) throw error('CMI_PORTABLE_MANIFEST_INVALID', 'Portable manifest format is unsupported or incomplete.');
  if (!manifest.cmi || typeof manifest.cmi.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.cmi.version) || (manifest.cmi.sourceRevision !== null && !/^[0-9a-f]{40}$/i.test(manifest.cmi.sourceRevision))) throw error('CMI_PORTABLE_MANIFEST_INVALID', 'Portable manifest CMI provenance is invalid.');
  if (!sourceIdentity || sourceIdentity.algorithm !== 'sha256' || !/^sha256:[0-9a-f]{64}$/.test(sourceIdentity.digest) || !Number.isInteger(sourceIdentity.fileCount) || sourceIdentity.fileCount < 0 || sourceIdentity.fileCount > MAX_SOURCE_FILES || !Number.isInteger(sourceIdentity.bytes) || sourceIdentity.bytes < 0 || sourceIdentity.bytes > MAX_SOURCE_TOTAL_BYTES || manifest.project.sourceRevision === undefined || !repository || typeof repository.available !== 'boolean' || !['git-origin-hash', 'unavailable'].includes(repository.identityBasis) || (repository.identity !== null && !/^sha256:[0-9a-f]{64}$/.test(repository.identity)) || !manifest.evidence?.digest || !/^sha256:[0-9a-f]{64}$/.test(manifest.evidence.digest) || !Array.isArray(manifest.evidence.files)) throw error('CMI_PORTABLE_MANIFEST_INVALID', 'Portable manifest identity or artifact inventory is missing.');
  if (manifest.project.sourceRevision !== null && !/^[0-9a-f]{40}$/i.test(manifest.project.sourceRevision)) throw error('CMI_PORTABLE_MANIFEST_INVALID', 'Portable project source revision is invalid.');
  if (manifest.project.worktreeClean !== null && typeof manifest.project.worktreeClean !== 'boolean') throw error('CMI_PORTABLE_MANIFEST_INVALID', 'Portable project worktree cleanliness must be boolean or null.');
  if (!manifest.project.location || typeof manifest.project.location.path !== 'string' || !manifest.creation || typeof manifest.creation.frozenAt !== 'string' || !Number.isFinite(Date.parse(manifest.creation.frozenAt)) || !manifest.provenance || typeof manifest.provenance.trustBoundary !== 'string') throw error('CMI_PORTABLE_MANIFEST_INVALID', 'Portable creation, location, or trust-boundary provenance is missing.');
  if (manifest.evidence.files.length > MAX_PORTABLE_ARTIFACTS) throw error('CMI_PORTABLE_LIMIT', 'Portable manifest contains too many artifacts.');
  const seen = new Set();
  const sortedPaths = manifest.evidence.files.map((item) => item?.path || '');
  if (JSON.stringify(sortedPaths) !== JSON.stringify([...sortedPaths].sort((left, right) => left.localeCompare(right)))) throw error('CMI_PORTABLE_MANIFEST_INVALID', 'Portable artifact inventory must be deterministically sorted.');
  for (const item of manifest.evidence.files) {
    if (!item || typeof item.path !== 'string' || !item.path.startsWith('.codex-memory/')) throw error('CMI_PORTABLE_MANIFEST_INVALID', 'Portable artifact paths must remain inside .codex-memory/.');
    const normalized = normalizeRelative(item.path);
    const key = process.platform === 'win32' ? item.path.toLowerCase() : item.path;
    if (normalized !== item.path || item.path.endsWith(`/${PORTABLE_PROVENANCE_FILE}`) || seen.has(key)) throw error('CMI_PORTABLE_MANIFEST_INVALID', `Portable artifact path is duplicate, reserved, or unsafe: ${item.path}`);
    if (!Number.isInteger(item.size) || item.size < 0 || item.size > MAX_PORTABLE_ARTIFACT_BYTES || !/^sha256:[0-9a-f]{64}$/.test(item.digest)) throw error('CMI_PORTABLE_MANIFEST_INVALID', `Portable artifact descriptor is invalid: ${item.path}`);
    seen.add(key);
  }
  if (manifest.evidence.digest !== evidenceDigest(manifest.evidence.files)) throw error('CMI_PORTABLE_MANIFEST_INVALID', 'Portable evidence inventory digest does not match its entries.');
  if (!manifest.identity || manifest.identity.algorithm !== 'sha256' || manifest.identity.digest !== buildIdentityDigest(manifest)) throw error('CMI_PORTABLE_MANIFEST_CORRUPT', 'Portable manifest identity digest does not verify.');
  return manifest;
}

export function validatePortableManifestContract(manifest) {
  try {
    assertManifestShape(manifest);
    return { valid: true, errors: [] };
  } catch (cause) {
    return { valid: false, errors: [cause.message], code: cause.code || 'CMI_PORTABLE_MANIFEST_INVALID' };
  }
}

async function readManifest(bundlePath) {
  const target = path.resolve(String(bundlePath || '').trim());
  if (!String(bundlePath || '').trim()) throw error('CMI_PORTABLE_PATH_INVALID', 'Portable bundle path is required.');
  await ensureNoSymlinkDirectory(target, 'Portable bundle');
  const manifestContent = await readStableFile(path.join(target, 'manifest.json'), MAX_PORTABLE_MANIFEST_BYTES, 'Portable manifest');
  let manifest;
  try { manifest = JSON.parse(manifestContent.toString('utf8')); }
  catch { throw error('CMI_PORTABLE_MANIFEST_INVALID', 'Portable manifest is not valid JSON.'); }
  return { target, manifest: assertManifestShape(manifest) };
}

async function readBundleArtifacts(bundle) {
  const contents = [];
  for (const descriptor of bundle.manifest.evidence.files) {
    const relative = normalizeRelative(descriptor.path);
    const target = path.join(bundle.target, 'evidence', relative);
    if (!inside(bundle.target, target)) throw error('CMI_PORTABLE_PATH_INVALID', `Portable artifact escapes the bundle: ${descriptor.path}`);
    const content = await readStableFile(target, MAX_PORTABLE_ARTIFACT_BYTES, `Portable artifact ${descriptor.path}`, bundle.target);
    if (content.byteLength !== descriptor.size || digestText(content) !== descriptor.digest) throw error('CMI_PORTABLE_DIGEST_MISMATCH', `Portable artifact digest mismatch: ${descriptor.path}`);
    await readTextForSecretCheck(content, `Portable artifact ${descriptor.path}`);
    contents.push({ descriptor, content });
  }
  return contents;
}

async function compareProject(manifest, root) {
  const projectRoot = await realpathOrNull(path.resolve(root));
  if (!projectRoot) throw error('CMI_PORTABLE_PATH_INVALID', 'Destination project root could not be resolved safely.');
  const sourceIdentity = await sourceFiles(projectRoot);
  const repository = await collectRepositoryProvenance(projectRoot);
  const mismatches = [];
  const notes = [];
  if (sourceIdentity.digest !== manifest.project.sourceIdentity.digest) mismatches.push({ dimension: 'source-content', expected: manifest.project.sourceIdentity.digest, observed: sourceIdentity.digest, reason: 'Project source content differs from the frozen source identity.' });
  if (manifest.project.repository?.identity && repository.identity && manifest.project.repository.identity !== repository.identity) mismatches.push({ dimension: 'repository', expected: manifest.project.repository.identity, observed: repository.identity, reason: 'Git repository identity differs.' });
  else if (manifest.project.repository?.identity && !repository.identity) notes.push('Repository identity could not be re-established at the destination.');
  if (manifest.project.sourceRevision && repository.revision && manifest.project.sourceRevision !== repository.revision) mismatches.push({ dimension: 'revision', expected: manifest.project.sourceRevision, observed: repository.revision, reason: 'Git source revision differs.' });
  else if (manifest.project.sourceRevision && !repository.revision) notes.push('Frozen Git revision could not be re-established at the destination; content identity was checked instead.');
  const exactProof = !mismatches.length && (!manifest.project.repository?.identity || Boolean(repository.identity)) && (!manifest.project.sourceRevision || Boolean(repository.revision)) && (!manifest.project.repository?.identity || manifest.project.repository.identity === repository.identity) && (!manifest.project.sourceRevision || manifest.project.sourceRevision === repository.revision);
  const frozenPath = manifest.project.location?.path || null;
  const samePath = Boolean(frozenPath && path.resolve(frozenPath) === projectRoot);
  let state = 'mismatch';
  if (!mismatches.length) state = exactProof && samePath ? 'exact' : exactProof ? 'compatible-relocated' : 'compatible-content-only';
  return { state, projectRoot, sourceIdentity, repository, mismatches, notes, samePath, exactProof };
}

async function existingEvidenceMatches(root, manifest) {
  const stale = await checkStaleMemory(root);
  if (stale.counts.blocked > 0) throw error('CMI_PORTABLE_DESTINATION_CONFLICT', 'Existing destination evidence is blocked and cannot be overwritten.', stale);
  const current = await evidenceFiles(root);
  return current.length === manifest.evidence.files.length && current.every((item, index) => {
    const expected = manifest.evidence.files[index];
    return item.path === expected.path && item.size === expected.size && item.digest === expected.digest;
  });
}

async function writeProvenance(stagingRoot, manifest, comparison, operation) {
  const value = {
    schemaVersion: 1,
    kind: 'cmi-portable-provenance',
    original: {
      manifestIdentity: manifest.identity.digest,
      frozenAt: manifest.creation.frozenAt,
      sourceIdentity: manifest.project.sourceIdentity,
      repository: manifest.project.repository,
      sourceRevision: manifest.project.sourceRevision,
      location: manifest.project.location,
    },
    requested: { operation, requestedAt: nowIso() },
    verification: {
      state: comparison.state,
      sourceIdentity: comparison.sourceIdentity,
      repository: comparison.repository,
      samePath: comparison.samePath,
      exactProof: comparison.exactProof,
      notes: comparison.notes,
    },
    trust: {
      authenticated: false,
      statement: 'Portable evidence is digest-verified and compatibility-checked, but this bundle is not authenticated or a proof of source authorship.',
    },
  };
  await safeWriteMemoryFile(stagingRoot, PORTABLE_PROVENANCE_FILE, `${JSON.stringify(value, null, 2)}\n`, { ifMissing: true });
  return value;
}

async function stageRestore(root, artifactContents, manifest, comparison, operation) {
  const projectRoot = comparison.projectRoot;
  const temporaryRoot = await fs.mkdtemp(path.join(projectRoot, `.cmi-restore-${process.pid}-`));
  try {
    for (const { descriptor, content } of artifactContents) {
      const relative = descriptor.path.slice('.codex-memory/'.length);
      await safeWriteMemoryFile(temporaryRoot, relative, content, { ifMissing: true });
    }
    const provenance = await writeProvenance(temporaryRoot, manifest, comparison, operation);
    const stagedMemory = path.join(temporaryRoot, '.codex-memory');
    const destinationMemory = path.join(projectRoot, '.codex-memory');
    let existing;
    try { existing = await fs.lstat(destinationMemory); } catch (cause) { if (cause?.code !== 'ENOENT') throw cause; }
    if (existing) throw error('CMI_PORTABLE_DESTINATION_CONFLICT', 'Destination .codex-memory appeared during restore; no evidence was overwritten.');
    await fs.rename(stagedMemory, destinationMemory);
    return provenance;
  } finally { await fs.rm(temporaryRoot, { recursive: true, force: true }).catch(() => {}); }
}

export async function freezePortableEvidence(root, bundlePath) {
  const projectRoot = await realpathOrNull(path.resolve(root));
  if (!projectRoot) throw error('CMI_PORTABLE_PATH_INVALID', 'Project root could not be resolved safely.');
  const target = path.resolve(String(bundlePath || '').trim());
  if (!String(bundlePath || '').trim()) throw error('CMI_PORTABLE_PATH_INVALID', 'Portable bundle path is required.');
  if (inside(projectRoot, target)) throw error('CMI_PORTABLE_PATH_INVALID', 'Portable bundle must be outside the project root so it cannot become source evidence.');
  const targetParent = path.dirname(target);
  await ensureNoSymlinkDirectory(targetParent, 'Portable bundle parent');
  let existing;
  try { existing = await fs.lstat(target); } catch (cause) { if (cause?.code !== 'ENOENT') throw cause; }
  if (existing) throw error('CMI_PORTABLE_DESTINATION_CONFLICT', 'Portable bundle destination already exists; refusing to overwrite it.');
  const stale = await checkStaleMemory(projectRoot);
  if (stale.counts.blocked > 0) throw error('CMI_EVIDENCE_BLOCKED', 'Portable freeze stopped because trust-critical evidence is blocked and cannot be exported as trusted state.', stale);
  const projectStatus = await getProjectStatus(projectRoot);
  const artifacts = await evidenceFiles(projectRoot);
  const sourceIdentity = await sourceFiles(projectRoot);
  const repository = await collectRepositoryProvenance(projectRoot);
  const executable = await collectExecutableProvenance({ projectRoot });
  const manifest = {
    schemaVersion: PORTABLE_SCHEMA_VERSION,
    kind: PORTABLE_KIND,
    format: { algorithm: 'sha256', bundleLayout: 'directory-v1', authenticated: false },
    cmi: { version: VERSION, sourceRevision: executable.observed.sourceRevision || null, invocationKind: executable.observed.invocationKind, packageRoot: executable.observed.packageRoot || null },
    project: {
      sourceIdentity,
      repository: { available: repository.available, identity: repository.identity, identityBasis: repository.identityBasis },
      sourceRevision: repository.revision || null,
      worktreeClean: repository.worktreeClean,
      location: { path: projectRoot },
    },
    evidence: {
      format: { storageSchemaVersion: 1, artifactRoot: '.codex-memory', reservedFiles: [PORTABLE_PROVENANCE_FILE] },
      files: artifacts,
      digest: evidenceDigest(artifacts),
      health: { state: projectStatus.evidenceHealth?.state || 'unknown', memory: projectStatus.memoryHealth || null, graph: projectStatus.graphHealth || null },
    },
    creation: { frozenAt: nowIso(), tool: 'cmi evidence freeze' },
    provenance: { requestedRebind: null, trustBoundary: 'observed identity and compatibility evidence; not authenticated provenance' },
  };
  manifest.identity = { algorithm: 'sha256', digest: buildIdentityDigest(manifest) };
  assertManifestShape(manifest);
  let createdTarget = false;
  try {
    await fs.mkdir(target, { mode: 0o700 });
    createdTarget = true;
    await fs.mkdir(path.join(target, 'evidence'), { mode: 0o700 });
    for (const descriptor of artifacts) {
      const source = path.join(projectRoot, descriptor.path);
      const destination = path.join(target, 'evidence', descriptor.path);
      const destinationParent = path.dirname(destination);
      await fs.mkdir(destinationParent, { recursive: true, mode: 0o700 });
      await ensureNoSymlinkDirectory(destinationParent, `Portable bundle parent for ${descriptor.path}`);
      const content = await readStableFile(source, MAX_PORTABLE_ARTIFACT_BYTES, descriptor.path, projectRoot);
      if (content.byteLength !== descriptor.size || digestText(content) !== descriptor.digest) throw error('CMI_PORTABLE_READ_RACE', `Evidence changed while freezing: ${descriptor.path}`);
      await fs.writeFile(destination, content, { flag: 'wx', mode: 0o600 });
    }
    await fs.writeFile(path.join(target, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  } catch (cause) {
    if (createdTarget) await fs.rm(target, { recursive: true, force: true }).catch(() => {});
    if (cause?.code?.startsWith?.('CMI_')) throw cause;
    throw error('CMI_PORTABLE_FREEZE_FAILED', 'Portable freeze failed before producing a complete bundle.', { cause: cause?.code || 'unknown' });
  }
  return { schemaVersion: PORTABLE_SCHEMA_VERSION, kind: PORTABLE_KIND, path: target, state: 'frozen', identity: manifest.identity, artifacts: artifacts.length, evidenceDigest: manifest.evidence.digest, authenticated: false, manifest };
}

export async function inspectPortableEvidence(bundlePath) {
  const bundle = await readManifest(bundlePath);
  const artifacts = await readBundleArtifacts(bundle);
  return { schemaVersion: PORTABLE_SCHEMA_VERSION, kind: PORTABLE_KIND, path: bundle.target, state: 'verified', identity: bundle.manifest.identity, artifacts: artifacts.length, evidenceDigest: bundle.manifest.evidence.digest, authenticated: false, manifest: bundle.manifest };
}

export async function restorePortableEvidence(root, bundlePath, options = {}) {
  const operation = options.rebind ? 'rebind' : 'restore';
  const bundle = await readManifest(bundlePath);
  const artifacts = await readBundleArtifacts(bundle);
  const comparison = await compareProject(bundle.manifest, root);
  if (comparison.mismatches.length) throw error('CMI_EVIDENCE_MISMATCH', `Portable evidence ${operation} failed closed: ${comparison.mismatches.map((item) => item.reason).join(' ')}`, comparison);
  const destination = comparison.projectRoot;
  let existing;
  try { existing = await fs.lstat(path.join(destination, '.codex-memory')); } catch (cause) { if (cause?.code !== 'ENOENT') throw cause; }
  if (existing) {
    if (existing.isSymbolicLink() || !existing.isDirectory()) throw error('CMI_PORTABLE_UNSAFE_PATH', 'Destination .codex-memory is not a safe directory; no evidence was overwritten.');
    const same = await existingEvidenceMatches(destination, bundle.manifest).catch((cause) => { throw error('CMI_PORTABLE_DESTINATION_CONFLICT', `Existing destination evidence could not be safely validated; no evidence was overwritten.`, { cause: cause.message }); });
    if (!same) throw error('CMI_PORTABLE_DESTINATION_CONFLICT', 'Destination already contains different or incomplete CMI evidence; no evidence was overwritten.');
    return { schemaVersion: PORTABLE_SCHEMA_VERSION, kind: PORTABLE_KIND, state: comparison.state, path: destination, restored: false, alreadyPresent: true, identity: bundle.manifest.identity, evidenceDigest: bundle.manifest.evidence.digest, authenticated: false, verification: comparison };
  }
  const provenance = await stageRestore(destination, artifacts, bundle.manifest, comparison, operation);
  return { schemaVersion: PORTABLE_SCHEMA_VERSION, kind: PORTABLE_KIND, state: comparison.state, path: destination, restored: true, alreadyPresent: false, identity: bundle.manifest.identity, evidenceDigest: bundle.manifest.evidence.digest, authenticated: false, verification: comparison, provenance };
}
