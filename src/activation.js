import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
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
- Get a CMI ambient task brief early, using the user's request verbatim when practical. Prefer the MCP tool \`get_ambient_task_brief\`; if MCP is unavailable, use the local executable fallback \`cmi ambient "<user request>" --json\` (or \`npx cmi ambient "<user request>" --json\` when CMI is only available through npx). This brief is read-only health/context evidence, not a completed session.
- Start or resume a durable CMI work session before substantive project work, including read-only investigation, review, and verification. With MCP, use \`start_work_session\`; with the local executable fallback, use \`cmi session start \"<goal>\" --json\` (or the equivalent \`npx cmi session start ...\`). Record meaningful progress and verification with \`observe_work_session\` or \`cmi session observe\`.
- Treat CMI intent classification, boundaries, impact, history, findings, and recommendations as advisory evidence, not authorization or product truth.
- For implementation/refactor/fix work, start a CMI work session and a Change Intelligence record before editing when durable writes are available; inspect relevant context/impact; observe actual changed paths; run the project's real verification; then complete the change record and finalize the session.
- For investigation/review work, retrieve context first and use the work session for the substantive task. Do not create a change record unless edits actually begin.
- For continuation requests such as "continue", "resume", or "làm tiếp", read the latest CMI handoff and re-check current repository evidence instead of asking the user to reconstruct known state.
- Do not broaden the user's task merely because CMI recommends additional work. Surface material P0/P1 evidence, but keep user intent in control.
- Never promote inferred advice, memory-gap suggestions, session candidates, or change-learning candidates into durable project truth without explicit review.
- Never claim a test/build/deploy succeeded unless it was actually run and observed through the agent's normal environment.
- Before ending substantial work, finalize the CMI session. With MCP, use \`finalize_work_session\` and retrieve its \`closingIntelligence\` (or \`get_closing_intelligence\`). With the local executable fallback, use \`cmi session close <id|latest> --outcome ... --json\`, then \`cmi session closing <id|latest> --json\` (or the equivalent \`npx cmi session ...\`). Append a concise \`### CMI Intelligence\` section only from that actual closed-session Closing Intelligence result: show at most three alerts, never omit material P0/P1 evidence, and show CLEAN only when the closing result exists and has no material alert.
- Do not use \`cmi ambient\`, \`cmi status\`, \`cmi doctor\`, or health/index/graph evidence as a substitute for starting or closing a session, and never synthesize a Closing-style \`CLEAN\` footer from those health-only results.
- If no write-capable MCP or local CLI lifecycle is usable, or the session cannot be closed, do not claim Closing Intelligence or emit a Closing-style CLEAN footer. Report verified project/evidence health separately under a non-closing label and state that CMI Closing Intelligence was not finalized because no closed-session evidence is available.
- Treat reviewed design, architecture, policy, and other consistency-rule relevance as a requirement to check, not proof of a violation. Only call something a violation when evidence establishes it.

If CMI is unavailable or blocked, continue only with evidence you can actually establish and state the limitation. Do not ask the user to rewrite a short prompt into a CMI-specific prompt.
${AGENTS_END}`;

const CODEX_BLOCK = `${CODEX_BEGIN}
[mcp_servers.cmi]
command = "npx"
args = ["--no", "--package=codex-memory-intelligence", "cmi-mcp"]
cwd = "."
env = { CMI_WRITE_ENABLED = "1" }
${CODEX_END}`;

function occurrences(text, value) {
  let count = 0;
  let offset = 0;
  while (true) {
    const index = text.indexOf(value, offset);
    if (index < 0) return count;
    count += 1;
    offset = index + value.length;
  }
}

function normalizedManagedContent(existing, begin, end, block, label) {
  const text = existing ?? '';
  const startCount = occurrences(text, begin);
  const endCount = occurrences(text, end);
  if (startCount !== endCount || startCount > 1) throw new Error(`${label} contains partial, duplicated, or malformed CMI managed blocks. Repair them explicitly before activation.`);
  if (startCount === 1) {
    const start = text.indexOf(begin);
    const finish = text.indexOf(end);
    if (finish < start) throw new Error(`${label} contains a malformed CMI managed block. Repair it explicitly before activation.`);
    const after = finish + end.length;
    return `${text.slice(0, start)}${block}${text.slice(after)}`;
  }
  const prefix = text && !text.endsWith('\n') ? `${text}\n` : text;
  return `${prefix}${prefix ? '\n' : ''}${block}\n`;
}

