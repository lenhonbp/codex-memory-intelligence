import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanProject } from '../src/core.js';

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  const value = Number(index >= 0 ? process.argv[index + 1] : fallback);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

const fileCount = argument('--files', Number(process.env.CMI_BENCH_FILES) || 600);
const json = process.argv.includes('--json');
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-benchmark-'));
try {
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ private: true, workspaces: ['packages/*'] }));
  for (const workspace of ['app','shared']) {
    const directory = path.join(root, 'packages', workspace, 'src');
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(root, 'packages', workspace, 'package.json'), JSON.stringify({ name: `@bench/${workspace}` }));
  }
  for (let index = 0; index < fileCount; index += 1) {
    const workspace = index % 2 === 0 ? 'app' : 'shared';
    const previous = index > 1 ? `import { value${index - 2} } from './file-${index - 2}.js';\n` : '';
    await fs.writeFile(path.join(root, 'packages', workspace, 'src', `file-${index}.js`), `${previous}export const value${index} = ${index};\n`);
  }
  const full = await scanProject(root, { full: true });
  const incremental = await scanProject(root);
  await new Promise((resolve) => setTimeout(resolve, 5));
  await fs.appendFile(path.join(root, 'packages', 'app', 'src', 'file-0.js'), 'export const changed = true;\n');
  const changed = await scanProject(root);
  const result = {
    fileCount,
    full: { durationMs: full.durationMs, parsed: full.graph.parsedFiles, reused: full.graph.reusedFiles },
    incremental: { durationMs: incremental.durationMs, parsed: incremental.graph.parsedFiles, reused: incremental.graph.reusedFiles },
    changed: { durationMs: changed.durationMs, parsed: changed.graph.parsedFiles, reused: changed.graph.reusedFiles },
  };
  if (incremental.graph.reusedFiles < fileCount - 2) throw new Error('Incremental scan did not reuse the expected source nodes.');
  if (changed.graph.parsedFiles < 1 || changed.graph.parsedFiles > 2) throw new Error('Changed scan reparsed an unexpected number of source nodes.');
  console.log(json ? JSON.stringify(result) : `CMI benchmark · ${fileCount} source files\nFull: ${result.full.durationMs} ms (${result.full.parsed} parsed)\nNo-op incremental: ${result.incremental.durationMs} ms (${result.incremental.reused} reused)\nOne-file change: ${result.changed.durationMs} ms (${result.changed.parsed} parsed, ${result.changed.reused} reused)`);
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
