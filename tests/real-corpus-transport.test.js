import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildRealCorpusExecutionPlan,
  runRealCorpusExecution,
  validateRealCorpusExecutionManifest,
} from '../src/real-corpus-execution.js';

const REVISION = 'a'.repeat(40);
const FETCH_REF = 'refs/heads/main';

function manifest(fetchRef = FETCH_REF) {
  return {
    schemaVersion: 1,
    kind: 'cmi-real-corpus-manifest',
    repositories: [{
      id: 'transport-fallback-repository',
      repository: 'example/project',
      revision: REVISION,
      fetchRef,
      repoClass: 'node-javascript',
      contextQuery: 'transport fallback context',
      impactTarget: 'src/index.js',
      minWorkspaces: 0,
    }],
  };
}

function ok(stdout = '') {
  return { status: 0, stdout, stderr: '', wallMs: 2.5 };
}

function transportFallbackRunner(calls) {
  return (command, args, options = {}) => {
    calls.push({ command, args: [...args], cwd: options.cwd });
    if (command === 'git') {
      if (args[2] === 'fetch' && args.includes('--depth')) {
        throw new Error(`git exited 128: fatal: remote error: upload-pack: not our ref ${REVISION}`);
      }
      if (args[2] === 'cat-file') {
        assert.equal(args[args.length - 1], `${REVISION}^{commit}`);
        return ok();
      }
      if (args[2] === 'checkout') {
        assert.equal(args[args.length - 1], REVISION);
        return ok();
      }
      if (args.includes('rev-parse')) return ok(`${REVISION}\n`);
      return ok();
    }

    assert.equal(command, process.execPath);
    const cmiCommand = args[1];
    if (cmiCommand === 'init') return ok('Initialized fixture\n');
    if (cmiCommand === 'scan') {
      const full = args.includes('--full');
      return ok(JSON.stringify({
        durationMs: full ? 25 : 5,
        files: 10,
        bytes: 2000,
        workspaces: { count: 1 },
        graph: {
          sourceFiles: 8,
          parsedFiles: full ? 8 : 0,
          reusedFiles: full ? 0 : 8,
          localEdges: 4,
          symbols: 20,
        },
      }));
    }
    if (cmiCommand === 'doctor') return ok(JSON.stringify({ healthy: true, checks: [{ name: 'graph', status: 'pass' }] }));
    if (cmiCommand === 'context') return ok(JSON.stringify({ results: [{ path: 'src/index.js' }] }));
    if (cmiCommand === 'impact') return ok(JSON.stringify({ blocked: false, affected: [] }));
    if (cmiCommand === 'session') {
      const action = args[2];
      if (action === 'start') return ok(JSON.stringify({ id: 'session-transport', status: 'active' }));
      if (action === 'close') return ok(JSON.stringify({ id: 'session-transport', status: 'closed', outcome: 'succeeded' }));
      if (action === 'handoff') return ok(JSON.stringify({ sessionId: 'session-transport', nextAction: { action: 'review results' } }));
    }
    throw new Error(`Unexpected fake command: ${command} ${args.join(' ')}`);
  };
}

test('execution manifest accepts only bounded heads/tags transport refs', () => {
  const validated = validateRealCorpusExecutionManifest(manifest());
  assert.equal(validated.repositories[0].fetchRef, FETCH_REF);
  assert.throws(() => validateRealCorpusExecutionManifest(manifest('main')), /safe refs\/heads/i);
  assert.throws(() => validateRealCorpusExecutionManifest(manifest('refs/heads/../escape')), /safe refs\/heads/i);
  assert.throws(() => validateRealCorpusExecutionManifest(manifest('refs/remotes/origin/main')), /safe refs\/heads/i);
});

test('execution plan makes transport fallback subordinate to exact revision validation', () => {
  const plan = buildRealCorpusExecutionPlan(manifest());
  const repository = plan.repositories[0];
  assert.equal(repository.fetchRef, FETCH_REF);
  assert.equal(repository.steps.some((step) => step.action === 'fetch-exact-revision' && step.revision === REVISION), true);
  assert.equal(repository.steps.some((step) => step.action === 'fetch-transport-ref-only-if-exact-fetch-unavailable' && step.ref === FETCH_REF), true);
  assert.equal(repository.steps.some((step) => step.action === 'checkout-pinned-revision-after-transport-fetch' && step.revision === REVISION), true);
});

test('transport fallback fetches a declared ref but checks out and verifies the pinned revision', async () => {
  const workRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-real-corpus-transport-'));
  const calls = [];
  try {
    const report = await runRealCorpusExecution(manifest(), {
      workRoot,
      cmiEntry: '/fixture/cmi-entry.js',
      commandRunner: transportFallbackRunner(calls),
    });

    assert.equal(report.status, 'passed');
    assert.deepEqual(report.summary, { total: 1, passed: 1, failed: 0, healthy: 1 });
    assert.deepEqual(report.repositories[0].transport, {
      exactRevisionFetch: false,
      fallbackRef: FETCH_REF,
    });
    assert.equal(calls.some((call) => call.command === 'git' && call.args[2] === 'fetch' && call.args.includes('--depth') && call.args.at(-1) === REVISION), true);
    assert.equal(calls.some((call) => call.command === 'git' && call.args[2] === 'fetch' && !call.args.includes('--depth') && call.args.at(-1) === FETCH_REF), true);
    assert.equal(calls.some((call) => call.command === 'git' && call.args[2] === 'cat-file' && call.args.at(-1) === `${REVISION}^{commit}`), true);
    assert.equal(calls.some((call) => call.command === 'git' && call.args[2] === 'checkout' && call.args.at(-1) === REVISION), true);
    assert.equal(calls.some((call) => call.command === 'git' && call.args[2] === 'checkout' && call.args.at(-1) === 'FETCH_HEAD'), false);
  } finally {
    await fs.rm(workRoot, { recursive: true, force: true });
  }
});
