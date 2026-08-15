import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildRealCorpusPlan,
  REAL_CORPUS_CONTRACT,
  runRealCorpus,
  validateRealCorpusManifest,
} from '../src/real-corpus.js';

const REVISION = 'a'.repeat(40);

function manifest(repositoryOverrides = {}) {
  return {
    schemaVersion: 1,
    kind: 'cmi-real-corpus-manifest',
    repositories: [{
      id: 'example-typescript-monorepo',
      repository: 'example/project',
      revision: REVISION,
      repoClass: 'node-typescript-monorepo',
      contextQuery: 'workspace publish flow',
      impactTarget: 'packages/cli/src/index.ts',
      minWorkspaces: 1,
      ...repositoryOverrides,
    }],
  };
}

function ok(stdout = '') {
  return { status: 0, stdout, stderr: '', wallMs: 2.5 };
}

function fakeRunner(calls, { includeWorkspaceCount = true } = {}) {
  return (command, args, options = {}) => {
    calls.push({ command, args: [...args], cwd: options.cwd });
    if (command === 'git') {
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
        files: 120,
        bytes: 24000,
        graph: {
          sourceFiles: 80,
          parsedFiles: full ? 80 : 0,
          reusedFiles: full ? 0 : 80,
          localEdges: 140,
          symbols: 360,
        },
        ...(includeWorkspaceCount ? { workspaces: { count: 3 } } : {}),
        stack: ['typescript'],
      }));
    }
    if (cmiCommand === 'doctor') return ok(JSON.stringify({ healthy: true, checks: [{ name: 'graph', status: 'pass' }] }));
    if (cmiCommand === 'context') return ok(JSON.stringify({ results: [{ path: 'packages/a.ts' }, { path: 'packages/b.ts' }] }));
    if (cmiCommand === 'impact') return ok(JSON.stringify({ blocked: false, affected: [{ path: 'packages/b.ts' }] }));
    if (cmiCommand === 'session') {
      const action = args[2];
      if (action === 'start') return ok(JSON.stringify({ id: 'session-123', status: 'active' }));
      if (action === 'close') return ok(JSON.stringify({ id: 'session-123', status: 'closed', outcome: 'succeeded' }));
      if (action === 'handoff') return ok(JSON.stringify({ sessionId: 'session-123', nextAction: { action: 'review results' } }));
    }
    throw new Error(`Unexpected fake command: ${command} ${args.join(' ')}`);
  };
}

test('real corpus manifest requires path-safe ids, pinned SHAs, owner/repo identities, and bounded targets', () => {
  const validated = validateRealCorpusManifest(manifest());
  assert.equal(validated.repositories[0].revision, REVISION);
  assert.equal(validated.repositories[0].repoClass, 'node-typescript-monorepo');
  assert.throws(() => validateRealCorpusManifest(manifest({ id: '../escape' })), /path-safe slug/i);
  assert.throws(() => validateRealCorpusManifest(manifest({ id: 'nested/checkout' })), /path-safe slug/i);
  assert.throws(() => validateRealCorpusManifest(manifest({ revision: 'main' })), /40-character Git commit SHA/i);
  assert.throws(() => validateRealCorpusManifest(manifest({ repository: 'https://github.com/example/project' })), /owner\/repository/i);
  assert.throws(() => validateRealCorpusManifest(manifest({ impactTarget: '../outside.ts' })), /repository-relative/i);
});

test('real corpus plan makes the no-target-execution policy explicit', () => {
  const plan = buildRealCorpusPlan(manifest());
  assert.equal(plan.policy.pinnedRevisions, true);
  assert.equal(plan.policy.disposableCheckouts, true);
  assert.equal(plan.policy.targetDependenciesInstalled, false);
  assert.equal(plan.policy.targetCodeExecuted, false);
  assert.equal(plan.policy.targetTestsExecuted, false);
  assert.deepEqual(new Set(plan.repositories[0].steps.map((step) => step.engine)), new Set(['git', 'cmi']));
  assert.equal(plan.repositories[0].steps.some((step) => /install|build|target-test|execute-target/i.test(step.action)), false);
});

