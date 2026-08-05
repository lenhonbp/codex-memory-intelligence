#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs/promises';
import { initProject, scanProject, remember, snapshot, status } from './core.js';
import { searchMemory, formatResults } from './search.js';

const [cmd, ...args] = process.argv.slice(2);
const pathCommands = new Set(['init', 'scan', 'status']);
const pathArg = args.find((arg) => !arg.startsWith('--'));
const root = path.resolve(pathArg && pathCommands.has(cmd) ? pathArg : process.cwd());
const json = args.includes('--json');

function help() {
  console.log(`Codex Memory + Project Intelligence

Usage:
  cmi init [path]
  cmi scan [path] [--json]
  cmi search <query> [--limit N] [--json]
  cmi context <query> [--limit N]
  cmi remember <fact|decision|mistake> <text>
  cmi snapshot [label]
  cmi status [path] [--json]
  cmi mcp-config
`);
}

function optionNumber(name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = Number(args[index + 1]);
  return Number.isFinite(value) ? value : fallback;
}

function positional(excluded = []) {
  const skip = new Set(excluded);
  const output = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--json') continue;
    if (skip.has(args[i])) { i += 1; continue; }
    output.push(args[i]);
  }
  return output;
}

try {
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') help();
  else if (cmd === 'init') console.log(`Initialized ${await initProject(root)}`);
  else if (cmd === 'scan') {
    const result = await scanProject(root);
    console.log(json ? JSON.stringify(result, null, 2) : `Scanned ${result.files} files (${result.bytes} bytes); stack: ${result.stack.join(', ') || 'unknown'}`);
  } else if (cmd === 'search' || cmd === 'context') {
    const query = positional(['--limit']).join(' ').trim();
    if (!query) throw new Error(`Usage: cmi ${cmd} <query> [--limit N]`);
    const results = await searchMemory(process.cwd(), query, optionNumber('--limit', cmd === 'context' ? 8 : 6));
    console.log(json && cmd === 'search' ? JSON.stringify(results, null, 2) : formatResults(results));
  } else if (cmd === 'remember') {
    const [type, ...text] = positional();
    if (!type || !text.length) throw new Error('Usage: cmi remember <fact|decision|mistake> <text>');
    await remember(process.cwd(), type, text.join(' '));
    console.log('Memory updated.');
  } else if (cmd === 'snapshot') console.log(`Created ${await snapshot(process.cwd(), positional().join(' ') || 'snapshot')}`);
  else if (cmd === 'status') {
    const result = await status(root);
    console.log(json ? JSON.stringify(result, null, 2) : result.initialized ? `Memory ${result.healthy ? 'healthy' : 'needs scan'} · ${result.entries.facts} facts · ${result.entries.decisions} decisions · ${result.entries.mistakes} lessons · ${result.snapshots} snapshots` : 'Memory is not initialized. Run cmi init.');
  } else if (cmd === 'mcp-config') {
    const executable = path.resolve(new URL('./mcp.js', import.meta.url).pathname);
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
