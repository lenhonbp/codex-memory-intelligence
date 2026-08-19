import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validatePackageBins } from '../scripts/package-bin-validation.js';

test('package bin validation preserves bounded paths, file type, existence, and shebang checks', async (t) => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-package-bin-validation-'));
  const root = path.join(parent, 'package');
  await fs.mkdir(path.join(root, 'bin'), { recursive: true });
  await fs.writeFile(path.join(root, 'bin', 'good.js'), '#!/usr/bin/env node\nconsole.log("good");\n');
  await fs.writeFile(path.join(root, 'bin', 'bad-shebang.js'), 'console.log("bad");\n');
  await fs.mkdir(path.join(root, 'bin', 'directory'));
  await fs.writeFile(path.join(parent, 'outside.js'), '#!/usr/bin/env node\n');
  const manifestPath = path.join(root, 'package.json');
  await fs.writeFile(manifestPath, `${JSON.stringify({
    bin: {
      good: 'bin/good.js',
      missing: 'bin/missing.js',
      directory: 'bin/directory',
      shebang: 'bin/bad-shebang.js',
      escape: '../outside.js',
      rewritten: './bin/good.js',
      empty: '',
    },
  })}\n`);
  t.after(() => fs.rm(parent, { recursive: true, force: true }));

  assert.deepEqual(validatePackageBins({ manifestPath, packageRoot: root }), [
    'package.json: bin[missing] target does not exist: bin/missing.js',
    'package.json: bin[directory] target must be a file: bin/directory',
    'package.json: bin[shebang] target must start with #!/usr/bin/env node',
    'package.json: bin[escape] must stay inside the package',
    'package.json: bin[rewritten] must not start with ./; npm rewrites it during publish',
    'package.json: bin[empty] must be a non-empty relative path',
  ]);
});
