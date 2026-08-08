import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { VERSION } from './version.js';

const execFileAsync = promisify(execFile);
const MAX_PACKAGE_BYTES = 2 * 1024 * 1024;

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(String(value)).digest('hex')}`;
}

function cleanOutput(value) {
  return String(value || '').trim();
}

async function realpathOrNull(value) {
  if (!value) return null;
  try { return await fs.realpath(value); } catch { return null; }
}

async function readPackage(packageFile) {
  let handle;
  try {
    const noFollow = typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0;
    let noFollowUsed = Boolean(noFollow);
    try { handle = await fs.open(packageFile, fsConstants.O_RDONLY | noFollow); }
    catch (openError) {
      if (!noFollow || !['EINVAL', 'ENOTSUP'].includes(openError?.code)) throw openError;
      noFollowUsed = false;
      handle = await fs.open(packageFile, fsConstants.O_RDONLY);
    }
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_PACKAGE_BYTES) return null;
    const parsed = JSON.parse(await handle.readFile('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    if (!noFollowUsed) {
      const after = await fs.lstat(packageFile);
      if (after.isSymbolicLink() || !after.isFile() || after.dev !== stat.dev || after.ino !== stat.ino) return null;
    }
    return {
      packageRoot: path.dirname(packageFile),
      packageFile,
      name: typeof parsed.name === 'string' ? parsed.name : null,
      version: typeof parsed.version === 'string' ? parsed.version : null,
      bin: parsed.bin || null,
    };
  } catch { return null; }
  finally { await handle?.close().catch(() => {}); }
}

async function nearestPackage(start) {
  if (!start) return null;
  let current = path.resolve(start);
  try {
    const stat = await fs.lstat(current);
    if (stat.isFile()) current = path.dirname(current);
  } catch { current = path.dirname(current); }
  while (true) {
    const found = await readPackage(path.join(current, 'package.json'));
    if (found) return found;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function runGit(root, args) {
  try {
    const result = await execFileAsync('git', args, {
      cwd: root,
      timeout: 4_000,
      maxBuffer: 1_048_576,
      windowsHide: true,
      encoding: 'utf8',
    });
    return { ok: true, value: cleanOutput(result.stdout) };
  } catch (error) {
    return { ok: false, value: '', code: error?.code || 'CMI_GIT_UNAVAILABLE' };
  }
}

function normalizeRemote(value) {
  const raw = cleanOutput(value);
  if (!raw) return null;
  try {
    if (/^[^/@\s]+@[^:]+:.+$/.test(raw)) {
      const [host, ...parts] = raw.split(':');
      return `${host.toLowerCase()}:${parts.join(':').replace(/\.git$/, '')}`;
    }
    const parsed = new URL(raw);
    parsed.username = '';
    parsed.password = '';
    parsed.hash = '';
    parsed.search = '';
    parsed.pathname = parsed.pathname.replace(/\.git$/, '');
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return raw.replace(/\.git$/, '').replace(/\/$/, '');
  }
}

export async function collectRepositoryProvenance(root) {
  const rootAbsolute = path.resolve(root);
  const resolvedRoot = await realpathOrNull(rootAbsolute);
  if (!resolvedRoot) {
    return { available: false, revision: null, worktreeClean: null, identity: null, identityBasis: 'unavailable', limitations: ['Project root could not be resolved safely.'] };
  }
  const gitRootResult = await runGit(resolvedRoot, ['rev-parse', '--show-toplevel']);
  if (!gitRootResult.ok || !gitRootResult.value) {
    return { available: false, revision: null, worktreeClean: null, identity: null, identityBasis: 'unavailable', limitations: ['Git repository identity is unavailable.'] };
  }
  const gitRoot = await realpathOrNull(gitRootResult.value) || path.resolve(gitRootResult.value);
  const revisionResult = await runGit(resolvedRoot, ['rev-parse', 'HEAD']);
  const revision = /^[0-9a-f]{40}$/i.test(revisionResult.value) ? revisionResult.value.toLowerCase() : null;
  const remoteResult = await runGit(resolvedRoot, ['config', '--get', 'remote.origin.url']);
  const normalizedRemote = normalizeRemote(remoteResult.value);
  const statusResult = await runGit(resolvedRoot, ['status', '--porcelain', '--untracked-files=all']);
  const worktreeClean = statusResult.ok ? statusResult.value === '' : null;
  return {
    available: true,
    root: gitRoot,
    revision,
    worktreeClean,
    identity: normalizedRemote ? sha256(`git-origin\0${normalizedRemote}`) : null,
    identityBasis: normalizedRemote ? 'git-origin-hash' : 'unavailable',
    limitations: [
      ...(normalizedRemote ? [] : ['No remote.origin.url was available; repository identity is not independently established.']),
      ...(revision ? [] : ['Git HEAD revision could not be established.']),
      ...(statusResult.ok ? [] : ['Git worktree cleanliness could not be established.']),
    ],
  };
}

async function resolveScriptPath() {
  const candidate = process.argv[1] ? path.resolve(process.argv[1]) : null;
  return realpathOrNull(candidate);
}

async function candidateFromPath(filePath) {
  const resolved = await realpathOrNull(filePath);
  if (!resolved) return null;
  const packageInfo = await nearestPackage(resolved);
  return {
    executablePath: resolved,
    scriptPath: /\.(?:mjs|cjs|js)$/i.test(resolved) ? resolved : null,
    packageRoot: packageInfo?.packageRoot || null,
    packageVersion: packageInfo?.version || null,
    packageName: packageInfo?.name || null,
  };
}

async function pathCandidates() {
  const names = process.platform === 'win32' ? ['cmi.cmd', 'cmi.exe', 'cmi'] : ['cmi'];
  const output = [];
  const seen = new Set();
  for (const directory of String(process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
    for (const name of names) {
      const candidate = await candidateFromPath(path.join(directory, name));
      if (!candidate || seen.has(candidate.executablePath)) continue;
      seen.add(candidate.executablePath);
      output.push(candidate);
    }
  }
  return output.slice(0, 20);
}

async function localPackageCandidates(projectRoot) {
  const output = [];
  const seen = new Set();
  let current = path.resolve(projectRoot || process.cwd());
  while (true) {
    const packageFile = path.join(current, 'node_modules', 'codex-memory-intelligence', 'package.json');
    const packageInfo = await readPackage(packageFile);
    if (packageInfo && !seen.has(packageInfo.packageRoot)) {
      seen.add(packageInfo.packageRoot);
      output.push({
        executablePath: null,
        scriptPath: null,
        packageRoot: packageInfo.packageRoot,
        packageVersion: packageInfo.version,
        packageName: packageInfo.name,
      });
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return output;
}

function hasNodeModulesSegment(root, candidate) {
  const relative = path.relative(root, candidate).split(path.sep);
  return relative.includes('node_modules');
}

function nodeModulesBase(packageRoot) {
  const segments = path.resolve(packageRoot).split(path.sep);
  const index = segments.lastIndexOf('node_modules');
  if (index < 0) return null;
  const base = segments.slice(0, index).join(path.sep);
  return base || path.parse(packageRoot).root;
}

function installKind({ packageRoot, sourceCheckout, projectRoot }) {
  if (!packageRoot) return 'unknown';
  if (sourceCheckout) return 'source-checkout';
  const dependencyBase = nodeModulesBase(packageRoot);
  if (dependencyBase && (inside(dependencyBase, projectRoot) || inside(projectRoot, dependencyBase))) return 'local-dependency';
  return 'global-package';
}

export async function collectExecutableProvenance(options = {}) {
  const projectRoot = await realpathOrNull(path.resolve(options.projectRoot || process.cwd())) || path.resolve(options.projectRoot || process.cwd());
  const runtimeExecutablePath = await realpathOrNull(process.execPath);
  const scriptPath = await resolveScriptPath();
  const packageInfo = await nearestPackage(scriptPath);
  const repository = packageInfo ? await collectRepositoryProvenance(packageInfo.packageRoot) : { available: false, revision: null, worktreeClean: null, identity: null, identityBasis: 'unavailable', limitations: [] };
  const sourceCheckout = Boolean(packageInfo?.packageRoot && repository.available && inside(repository.root, packageInfo.packageRoot) && !hasNodeModulesSegment(repository.root, packageInfo.packageRoot));
  const developmentInvocation = process.execArgv.some((value) => value === '--test' || value.startsWith('--test-')) || process.env.NODE_ENV === 'test' || process.env.CMI_DEV_MODE === '1';
  const kind = installKind({ packageRoot: packageInfo?.packageRoot, sourceCheckout, projectRoot });
  const invocationKind = developmentInvocation ? 'development-test' : kind;
  const actual = {
    runtimeExecutablePath,
    scriptPath,
    packageRoot: packageInfo?.packageRoot || null,
    packageName: packageInfo?.name || null,
    packageVersion: packageInfo?.version || null,
    installKind: kind,
    invocationKind,
    sourceCheckout,
    sourceRevision: sourceCheckout ? repository.revision : null,
    sourceWorktreeClean: sourceCheckout ? repository.worktreeClean : null,
  };
  const candidates = [];
  const addCandidate = (candidate, source) => {
    if (!candidate) return;
    const key = `${candidate.executablePath || ''}\0${candidate.packageRoot || ''}`;
    if (candidates.some((item) => item.key === key)) return;
    candidates.push({ key, source, ...candidate });
  };
  addCandidate({ executablePath: scriptPath, scriptPath, packageRoot: actual.packageRoot, packageVersion: actual.packageVersion, packageName: actual.packageName }, 'actual-invocation');
  for (const candidate of await pathCandidates()) addCandidate(candidate, 'PATH');
  for (const candidate of await localPackageCandidates(projectRoot)) addCandidate(candidate, 'project-local-candidate');
  const packageVersions = [...new Set(candidates.map((item) => item.packageVersion).filter(Boolean))];
  const packageRoots = [...new Set(candidates.map((item) => item.packageRoot).filter(Boolean))];
  const diagnostics = [];
  if (!actual.packageRoot) diagnostics.push('The invoked script could not be associated with a package root.');
  if (!actual.packageVersion) diagnostics.push('The invoked package semantic version is unknown.');
  if (packageVersions.length > 1) diagnostics.push(`Multiple CMI package versions are observable: ${packageVersions.join(', ')}.`);
  if (packageRoots.length > 1) diagnostics.push(`Multiple CMI package roots are observable (${packageRoots.length} candidates).`);
  if (actual.packageRoot && candidates.some((item) => item.source === 'project-local-candidate' && item.packageRoot !== actual.packageRoot)) {
    diagnostics.push('A project-local CMI candidate differs from the package used by this invocation.');
  }
  const limitations = [...new Set([...repository.limitations, ...diagnostics])];
  return {
    schemaVersion: 1,
    kind: 'cmi-executable-provenance',
    observed: actual,
    repository: {
      available: repository.available,
      identity: repository.identity,
      identityBasis: repository.identityBasis,
      revision: sourceCheckout ? repository.revision : null,
      worktreeClean: sourceCheckout ? repository.worktreeClean : null,
    },
    ambiguity: {
      ambiguous: diagnostics.some((item) => /Multiple|differs/.test(item)),
      diagnostics,
      candidates: candidates.map(({ key, ...candidate }) => candidate),
    },
    confidence: actual.packageRoot && actual.packageVersion ? (diagnostics.length ? 'medium' : 'high') : 'low',
    limitations,
    policy: 'Executable provenance reports observable runtime, package, source, and candidate-install evidence. Unknown or ambiguous values are preserved as unknown or ambiguous; CMI does not infer provenance from the current working directory package.json.',
    observedAt: new Date().toISOString(),
    cmi: { version: VERSION },
  };
}
