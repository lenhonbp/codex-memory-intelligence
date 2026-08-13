import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const REAL_CORPUS_SCHEMA_VERSION = 1;
const REAL_CORPUS_MANIFEST_KIND = 'cmi-real-corpus-manifest';
const REAL_CORPUS_REPORT_KIND = 'cmi-real-corpus-report';
const REPO_CLASSES = ['node-javascript', 'node-typescript', 'node-typescript-monorepo'];
const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_CMI_ENTRY = fileURLToPath(new URL('./cli-entry.js', import.meta.url));

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function boundedString(value, name, { max = 320 } = {}) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} must be a non-empty string`);
  const clean = value.trim();
  if (clean.length > max) throw new Error(`${name} exceeds ${max} characters`);
  if (clean.includes('\0')) throw new Error(`${name} contains a NUL byte`);
  return clean;
}

function oneOf(value, allowed, name) {
  if (!allowed.includes(value)) throw new Error(`${name} must be one of: ${allowed.join(', ')}`);
  return value;
}

function nonNegativeInteger(value, name) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  return value;
}

function validateRevision(value, name) {
  const revision = boundedString(value, name, { max: 40 });
  if (!/^[0-9a-f]{40}$/i.test(revision)) throw new Error(`${name} must be a 40-character Git commit SHA`);
  return revision.toLowerCase();
}

function validateRepository(value, name) {
  const repository = boundedString(value, name, { max: 180 });
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error(`${name} must use owner/repository form without a URL, branch, or .git suffix`);
  }
  return repository;
}

function validateTarget(value, name) {
  const target = boundedString(value, name, { max: 320 }).replaceAll('\\', '/');
  if (target.startsWith('/') || /^[A-Za-z]:\//.test(target) || target.split('/').includes('..')) {
    throw new Error(`${name} must be a repository-relative file or symbol target`);
  }
  return target;
}

function validateRepositoryEntry(entry, index) {
  if (!isObject(entry)) throw new Error(`repositories[${index}] must be an object`);
  return {
    id: boundedString(entry.id, `repositories[${index}].id`, { max: 120 }),
    repository: validateRepository(entry.repository, `repositories[${index}].repository`),
    revision: validateRevision(entry.revision, `repositories[${index}].revision`),
    repoClass: oneOf(entry.repoClass, REPO_CLASSES, `repositories[${index}].repoClass`),
    contextQuery: boundedString(entry.contextQuery, `repositories[${index}].contextQuery`, { max: 300 }),
    impactTarget: validateTarget(entry.impactTarget, `repositories[${index}].impactTarget`),
    minWorkspaces: nonNegativeInteger(entry.minWorkspaces ?? 0, `repositories[${index}].minWorkspaces`),
  };
}

export function validateRealCorpusManifest(manifest) {
  if (!isObject(manifest)) throw new Error('manifest must be an object');
  if (manifest.schemaVersion !== REAL_CORPUS_SCHEMA_VERSION) throw new Error(`Unsupported real corpus schemaVersion: ${manifest.schemaVersion}`);
  if (manifest.kind !== REAL_CORPUS_MANIFEST_KIND) throw new Error(`Invalid real corpus manifest kind: ${manifest.kind}`);
  if (!Array.isArray(manifest.repositories) || manifest.repositories.length < 1 || manifest.repositories.length > 20) {
    throw new Error('manifest.repositories must contain between 1 and 20 pinned repositories');
  }
  const repositories = manifest.repositories.map(validateRepositoryEntry);
  const ids = repositories.map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) throw new Error('repository ids must be unique');
  const pins = repositories.map((entry) => `${entry.repository}@${entry.revision}`);
  if (new Set(pins).size !== pins.length) throw new Error('repository revision pins must be unique');
  return { schemaVersion: REAL_CORPUS_SCHEMA_VERSION, kind: REAL_CORPUS_MANIFEST_KIND, repositories };
}

function repoUrl(repository) {
  return `https://github.com/${repository}.git`;
}

