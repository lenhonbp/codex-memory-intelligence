import fs from 'node:fs';
import path from 'node:path';
import { MEMORY_SCHEMA_VERSION, SESSION_SCHEMA_VERSION, FINDINGS_SCHEMA_VERSION, MEMORY_LIFECYCLE_STATES, SESSION_OUTCOMES, FINDING_STATES, FINDING_SEVERITIES, EVIDENCE_TYPES, RECOMMENDATION_PRIORITIES, CONFIDENCE_LEVELS } from '../src/durable-contracts.js';
import { EVALUATION_SCHEMA_VERSION, EVALUATION_SOURCE_KINDS, EVALUATION_PROTOCOL_KINDS, EVALUATION_REPOSITORY_CLASSES, EVALUATION_TASK_KINDS, EVALUATION_REVIEW_OUTCOMES, EVALUATION_REVIEW_PROVENANCE, EVALUATION_UTILITY_RATINGS, EVALUATION_RECONSTRUCTION_RATINGS, EVALUATION_FOLLOW_UP_OUTCOMES, EVALUATION_VERIFICATION_CHOICE_OUTCOMES, EVALUATION_HISTORY_RATINGS, EVALUATION_BUNDLE_SCHEMA_VERSION, EVALUATION_BUNDLE_KIND, EVALUATION_STRESS_SCENARIOS, EVALUATION_STRESS_OUTCOMES } from '../src/evaluation-contracts.js';
import { validatePackageBins } from './package-bin-validation.js';

const allowed = new Set(['.js','.md','.json','.yml','.yaml']);
const ignored = new Set(['.git','node_modules']);
const errors = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && allowed.has(path.extname(entry.name))) {
      const text = fs.readFileSync(full, 'utf8');
      if (text && !text.endsWith('\n')) errors.push(`${full}: missing final newline`);
      text.split(/\r?\n/).forEach((line, index) => { if (/[ \t]+$/.test(line)) errors.push(`${full}:${index + 1}: trailing whitespace`); });
      if (path.extname(entry.name) === '.json') try { JSON.parse(text); } catch (error) { errors.push(`${full}: invalid JSON (${error.message})`); }
    }
  }
}

