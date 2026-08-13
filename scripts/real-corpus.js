#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  buildRealCorpusPlan,
  runRealCorpus,
  validateRealCorpusManifest,
} from '../src/real-corpus.js';

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

function help() {
  console.log(`CMI real repository corpus validator\n\nUsage:\n  node scripts/real-corpus.js validate --manifest <file>\n  node scripts/real-corpus.js plan --manifest <file> [--json]\n  node scripts/real-corpus.js run --manifest <file> [--work-root <dir>] [--keep-checkouts] [--json]\n\nThe runner fetches exact Git commit SHAs into disposable checkouts and invokes CMI only. It never installs target dependencies or runs target code, builds, or tests.`);
}

try {
  if (!command || ['help', '--help', '-h'].includes(command)) {
    help();
  } else if (command === 'validate') {
    validateFlags(['--manifest']);
    const { manifest, manifestPath } = await readManifest();
    const validated = validateRealCorpusManifest(manifest);
    console.log(`Valid real corpus manifest: ${manifestPath} · ${validated.repositories.length} pinned repositories`);
  } else if (command === 'plan') {
    validateFlags(['--manifest', '--json']);
    const { manifest } = await readManifest();
    const plan = buildRealCorpusPlan(manifest);
    if (hasFlag('--json')) console.log(JSON.stringify(plan, null, 2));
    else printPlan(plan);
  } else if (command === 'run') {
    validateFlags(['--manifest', '--work-root', '--keep-checkouts', '--json']);
    const { manifest } = await readManifest();
    const report = await runRealCorpus(manifest, {
      workRoot: option('--work-root') || undefined,
      keepCheckouts: hasFlag('--keep-checkouts'),
    });
    if (hasFlag('--json')) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`Real corpus validation: ${report.summary.passed}/${report.summary.total} passed`);
      for (const repository of report.repositories) {
        console.log(`- ${repository.id}: ${repository.status} · ${repository.fullScan.sourceFiles ?? '?'} source files · ${repository.fullScan.workspaces ?? '?'} workspaces · doctor ${repository.doctor.healthy ? 'healthy' : 'blocked'}`);
      }
    }
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  console.error(`Real corpus validation error: ${error?.message || String(error)}`);
  process.exitCode = 1;
}
