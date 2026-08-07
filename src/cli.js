#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initProject, scanProject, remember, snapshot, status, doctor, explainIgnore } from './core.js';
import { searchMemory, buildContextPack, formatResults } from './search.js';
import { loadProjectGraph, impactAnalysis, formatImpact } from './graph.js';
import { checkStaleMemory, formatStaleReport, refreshMemory } from './stale.js';
import { formatWorkspaces } from './workspaces.js';
import {
  getRepositoryBaseline,
  mapProjectBoundaries,
  suggestProjectMemory,
  prepareChangeBrief,
  formatRepositoryBaseline,
  formatBoundaryMap,
  formatMemorySuggestions,
  formatChangeBrief,
} from './advisor.js';
import {
  startChangeRecord,
  observeChangeRecord,
  completeChangeRecord,
  getChangeRecord,
  listChangeRecords,
  buildChangeInsights,
  formatChangeRecord,
  formatChangeInsights,
  formatChangeList,
} from './change-intelligence.js';
import { VERSION } from './version.js';

const [cmd, ...args] = process.argv.slice(2);
const pathCommands = new Set(['init','scan','status','graph','stale','doctor','workspaces','baseline','boundaries']);
const json = args.includes('--json');

function help() {
  console.log(`Codex Memory + Project Intelligence v${VERSION}\n\nUsage:\n  cmi init [path]\n  cmi scan [path] [--full] [--json]\n  cmi graph [path] [--json]\n  cmi workspaces [path] [--json]\n  cmi baseline [path] [--json]\n  cmi boundaries [path] [--json]\n  cmi explain-ignore <path> [--directory] [--json]\n  cmi search <query> [--limit N] [--workspace name-or-path] [--json]\n  cmi context <query> [--limit N] [--workspace name-or-path] [--json]\n  cmi prepare <change-goal> [--limit N] [--depth N] [--workspace name-or-path] [--json]\n  cmi memory-gaps <query> [--limit N] [--workspace name-or-path] [--json]\n  cmi impact <file-or-symbol> [--depth N] [--json]\n  cmi change start <goal> [--limit N] [--depth N] [--workspace name-or-path] [--json]\n  cmi change observe <id> [--file path ...] [--json]\n  cmi change complete <id> [--outcome succeeded|failed|partial|abandoned|unknown] [--file path ...] [--verify name=status ...] [--unexpected text ...] [--note text ...] [--json]\n  cmi change show <id> [--json]\n  cmi change list [--status active|completed] [--limit N] [--json]\n  cmi change history [query] [--limit N] [--json]\n  cmi remember <fact|decision|mistake> <text> [--source path ...]\n  cmi stale [path] [--fail-on stale|review|any] [--json]\n  cmi refresh-memory <id|all> [--reviewed-by name] [--reason text]\n  cmi snapshot [label]\n  cmi status [path] [--json]\n  cmi doctor [path] [--json]\n  cmi mcp-config [--write] [--bulk-refresh]\n  cmi --version\n\nIncremental scanning is enabled by default. Use --full to rebuild every source node.\nBoundary maps, risks, memory-gap suggestions, and historical co-change evidence are advisory and evidence-labeled.\nChange records compare predicted scope with observed changed paths; they do not claim causal or runtime-complete impact.\nMCP durable project writes, including memory and change records, are disabled unless --write is explicitly requested.\n`);
}

