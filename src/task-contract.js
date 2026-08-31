export const TASK_CONTRACT_VERSION = 1;
export const EVIDENCE_KINDS = Object.freeze([
  'implementation',
  'behavior',
  'environment-specific',
  'external/live',
  'release',
]);

const TASK_KINDS = new Set(['change', 'documentation', 'investigation', 'unknown']);
const DEPTHS = new Set(['light', 'standard', 'deep']);
const CONFIDENCE_LEVELS = new Set(['low', 'medium', 'high']);
const HIGH_RISK_TOPICS = new Set([
  'identity-access',
  'persistence-schema',
  'security-privacy',
  'deployment-operations',
  'financial-integrity',
]);
const BEHAVIOR_TOPICS = new Set([
  'identity-access',
  'persistence-schema',
  'api-contract',
  'async-consistency',
  'user-interface',
  'performance-budget',
  'security-privacy',
  'financial-integrity',
]);

const DOCUMENTATION_SIGNAL = /(?:^|[\s/_.-])(?:doc|docs|documentation|readme|markdown|copy|content|changelog)(?:$|[\s/_.-])/iu;
const INVESTIGATION_SIGNAL = /(?:\b(?:investigate|investigation|debug|analyse|analyze|review|audit|why|understand|inspect|kiểm\s+tra|tìm\s+hiểu|phân\s+tích|đánh\s+giá)\b)/iu;
const CHANGE_SIGNAL = /(?:\b(?:fix|add|implement|change|create|update|refactor|remove|delete|modify|migrate|deploy|release|triển\s+khai|sửa|thêm|tạo|cập\s+nhật|đổi|xóa|refactor)\b)/iu;
const MOBILE_OR_DEVICE_SIGNAL = /(?:\b(?:mobile|ios|android|iphone|ipad|device|viewport|responsive|handset)\b|di\s+động|điện\s+thoại|máy\s+tính\s+bảng|thiết\s+bị)/iu;
const BROWSER_SIGNAL = /(?:\b(?:browser|chrome|safari|firefox|edge|web\s+app|trình\s+duyệt)\b)/iu;
const LIVE_SIGNAL = /(?:\b(?:production|prod|live|deployed|deployment|deploy|staging|external|third[-\s]?party|tích\s+hợp\s+thật|môi\s+trường\s+thật)\b)/iu;
const RELEASE_SIGNAL = /(?:\b(?:release|publish|ship|rollout|go\s+live|phát\s+hành|xuất\s+bản|đưa\s+lên\s+production)\b)/iu;

function text(value) { return typeof value === 'string' ? value.trim() : ''; }
function bounded(values, limit) { return [...new Set((values || []).filter(Boolean))].slice(0, limit); }
function cleanTopic(topic) {
  if (!topic || typeof topic !== 'object' || Array.isArray(topic)) return null;
  const id = text(topic.id);
  const title = text(topic.title) || id;
  return id ? { id, title } : null;
}
function addRequirement(requirements, requirement) {
  if (!requirements.some((item) => item.id === requirement.id)) requirements.push(requirement);
}
function requirementFor(kind, source, guidance) {
  const labels = {
    implementation: ['Implementation evidence', 'Check the changed implementation or work product with a passing focused check.'],
    behavior: ['Behavior evidence', 'Replay or exercise the requested behavior/contract with a passing check.'],
    'environment-specific': ['Environment-specific evidence', 'Verify the requested behavior in the named device, browser, OS, viewport, or runtime context.'],
    'external/live': ['External/live evidence', 'Observe the real deployed, external, or third-party integration target.'],
    release: ['Release evidence', 'Assess the exact release target against its release gates and approval boundary.'],
  };
  const [title, fallbackGuidance] = labels[kind];
  return {
    id: kind,
    kind,
    title,
    guidance: text(guidance) || fallbackGuidance,
    required: true,
    source: text(source) || 'deterministic-task-shape-rule',
    confidence: 'medium',
  };
}

function taskKindFor(haystack) {
  if (DOCUMENTATION_SIGNAL.test(haystack) && !CHANGE_SIGNAL.test(haystack.replace(/\b(?:update|change|edit|cập\s+nhật|đổi)\b/giu, ''))) return 'documentation';
  if (INVESTIGATION_SIGNAL.test(haystack) && !CHANGE_SIGNAL.test(haystack)) return 'investigation';
  if (CHANGE_SIGNAL.test(haystack)) return 'change';
  return 'unknown';
}

