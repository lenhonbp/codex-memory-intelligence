#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  buildRealCorpusExecutionPlan,
  runRealCorpusExecution,
  validateRealCorpusExecutionManifest,
} from '../src/real-corpus-execution.js';

const [command, ...args] = process.argv.slice(2);

function option(name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

function hasFlag(name) {
  return args.includes(name);
}

function validateFlags(allowed) {
  const allowedSet = new Set(allowed);
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value.startsWith('--')) throw new Error(`Unexpected positional argument: ${value}`);
    if (!allowedSet.has(value)) throw new Error(`Unknown option: ${value}`);
    if (['--manifest', '--work-root'].includes(value)) index += 1;
  }
}

async function readManifest() {
  const manifestPath = option('--manifest');
  if (!manifestPath) throw new Error('--manifest is required');
  const absolute = path.resolve(manifestPath);
  const content = await fs.readFile(absolute, 'utf8');
  return { manifest: JSON.parse(content), manifestPath: absolute };
}

function printPlan(plan) {
  console.log(`Real corpus plan · ${plan.repositories.length} pinned repositories`);
  console.log('Safety: target dependencies/code/tests are not executed.');
  for (const repository of plan.repositories) {
    console.log(`\n- ${repository.id} · ${repository.repository}@${repository.revision.slice(0, 12)} · ${repository.repoClass}`);
    for (const step of repository.steps) console.log(`  ${step.engine}: ${step.action}`);
  }
}

function printReport(report) {
  console.log(`Real corpus validation: ${report.summary.passed}/${report.summary.total} passed`);
  for (const repository of report.repositories) {
    if (repository.status === 'passed') {
      const fallback = repository.transport?.fallbackRef ? ` · transport fallback ${repository.transport.fallbackRef}` : '';
      console.log(`- ${repository.id}: passed · ${repository.fullScan.sourceFiles ?? '?'} source files · ${repository.fullScan.workspaces ?? '?'} workspaces · doctor ${repository.doctor.healthy ? 'healthy' : 'blocked'}${fallback}`);
    } else {
      console.log(`- ${repository.id}: failed · ${repository.failure?.code || 'CMI_REAL_CORPUS_REPOSITORY_FAILED'} · ${repository.failure?.message || 'unknown failure'}`);
    }
  }
}

function help() {
  console.log(`CMI real repository corpus validator\n\nUsage:\n  node scripts/real-corpus.js validate --manifest <file>\n  node scripts/real-corpus.js plan --manifest <file> [--json]\n  node scripts/real-corpus.js run --manifest <file> [--work-root <dir>] [--keep-checkouts] [--json]\n\nThe runner validates exact pinned revisions in disposable checkouts and invokes CMI only. An optional fetchRef may be used solely as a transport fallback if a Git server refuses direct SHA fetch; the pinned SHA is still checked out and verified before CMI runs. Target dependencies/code/builds/tests are never executed. Repository failures are retained in the report, later repositories still run, and the command exits non-zero after emitting the complete bounded report.`);
}

try {
  if (!command || ['help', '--help', '-h'].includes(command)) {
    help();
  } else if (command === 'validate') {
    validateFlags(['--manifest']);
    const { manifest, manifestPath } = await readManifest();
    const validated = validateRealCorpusExecutionManifest(manifest);
    console.log(`Valid real corpus manifest: ${manifestPath} · ${validated.repositories.length} pinned repositories`);
  } else if (command === 'plan') {
    validateFlags(['--manifest', '--json']);
    const { manifest } = await readManifest();
    const plan = buildRealCorpusExecutionPlan(manifest);
    if (hasFlag('--json')) console.log(JSON.stringify(plan, null, 2));
    else printPlan(plan);
  } else if (command === 'run') {
    validateFlags(['--manifest', '--work-root', '--keep-checkouts', '--json']);
    const { manifest } = await readManifest();
    const report = await runRealCorpusExecution(manifest, {
      workRoot: option('--work-root') || undefined,
      keepCheckouts: hasFlag('--keep-checkouts'),
    });
    if (hasFlag('--json')) console.log(JSON.stringify(report, null, 2));
    else printReport(report);
    if (report.status !== 'passed') process.exitCode = 1;
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  console.error(`Real corpus validation error: ${error?.message || String(error)}`);
  process.exitCode = 1;
}
