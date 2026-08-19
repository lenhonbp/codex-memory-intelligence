import fs from 'node:fs';
import path from 'node:path';

function errorCode(error) {
  return error?.code ? ` (${error.code})` : '';
}

export function validatePackageBins({ manifestPath = 'package.json', packageRoot = process.cwd() } = {}) {
  const errors = [];
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); }
  catch (error) { return [`package.json: cannot validate bin entries (${error.message})`]; }

  const root = path.resolve(packageRoot);
  const bins = manifest.bin && typeof manifest.bin === 'object' ? manifest.bin : {};
  for (const [command, target] of Object.entries(bins)) {
    if (typeof target !== 'string' || !target) {
      errors.push(`package.json: bin[${command}] must be a non-empty relative path`);
      continue;
    }
    const normalized = target.replaceAll('\\', '/');
    if (normalized.startsWith('./')) errors.push(`package.json: bin[${command}] must not start with ./; npm rewrites it during publish`);
    const executablePath = path.resolve(root, target);
    const relativePath = path.relative(root, executablePath);
    if (path.isAbsolute(target) || normalized === '..' || normalized.startsWith('../') || relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
      errors.push(`package.json: bin[${command}] must stay inside the package`);
      continue;
    }

    let descriptor;
    try {
      descriptor = fs.openSync(executablePath, 'r');
    } catch (error) {
      if (error?.code === 'ENOENT') errors.push(`package.json: bin[${command}] target does not exist: ${target}`);
      else if (error?.code === 'EISDIR') errors.push(`package.json: bin[${command}] target must be a file: ${target}`);
      else {
        let status;
        try { status = fs.lstatSync(executablePath); }
        catch { /* Preserve the original open failure below. */ }
        if (status && !status.isFile()) errors.push(`package.json: bin[${command}] target must be a file: ${target}`);
        else errors.push(`package.json: bin[${command}] target cannot be opened: ${target}${errorCode(error)}`);
      }
      continue;
    }

    try {
      if (!fs.fstatSync(descriptor).isFile()) {
        errors.push(`package.json: bin[${command}] target must be a file: ${target}`);
        continue;
      }
      const source = fs.readFileSync(descriptor, 'utf8');
      if (!source.startsWith('#!/usr/bin/env node')) errors.push(`package.json: bin[${command}] target must start with #!/usr/bin/env node`);
    } catch (error) {
      errors.push(`package.json: bin[${command}] target cannot be validated: ${target}${errorCode(error)}`);
    } finally {
      try { fs.closeSync(descriptor); }
      catch (error) { errors.push(`package.json: bin[${command}] target handle could not be closed: ${target}${errorCode(error)}`); }
    }
  }
  return errors;
}