function riskLevelFor({ topics, boundaries, environment, live, release, taskKind }) {
  if (topics.some((topic) => HIGH_RISK_TOPICS.has(topic.id)) || live || release || boundaries.length >= 3) return 'high';
  if (topics.length || environment || boundaries.length > 1 || taskKind === 'change') return 'medium';
  return 'low';
}

function depthFor({ riskLevel, taskKind, requirements, boundaries }) {
  if (riskLevel === 'high' || requirements.some((item) => ['environment-specific', 'external/live', 'release'].includes(item.kind))) return 'deep';
  if (taskKind === 'documentation' || taskKind === 'investigation') return 'light';
  if (boundaries.length > 1 || requirements.some((item) => item.kind === 'behavior')) return 'standard';
  return 'light';
}

function criteriaFor(requirements) {
  return requirements.slice(0, 8).map((item) => ({
    id: `criterion-${item.id}`,
    statement: item.guidance,
    evidenceKind: item.kind,
    requirementId: item.id,
    status: 'inferred',
    confidence: item.confidence,
  }));
}

function unknownsFor({ requirements, taskKind, environment, live, release }) {
  const unknowns = ['User acceptance criteria were not explicitly supplied; derived criteria are advisory.'];
  if (taskKind === 'unknown') unknowns.push('Task shape is ambiguous from the supplied request and retrieved paths.');
  if (requirements.some((item) => item.kind === 'behavior')) unknowns.push('The exact behavior journey and acceptance cases were not explicitly supplied.');
  if (environment) unknowns.push('The target device, browser, OS, viewport, or runtime version was not explicitly supplied.');
  if (live) unknowns.push('The target live/external environment and observation source were not explicitly supplied.');
  if (release) unknowns.push('The release target and explicit approval/authorization boundary were not supplied.');
  return bounded(unknowns, 8);
}

function validateRequirement(item, index, errors) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) { errors.push(`requiredEvidence[${index}] must be an object.`); return; }
  if (!text(item.id) || !text(item.title) || !text(item.guidance) || !text(item.source)
    || item.id.length > 120 || item.title.length > 500 || item.guidance.length > 500 || item.source.length > 200) errors.push(`requiredEvidence[${index}] is missing bounded text.`);
  if (!EVIDENCE_KINDS.includes(item.kind)) errors.push(`requiredEvidence[${index}].kind is invalid.`);
  if (item.required !== true) errors.push(`requiredEvidence[${index}].required must be true.`);
  if (!CONFIDENCE_LEVELS.has(item.confidence)) errors.push(`requiredEvidence[${index}].confidence is invalid.`);
}

export function validateTaskContract(contract) {
  const errors = [];
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) return { valid: false, errors: ['taskContract must be an object.'] };
  if (contract.version !== TASK_CONTRACT_VERSION) errors.push(`taskContract.version must be ${TASK_CONTRACT_VERSION}.`);
  if (!text(contract.goal) || contract.goal.length > 500) errors.push('taskContract.goal must be bounded text.');
  if (!TASK_KINDS.has(contract.taskKind)) errors.push('taskContract.taskKind is invalid.');
  if (!DEPTHS.has(contract.depth)) errors.push('taskContract.depth is invalid.');
  if (!contract.risk || typeof contract.risk !== 'object' || Array.isArray(contract.risk)
    || !['low', 'medium', 'high'].includes(contract.risk.level)
    || !Array.isArray(contract.risk.topics) || contract.risk.topics.length > 12
    || !contract.risk.topics.every((item) => text(item) && item.length <= 120)
    || contract.risk.evidenceType !== 'inferred') errors.push('taskContract.risk is invalid.');
  if (!Array.isArray(contract.successCriteria) || contract.successCriteria.length > 8) errors.push('taskContract.successCriteria is invalid.');
  if (!Array.isArray(contract.requiredEvidence) || contract.requiredEvidence.length > 8) errors.push('taskContract.requiredEvidence is invalid.');
  else contract.requiredEvidence.forEach((item, index) => validateRequirement(item, index, errors));
  if (!Array.isArray(contract.unknowns) || contract.unknowns.length > 8 || !contract.unknowns.every((item) => text(item) && item.length <= 500)) errors.push('taskContract.unknowns is invalid.');
  if (!Array.isArray(contract.assumptions) || contract.assumptions.length > 8 || !contract.assumptions.every((item) => text(item) && item.length <= 500)) errors.push('taskContract.assumptions is invalid.');
  if (!contract.provenance || typeof contract.provenance !== 'object' || Array.isArray(contract.provenance)
    || !Object.values(contract.provenance).every((item) => text(item) && item.length <= 300)) errors.push('taskContract.provenance is invalid.');
  if (!text(contract.policy) || contract.policy.length > 1000) errors.push('taskContract.policy is required.');
  return { valid: errors.length === 0, errors };
}

