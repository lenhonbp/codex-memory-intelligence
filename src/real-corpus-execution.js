import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import {
  buildRealCorpusPlan,
  runRealCorpus,
  validateRealCorpusManifest,
} from './real-corpus.js';

const FAILURE_MESSAGE_LIMIT = 1000;
const DEFAULT_TIMEOUT_MS = 180_000;
const FETCH_REF_PATTERN = /^refs\/(heads|tags)\/[A-Za-z0-9][A-Za-z0-9._/-]*$/;

function executionPolicy() {
  return {
    pinnedRevisions: true,
    disposableCheckouts: true,
    targetDependenciesInstalled: false,
    targetCodeExecuted: false,
    targetTestsExecuted: false,
    cmiStateScope: 'disposable-checkout-only',
  };
}

function compactFailureMessage(error) {
  const raw = error instanceof Error ? error.message : String(error ?? 'Unknown repository validation failure');
  const compact = raw.replace(/\s+/g, ' ').trim();
  return (compact || 'Unknown repository validation failure').slice(0, FAILURE_MESSAGE_LIMIT);
}

function failedRepository(entry, error) {
  return {
    id: entry.id,
    repository: entry.repository,
    revision: entry.revision,
    repoClass: entry.repoClass,
    status: 'failed',
    failure: {
      code: 'CMI_REAL_CORPUS_REPOSITORY_FAILED',
      message: compactFailureMessage(error),
    },
  };
}

