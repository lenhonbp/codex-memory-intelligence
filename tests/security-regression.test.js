import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanProject } from '../src/core.js';
import { loadProjectGraph } from '../src/graph.js';

test('TypeScript path targets replace every wildcard occurrence', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cmi-alias-wildcards-'));
  await fs.writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  await fs.writeFile(path.join(root, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      baseUrl: '.',
      paths: { '@dup/*': ['generated/*/copy/*'] },
    },
  }));
  await fs.mkdir(path.join(root, 'generated', 'widget', 'copy'), { recursive: true });
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'generated', 'widget', 'copy', 'widget.ts'), 'export const value = 1;\n');
  await fs.writeFile(path.join(root, 'src', 'index.ts'), "import { value } from '@dup/widget';\nexport { value };\n");

  const scan = await scanProject(root);
  assert.equal(scan.graph.localEdges, 1);
  assert.equal(scan.graph.unresolvedImports, 0);

  const graph = await loadProjectGraph(root);
  const entry = graph.nodes.find((node) => node.path === 'src/index.ts');
  assert.equal(entry.imports[0].resolved, 'generated/widget/copy/widget.ts');
});
