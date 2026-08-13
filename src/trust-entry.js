#!/usr/bin/env node
import path from 'node:path';
import { VERSION } from './version.js';
import {
  assessOperationalTrust,
  formatOperationalTrust,
  scanExportCandidate,
} from './operational-trust.js';

const [command, ...args] = process.argv.slice(2);
const json = args.includes('--json');

function fail(message, code = 'CMI_TRUST_CLI_ERROR') {
  const payload = { ok: false, error: { code, message } };
  if (json) console.error(JSON.stringify(payload));
  else console.error(`CMI trust error: ${message}`);
  process.exitCode = 1;
}

function positionals() {
  const output = [];
  for (const value of args) {
    if (value === '--json') continue;
    if (value.startsWith('-')) throw new Error(`Unknown option: ${value}`);
    output.push(value);
  }
  return output;
}

function help() {
  console.log(`CMI Operational Trust v${VERSION}\n\nUsage:\n  cmi-trust doctor [path] [--json]\n  cmi-trust export <file> [--json]\n  cmi-trust --version\n\nThe doctor gate checks .codex-memory Git-sharing policy plus a bounded accidental-secret scan. Export scanning is read-only and fails closed for unscannable or credential-like content.`);
}

try {
  if (!command || ['help', '--help', '-h'].includes(command)) {
    help();
  } else if (['--version', '-v', 'version'].includes(command)) {
    if (args.length) throw new Error('Version does not accept additional arguments.');
    console.log(VERSION);
  } else if (command === 'doctor') {
    const values = positionals();
    if (values.length > 1) throw new Error('Usage: cmi-trust doctor [path] [--json]');
    const root = path.resolve(values[0] || process.cwd());
    const result = await assessOperationalTrust(root);
    console.log(json ? JSON.stringify(result, null, 2) : formatOperationalTrust(result));
    if (!result.readyToShare) process.exitCode = result.state === 'blocked' || result.state === 'uninitialized' ? 2 : 1;
  } else if (command === 'export') {
    const values = positionals();
    if (values.length !== 1) throw new Error('Usage: cmi-trust export <file> [--json]');
    const result = await scanExportCandidate(values[0]);
    if (json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`CMI Export Trust · ${result.state}`);
      console.log(`Safe to share: ${result.safeToShare ? 'yes' : 'no'}`);
      console.log(`File: ${result.file} · bytes=${result.bytesScanned}`);
      for (const item of result.findings) console.log(`- ${item.code} ${item.path}: ${item.detail}`);
    }
    if (!result.safeToShare) process.exitCode = 2;
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  fail(error?.message || String(error));
}