/**
 * Build bounded task semantics from already available query, topic, path, and
 * boundary evidence. This is pure and advisory; it does not execute, persist,
 * authorize, or infer user acceptance as fact.
 */
export function buildTaskContract({ goal, topics = [], boundaries = [], files = [] } = {}) {
  const normalizedGoal = text(goal);
  if (!normalizedGoal) throw new Error('Task contract goal cannot be empty.');
  const haystack = `${normalizedGoal}\n${files.join('\n')}`;
  const normalizedTopics = topics.map(cleanTopic).filter(Boolean).slice(0, 12);
  const environment = MOBILE_OR_DEVICE_SIGNAL.test(haystack) || BROWSER_SIGNAL.test(haystack);
  const live = LIVE_SIGNAL.test(haystack);
  const release = RELEASE_SIGNAL.test(haystack);
  const taskKind = taskKindFor(haystack);
  const requirements = [];

  if (['change', 'documentation'].includes(taskKind)) {
    addRequirement(requirements, requirementFor('implementation', taskKind === 'documentation' ? 'documentation-task-shape' : 'change-task-shape'));
  }
  if (normalizedTopics.some((topic) => BEHAVIOR_TOPICS.has(topic.id))) {
    const topicNames = normalizedTopics.filter((topic) => BEHAVIOR_TOPICS.has(topic.id)).map((topic) => topic.id).join(', ');
    addRequirement(requirements, requirementFor('behavior', `topic:${topicNames}`));
  }
  if (environment) addRequirement(requirements, requirementFor('environment-specific', 'environment-context-signal'));
  if (live || normalizedTopics.some((topic) => topic.id === 'deployment-operations')) addRequirement(requirements, requirementFor('external/live', live ? 'live-context-signal' : 'topic:deployment-operations'));
  if (release) addRequirement(requirements, requirementFor('release', 'release-context-signal'));

  const riskLevel = riskLevelFor({ topics: normalizedTopics, boundaries, environment, live, release, taskKind });
  const depth = depthFor({ riskLevel, taskKind, requirements, boundaries });
  const contract = {
    version: TASK_CONTRACT_VERSION,
    goal: normalizedGoal,
    taskKind,
    depth,
    risk: {
      level: riskLevel,
      topics: normalizedTopics.map((topic) => topic.id),
      evidenceType: 'inferred',
    },
    successCriteria: criteriaFor(requirements),
    requiredEvidence: requirements.slice(0, 8),
    unknowns: unknownsFor({ requirements, taskKind, environment, live, release }),
    assumptions: [
      'Task shape, risk, and evidence requirements are deterministic inferences from the request and retrieved project paths.',
      'A required evidence item is a minimum completion condition, not proof of complete runtime impact or user acceptance.',
      'CMI records and assesses supplied evidence but does not execute commands or authorize external actions.',
    ],
    provenance: {
      taskShape: 'deterministic request and path signal rules',
      topics: 'advisor topic classification from query and retrieved paths',
      risk: 'topic, boundary, environment, live, and release signals',
      requiredEvidence: 'bounded deterministic mapping from task/risk signals',
    },
    policy: 'Task Contract semantics are inferred pre-change requirements. Missing context remains an explicit unknown; requirements never authorize edits, commands, deployment, release, or automatic memory promotion.',
  };
  const validation = validateTaskContract(contract);
  if (!validation.valid) throw new Error(`Invalid derived task contract: ${validation.errors.join(' ')}`);
  return contract;
}
