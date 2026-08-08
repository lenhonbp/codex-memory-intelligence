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
  formatSessionReport,
  formatSessionAssessment,
  formatHandoff,
  formatFindingList,
} from './session-intelligence.js';
import {
  captureEvaluation,
  getEvaluation,
  listEvaluations,
  buildEvaluationReport,
  formatEvaluationRecord,
  formatEvaluationList,
  formatEvaluationReport,
} from './evaluation.js';

const [command, ...args] = process.argv.slice(2);
if (!['session', 'finding', 'evaluate'].includes(command)) {
  await import('./cli.js');
  process.exit();
}

const json = args.includes('--json');
function hasFlag(name) { return args.includes(name); }
function optionValues(name) {
  const output = [];
  for (let index = 0; index < args.length; index += 1) if (args[index] === name && args[index + 1]) output.push(args[index + 1]);
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
    stressScenario: optionValues('--stress-scenario')[0],
    stressExpected: optionValues('--stress-expected')[0],
    stressPassed: optionValues('--stress-passed')[0],
    stressFailed: optionValues('--stress-failed')[0],
  };
}
function print(value, formatted) { console.log(json ? JSON.stringify(value, null, 2) : formatted); }
function groupHelp(name) {
  if (name === 'session') return 'Usage: cmi session <start|observe|status|close|show|list|handoff> ...\n\nTrack project work, persist findings, and produce an evidence-based handoff/next action.';
  if (name === 'finding') return 'Usage: cmi finding <list|show|state> ...\n\nInspect and explicitly review persistent project findings.';
  return 'Usage: cmi evaluate <capture|list|show|report> ...\n\nCollect anonymized field evidence while keeping external-real, self-host, and synthetic records separate.';
}

try {
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
      print(result, formatSessionAssessment(result));
    } else if (action === 'close') {
      const record = await closeSession(process.cwd(), values[0] || 'latest', sessionOptions());
      print(record, formatSessionReport(record));
    } else if (action === 'show') {
      const record = await getSession(process.cwd(), values[0] || 'latest');
      print(record, formatSessionReport(record));
    } else if (action === 'list') {
      const result = await listSessions(process.cwd(), { status: optionValues('--status')[0], limit: optionNumber('--limit', 20) });
      const text = result.records.length ? result.records.map((item) => `- ${item.id.slice(0, 8)} [${item.status}${item.outcome ? `/${item.outcome}` : ''}] ${item.goal}${item.nextAction ? `\n  Next: ${item.nextAction.priority} ${item.nextAction.action}` : ''}`).join('\n') : 'No CMI sessions found.';
      print(result, text);
    } else if (action === 'handoff') {
      const handoff = await getSessionHandoff(process.cwd(), values[0] || 'latest');
      print(handoff, formatHandoff(handoff));
    } else {
      throw new Error('Usage: cmi session <start|observe|status|close|show|list|handoff> ...');
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
    const values = positional(['--source-kind','--protocol','--repository-class','--task-kind','--session','--review-outcome','--review-provenance','--false-positive-findings','--missed-findings','--next-action-rating','--handoff-rating','--stress-scenario','--stress-expected','--stress-passed','--stress-failed','--limit']);
    const action = values.shift();
    if (action === 'capture') {
      if (!optionValues('--source-kind')[0]) throw new Error('Usage: cmi evaluate capture --source-kind <external-real|self-host|synthetic> [--protocol observational|controlled-stress] [--repository-class class] [--task-kind kind] [--session latest|none|id] [--stress-scenario scenario --stress-expected N --stress-passed N --stress-failed N]');
      const record = await captureEvaluation(process.cwd(), evaluationOptions());
      print(record, formatEvaluationRecord(record));
    } else if (action === 'list') {
      const result = await listEvaluations(process.cwd(), { sourceKind: optionValues('--source-kind')[0], limit: optionNumber('--limit', 50) });
      print(result, formatEvaluationList(result));
    } else if (action === 'show') {
      const record = await getEvaluation(process.cwd(), values[0]);
      print(record, formatEvaluationRecord(record));
    } else if (action === 'report') {
      const report = await buildEvaluationReport(process.cwd(), { sourceKind: optionValues('--source-kind')[0] });
      print(report, formatEvaluationReport(report));
    } else {
      throw new Error('Usage: cmi evaluate <capture|list|show|report> ...');
    }
  }
} catch (error) {
  console.error(`CMI error: ${error.message}`);
  if (hasFlag('--json')) console.error(JSON.stringify({ error: error.message }));
  process.exitCode = 1;
}
