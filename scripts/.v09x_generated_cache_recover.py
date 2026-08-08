from pathlib import Path

p=Path('src/search.js')
t=p.read_text()
old="import { safeReadMemoryFile, safeReadMemoryJson } from './storage.js';"
new="import { safeReadMemoryFile, safeReadMemoryJson, DEFAULT_MAX_GENERATED_CACHE_BYTES } from './storage.js';"
if old not in t: raise SystemExit('search storage import anchor missing')
t=t.replace(old,new,1)
old="const graph = await safeReadMemoryJson(root, 'project-graph.json');"
new="const graph = await safeReadMemoryJson(root, 'project-graph.json', { maxBytes: DEFAULT_MAX_GENERATED_CACHE_BYTES });"
if old not in t: raise SystemExit('search graph read anchor missing')
t=t.replace(old,new,1)
old="const index = await safeReadMemoryJson(root, 'project-index.json');"
new="const index = await safeReadMemoryJson(root, 'project-index.json', { maxBytes: DEFAULT_MAX_GENERATED_CACHE_BYTES });"
if old not in t: raise SystemExit('search index read anchor missing')
t=t.replace(old,new,1)
p.write_text(t)
