import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  createStudyLedger,
  validateStudyLedger,
} from '../src/empirical-study.js';

const REVISION = 'c'.repeat(40);

function createLedger() {
  return createStudyLedger({
    studyId: 'hardening-study',
    pairId: 'hardening-pair',
    repositoryStudyId: 'hardening-repo',
    revision: REVISION,
    repoClass: 'application',
    taskClass: 'audit',
    order: 'plain-first',
    agentConfiguration: 'fresh isolated sessions with condition-appropriate tools',
    taskReference: null,
    acceptanceReference: null,
    negativeControl: false,
  });
}

function run(...args) {
  return spawnSync(process.execPath, ['scripts/empirical-study.js', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
}

test('study validation rejects non-boolean negative-control metadata instead of coercing it', () => {
  const ledger = createLedger();
  ledger.study.negativeControl = 'false';
  assert.throws(() => validateStudyLedger(ledger), /negativeControl must be boolean/i);
});

test('study CLI rejects unknown options and positional arguments', () => {
  let command = run('validate', '--file', 'missing-ledger.json', '--typo', 'value');
  assert.notEqual(command.status, 0);
  assert.match(command.stderr, /unknown option --typo/i);

  command = run('validate', '--file', 'missing-ledger.json', 'unexpected');
  assert.notEqual(command.status, 0);
  assert.match(command.stderr, /unexpected positional argument/i);
});

test('study CLI rejects duplicate single-file options outside aggregate mode', () => {
  const command = run('validate', '--file', 'first.json', '--file', 'second.json');
  assert.notEqual(command.status, 0);
  assert.match(command.stderr, /duplicate option --file/i);
});
