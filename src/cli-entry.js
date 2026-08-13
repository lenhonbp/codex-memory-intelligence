#!/usr/bin/env node
import {
  startSession,
  observeSession,
  assessSession,
  closeSession,
  getSession,
  listSessions,
  getSessionHandoff,
  listFindings,
  getFinding,
  setFindingState,
  formatFindingList,
} from './session-intelligence.js';
import { buildClosingIntelligence, formatClosingIntelligence } from './closing-intelligence.js';
import {
  formatSessionRecordWithEvidence,
  formatSessionAssessmentWithEvidence,
  formatSessionHandoffWithEvidence,
} from './session-evidence-view.js';
import {
  captureEvaluation,
  getEvaluation,
  reviewEvaluation,
  exportEvaluations,
  importEvaluations,
  listEvaluations,
  buildEvaluationReport,
  formatEvaluationRecord,
  formatEvaluationList,
  formatEvaluationReport,
} from './evaluation.js';

const [command, ...args] = process.argv.slice(2);

async function flushStandardStream(stream) {
  if (!stream || stream.destroyed || !stream.writable) return;
  await new Promise((resolve) => {
    try {
      stream.write('', () => resolve());
    } catch {
      resolve();
    }
  });
}

const NUMERIC_FLAG_MINIMUMS = new Map([
  ['--limit', 1],
  ['--depth', 1],
  ['--since-days', 1],
  ['--false-positive-findings', 0],
  ['--missed-findings', 0],
  ['--stress-expected', 1],
  ['--stress-passed', 0],
  ['--stress-failed', 0],
]);
function failCliPreflight(message) {
  if (args.includes('--json')) console.error(JSON.stringify({ ok: false, error: { code: 'CMI_CLI_ERROR', message } }));
  else console.error(`CMI error: ${message}`);
  process.exit(1);
}
function validateNumericFlags(values) {
  for (let index = 0; index < values.length; index += 1) {
    const flag = values[index];
    if (!NUMERIC_FLAG_MINIMUMS.has(flag)) continue;
    const next = values[index + 1];
    if (!next || next.startsWith('--')) failCliPreflight(`${flag} requires a value.`);
    const parsed = Number(next);
    if (!Number.isInteger(parsed) || !Number.isFinite(parsed)) failCliPreflight(`${flag} requires an integer value.`);
    const minimum = NUMERIC_FLAG_MINIMUMS.get(flag);
    if (parsed < minimum) failCliPreflight(`${flag} must be at least ${minimum}.`);
  }
}
function validateTopLevelTrustFlags(values) {
  if (command !== 'stale') return;
  const failOnIndexes = values.map((value, index) => value === '--fail-on' ? index : -1).filter((index) => index >= 0);
  if (failOnIndexes.length > 1) failCliPreflight('--fail-on may be specified only once.');
  if (!failOnIndexes.length) return;
  const next = values[failOnIndexes[0] + 1];
  if (!next || next.startsWith('--')) failCliPreflight('--fail-on requires a value.');
  if (!['stale', 'review', 'any'].includes(next)) failCliPreflight('--fail-on must be stale, review, or any');
}
validateNumericFlags(args);
validateTopLevelTrustFlags(args);
if (!['session', 'finding', 'evaluate'].includes(command)) {
  await import('./cli.js');
  await Promise.all([flushStandardStream(process.stdout), flushStandardStream(process.stderr)]);
  process.exit(process.exitCode ?? 0);
}