function validateFetchRef(value, name) {
  if (value == null) return null;
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} must be a non-empty Git heads/tags ref`);
  const ref = value.trim();
  if (ref.length > 240 || !FETCH_REF_PATTERN.test(ref) || ref.includes('..') || ref.includes('//') || ref.includes('@{') || ref.endsWith('/')) {
    throw new Error(`${name} must be a safe refs/heads/... or refs/tags/... transport hint`);
  }
  return ref;
}

function stripExecutionFields(repository) {
  const { fetchRef: _fetchRef, ...coreRepository } = repository;
  return coreRepository;
}

export function validateRealCorpusExecutionManifest(manifest) {
  const validated = validateRealCorpusManifest(manifest);
  return {
    ...validated,
    repositories: validated.repositories.map((repository, index) => ({
      ...repository,
      fetchRef: validateFetchRef(manifest.repositories[index]?.fetchRef, `repositories[${index}].fetchRef`),
    })),
  };
}

export function buildRealCorpusExecutionPlan(manifest) {
  const validated = validateRealCorpusExecutionManifest(manifest);
  const coreManifest = {
    schemaVersion: validated.schemaVersion,
    kind: validated.kind,
    repositories: validated.repositories.map(stripExecutionFields),
  };
  const plan = buildRealCorpusPlan(coreManifest);
  return {
    ...plan,
    repositories: plan.repositories.map((repository, index) => {
      const fetchRef = validated.repositories[index].fetchRef;
      if (!fetchRef) return repository;
      const steps = [];
      for (const step of repository.steps) {
        steps.push(step);
        if (step.action === 'fetch-exact-revision') {
          steps.push({
            engine: 'git',
            action: 'fetch-transport-ref-only-if-exact-fetch-unavailable',
            ref: fetchRef,
          });
          steps.push({
            engine: 'git',
            action: 'checkout-pinned-revision-after-transport-fetch',
            revision: repository.revision,
          });
        }
      }
      return { ...repository, fetchRef, steps };
    }),
  };
}

function singleRepositoryManifest(validatedManifest, repository) {
  return {
    schemaVersion: validatedManifest.schemaVersion,
    kind: validatedManifest.kind,
    repositories: [stripExecutionFields(repository)],
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

function isExactRevisionFetch(args, revision) {
  return args[0] === '-C'
    && args[2] === 'fetch'
    && args.includes('--depth')
    && args[args.length - 1] === revision;
}

function isFetchHeadCheckout(args) {
  return args[0] === '-C'
    && args[2] === 'checkout'
    && args[args.length - 1] === 'FETCH_HEAD';
}

function createTransportAwareRunner(repository, baseRunner) {
  let fallbackUsed = false;
  const commandRunner = (command, args, options = {}) => {
    if (command === 'git' && repository.fetchRef && isExactRevisionFetch(args, repository.revision)) {
      try {
        return baseRunner(command, args, options);
      } catch (error) {
        const checkout = args[1];
        const fallback = baseRunner(command, ['-C', checkout, 'fetch', '--quiet', 'origin', repository.fetchRef], options);
        baseRunner(command, ['-C', checkout, 'cat-file', '-e', `${repository.revision}^{commit}`], options);
        fallbackUsed = true;
        return fallback;
      }
    }
    if (command === 'git' && fallbackUsed && isFetchHeadCheckout(args)) {
      return baseRunner(command, [...args.slice(0, -1), repository.revision], options);
    }
    return baseRunner(command, args, options);
  };
  return {
    commandRunner,
    transportState: () => ({
      exactRevisionFetch: !fallbackUsed,
      fallbackRef: fallbackUsed ? repository.fetchRef : null,
    }),
  };
}

export async function runRealCorpusExecution(manifest, options = {}) {
  const validated = validateRealCorpusExecutionManifest(manifest);
  const runCorpus = options.runCorpus || runRealCorpus;
  const suppliedRunner = options.commandRunner;
  const runnerOptions = { ...options };
  delete runnerOptions.runCorpus;
  delete runnerOptions.commandRunner;

  const startedAt = new Date().toISOString();
  const repositories = [];

  for (const repository of validated.repositories) {
    let transport = null;
    try {
      let commandRunner = suppliedRunner;
      if (runCorpus === runRealCorpus && repository.fetchRef) {
        const wrapped = createTransportAwareRunner(repository, suppliedRunner || defaultCommandRunner);
        commandRunner = wrapped.commandRunner;
        transport = wrapped.transportState;
      }
      const report = await runCorpus(singleRepositoryManifest(validated, repository), {
        ...runnerOptions,
        ...(commandRunner ? { commandRunner } : {}),
      });
      const [result] = report.repositories || [];
      if (!result || result.status !== 'passed') {
        throw new Error(`${repository.id}: repository run did not return a passed result`);
      }
      repositories.push({
        ...result,
        ...(transport ? { transport: transport() } : {}),
      });
    } catch (error) {
      repositories.push(failedRepository(repository, error));
    }
  }

  const passed = repositories.filter((entry) => entry.status === 'passed').length;
  const failed = repositories.length - passed;
  const healthy = repositories.filter((entry) => entry.doctor?.healthy === true).length;

  return {
    schemaVersion: validated.schemaVersion,
    kind: 'cmi-real-corpus-report',
    startedAt,
    endedAt: new Date().toISOString(),
    status: failed === 0 ? 'passed' : 'failed',
    policy: executionPolicy(),
    repositories,
    summary: {
      total: repositories.length,
      passed,
      failed,
      healthy,
    },
    claimDiscipline: 'engineering-validation-only',
    limitations: [
      'This runner validates CMI behavior on pinned real repository source trees; it does not execute target repository code or prove product-value improvement.',
      'Context and impact outputs remain heuristic/advisory and are summarized without treating result counts as correctness claims.',
      'Repository failures are preserved as bounded operational diagnostics so later repositories still run; any failed repository keeps the overall execution failed.',
      'An optional fetchRef is only a transport hint when a server refuses direct SHA fetch; checkout identity is still the preregistered revision and is verified before CMI runs.',
      'Network availability and upstream Git object retention are operational prerequisites even though revisions are pinned.',
    ],
  };
}

export const REAL_CORPUS_EXECUTION_CONTRACT = Object.freeze({
  schemaVersion: 1,
  reportKind: 'cmi-real-corpus-report',
  failureCode: 'CMI_REAL_CORPUS_REPOSITORY_FAILED',
  failureMessageLimit: FAILURE_MESSAGE_LIMIT,
  fetchRefPattern: FETCH_REF_PATTERN.source,
});
