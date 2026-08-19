# CMI Setup Validation

Updated: 2026-08-19.

This note records the concrete basis for the public onboarding commands used by the v0.14.1 README.

## Canonical activation contract

The CLI help surface exposes:

```text
cmi activate [--agent codex|generic] [--json]
```

The implementation resolves activation against `process.cwd()` and does not accept a project-path positional argument. Therefore the user must change into the intended project root before activation.

Canonical installed-CLI flow:

```bash
npm install -g codex-memory-intelligence@0.14.1
cmi --version
cd /absolute/path/to/your-project
cmi activate
cmi doctor
```

## One-off npm execution

The npm package name is `codex-memory-intelligence`; `cmi` is a binary exposed by that package. For one-off execution, the package is therefore identified explicitly:

```bash
npx --yes --package=codex-memory-intelligence@0.14.1 cmi activate
```

This matches npm exec/npx semantics for running a command whose binary name differs from the package name and avoids treating bare `cmi` as the package specifier.

## Activation side effects and boundaries

For the Codex adapter, activation:

- initializes CMI when needed and refreshes project intelligence;
- manages bounded CMI sections in root `AGENTS.md`, `.codex/config.toml`, and `.gitignore` while preserving unrelated content;
- enables the managed MCP lifecycle;
- binds the generated MCP working directory and `CMI_PROJECT_ROOT` to the resolved project root;
- prefers a valid exact project-local package entrypoint when available;
- otherwise generates an exact-version non-interactive registry fallback;
- requires reactivation after the project is moved or cloned to another filesystem path;
- does not install Skills into a runtime or promote inferred advice into durable project truth.

## Scope

This setup validation establishes command/documentation alignment for the current CMI CLI and v0.14.1 activation behavior. It is not a universal compatibility claim for every Codex client/runtime.