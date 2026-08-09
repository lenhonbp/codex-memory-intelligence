import fs from 'node:fs/promises';
import path from 'node:path';
import { initProject, scanProject } from './core.js';

const MAX_INTEGRATION_BYTES = 1_000_000;
const AGENTS_BEGIN = '<!-- cmi-managed:start -->';
const AGENTS_END = '<!-- cmi-managed:end -->';
const CODEX_BEGIN = '# cmi-managed:start';
const CODEX_END = '# cmi-managed:end';

const AGENTS_BLOCK = `${AGENTS_BEGIN}
## CMI ambient project intelligence

CMI is activated for this project. The user may give short, natural requests and does not need to mention CMI or restate its workflow.

For every substantive repository task:
- Get a CMI ambient task brief early, using the user's request verbatim when practical. Prefer the MCP tool \`get_ambient_task_brief\`; if MCP is unavailable, use \`npx cmi ambient "<user request>" --json\`.
- Treat CMI intent classification, boundaries, impact, history, findings, and recommendations as advisory evidence, not authorization or product truth.
- For implementation/refactor/fix work, start a CMI work session and a Change Intelligence record before editing when write tools are available; inspect relevant context/impact; observe actual changed paths; run the project's real verification; then complete the change record and finalize the session.
- For investigation/review work, retrieve context first and use a work session when the work is substantial. Do not create a change record unless edits actually begin.
- For continuation requests such as "continue", "resume", or "làm tiếp", read the latest CMI handoff and re-check current repository evidence instead of asking the user to reconstruct known state.
- Do not broaden the user's task merely because CMI recommends additional work. Surface material P0/P1 evidence, but keep user intent in control.
- Never promote inferred advice, memory-gap suggestions, session candidates, or change-learning candidates into durable project truth without explicit review.
- Never claim a test/build/deploy succeeded unless it was actually run and observed through the agent's normal environment.
- Before ending substantial work, finalize the CMI session when possible and surface unresolved P0/P1 findings plus the highest-priority evidence-based next action.

If CMI is unavailable or blocked, continue only with evidence you can actually establish and state the limitation. Do not ask the user to rewrite a short prompt into a CMI-specific prompt.
${AGENTS_END}`;

const CODEX_BLOCK = `${CODEX_BEGIN}
[mcp_servers.cmi]
command = "npx"
args = ["--no-install", "cmi-mcp"]
cwd = "."
env = { CMI_WRITE_ENABLED = "1" }
${CODEX_END}`;

function normalizedManagedContent(existing, begin, end, block, label) {
  const text = existing ?? '';
  const start = text.indexOf(begin);
  const finish = text.indexOf(end);
  if ((start >= 0) !== (finish >= 0) || (start >= 0 && finish < start)) throw new Error(`${label} contains a partial or malformed CMI managed block. Repair it explicitly before activation.`);
  if (start >= 0) {
    const after = finish + end.length;
    return `${text.slice(0, start)}${block}${text.slice(after)}`;
  }
  const prefix = text && !text.endsWith('\n') ? `${text}\n` : text;
  return `${prefix}${prefix ? '\n' : ''}${block}\n`;
}

async function readIntegrationFile(root, relative) {
  const target = path.join(root, relative);
  let stat;
  try { stat = await fs.lstat(target); }
  catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`${relative} must be a regular non-symlink file before CMI can manage it.`);
  if (stat.size > MAX_INTEGRATION_BYTES) throw new Error(`${relative} exceeds the bounded CMI integration size limit.`);
  return fs.readFile(target, 'utf8');
}

async function atomicWrite(root, relative, content) {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.cmi-activate.tmp`;
  await fs.writeFile(temporary, content, { encoding: 'utf8', mode: 0o600 });
  try { await fs.rename(temporary, target); }
  catch (error) { await fs.rm(temporary, { force: true }).catch(() => {}); throw error; }
}

async function mergeAgents(root) {
  const existing = await readIntegrationFile(root, 'AGENTS.md');
  const next = normalizedManagedContent(existing, AGENTS_BEGIN, AGENTS_END, AGENTS_BLOCK, 'AGENTS.md');
  if (next !== existing) await atomicWrite(root, 'AGENTS.md', next);
  return { path: 'AGENTS.md', changed: next !== existing, managed: true };
}

async function mergeCodexConfig(root) {
  const existing = await readIntegrationFile(root, '.codex/config.toml');
  const text = existing ?? '';
  if (/^\s*\[mcp_servers\.cmi\]\s*$/m.test(text) && !text.includes(CODEX_BEGIN)) {
    throw new Error('.codex/config.toml already contains an unmanaged [mcp_servers.cmi] section. CMI will not overwrite it; reconcile that configuration explicitly first.');
  }
  const next = normalizedManagedContent(existing, CODEX_BEGIN, CODEX_END, CODEX_BLOCK, '.codex/config.toml');
  if (next !== existing) await atomicWrite(root, '.codex/config.toml', next);
  return { path: '.codex/config.toml', changed: next !== existing, managed: true, writeEnabled: true };
}

export async function activateProject(root, options = {}) {
  const resolvedRoot = path.resolve(root);
  const agent = String(options.agent || 'codex').trim().toLowerCase();
  if (!['codex', 'generic'].includes(agent)) throw new Error('Activation agent must be codex or generic.');
  await initProject(resolvedRoot);
  const integrations = [];
  if (agent === 'codex') {
    integrations.push(await mergeAgents(resolvedRoot));
    integrations.push(await mergeCodexConfig(resolvedRoot));
  }
  const scan = await scanProject(resolvedRoot);
  return {
    schemaVersion: 1,
    activated: true,
    agent,
    integrations,
    scan: { files: scan.files, sourceFiles: scan.graph.sourceFiles, symbols: scan.graph.symbols, workspaces: scan.workspaces.count },
    usage: agent === 'codex' ? 'Start a new Codex run/session, then talk to Codex normally. Short prompts are sufficient; CMI workflow instructions are project-managed.' : 'Use CMI CLI/MCP from the external agent integration. Generic activation cannot force an arbitrary client to consume CMI.',
    limitations: agent === 'codex'
      ? ['Codex builds its project instruction chain at run/session start, so first activation requires a new Codex run/session before the managed AGENTS.md block is guaranteed to apply.', 'Project-scoped .codex/config.toml is consumed only when the project is trusted by the client.', 'CMI cannot force a client that ignores project instructions or MCP to follow the integration contract.']
      : ['Generic activation initializes/scans CMI but cannot configure every external AI client automatically.'],
    policy: 'Activation configures supported integration surfaces and generated intelligence. It does not promote inferred advice or memory candidates into durable project truth.',
  };
}

export function formatActivation(result) {
  const items = result.integrations.length ? result.integrations.map((item) => `- ${item.path}: ${item.changed ? 'updated' : 'already current'}`).join('\n') : '- No agent-specific files were changed.';
  return `CMI activated for ${result.agent}.\n${items}\nProject intelligence: ${result.scan.sourceFiles} source files · ${result.scan.symbols} symbols · ${result.scan.workspaces} workspace(s)\n\n${result.usage}`;
}