export function buildRealCorpusPlan(manifest) {
  const validated = validateRealCorpusManifest(manifest);
  return {
    schemaVersion: REAL_CORPUS_SCHEMA_VERSION,
    kind: 'cmi-real-corpus-plan',
    policy: {
      pinnedRevisions: true,
      disposableCheckouts: true,
      targetDependenciesInstalled: false,
      targetCodeExecuted: false,
      targetTestsExecuted: false,
      cmiStateScope: 'disposable-checkout-only',
    },
    repositories: validated.repositories.map((entry) => ({
      ...entry,
      steps: [
        { engine: 'git', action: 'init-disposable-checkout' },
        { engine: 'git', action: 'fetch-exact-revision', revision: entry.revision },
        { engine: 'git', action: 'verify-head', revision: entry.revision },
        { engine: 'cmi', action: 'init' },
        { engine: 'cmi', action: 'scan-full' },
        { engine: 'cmi', action: 'scan-incremental-reuse' },
        { engine: 'cmi', action: 'doctor-readiness' },
        { engine: 'cmi', action: 'context-query', query: entry.contextQuery },
        { engine: 'cmi', action: 'impact-query', target: entry.impactTarget },
        { engine: 'cmi', action: 'session-start-close-handoff' },
      ],
    })),
  };
}

function defaultCommandRunner(command, args, options = {}) {
  const started = performance.now();
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, ...(options.env || {}) },
  });
  const wallMs = Math.round((performance.now() - started) * 100) / 100;
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const stderr = String(result.stderr || '').trim().slice(0, 4000);
    const stdout = String(result.stdout || '').trim().slice(0, 2000);
    throw new Error(`${path.basename(command)} exited ${result.status}${stderr ? `: ${stderr}` : stdout ? `: ${stdout}` : ''}`);
  }
  return { stdout: String(result.stdout || ''), stderr: String(result.stderr || ''), status: result.status, wallMs };
}

function parseJsonOutput(run, label) {
  try {
    return JSON.parse(run.stdout.trim());
  } catch {
    throw new Error(`${label} did not return valid JSON`);
  }
}

function numericOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function scanSummary(value, wallMs) {
  return {
    wallMs: numericOrNull(wallMs),
    durationMs: numericOrNull(value?.durationMs),
    files: Number.isInteger(value?.files) ? value.files : null,
    bytes: Number.isInteger(value?.bytes) ? value.bytes : null,
    workspaces: Number.isInteger(value?.workspaces?.count) ? value.workspaces.count : null,
    sourceFiles: Number.isInteger(value?.graph?.sourceFiles) ? value.graph.sourceFiles : null,
    parsedFiles: Number.isInteger(value?.graph?.parsedFiles) ? value.graph.parsedFiles : null,
    reusedFiles: Number.isInteger(value?.graph?.reusedFiles) ? value.graph.reusedFiles : null,
    localEdges: Number.isInteger(value?.graph?.localEdges) ? value.graph.localEdges : null,
    symbols: Number.isInteger(value?.graph?.symbols) ? value.graph.symbols : null,
  };
}

function evidenceCount(value) {
  if (Array.isArray(value)) return value.length;
  if (!isObject(value)) return null;
  for (const key of ['results', 'items', 'affected', 'files', 'matches', 'evidence']) {
    if (Array.isArray(value[key])) return value[key].length;
  }
  if (Array.isArray(value?.impact?.affected)) return value.impact.affected.length;
  if (Array.isArray(value?.context?.results)) return value.context.results.length;
  return null;
}

function sessionId(value) {
  const candidates = [value?.id, value?.sessionId, value?.session?.id];
  const found = candidates.find((item) => typeof item === 'string' && item.trim());
  if (!found) throw new Error('session start did not return an id');
  return found;
}