function optionValues(name) {
  const output = [];
  for (let index = 0; index < args.length; index += 1) if (args[index] === name && args[index + 1]) output.push(args[index + 1]);
  return output;
}
function optionNumber(name, fallback) { const value = Number(optionValues(name)[0]); return Number.isFinite(value) ? value : fallback; }
function hasFlag(name) { return args.includes(name); }
function positional(excluded = []) {
  const withValue = new Set(excluded);
  const output = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (['--json','--write','--bulk-refresh','--full','--directory'].includes(value)) continue;
    if (withValue.has(value)) { index += 1; continue; }
    if (value.startsWith('--')) continue;
    output.push(value);
  }
  return output;
}
function commandRoot() {
  if (!pathCommands.has(cmd)) return process.cwd();
  const candidates = positional(['--fail-on']);
  return path.resolve(candidates[0] || process.cwd());
}
function formatGraph(graph) {
  if (!graph) return 'Project graph is missing. Run cmi scan.';
  const hubs = graph.hubs.filter((item) => item.dependents > 0).slice(0, 10);
  return `Project graph · ${graph.summary.sourceFiles} source files · ${graph.summary.localEdges} local edges · ${graph.summary.symbols} symbols · ${graph.summary.externalDependencies} external dependencies · ${graph.summary.reusedFiles || 0} reused\n\nHigh-impact files:\n${hubs.map((item) => `- ${item.path}: ${item.dependents} dependents${item.workspace ? ` · ${item.workspace}` : ''}`).join('\n') || '- None detected'}`;
}
function formatDoctor(result) { return [`CMI ${result.version} · ${result.healthy ? 'ready' : 'blocked'}`, ...result.checks.map((check) => `- ${check.status.toUpperCase()} ${check.name}: ${check.detail}`)].join('\n'); }