test('real corpus runner verifies revision and records only CMI engineering metrics', async () => {
  const workRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-real-corpus-test-'));
  const calls = [];
  try {
    const report = await runRealCorpus(manifest(), {
      workRoot,
      cmiEntry: '/fixture/cmi-entry.js',
      commandRunner: fakeRunner(calls),
    });

    assert.equal(report.kind, 'cmi-real-corpus-report');
    assert.equal(report.summary.total, 1);
    assert.equal(report.summary.passed, 1);
    assert.equal(report.summary.healthy, 1);
    assert.equal(report.policy.targetDependenciesInstalled, false);
    assert.equal(report.policy.targetCodeExecuted, false);
    assert.equal(report.policy.targetTestsExecuted, false);
    assert.equal(report.claimDiscipline, 'engineering-validation-only');

    const [repository] = report.repositories;
    assert.equal(repository.revision, REVISION);
    assert.equal(repository.fullScan.parsedFiles, 80);
    assert.equal(repository.incrementalScan.reusedFiles, 80);
    assert.equal(repository.fullScan.workspaces, 3);
    assert.equal(repository.doctor.healthy, true);
    assert.equal(repository.context.evidenceItems, 2);
    assert.equal(repository.impact.evidenceItems, 1);
    assert.equal(repository.impact.blocked, false);
    assert.equal(repository.session.handoffProduced, true);

    const executables = new Set(calls.map((call) => call.command));
    assert.deepEqual(executables, new Set(['git', process.execPath]));
    const forbidden = calls.some((call) => ['npm', 'pnpm', 'yarn', 'bun', 'make'].includes(path.basename(call.command)));
    assert.equal(forbidden, false);
    assert.equal(calls.some((call) => call.command === 'git' && call.args.includes('rev-parse')), true);
    assert.equal(calls.some((call) => call.command === process.execPath && call.args.includes('scan') && call.args.includes('--full')), true);
    assert.equal(calls.some((call) => call.command === process.execPath && call.args.includes('doctor')), true);
    assert.equal(calls.some((call) => call.command === process.execPath && call.args.includes('session') && call.args.includes('handoff')), true);

    const checkoutExists = await fs.stat(path.join(workRoot, 'example-typescript-monorepo')).then(() => true).catch(() => false);
    assert.equal(checkoutExists, false);
  } finally {
    await fs.rm(workRoot, { recursive: true, force: true });
  }
});

test('real corpus runner fails closed when required workspace evidence is unavailable', async () => {
  const workRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-real-corpus-workspace-'));
  const calls = [];
  try {
    await assert.rejects(
      runRealCorpus(manifest({ minWorkspaces: 1 }), {
        workRoot,
        cmiEntry: '/fixture/cmi-entry.js',
        commandRunner: fakeRunner(calls, { includeWorkspaceCount: false }),
      }),
      /workspace count is unavailable/i,
    );
    assert.equal(calls.some((call) => call.command === process.execPath && call.args.includes('doctor')), false);
  } finally {
    await fs.rm(workRoot, { recursive: true, force: true });
  }
});

test('real corpus runner fails closed when checkout revision differs from manifest pin', async () => {
  const workRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-real-corpus-mismatch-'));
  const runner = (command, args) => {
    if (command === 'git' && args.includes('rev-parse')) return ok(`${'b'.repeat(40)}\n`);
    if (command === 'git') return ok();
    throw new Error('CMI must not run after revision mismatch');
  };
  try {
    await assert.rejects(
      runRealCorpus(manifest(), { workRoot, cmiEntry: '/fixture/cmi-entry.js', commandRunner: runner }),
      /instead of pinned revision/i,
    );
  } finally {
    await fs.rm(workRoot, { recursive: true, force: true });
  }
});

test('real corpus contract exposes supported repository classes without claiming polyglot coverage', () => {
  assert.equal(REAL_CORPUS_CONTRACT.schemaVersion, 1);
  assert.deepEqual(REAL_CORPUS_CONTRACT.repoClasses, [
    'node-javascript',
    'node-typescript',
    'node-typescript-monorepo',
    'python',
    'go',
    'rust',
    'php',
  ]);
});