function runCmi(commandRunner, cmiEntry, cwd, args, label) {
  const run = commandRunner(process.execPath, [cmiEntry, ...args], { cwd, timeoutMs: DEFAULT_TIMEOUT_MS });
  return { run, value: parseJsonOutput(run, label) };
}

async function prepareCheckout(entry, checkout, commandRunner) {
  await fs.mkdir(checkout, { recursive: true });
  commandRunner('git', ['init', '--quiet', checkout], { cwd: path.dirname(checkout), timeoutMs: DEFAULT_TIMEOUT_MS });
  commandRunner('git', ['-C', checkout, 'remote', 'add', 'origin', repoUrl(entry.repository)], { cwd: path.dirname(checkout), timeoutMs: DEFAULT_TIMEOUT_MS });
  commandRunner('git', ['-C', checkout, 'fetch', '--quiet', '--depth', '1', 'origin', entry.revision], { cwd: path.dirname(checkout), timeoutMs: DEFAULT_TIMEOUT_MS });
  commandRunner('git', ['-C', checkout, 'checkout', '--quiet', '--detach', 'FETCH_HEAD'], { cwd: path.dirname(checkout), timeoutMs: DEFAULT_TIMEOUT_MS });
  const observed = commandRunner('git', ['-C', checkout, 'rev-parse', 'HEAD'], { cwd: path.dirname(checkout), timeoutMs: DEFAULT_TIMEOUT_MS }).stdout.trim().toLowerCase();
  if (observed !== entry.revision) throw new Error(`${entry.id}: checked out ${observed || 'unknown'} instead of pinned revision ${entry.revision}`);
  return observed;
}

async function runRepository(entry, options) {
  const { root, cmiEntry, commandRunner, keepCheckouts } = options;
  const checkout = path.join(root, entry.id);
  try {
    const revision = await prepareCheckout(entry, checkout, commandRunner);

    commandRunner(process.execPath, [cmiEntry, 'init', checkout], { cwd: root, timeoutMs: DEFAULT_TIMEOUT_MS });

    const fullRun = commandRunner(process.execPath, [cmiEntry, 'scan', checkout, '--full', '--json'], { cwd: root, timeoutMs: DEFAULT_TIMEOUT_MS });
    const fullValue = parseJsonOutput(fullRun, `${entry.id} full scan`);
    const fullScan = scanSummary(fullValue, fullRun.wallMs);
    if (fullScan.workspaces != null && fullScan.workspaces < entry.minWorkspaces) {
      throw new Error(`${entry.id}: expected at least ${entry.minWorkspaces} workspaces, observed ${fullScan.workspaces}`);
    }

    const incrementalRun = commandRunner(process.execPath, [cmiEntry, 'scan', checkout, '--json'], { cwd: root, timeoutMs: DEFAULT_TIMEOUT_MS });
    const incrementalScan = scanSummary(parseJsonOutput(incrementalRun, `${entry.id} incremental scan`), incrementalRun.wallMs);

    const doctorRun = commandRunner(process.execPath, [cmiEntry, 'doctor', checkout, '--json'], { cwd: root, timeoutMs: DEFAULT_TIMEOUT_MS });
    const doctor = parseJsonOutput(doctorRun, `${entry.id} doctor`);
    if (doctor?.healthy !== true) throw new Error(`${entry.id}: cmi doctor did not report healthy: true`);

    const contextResult = runCmi(commandRunner, cmiEntry, checkout, ['context', entry.contextQuery, '--json'], `${entry.id} context`);
    const impactResult = runCmi(commandRunner, cmiEntry, checkout, ['impact', entry.impactTarget, '--depth', '3', '--json'], `${entry.id} impact`);

    const sessionStart = runCmi(commandRunner, cmiEntry, checkout, [
      'session', 'start', 'Real corpus validation probe',
      '--note', 'Evaluator-side static validation only; target repository code was not executed.', '--json',
    ], `${entry.id} session start`);
    const id = sessionId(sessionStart.value);
    const sessionClose = runCmi(commandRunner, cmiEntry, checkout, [
      'session', 'close', id, '--outcome', 'succeeded',
      '--note', 'Full scan, incremental scan, doctor, context, and impact probes completed.', '--json',
    ], `${entry.id} session close`);
    const handoff = runCmi(commandRunner, cmiEntry, checkout, ['session', 'handoff', id, '--json'], `${entry.id} session handoff`);

    return {
      id: entry.id,
      repository: entry.repository,
      revision,
      repoClass: entry.repoClass,
      fullScan,
      incrementalScan,
      doctor: { healthy: true, wallMs: numericOrNull(doctorRun.wallMs), checks: Array.isArray(doctor?.checks) ? doctor.checks.length : null },
      context: { query: entry.contextQuery, evidenceItems: evidenceCount(contextResult.value), wallMs: numericOrNull(contextResult.run.wallMs) },
      impact: { target: entry.impactTarget, evidenceItems: evidenceCount(impactResult.value), wallMs: numericOrNull(impactResult.run.wallMs), blocked: impactResult.value?.blocked === true },
      session: {
        startWallMs: numericOrNull(sessionStart.run.wallMs),
        closeWallMs: numericOrNull(sessionClose.run.wallMs),
        handoffWallMs: numericOrNull(handoff.run.wallMs),
        handoffProduced: isObject(handoff.value),
      },
      status: 'passed',
    };
  } finally {
    if (!keepCheckouts) await fs.rm(checkout, { recursive: true, force: true });
  }
}