async function assertSafeIntegrationParents(root, relative) {
  const parts = relative.split('/').filter(Boolean).slice(0, -1);
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    let stat;
    try { stat = await fs.lstat(current); }
    catch (error) { if (error?.code === 'ENOENT') return; throw error; }
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`${relative} has an unsafe integration parent: ${part}. CMI will not follow or replace it.`);
  }
}

async function readIntegrationFile(root, relative) {
  await assertSafeIntegrationParents(root, relative);
  const target = path.join(root, relative);
  let handle;
  try {
    const noFollow = typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0;
    handle = await fs.open(target, fsConstants.O_RDONLY | noFollow);
    const opened = await handle.stat();
    if (!opened.isFile()) throw new Error(`${relative} must be a regular non-symlink file before CMI can manage it.`);
    if (opened.size > MAX_INTEGRATION_BYTES) throw new Error(`${relative} exceeds the bounded CMI integration size limit.`);
    if (!noFollow) {
      const stat = await fs.lstat(target);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.dev !== opened.dev || stat.ino !== opened.ino) throw new Error(`${relative} changed or resolved unsafely while CMI was inspecting it.`);
    }
    return await handle.readFile('utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    if (error?.code === 'ELOOP') throw new Error(`${relative} must not be a symbolic link.`);
    throw error;
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function atomicWrite(root, relative, content) {
  await assertSafeIntegrationParents(root, relative);
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await assertSafeIntegrationParents(root, relative);
  const temporary = `${target}.${process.pid}.cmi-activate.tmp`;
  await fs.writeFile(temporary, content, { encoding: 'utf8', mode: 0o600 });
  try { await fs.rename(temporary, target); }
  catch (error) { await fs.rm(temporary, { force: true }).catch(() => {}); throw error; }
}

async function planAgents(root) {
  const existing = await readIntegrationFile(root, 'AGENTS.md');
  const next = normalizedManagedContent(existing, AGENTS_BEGIN, AGENTS_END, AGENTS_BLOCK, 'AGENTS.md');
  return { path: 'AGENTS.md', existing, next, changed: next !== existing, managed: true };
}

async function planCodexConfig(root) {
  const existing = await readIntegrationFile(root, '.codex/config.toml');
  const text = existing ?? '';
  if (/^\s*\[mcp_servers\.cmi\]\s*$/m.test(text) && !text.includes(CODEX_BEGIN)) {
    throw new Error('.codex/config.toml already contains an unmanaged [mcp_servers.cmi] section. CMI will not overwrite it; reconcile that configuration explicitly first.');
  }
  const next = normalizedManagedContent(existing, CODEX_BEGIN, CODEX_END, CODEX_BLOCK, '.codex/config.toml');
  return { path: '.codex/config.toml', existing, next, changed: next !== existing, managed: true, writeEnabled: true };
}

async function applyPlan(root, plan) {
  if (plan.changed) await atomicWrite(root, plan.path, plan.next);
  const { existing, next, ...result } = plan;
  return result;
}

export async function activateProject(root, options = {}) {
  const resolvedRoot = path.resolve(root);
  const agent = String(options.agent || 'codex').trim().toLowerCase();
  if (!['codex', 'generic'].includes(agent)) throw new Error('Activation agent must be codex or generic.');

  const plans = agent === 'codex'
    ? [await planAgents(resolvedRoot), await planCodexConfig(resolvedRoot)]
    : [];

  await initProject(resolvedRoot);
  let scan = await scanProject(resolvedRoot);
  const integrations = [];
  let integrationChanged = false;
  for (const plan of plans) {
    integrations.push(await applyPlan(resolvedRoot, plan));
    integrationChanged ||= plan.changed;
  }
  if (integrationChanged) scan = await scanProject(resolvedRoot);

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
