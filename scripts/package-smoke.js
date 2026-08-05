import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run this script through npm.');
const runNpm = (args, cwd = process.cwd()) => execFileSync(process.execPath, [npmCli, ...args], { cwd, encoding: 'utf8', stdio: ['ignore','pipe','inherit'] }).trim();
const packed = JSON.parse(runNpm(['pack','--json','--ignore-scripts']));
const archive = path.resolve(packed[0].filename);
const prefix = fs.mkdtempSync(path.join(os.tmpdir(), 'cmi-package-'));
try {
  runNpm(['install','--global','--prefix',prefix,archive,'--ignore-scripts']);
  const executable = process.platform === 'win32' ? path.join(prefix, 'cmi.cmd') : path.join(prefix, 'bin', 'cmi');
  const runExecutable = (args, options = {}) => execFileSync(executable, args, { encoding: 'utf8', shell: process.platform === 'win32', ...options });
  const version = runExecutable(['--version']).trim();
  if (version !== '0.5.0') throw new Error(`Unexpected installed version: ${version}`);
  runExecutable(['--help'], { stdio: 'ignore' });
  console.log(`Package smoke test passed for ${path.basename(archive)}.`);
} finally {
  fs.rmSync(prefix, { recursive: true, force: true });
  fs.rmSync(archive, { force: true });
}
