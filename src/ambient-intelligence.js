import { status as getProjectStatus } from './core.js';
import { getRepositoryBaseline, prepareChangeBrief } from './advisor.js';
import { buildContextPack } from './search.js';
import { getSessionHandoff } from './session-intelligence.js';

const CONTINUE = /(?:\blàm\s+tiếp\b|\btiếp\s+tục\b|\bresume\b|\bcontinue\b|\bpick\s+up\b|\bhôm\s+qua\b|\blast\s+(?:time|session)\b)/iu;
const MUTATE = /(?:\bsửa\b|\bfix\b|\bthêm\b|\badd\b|\bimplement\b|\btriển\s+khai\b|\btạo\b|\bcreate\b|\bupdate\b|\bcập\s+nhật\b|\brefactor\b|\bđổi\b|\bchange\b|\bxóa\b|\bremove\b|\blàm\s+cho\b|\bmake\b)/iu;
const REVIEW = /(?:ổn\s+chưa|\breview\b|\baudit\b|đánh\s+giá|có\s+lỗi\s+gì|\bwhat(?:'s|\s+is)?\s+wrong\b|\bis\s+this\s+(?:ok|okay|good)\b)/iu;
const INVESTIGATE = /(?:\bkiểm\s+tra\b|\binvestigat\w*\b|\bdebug\b|\btìm\s+hiểu\b|\bphân\s+tích\b|\banaly[sz]e\b|\btại\s+sao\b|\bwhy\b)/iu;

export function classifyAmbientIntent(request) {
  const text = String(request || '').trim();
  if (!text) return { intent: 'unknown', confidence: 'low', evidence: [] };
  if (CONTINUE.test(text)) return { intent: 'continue', confidence: 'high', evidence: ['request-continuation-language'] };
  if (REVIEW.test(text)) return { intent: 'review', confidence: 'medium', evidence: ['request-review-language'] };
  if (MUTATE.test(text)) return { intent: 'mutate', confidence: 'medium', evidence: ['request-mutation-language'] };
  if (INVESTIGATE.test(text)) return { intent: 'investigate', confidence: 'medium', evidence: ['request-investigation-language'] };
  return { intent: 'unknown', confidence: 'low', evidence: ['no-deterministic-intent-rule-matched'] };
}

async function optionalContext(root, request, project) {
  if (!project?.graphHealth?.current) return null;
  try {
    const pack = await buildContextPack(root, request, 8, { stalePolicy: 'demote' });
    return { summary: pack.summary || null, recommendedFiles: pack.recommendedFiles || [], affectedWorkspaces: pack.affectedWorkspaces || [], results: (pack.results || []).slice(0, 8), health: pack.health || null };
  } catch { return null; }
}

async function optionalHandoff(root) {
  try { return await getSessionHandoff(root, 'latest'); }
  catch { return null; }
}

function workflowFor(intent, context) {
  if (intent === 'continue') return ['Read the latest CMI handoff when available and re-check current repository evidence.', 'Continue the recorded objective only when it still matches the user request.', 'Address relevant P0/P1 evidence before unrelated work unless the user changes priority.'];
  if (intent === 'mutate') return ['Start a CMI work session and Change Intelligence record before editing when durable writes are enabled.', 'Use task context and impact evidence before changing shared files or symbols.', 'After editing, run real project verification, observe actual changed paths, complete the change record, and finalize the session.'];
  if (intent === 'review') return ['Use CMI context, current Git state, decisions, and lessons as review evidence.', 'Do not create a change record unless edits actually begin.', 'Use a work session when the review is substantial or leaves durable findings.'];
  if (intent === 'investigate') return ['Use CMI context and relevant history before broad exploration.', 'Use a work session for substantial investigation; do not create a change record unless edits begin.', 'Preserve unresolved blockers/questions for continuation instead of promoting hypotheses into durable truth.'];
  return context?.recommendedFiles?.length ? ["Use the retrieved evidence to understand the request, but keep the user's intent in control.", 'Do not infer permission to edit or broaden scope solely from CMI advice.'] : ['CMI has insufficient evidence to prescribe a specialized workflow. Follow the user request conservatively and establish project evidence as needed.'];
}

export async function buildAmbientTaskBrief(root, request) {
  const normalized = String(request || '').trim();
  if (!normalized) throw new Error('Ambient task request cannot be empty.');
  const classification = classifyAmbientIntent(normalized);
  const [project, repository] = await Promise.all([getProjectStatus(root), getRepositoryBaseline(root)]);
  const context = await optionalContext(root, normalized, project);
  let preparation = null;
  if (classification.intent === 'mutate' && project?.graphHealth?.current) {
    try { preparation = await prepareChangeBrief(root, normalized, { limit: 10, depth: 3 }); } catch {}
  }
  const handoff = classification.intent === 'continue' ? await optionalHandoff(root) : null;
  return {
    schemaVersion: 1,
    request: normalized,
    classification,
    project: { initialized: project.initialized, healthy: project.healthy, evidenceHealth: project.evidenceHealth, graphHealth: project.graphHealth, memoryHealth: project.memoryHealth },
    repository,
    context,
    preparation,
    handoff,
    workflow: workflowFor(classification.intent, context),
    policy: 'Intent classification and workflow hints are deterministic advisory routing. They do not authorize edits, execute project commands, or turn inferred/candidate knowledge into durable truth.',
  };
}

export function formatAmbientTaskBrief(result) {
  const files = result.context?.recommendedFiles?.slice(0, 8) || [];
  return `# CMI ambient task brief\n\nRequest: ${result.request}\nIntent: ${result.classification.intent} · confidence ${result.classification.confidence}\nProject evidence: ${result.project.evidenceHealth?.state || 'unknown'}\nGit product worktree: ${result.repository.available ? (result.repository.clean ? 'clean' : 'dirty') : 'unavailable'}${result.repository.available && result.repository.rawClean === false && result.repository.clean ? ' · raw Git includes CMI-internal state' : ''}\n\n## Relevant files\n${files.length ? files.map((file) => `- ${file}`).join('\n') : '- No task-relevant files retrieved'}\n\n## Workflow\n${result.workflow.map((item) => `- ${item}`).join('\n')}\n\n${result.policy}`;
}
