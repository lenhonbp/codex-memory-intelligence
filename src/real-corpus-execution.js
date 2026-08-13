import {
  runRealCorpus,
  validateRealCorpusManifest,
} from './real-corpus.js';

const FAILURE_MESSAGE_LIMIT = 1000;

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

function singleRepositoryManifest(validatedManifest, repository) {
  return {
    schemaVersion: validatedManifest.schemaVersion,
    kind: validatedManifest.kind,
    repositories: [repository],
  };
}

export async function runRealCorpusExecution(manifest, options = {}) {
  const validated = validateRealCorpusManifest(manifest);
  const runCorpus = options.runCorpus || runRealCorpus;
  const runnerOptions = { ...options };
  delete runnerOptions.runCorpus;

  const startedAt = new Date().toISOString();
  const repositories = [];

  for (const repository of validated.repositories) {
    try {
      const report = await runCorpus(singleRepositoryManifest(validated, repository), runnerOptions);
      const [result] = report.repositories || [];
      if (!result || result.status !== 'passed') {
        throw new Error(`${repository.id}: repository run did not return a passed result`);
      }
      repositories.push(result);
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
      'Network availability and upstream Git object retention are operational prerequisites even though revisions are pinned.',
    ],
  };
}

export const REAL_CORPUS_EXECUTION_CONTRACT = Object.freeze({
  schemaVersion: 1,
  reportKind: 'cmi-real-corpus-report',
  failureCode: 'CMI_REAL_CORPUS_REPOSITORY_FAILED',
  failureMessageLimit: FAILURE_MESSAGE_LIMIT,
});