export async function runRealCorpus(manifest, options = {}) {
  const validated = validateRealCorpusManifest(manifest);
  const commandRunner = options.commandRunner || defaultCommandRunner;
  const cmiEntry = path.resolve(options.cmiEntry || DEFAULT_CMI_ENTRY);
  const ownsRoot = !options.workRoot;
  const root = options.workRoot
    ? path.resolve(options.workRoot)
    : await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-real-corpus-'));
  await fs.mkdir(root, { recursive: true });
  const startedAt = new Date().toISOString();
  try {
    const repositories = [];
    for (const entry of validated.repositories) {
      repositories.push(await runRepository(entry, { root, cmiEntry, commandRunner, keepCheckouts: options.keepCheckouts === true }));
    }
    return {
      schemaVersion: REAL_CORPUS_SCHEMA_VERSION,
      kind: REAL_CORPUS_REPORT_KIND,
      startedAt,
      endedAt: new Date().toISOString(),
      policy: {
        pinnedRevisions: true,
        disposableCheckouts: true,
        targetDependenciesInstalled: false,
        targetCodeExecuted: false,
        targetTestsExecuted: false,
        cmiStateScope: 'disposable-checkout-only',
      },
      repositories,
      summary: {
        total: repositories.length,
        passed: repositories.filter((entry) => entry.status === 'passed').length,
        healthy: repositories.filter((entry) => entry.doctor.healthy).length,
      },
      claimDiscipline: 'engineering-validation-only',
      limitations: [
        'This runner validates CMI behavior on pinned real repository source trees; it does not execute target repository code or prove product-value improvement.',
        'Context and impact outputs remain heuristic/advisory and are summarized without treating result counts as correctness claims.',
        'Network availability and upstream Git object retention are operational prerequisites even though revisions are pinned.',
      ],
    };
  } finally {
    if (ownsRoot && !options.keepCheckouts) await fs.rm(root, { recursive: true, force: true });
  }
}

export const REAL_CORPUS_CONTRACT = Object.freeze({
  schemaVersion: REAL_CORPUS_SCHEMA_VERSION,
  manifestKind: REAL_CORPUS_MANIFEST_KIND,
  reportKind: REAL_CORPUS_REPORT_KIND,
  repoClasses: [...REPO_CLASSES],
});