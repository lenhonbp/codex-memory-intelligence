#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  aggregateStudyLedgers,
  createStudyLedger,
  recordStudyCondition,
  reportStudyLedger,
  validateStudyLedger,
} from '../src/empirical-study.js';

const COMMAND_OPTIONS = {
  init: new Set(['out', 'study-id', 'pair-id', 'repository-study-id', 'revision', 'repo-class', 'task-class', 'order', 'agent-configuration', 'task-reference', 'acceptance-reference', 'negative-control']),
  record: new Set(['file', 'condition', 'input']),
  validate: new Set(['file']),
  report: new Set(['file', 'json']),
  aggregate: new Set(['file', 'json']),
};

function usage() {
  console.log(`CMI empirical study harness

Usage:
  node scripts/empirical-study.js init --out FILE --study-id ID --pair-id ID --repository-study-id ID --revision SHA --repo-class CLASS --task-class CLASS --order plain-first|cmi-first --agent-configuration TEXT [--task-reference REF] [--acceptance-reference REF] [--negative-control]
  node scripts/empirical-study.js record --file FILE --condition plain|cmi --input RESULT.json
  node scripts/empirical-study.js validate --file FILE
  node scripts/empirical-study.js report --file FILE [--json]
  node scripts/empirical-study.js aggregate --file FILE [--file FILE ...] [--json]

The harness stores an external study ledger. It does not write to .codex-memory and never upgrades caller-attested evidence into a productivity claim.`);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const values = { _: [] };
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) {
      values._.push(token);
      continue;
    }
    const key = token.slice(2);
    if (key === 'negative-control' || key === 'json') {
      if (Object.hasOwn(values, key)) throw new Error(`Duplicate option --${key}`);
      values[key] = true;
      continue;
    }
    const next = rest[index + 1];
    if (!next || next.startsWith('--')) throw new Error(`Missing value for --${key}`);
    index += 1;
    if (key === 'file') {
      if (!Array.isArray(values.file)) values.file = [];
      values.file.push(next);
    } else {
      if (Object.hasOwn(values, key)) throw new Error(`Duplicate option --${key}`);
      values[key] = next;
    }
  }
  return { command, values };
}

function validateCommandOptions(command, values) {
  const allowed = COMMAND_OPTIONS[command];
  if (!allowed) throw new Error(`Unknown command: ${command}`);
  if (values._.length) throw new Error(`Unexpected positional argument: ${values._[0]}`);
  for (const key of Object.keys(values)) {
    if (key === '_') continue;
    if (!allowed.has(key)) throw new Error(`Unknown option --${key} for ${command}`);
  }
  if (command !== 'aggregate' && Array.isArray(values.file) && values.file.length > 1) {
    throw new Error('Duplicate option --file');
  }
}

function requireValue(values, key) {
  const value = values[key];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing required --${key}`);
  return value.trim();
}

function firstFile(values) {
  return Array.isArray(values.file) ? values.file[0] : values.file;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  const target = path.resolve(filePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function printReport(report, json) {
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  if (report.kind === 'cmi-empirical-study-report') {
    console.log(`Study ${report.studyId} / pair ${report.pairId}`);
    console.log(`Status: ${report.status}`);
    console.log(`Protocol eligible: ${report.protocolEligible ? 'yes' : 'no'}`);
    console.log(`Claim discipline: ${report.claimDiscipline}`);
    if (report.deltas) {
      console.log(`Reconstruction delta (plain - cmi): inspections=${report.deltas.inspectionCount}, searches=${report.deltas.searchCount}, gitQueries=${report.deltas.gitQueryCount}, clarifications=${report.deltas.clarificationCount}`);
    }
    for (const limitation of report.limitations) console.log(`- ${limitation}`);
    return;
  }
  console.log(`Pairs: ${report.pairs.total}; complete=${report.pairs.complete}; eligible=${report.pairs.protocolEligible}`);
  console.log(`Independent repository study IDs: ${report.repositories}`);
  console.log(`Claim discipline: ${report.claimDiscipline}`);
  for (const limitation of report.limitations) console.log(`- ${limitation}`);
}

try {
  const { command, values } = parseArgs(process.argv.slice(2));
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    usage();
    process.exit(0);
  }
  validateCommandOptions(command, values);

  if (command === 'init') {
    const output = requireValue(values, 'out');
    const ledger = createStudyLedger({
      studyId: requireValue(values, 'study-id'),
      pairId: requireValue(values, 'pair-id'),
      repositoryStudyId: requireValue(values, 'repository-study-id'),
      revision: requireValue(values, 'revision'),
      repoClass: requireValue(values, 'repo-class'),
      taskClass: requireValue(values, 'task-class'),
      order: requireValue(values, 'order'),
      agentConfiguration: requireValue(values, 'agent-configuration'),
      taskReference: values['task-reference'] || null,
      acceptanceReference: values['acceptance-reference'] || null,
      negativeControl: Boolean(values['negative-control']),
    });
    writeJson(output, ledger);
    console.log(`Initialized empirical study ledger at ${path.resolve(output)}.`);
  } else if (command === 'record') {
    const ledgerPath = requireValue({ ...values, file: firstFile(values) }, 'file');
    const condition = requireValue(values, 'condition');
    const resultPath = requireValue(values, 'input');
    const updated = recordStudyCondition(readJson(ledgerPath), condition, readJson(resultPath));
    writeJson(ledgerPath, updated);
    console.log(`Recorded ${condition} condition in ${path.resolve(ledgerPath)}.`);
  } else if (command === 'validate') {
    const file = requireValue({ ...values, file: firstFile(values) }, 'file');
    validateStudyLedger(readJson(file));
    console.log(`Empirical study ledger is valid: ${path.resolve(file)}`);
  } else if (command === 'report') {
    const file = requireValue({ ...values, file: firstFile(values) }, 'file');
    printReport(reportStudyLedger(readJson(file)), Boolean(values.json));
  } else if (command === 'aggregate') {
    const files = Array.isArray(values.file) ? values.file : values.file ? [values.file] : [];
    if (!files.length) throw new Error('At least one --file is required');
    printReport(aggregateStudyLedgers(files.map(readJson)), Boolean(values.json));
  }
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}
