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

function validatePackageBins() {
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync('package.json', 'utf8')); }
  catch (error) { errors.push(`package.json: cannot validate bin entries (${error.message})`); return; }
  const bins = manifest.bin && typeof manifest.bin === 'object' ? manifest.bin : {};
  for (const [command, target] of Object.entries(bins)) {
    if (typeof target !== 'string' || !target) {
      errors.push(`package.json: bin[${command}] must be a non-empty relative path`);
      continue;
    }
    const normalized = target.replaceAll('\\', '/');
    if (normalized.startsWith('./')) errors.push(`package.json: bin[${command}] must not start with ./; npm rewrites it during publish`);
    if (path.isAbsolute(target) || normalized === '..' || normalized.startsWith('../')) {
      errors.push(`package.json: bin[${command}] must stay inside the package`);
      continue;
    }
    const executablePath = path.resolve(target);
    if (!fs.existsSync(executablePath) || !fs.statSync(executablePath).isFile()) {
      errors.push(`package.json: bin[${command}] target does not exist: ${target}`);
      continue;
    }
    const source = fs.readFileSync(executablePath, 'utf8');
    if (!source.startsWith('#!/usr/bin/env node')) errors.push(`package.json: bin[${command}] target must start with #!/usr/bin/env node`);
  }
}

walk('.');
validatePackageBins();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('Repository quality checks passed.');
