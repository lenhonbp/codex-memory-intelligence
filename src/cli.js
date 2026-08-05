#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initProject, scanProject, remember, snapshot, status } from './core.js';
import { searchMemory, formatResults } from './search.js';
import { loadProjectGraph, impactAnalysis, formatImpact } from './graph.js';
import { checkStaleMemory, formatStaleReport, refreshMemory } from './stale.js';

const [cmd, ...args] = process.argv.slice(2);
const pathCommands = new Set(['init', 'scan', 'status', 'graph', 'stale']);
const json = args.includes('--json');

function help() {
  console.log(`Codex Memory + Project Intelligence

Usage:
  cmi init [path]
  cmi scan [path] [--json]
  cmi graph [path] [--json]
  cmi search <query> [--limit N] [--json]
  cmi context <query> [--limit N]
  cmi impact <file-or-symbol> [--depth N] [--json]
  cmi remember <fact|decision|mistake> <text> [--source path ...]
  cmi stale [path] [--json]
  cmi refresh-memory [id|all]
  cmi snapshot [label]
  cmi status [path] [--json]
  cmi mcp-config
`);
}

function optionValues(name) {
  const output = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name && args[index + 1]) output.push(args[index + 1]);
  }
  return output;
}

function optionNumber(name, fallback) {
  const value = Number(optionValues(name)[0]);
  return Number.isFinite(value) ? value : fallback;
}

function positional(excluded = []) {
  const withValue = new Set(excluded);
  const output = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === '--json') continue;
    if (withValue.has(value)) { index += 1; continue; }
    if (value.startsWith('--')) continue;
    output.push(value);
  }
  return output;
}

function commandRoot() {
  if (!pathCommands.has(cmd)) return process.cwd();
  const candidates = positional();
  return path.resolve(candidates[0] || process.cwd());
}

function formatGraph(graph) {
  if (!graph) return 'Project graph is missing. Run cmi scan.';
  const hubs = graph.hubs.filter((item) => item.dependents > 0).slice(0, 10);
  return `Project graph · ${graph.summary.sourceFiles} source files · ${graph.summary.localEdges} local edges · ${graph.summary.symbols} symbols · ${graph.summary.externalDependencies} external dependencies\n\nHigh-impact files:\n${hubs.map((item) => `- ${item.path}: ${item.dependents} dependents`).join('\n') || '- None detected'}`;
}

try {
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') help();
  else if (cmd === 'init') console.log(`Initialized ${await initProject(commandRoot())}`);
  else if (cmd === 'scan') {
    const result = await scanProject(commandRoot());
    console.log(json ? JSON.stringify(result, null, 2) : `Scanned ${result.files} files (${result.bytes} bytes); ${result.graph.sourceFiles} source files, ${result.graph.localEdges} import edges, ${result.graph.symbols} symbols; stack: ${result.stack.join(', ') || 'unknown'}`);
  } else if (cmd === 'graph') {
    const result = await loadProjectGraph(commandRoot());
    console.log(json ? JSON.stringify(result, null, 2) : formatGraph(result));
  } else if (cmd === 'search' || cmd === 'context') {
    const query = positional(['--limit']).join(' ').trim();
    if (!query) throw new Error(`Usage: cmi ${cmd} <query> [--limit N]`);
    const results = await searchMemory(process.cwd(), query, optionNumber('--limit', cmd === 'context' ? 8 : 6));
    console.log(json && cmd === 'search' ? JSON.stringify(results, null, 2) : formatResults(results));
  } else if (cmd === 'impact') {
    const target = positional(['--depth']).join(' ').trim();
    if (!target) throw new Error('Usage: cmi impact <file-or-symbol> [--depth N]');
    const result = await impactAnalysis(process.cwd(), target, optionNumber('--depth', 3));
    console.log(json ? JSON.stringify(result, null, 2) : formatImpact(result));
  } else if (cmd === 'remember') {
    const [type, ...text] = positional(['--source']);
    if (!type || !text.length) throw new Error('Usage: cmi remember <fact|decision|mistake> <text> [--source path ...]');
    const metadata = await remember(process.cwd(), type, text.join(' '), { sources: optionValues('--source') });
    console.log(`Memory updated: ${metadata.id.slice(0, 8)}${metadata.sources.length ? ` · ${metadata.sources.length} source(s)` : ''}`);
  } else if (cmd === 'stale') {
    const result = await checkStaleMemory(commandRoot());
    console.log(json ? JSON.stringify(result, null, 2) : formatStaleReport(result));
  } else if (cmd === 'refresh-memory') {
    const selector = positional()[0] || 'all';
    const result = await refreshMemory(process.cwd(), selector);
    console.log(`Refreshed ${result.updated} memory entr${result.updated === 1 ? 'y' : 'ies'}.`);
  } else if (cmd === 'snapshot') console.log(`Created ${await snapshot(process.cwd(), positional().join(' ') || 'snapshot')}`);
  else if (cmd === 'status') {
    const result = await status(commandRoot());
    console.log(json ? JSON.stringify(result, null, 2) : result.initialized ? `Memory ${result.healthy ? 'healthy' : 'needs attention'} · ${result.entries.facts} facts · ${result.entries.decisions} decisions · ${result.entries.mistakes} lessons · ${result.memoryHealth.stale} stale · ${result.memoryHealth.review} review · ${result.graph?.symbols || 0} symbols · ${result.snapshots} snapshots` : 'Memory is not initialized. Run cmi init.');
  } else if (cmd === 'mcp-config') {
    const executable = fileURLToPath(new URL('./mcp.js', import.meta.url));
    const config = { mcpServers: { 'codex-memory-intelligence': { command: process.execPath, args: [executable], env: { CMI_PROJECT_ROOT: process.cwd() } } } };
    console.log(JSON.stringify(config, null, 2));
  } else {
    help();
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
}
