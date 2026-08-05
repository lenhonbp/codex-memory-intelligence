#!/usr/bin/env node
import path from 'node:path';
import { initProject, scanProject, remember, snapshot, status } from './core.js';

const [cmd, ...args] = process.argv.slice(2);
const pathArg = args.find((arg) => !arg.startsWith('--'));
const root = path.resolve(pathArg && ['init', 'scan', 'status'].includes(cmd) ? pathArg : process.cwd());

function help() {
  console.log(`Codex Memory + Project Intelligence

Usage:
  cmi init [path]
  cmi scan [path]
  cmi remember <fact|decision|mistake> <text>
  cmi snapshot [label]
  cmi status [path]
`);
}

try {
  if (!cmd || cmd === 'help' || cmd === '--help') {
    help();
  } else if (cmd === 'init') {
    console.log(`Initialized ${await initProject(root)}`);
  } else if (cmd === 'scan') {
    const result = await scanProject(root);
    console.log(`Scanned ${result.files} files; stack: ${result.stack.join(', ') || 'unknown'}`);
  } else if (cmd === 'remember') {
    const [type, ...text] = args;
    if (!type || !text.length) {
      throw new Error('Usage: cmi remember <fact|decision|mistake> <text>');
    }
    await remember(process.cwd(), type, text.join(' '));
    console.log('Memory updated.');
  } else if (cmd === 'snapshot') {
    console.log(`Created ${await snapshot(process.cwd(), args.join(' ') || 'snapshot')}`);
  } else if (cmd === 'status') {
    console.log(JSON.stringify(await status(root), null, 2));
  } else {
    help();
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
}
