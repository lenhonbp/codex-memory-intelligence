import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REAL_CORPUS_EXECUTION_CONTRACT,
  runRealCorpusExecution,
} from '../src/real-corpus-execution.js';

const REVISION_A = 'a'.repeat(40);
const REVISION_B = 'b'.repeat(40);

function manifest() {
  return {
    schemaVersion: 1,
    kind: 'cmi-real-corpus-manifest',
    repositories: [
      {
        id: 'first-repository',
        repository: 'example/first',
        revision: REVISION_A,
        repoClass: 'node-javascript',
        contextQuery: 'first context',
        impactTarget: 'src/index.js',
        minWorkspaces: 0,
      },
      {
        id: 'second-repository',
        repository: 'example/second',
        revision: REVISION_B,
        repoClass: 'node-typescript',
        contextQuery: 'second context',
        impactTarget: 'src/index.ts',
        minWorkspaces: 0,
      },
    ],
  };
}

function passedReport(repository) {
  return {
    schemaVersion: 1,
    kind: 'cmi-real-corpus-report',
    repositories: [{
      id: repository.id,
      repository: repository.repository,
      revision: repository.revision,
      repoClass: repository.repoClass,
      status: 'passed',
      fullScan: { sourceFiles: 10, workspaces: 0 },
      incrementalScan: { reusedFiles: 10 },
      doctor: { healthy: true },
      context: { evidenceItems: 2 },
      impact: { evidenceItems: 1, blocked: false },
      session: { handoffProduced: true },
    }],
  };
}

test('real corpus execution preserves a failed repository and continues later repositories', async () => {
  const calls = [];
  const report = await runRealCorpusExecution(manifest(), {
    runCorpus: async (singleManifest) => {
      const [repository] = singleManifest.repositories;
      calls.push(repository.id);
      if (repository.id === 'first-repository') throw new Error('first repository failed\nwith additional detail');
      return passedReport(repository);
    },
  });

  assert.deepEqual(calls, ['first-repository', 'second-repository']);
  assert.equal(report.status, 'failed');
  assert.deepEqual(report.summary, { total: 2, passed: 1, failed: 1, healthy: 1 });
  assert.equal(report.repositories[0].status, 'failed');
  assert.equal(report.repositories[0].failure.code, 'CMI_REAL_CORPUS_REPOSITORY_FAILED');
  assert.equal(report.repositories[0].failure.message, 'first repository failed with additional detail');
  assert.equal(report.repositories[1].status, 'passed');
  assert.equal(report.claimDiscipline, 'engineering-validation-only');
  assert.equal(report.policy.targetCodeExecuted, false);
});

test('real corpus execution remains failed when a repository returns a non-passed result', async () => {
  const report = await runRealCorpusExecution({ ...manifest(), repositories: [manifest().repositories[0]] }, {
    runCorpus: async () => ({ repositories: [{ status: 'failed' }] }),
  });

  assert.equal(report.status, 'failed');
  assert.equal(report.summary.failed, 1);
  assert.match(report.repositories[0].failure.message, /did not return a passed result/i);
});

test('real corpus execution reports passed only when every repository passes', async () => {
  const report = await runRealCorpusExecution(manifest(), {
    runCorpus: async (singleManifest) => passedReport(singleManifest.repositories[0]),
  });

  assert.equal(report.status, 'passed');
  assert.deepEqual(report.summary, { total: 2, passed: 2, failed: 0, healthy: 2 });
  assert.equal(report.repositories.every((entry) => entry.status === 'passed'), true);
});

test('real corpus execution validates the full manifest before running any repository', async () => {
  let called = false;
  await assert.rejects(
    runRealCorpusExecution({ ...manifest(), repositories: [{ ...manifest().repositories[0], revision: 'main' }] }, {
      runCorpus: async () => {
        called = true;
        throw new Error('must not run');
      },
    }),
    /40-character Git commit SHA/i,
  );
  assert.equal(called, false);
});

test('real corpus execution bounds failure diagnostics and does not expose stacks', async () => {
  const error = new Error('x'.repeat(REAL_CORPUS_EXECUTION_CONTRACT.failureMessageLimit + 200));
  error.stack = 'sensitive stack should not be serialized';
  const report = await runRealCorpusExecution({ ...manifest(), repositories: [manifest().repositories[0]] }, {
    runCorpus: async () => { throw error; },
  });

  const failure = report.repositories[0].failure;
  assert.equal(failure.message.length, REAL_CORPUS_EXECUTION_CONTRACT.failureMessageLimit);
  assert.equal(JSON.stringify(failure).includes('sensitive stack'), false);
  assert.equal(REAL_CORPUS_EXECUTION_CONTRACT.reportKind, 'cmi-real-corpus-report');
});