try {
  if (cmd === '--version' || cmd === '-v' || cmd === 'version') console.log(VERSION);
  else if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') help();
  else if (cmd === 'init') console.log(`Initialized ${await initProject(commandRoot())}`);
  else if (cmd === 'scan') {
    const result = await scanProject(commandRoot(), { full: hasFlag('--full') });
    console.log(json ? JSON.stringify(result, null, 2) : `Scanned ${result.files} files (${result.bytes} bytes) in ${result.durationMs} ms; ${result.graph.sourceFiles} source files, ${result.graph.parsedFiles} parsed, ${result.graph.reusedFiles} reused, ${result.graph.localEdges} import edges, ${result.graph.symbols} symbols, ${result.workspaces.count} workspaces; stack: ${result.stack.join(', ') || 'unknown'}`);
  }
  else if (cmd === 'graph') { const result = await loadProjectGraph(commandRoot()); console.log(json ? JSON.stringify(result, null, 2) : formatGraph(result)); }
  else if (cmd === 'workspaces') {
    const result = await status(commandRoot());
    const workspaces = result.workspaces;
    if (!workspaces) throw new Error('Project workspace index is missing. Run cmi scan.');
    console.log(json ? JSON.stringify(workspaces, null, 2) : formatWorkspaces(workspaces));
  }
  else if (cmd === 'baseline') {
    const result = await getRepositoryBaseline(commandRoot());
    console.log(json ? JSON.stringify(result, null, 2) : formatRepositoryBaseline(result));
  }
  else if (cmd === 'boundaries') {
    const result = await mapProjectBoundaries(commandRoot());
    console.log(json ? JSON.stringify(result, null, 2) : formatBoundaryMap(result));
  }
  else if (cmd === 'explain-ignore') {
    const candidate = positional()[0];
    if (!candidate) throw new Error('Usage: cmi explain-ignore <path> [--directory]');
    const result = await explainIgnore(process.cwd(), candidate, { directory: hasFlag('--directory') });
    console.log(json ? JSON.stringify(result, null, 2) : `${result.ignored ? 'IGNORED' : 'INCLUDED'} ${result.path}\n${result.reason}`);
  }
  else if (cmd === 'search' || cmd === 'context') {
    const query = positional(['--limit','--workspace']).join(' ').trim();
    if (!query) throw new Error(`Usage: cmi ${cmd} <query> [--limit N] [--workspace name-or-path]`);
    const options = { workspace: optionValues('--workspace')[0] };
    if (cmd === 'context') {
      const pack = await buildContextPack(process.cwd(), query, optionNumber('--limit', 8), options);
      console.log(json ? JSON.stringify(pack, null, 2) : formatResults(pack.results));
    } else {
      const results = await searchMemory(process.cwd(), query, optionNumber('--limit', 6), options);
      console.log(json ? JSON.stringify(results, null, 2) : formatResults(results));
    }
  }
  else if (cmd === 'prepare') {
    const query = positional(['--limit','--depth','--workspace']).join(' ').trim();
    if (!query) throw new Error('Usage: cmi prepare <change-goal> [--limit N] [--depth N] [--workspace name-or-path]');
    const result = await prepareChangeBrief(process.cwd(), query, { limit: optionNumber('--limit', 12), depth: optionNumber('--depth', 3), workspace: optionValues('--workspace')[0] });
    console.log(json ? JSON.stringify(result, null, 2) : formatChangeBrief(result));
  }
  else if (cmd === 'memory-gaps') {
    const query = positional(['--limit','--workspace']).join(' ').trim();
    if (!query) throw new Error('Usage: cmi memory-gaps <query> [--limit N] [--workspace name-or-path]');
    const result = await suggestProjectMemory(process.cwd(), query, { limit: optionNumber('--limit', 20), workspace: optionValues('--workspace')[0] });
    console.log(json ? JSON.stringify(result, null, 2) : formatMemorySuggestions(result));
  }
  else if (cmd === 'impact') {
    const target = positional(['--depth']).join(' ').trim();
    if (!target) throw new Error('Usage: cmi impact <file-or-symbol> [--depth N]');
    const result = await impactAnalysis(process.cwd(), target, optionNumber('--depth', 3));
    console.log(json ? JSON.stringify(result, null, 2) : formatImpact(result));
  }
  else if (cmd === 'change') {
    const values = positional(['--limit','--depth','--workspace','--file','--outcome','--verify','--unexpected','--note','--status']);
    const action = values.shift();
    if (action === 'start') {
      const goal = values.join(' ').trim();
      if (!goal) throw new Error('Usage: cmi change start <goal> [--limit N] [--depth N] [--workspace name-or-path]');
      const result = await startChangeRecord(process.cwd(), goal, { limit: optionNumber('--limit', 12), depth: optionNumber('--depth', 3), workspace: optionValues('--workspace')[0] });
      console.log(json ? JSON.stringify(result, null, 2) : formatChangeRecord(result));
    }
    else if (action === 'observe') {
      const selector = values[0];
      if (!selector) throw new Error('Usage: cmi change observe <id> [--file path ...]');
      const result = await observeChangeRecord(process.cwd(), selector, { files: optionValues('--file') });
      console.log(json ? JSON.stringify(result, null, 2) : `Observed ${result.observedChangedFiles.length} changed path(s) · attribution ${result.attribution} · prediction gaps ${result.comparison.missedByPrediction.length}`);
    }
    else if (action === 'complete') {
      const selector = values[0];
      if (!selector) throw new Error('Usage: cmi change complete <id> [--outcome succeeded|failed|partial|abandoned|unknown]');
      const result = await completeChangeRecord(process.cwd(), selector, {
        outcome: optionValues('--outcome')[0] || 'unknown',
        files: optionValues('--file'),
        verifications: optionValues('--verify'),
        unexpectedImpact: optionValues('--unexpected'),
        notes: optionValues('--note'),
      });
      console.log(json ? JSON.stringify(result, null, 2) : formatChangeRecord(result));
    }
    else if (action === 'show') {
      const selector = values[0];
      if (!selector) throw new Error('Usage: cmi change show <id> [--json]');
      const result = await getChangeRecord(process.cwd(), selector);
      console.log(json ? JSON.stringify(result, null, 2) : formatChangeRecord(result));
    }
    else if (action === 'list') {
      const result = await listChangeRecords(process.cwd(), { status: optionValues('--status')[0], limit: optionNumber('--limit', 20) });
      console.log(json ? JSON.stringify(result, null, 2) : formatChangeList(result));
    }
    else if (action === 'history') {
      const query = values.join(' ').trim();
      const result = await buildChangeInsights(process.cwd(), query, { limit: optionNumber('--limit', 6) });
      console.log(json ? JSON.stringify(result, null, 2) : formatChangeInsights(result));
    }
    else throw new Error('Usage: cmi change <start|observe|complete|show|list|history> ...');
  }
  else if (cmd === 'remember') {
    const [type, ...text] = positional(['--source']);
    if (!type || !text.length) throw new Error('Usage: cmi remember <fact|decision|mistake> <text> [--source path ...]');
    const metadata = await remember(process.cwd(), type, text.join(' '), { sources: optionValues('--source') });
    console.log(`Memory updated: ${metadata.id.slice(0, 8)}${metadata.sources.length ? ` · ${metadata.sources.length} source(s)` : ''}`);
  }
  else if (cmd === 'stale') {
    const result = await checkStaleMemory(commandRoot());
    console.log(json ? JSON.stringify(result, null, 2) : formatStaleReport(result));
    const failOn = optionValues('--fail-on')[0];
    if (failOn === 'stale' && result.counts.stale > 0) process.exitCode = 2;
    else if (failOn === 'review' && (result.counts.stale + result.counts.review + result.counts.untracked) > 0) process.exitCode = 2;
    else if (failOn === 'any' && result.entries.some((entry) => entry.status !== 'fresh')) process.exitCode = 2;
    else if (failOn && !['stale','review','any'].includes(failOn)) throw new Error('--fail-on must be stale, review, or any');
  }
  else if (cmd === 'refresh-memory') {
    const selector = positional(['--reviewed-by','--reason'])[0];
    if (!selector) throw new Error('Usage: cmi refresh-memory <id|all> [--reviewed-by name] [--reason text]');
    const result = await refreshMemory(process.cwd(), selector, { reviewedBy: optionValues('--reviewed-by')[0], reason: optionValues('--reason')[0] });
    console.log(`Refreshed ${result.updated} memory entr${result.updated === 1 ? 'y' : 'ies'}.`);
  }
  else if (cmd === 'snapshot') console.log(`Created ${await snapshot(process.cwd(), positional().join(' ') || 'snapshot')}`);
  else if (cmd === 'status') {
    const result = await status(commandRoot());
    console.log(json ? JSON.stringify(result, null, 2) : result.initialized ? `Memory ${result.healthy ? 'healthy' : 'needs attention'} · ${result.entries.facts} facts · ${result.entries.decisions} decisions · ${result.entries.mistakes} lessons · ${result.memoryHealth.stale} stale · ${result.memoryHealth.review} review · ${result.graph?.symbols || 0} symbols · ${result.graph?.reusedFiles || 0} reused · ${result.workspaces?.count || 0} workspaces · ${result.snapshots} snapshots` : 'Memory is not initialized. Run cmi init.');
  }
  else if (cmd === 'doctor') {
    const result = await doctor(commandRoot());
    console.log(json ? JSON.stringify(result, null, 2) : formatDoctor(result));
    if (!result.healthy) process.exitCode = 1;
  }
  else if (cmd === 'mcp-config') {
    const executable = fileURLToPath(new URL('./mcp.js', import.meta.url));
    const env = { CMI_PROJECT_ROOT: process.cwd(), CMI_WRITE_ENABLED: hasFlag('--write') ? '1' : '0' };
    if (hasFlag('--bulk-refresh')) {
      if (!hasFlag('--write')) throw new Error('--bulk-refresh requires --write');
      env.CMI_ALLOW_BULK_REFRESH = '1';
    }
    const config = { mcpServers: { 'codex-memory-intelligence': { command: process.execPath, args: [executable], env } } };
    console.log(JSON.stringify(config, null, 2));
  }
  else { help(); process.exitCode = 1; }
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
}
