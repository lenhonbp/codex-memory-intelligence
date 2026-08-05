# Benchmarks

CMI includes a reproducible synthetic benchmark:

```bash
npm run benchmark
npm run benchmark:smoke
node scripts/benchmark.js --files 2000 --json
```

The benchmark creates two JavaScript workspaces, generates a chain-like import graph, then measures:

1. A full scan.
2. An unchanged incremental scan.
3. An incremental scan after one source file changes.

The smoke benchmark asserts that the unchanged scan reuses nearly all source nodes and that a one-file edit reparses only the changed node.

Example from a development container with 120 generated source files:

```text
Full scan: about 48 ms, 120 parsed
No-op incremental scan: about 9 ms, 120 reused
One-file change: about 9 ms, 1 parsed and 119 reused
```

These numbers are illustrative, not a performance guarantee. Filesystem, operating system, CPU, antivirus software, repository shape, parser mix, file sizes, and CI contention materially affect results. Report performance issues with the command, file count, operating system, Node.js version, and JSON output.

## Correctness boundary

Incremental reuse is keyed by parser version plus file size, modification time, and change time. Import resolution is recomputed on every scan. Use `cmi scan --full` when validating parser changes, restoring unusual filesystem snapshots, or investigating suspected cache invalidation issues.
