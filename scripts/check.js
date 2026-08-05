import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const roots = ['src', 'scripts', 'tests'];
const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(full);
  }
}
for (const directory of roots) if (fs.existsSync(directory)) walk(directory);
for (const file of files) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
console.log(`Syntax checked ${files.length} JavaScript files.`);