const json = args.includes('--json');
const VALUE_FLAGS = new Set([
  '--file','--note','--accomplished','--blocker','--decision','--question','--outcome','--status','--limit','--reason','--changed-by','--superseded-by',
  '--source-kind','--protocol','--repository-class','--task-kind','--session','--review-outcome','--review-provenance','--false-positive-findings','--missed-findings',
  '--next-action-rating','--handoff-rating','--reconstruction-rating','--follow-up-outcome','--verification-choice-outcome','--history-rating','--stress-scenario',
  '--stress-expected','--stress-passed','--stress-failed','--subject-version','--since-days',
]);
function hasFlag(name) { return args.includes(name); }
function optionValues(name) {
  const output = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== name) continue;
    const next = args[index + 1];
    if (!next || next.startsWith('--')) throw new Error(`${name} requires a value.`);
    output.push(next);
  }
  return output;
}
function optionNumber(name, fallback) { const value = Number(optionValues(name)[0]); return Number.isFinite(value) ? value : fallback; }
function positional(valueOptions = []) {
  const withValue = new Set(valueOptions);
  const output = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (['--json'].includes(value)) continue;
    if (withValue.has(value)) { index += 1; continue; }
    if (value.startsWith('--')) continue;
    output.push(value);
  }
  return output;
}
function actionName() {
  const values = positional([...VALUE_FLAGS]);
  return values[0] || null;
}
function allowedFlags() {
  const action = actionName();
  if (command === 'session') {
    const commonObservation = ['--file','--note','--accomplished','--blocker','--decision','--question','--outcome','--json'];
    const map = {
      start: ['--file','--note','--accomplished','--blocker','--decision','--question','--json'],
      observe: commonObservation.filter((item) => item !== '--outcome'),
      status: ['--json'], close: commonObservation, closing: ['--json'], show: ['--json'], list: ['--status','--limit','--json'], handoff: ['--json'],
    };
    return new Set(map[action] || []);
  }
  if (command === 'finding') {
    const map = { list: ['--status','--limit','--json'], show: ['--json'], state: ['--reason','--changed-by','--superseded-by','--json'] };
    return new Set(map[action] || []);
  }
  const capture = ['--source-kind','--protocol','--repository-class','--task-kind','--session','--stress-scenario','--stress-expected','--stress-passed','--stress-failed','--json'];
  const review = ['--review-outcome','--review-provenance','--false-positive-findings','--missed-findings','--next-action-rating','--handoff-rating','--reconstruction-rating','--follow-up-outcome','--verification-choice-outcome','--history-rating','--json'];
  const filters = ['--source-kind','--task-kind','--subject-version','--since-days'];
  const map = {
    capture,
    review,
    list: [...filters,'--limit','--json'],
    show: ['--json'],
    report: [...filters,'--json'],
    export: [...filters,'--json'],
    import: ['--json'],
  };
  return new Set(map[action] || []);
}
function validateFlags() {
  if (hasFlag('--help') || hasFlag('-h') || args[0] === 'help') return;
  const allowed = allowedFlags();
  for (const value of args) {
    if (!value.startsWith('--')) continue;
    if (!allowed.has(value)) throw new Error(`Unknown option for ${command} ${actionName() || ''}: ${value}`.trim());
  }
  for (const value of allowed) if (VALUE_FLAGS.has(value) && args.includes(value)) optionValues(value);
}
function sessionOptions() {
  return {
    files: optionValues('--file'),
    notes: optionValues('--note'),
    accomplished: optionValues('--accomplished'),
    blockers: optionValues('--blocker'),
    decisions: optionValues('--decision'),
    questions: optionValues('--question'),
    outcome: optionValues('--outcome')[0],
  };
}
function evaluationOptions() {
  return {
    sourceKind: optionValues('--source-kind')[0],
    protocolKind: optionValues('--protocol')[0],
    repositoryClass: optionValues('--repository-class')[0],
    taskKind: optionValues('--task-kind')[0],
    session: optionValues('--session')[0],
    reviewOutcome: optionValues('--review-outcome')[0],
    reviewProvenance: optionValues('--review-provenance')[0],
    falsePositiveFindings: optionValues('--false-positive-findings')[0],
    missedFindings: optionValues('--missed-findings')[0],
    nextActionRating: optionValues('--next-action-rating')[0],
    handoffRating: optionValues('--handoff-rating')[0],
    reconstructionRating: optionValues('--reconstruction-rating')[0],
    followUpOutcome: optionValues('--follow-up-outcome')[0],
    verificationChoiceOutcome: optionValues('--verification-choice-outcome')[0],
    historyRating: optionValues('--history-rating')[0],
    stressScenario: optionValues('--stress-scenario')[0],
    stressExpected: optionValues('--stress-expected')[0],
    stressPassed: optionValues('--stress-passed')[0],
    stressFailed: optionValues('--stress-failed')[0],
  };
}
function print(value, formatted) { console.log(json ? JSON.stringify(value, null, 2) : formatted); }
function groupHelp(name) {
  if (name === 'session') return 'Usage: cmi session <start|observe|status|close|closing|show|list|handoff> ...\n\nTrack project work, persist findings, and produce an evidence-based handoff/next action plus bounded Closing Intelligence.';
  if (name === 'finding') return 'Usage: cmi finding <list|show|state> ...\n\nInspect and explicitly review persistent project findings.';
  return 'Usage: cmi evaluate <capture|review|list|show|report> ...\n       cmi evaluate <export|import> ...\n\nSource kinds: external-real | self-host | synthetic.\nCollect anonymized field evidence, explicit longitudinal human/agent judgments, and portable local bundles without mixing provenance classes.';
}
function emitError(error) {
  if (json) console.error(JSON.stringify({ ok: false, error: { code: error?.code || 'CMI_CLI_ERROR', message: error?.message || String(error), ...(error?.details === undefined ? {} : { details: error.details }) } }));
  else console.error(`CMI error: ${error?.message || String(error)}`);
}