function sorted(values) { return [...values].sort(); }
function sameValues(actual, expected) { return JSON.stringify(sorted(actual || [])) === JSON.stringify(sorted(expected || [])); }
function validateSchemaContracts() {
  const memory = JSON.parse(fs.readFileSync('schemas/memory-metadata.schema.json', 'utf8'));
  const session = JSON.parse(fs.readFileSync('schemas/session-record.schema.json', 'utf8'));
  const findings = JSON.parse(fs.readFileSync('schemas/findings-registry.schema.json', 'utf8'));
  const evaluation = JSON.parse(fs.readFileSync('schemas/evaluation-record.schema.json', 'utf8'));
  const evaluationBundle = JSON.parse(fs.readFileSync('schemas/evaluation-bundle.schema.json', 'utf8'));
  if (memory.properties?.schemaVersion?.const !== MEMORY_SCHEMA_VERSION) errors.push('memory schemaVersion differs from runtime contract');
  if (!sameValues(memory.properties?.lifecycle?.properties?.state?.enum, MEMORY_LIFECYCLE_STATES)) errors.push('memory lifecycle enum differs from runtime contract');
  if (session.properties?.schemaVersion?.const !== SESSION_SCHEMA_VERSION) errors.push('session schemaVersion differs from runtime contract');
  if (session.properties?.id?.format !== 'uuid') errors.push('session id schema must use canonical UUID format');
  if (session.$defs?.finding?.properties?.id?.format !== 'uuid') errors.push('session finding id schema must use canonical UUID format');
  if (!(session.$defs?.finding?.required || []).includes('occurrences')) errors.push('session finding schema must require occurrences like runtime');
  if (session.$defs?.handoff?.properties?.sessionId?.format !== 'uuid') errors.push('session handoff sessionId schema must use canonical UUID format');
  if (!sameValues(session.properties?.close?.anyOf?.[1]?.properties?.outcome?.enum, SESSION_OUTCOMES)) errors.push('session outcome enum differs from runtime contract');
  if (!sameValues(session.$defs?.finding?.properties?.state?.enum, FINDING_STATES)) errors.push('session finding states differ from runtime contract');
  if (!sameValues(session.$defs?.finding?.properties?.severity?.enum, FINDING_SEVERITIES)) errors.push('session finding severities differ from runtime contract');
  if (!sameValues(session.$defs?.finding?.properties?.evidenceType?.enum, EVIDENCE_TYPES)) errors.push('session finding evidence types differ from runtime contract');
  if (!sameValues(session.$defs?.recommendation?.properties?.priority?.enum, RECOMMENDATION_PRIORITIES)) errors.push('session recommendation priorities differ from runtime contract');
  if (!sameValues(session.$defs?.recommendation?.properties?.confidence?.enum, CONFIDENCE_LEVELS)) errors.push('session recommendation confidence differs from runtime contract');
  if (findings.properties?.schemaVersion?.const !== FINDINGS_SCHEMA_VERSION) errors.push('findings schemaVersion differs from runtime contract');
  if (findings.properties?.findings?.items?.properties?.id?.format !== 'uuid') errors.push('findings registry id schema must use canonical UUID format');
  if (!(findings.properties?.findings?.items?.required || []).includes('occurrences')) errors.push('findings registry must require occurrences like runtime');
  if (!sameValues(findings.properties?.findings?.items?.properties?.state?.enum, FINDING_STATES)) errors.push('findings registry states differ from runtime contract');
  if (!sameValues(findings.properties?.findings?.items?.properties?.severity?.enum, FINDING_SEVERITIES)) errors.push('findings registry severities differ from runtime contract');
  if (!sameValues(findings.properties?.findings?.items?.properties?.evidenceType?.enum, EVIDENCE_TYPES)) errors.push('findings registry evidence types differ from runtime contract');
  if (evaluation.properties?.schemaVersion?.const !== EVALUATION_SCHEMA_VERSION) errors.push('evaluation schemaVersion differs from runtime contract');
  if (evaluation.properties?.id?.format !== 'uuid') errors.push('evaluation id schema must use canonical UUID format');
  if (!sameValues(evaluation.properties?.source?.properties?.kind?.enum, EVALUATION_SOURCE_KINDS)) errors.push('evaluation source kinds differ from runtime contract');
  if (!sameValues(evaluation.properties?.protocol?.properties?.kind?.enum, EVALUATION_PROTOCOL_KINDS)) errors.push('evaluation protocol kinds differ from runtime contract');
  if (evaluation.properties?.subject?.properties?.sourceRevision?.pattern !== '^[0-9a-f]{40}$') errors.push('evaluation subject revision schema differs from runtime contract');
  if (!sameValues(evaluation.properties?.repository?.properties?.class?.enum, EVALUATION_REPOSITORY_CLASSES)) errors.push('evaluation repository classes differ from runtime contract');
  if (!sameValues(evaluation.properties?.task?.properties?.kind?.enum, EVALUATION_TASK_KINDS)) errors.push('evaluation task kinds differ from runtime contract');
  if (!sameValues(evaluation.properties?.review?.properties?.outcome?.enum, EVALUATION_REVIEW_OUTCOMES)) errors.push('evaluation review outcomes differ from runtime contract');
  if (!sameValues(evaluation.properties?.review?.properties?.provenance?.enum, EVALUATION_REVIEW_PROVENANCE)) errors.push('evaluation review provenance differs from runtime contract');
  if (!sameValues(evaluation.properties?.review?.properties?.nextActionRating?.enum, EVALUATION_UTILITY_RATINGS)) errors.push('evaluation next-action ratings differ from runtime contract');
  if (!sameValues(evaluation.properties?.review?.properties?.handoffRating?.enum, EVALUATION_UTILITY_RATINGS)) errors.push('evaluation handoff ratings differ from runtime contract');
  if (!sameValues(evaluation.properties?.review?.properties?.reconstructionRating?.enum, EVALUATION_RECONSTRUCTION_RATINGS)) errors.push('evaluation reconstruction ratings differ from runtime contract');
  if (!sameValues(evaluation.properties?.review?.properties?.followUpOutcome?.enum, EVALUATION_FOLLOW_UP_OUTCOMES)) errors.push('evaluation follow-up outcomes differ from runtime contract');
  if (!sameValues(evaluation.properties?.review?.properties?.verificationChoiceOutcome?.enum, EVALUATION_VERIFICATION_CHOICE_OUTCOMES)) errors.push('evaluation verification-choice outcomes differ from runtime contract');
  if (!sameValues(evaluation.properties?.review?.properties?.historyRating?.enum, EVALUATION_HISTORY_RATINGS)) errors.push('evaluation history ratings differ from runtime contract');
  if (evaluationBundle.properties?.schemaVersion?.const !== EVALUATION_BUNDLE_SCHEMA_VERSION) errors.push('evaluation bundle schemaVersion differs from runtime contract');
  if (evaluationBundle.properties?.kind?.const !== EVALUATION_BUNDLE_KIND) errors.push('evaluation bundle kind differs from runtime contract');
  if (!sameValues((evaluation.properties?.stress?.properties?.scenario?.enum || []).filter((value) => value !== null), EVALUATION_STRESS_SCENARIOS)) errors.push('evaluation stress scenarios differ from runtime contract');
  if (!sameValues(evaluation.properties?.stress?.properties?.outcome?.enum, EVALUATION_STRESS_OUTCOMES)) errors.push('evaluation stress outcomes differ from runtime contract');
}

walk('.');
errors.push(...validatePackageBins());
validateSchemaContracts();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('Repository quality checks passed.');
