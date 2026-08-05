import fs from 'node:fs';
import path from 'node:path';

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
walk('.');
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('Repository quality checks passed.');