try {
  validateFlags();
  if (hasFlag('--help') || hasFlag('-h') || args[0] === 'help') {
    console.log(groupHelp(command));
  } else if (command === 'session') {
    const values = positional(['--file','--note','--accomplished','--blocker','--decision','--question','--outcome','--status','--limit']);
    const action = values.shift();
    if (action === 'start') {
      const goal = values.join(' ').trim();
      if (!goal) throw new Error('Usage: cmi session start <goal> [--note text] [--json]');
      const record = await startSession(process.cwd(), goal, sessionOptions());
      print(record, `Started CMI session ${record.id.slice(0, 8)}\nGoal: ${record.goal}\n\nCMI will preserve findings and propose evidence-based next actions when this session is closed.`);
    } else if (action === 'observe') {
      const selector = values[0] || 'latest';
      const record = await observeSession(process.cwd(), selector, sessionOptions());
      print(record, `Observed session ${record.id.slice(0, 8)} · ${record.observations.length} observation(s) recorded.`);
    } else if (action === 'status') {
      const result = await assessSession(process.cwd(), values[0] || 'latest');
      print(result, formatSessionAssessmentWithEvidence(result));
    } else if (action === 'close') {
      const record = await closeSession(process.cwd(), values[0] || 'latest', sessionOptions());
      if (json) print(record, formatSessionRecordWithEvidence(record));
      else {
        const closing = await buildClosingIntelligence(process.cwd(), record.id);
        console.log(`${formatSessionRecordWithEvidence(record)}\n\n${formatClosingIntelligence(closing)}`);
      }
    } else if (action === 'closing') {
      const closing = await buildClosingIntelligence(process.cwd(), values[0] || 'latest');
      print(closing, formatClosingIntelligence(closing));
    } else if (action === 'show') {
      const record = await getSession(process.cwd(), values[0] || 'latest');
      print(record, formatSessionRecordWithEvidence(record));
    } else if (action === 'list') {
      const result = await listSessions(process.cwd(), { status: optionValues('--status')[0], limit: optionNumber('--limit', 20) });
      const text = result.records.length ? result.records.map((item) => `- ${item.id.slice(0, 8)} [${item.status}${item.outcome ? `/${item.outcome}` : ''}] ${item.goal}${item.nextAction ? `\n  Next: ${item.nextAction.priority} ${item.nextAction.action}` : ''}`).join('\n') : 'No CMI sessions found.';
      print(result, text);
    } else if (action === 'handoff') {
      const handoff = await getSessionHandoff(process.cwd(), values[0] || 'latest');
      print(handoff, formatSessionHandoffWithEvidence(handoff));
    } else {
      throw new Error('Usage: cmi session <start|observe|status|close|closing|show|list|handoff> ...');
    }
  } else if (command === 'finding') {
    const values = positional(['--status','--limit','--reason','--changed-by','--superseded-by']);
    const action = values.shift();
    if (action === 'list') {
      const result = await listFindings(process.cwd(), { state: optionValues('--status')[0], limit: optionNumber('--limit', 50) });
      print(result, formatFindingList(result));
    } else if (action === 'show') {
      const item = await getFinding(process.cwd(), values[0]);
      print(item, `# Project finding\n\n${item.title}\nState: ${item.state}\nSeverity: ${item.severity}\nConfidence: ${item.confidence}\nEvidence type: ${item.evidenceType}\n\n${item.detail}`);
    } else if (action === 'state') {
      const [selector, state] = values;
      if (!selector || !state) throw new Error('Usage: cmi finding state <id> <open|resolved|accepted|dismissed|superseded> --reason text');
      const item = await setFindingState(process.cwd(), selector, state, { reason: optionValues('--reason')[0], changedBy: optionValues('--changed-by')[0], supersededBy: optionValues('--superseded-by')[0] });
      print(item, `Finding ${item.id.slice(0, 8)} is now ${item.state}.`);
    } else {
      throw new Error('Usage: cmi finding <list|show|state> ...');
    }
  } else {
    const values = positional([...VALUE_FLAGS]);
    const action = values.shift();
    if (action === 'capture') {
      if (!optionValues('--source-kind')[0]) throw new Error('Usage: cmi evaluate capture --source-kind <external-real|self-host|synthetic> [--protocol observational|controlled-stress] [--repository-class class] [--task-kind kind] [--session latest|none|id] [--stress-scenario scenario --stress-expected N --stress-passed N --stress-failed N]');
      const record = await captureEvaluation(process.cwd(), evaluationOptions());
      print(record, formatEvaluationRecord(record));
    } else if (action === 'review') {
      const selector = values[0];
      if (!selector) throw new Error('Usage: cmi evaluate review <id> --review-outcome <pass|partial|fail> --review-provenance <human|agent> [usefulness options]');
      const record = await reviewEvaluation(process.cwd(), selector, evaluationOptions());
      print(record, formatEvaluationRecord(record));
    } else if (action === 'list') {
      const result = await listEvaluations(process.cwd(), { sourceKind: optionValues('--source-kind')[0], taskKind: optionValues('--task-kind')[0], subjectVersion: optionValues('--subject-version')[0], sinceDays: optionValues('--since-days')[0], limit: optionNumber('--limit', 50) });
      print(result, formatEvaluationList(result));
    } else if (action === 'show') {
      const record = await getEvaluation(process.cwd(), values[0]);
      print(record, formatEvaluationRecord(record));
    } else if (action === 'report') {
      const report = await buildEvaluationReport(process.cwd(), { sourceKind: optionValues('--source-kind')[0], taskKind: optionValues('--task-kind')[0], subjectVersion: optionValues('--subject-version')[0], sinceDays: optionValues('--since-days')[0] });
      print(report, formatEvaluationReport(report));
    } else if (action === 'export') {
      const filePath = values[0];
      if (!filePath) throw new Error('Usage: cmi evaluate export <file> [--source-kind kind] [--task-kind kind] [--subject-version version] [--since-days N]');
      const result = await exportEvaluations(process.cwd(), filePath, { sourceKind: optionValues('--source-kind')[0], taskKind: optionValues('--task-kind')[0], subjectVersion: optionValues('--subject-version')[0], sinceDays: optionValues('--since-days')[0] });
      print(result, `Exported ${result.records} anonymized evaluation record(s) to ${result.path}.`);
    } else if (action === 'import') {
      const filePath = values[0];
      if (!filePath) throw new Error('Usage: cmi evaluate import <file>');
      const result = await importEvaluations(process.cwd(), filePath);
      print(result, `Imported ${result.imported} evaluation record(s); ${result.skipped} already present.`);
    } else {
      throw new Error('Usage: cmi evaluate <capture|review|list|show|report|export|import> ...');
    }
  }
} catch (error) {
  emitError(error);
  process.exitCode = 1;
}
