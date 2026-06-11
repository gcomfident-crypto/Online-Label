import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const docsDir = resolve(rootDir, 'docs/api');
const postmanDir = resolve(docsDir, 'postman');

const folders = [
  { id: 'auth', name: '00 Auth 登录', tag: 'Auth' },
  { id: 'system', name: '01 System 系统检查', tag: 'System' },
  { id: 'tasks', name: '02 Owner 任务管理', tag: 'Tasks' },
  { id: 'templates', name: '03 Owner 模板管理', tag: 'Templates' },
  { id: 'datasets', name: '04 Owner 数据导入', tag: 'Datasets' },
  { id: 'labeler', name: '05 Labeler 任务领取与标注', tag: 'Labeler' },
  { id: 'ai', name: '06 AI Agent 预审', tag: 'AiReview' },
  { id: 'reviewer', name: '07 Reviewer 人工复核', tag: 'Reviews' },
  { id: 'exports', name: '08 Export 导出中心', tag: 'Exports' },
  { id: 'flows', name: '09 Task Flow 质检流转', tag: 'TaskFlow' },
  { id: 'llm', name: '10 LLM 辅助能力', tag: 'LLM' },
  { id: 'debug', name: '99 Debug 内部调试', tag: 'Debug' },
];

const routeDefinitions = [
  route('GET', '/health', '/health', 'system', '健康检查', { public: true }),
  route('POST', '/auth/login', '/auth/login', 'auth', '使用演示账号登录', {
    public: true,
    body: { account: 'zhangzexin', password: 'LabelHub@1101101' },
    variants: [
      loginVariant('Owner 登录', 'zhangzexin', 'LabelHub@1101101', 'ownerToken'),
      loginVariant('Labeler 王昱阳登录', 'wangyuyang', 'labelerToken'),
      loginVariant('Labeler 侯士康登录', 'houshikang', 'secondLabelerToken'),
      loginVariant('AI Agent 登录', 'agent', 'agentToken'),
      loginVariant('Reviewer 登录', 'xinzezhang', 'reviewerToken'),
    ],
  }),
  route('GET', '/me', '/me', 'auth', '获取当前用户', { token: 'ownerToken' }),

  route('POST', '/tasks', '/tasks', 'tasks', '创建任务草稿', {
    token: 'ownerToken',
    body: {
      title: 'Postman 验证任务',
      description: '通过 Postman Collection 创建的任务草稿。',
      richTextInstruction: '<p>请按模板完成标注。</p>',
      tags: ['postman', 'api'],
      rewardRule: '按题计费',
      rewardPerItem: 1,
      perUserLimit: 12,
      quota: 12,
      deadline: '2026-06-30T18:00:00.000Z',
      distributionStrategy: 'FIRST_COME_FIRST_SERVE',
      aiPreReviewEnabled: true,
      aiRuleName: '默认 AI 预审规则',
      templateId: '{{templateId}}',
      actorId: '{{ownerId}}',
    },
    save: { variable: 'taskId', paths: ['data.id'] },
  }),
  route('GET', '/tasks', '/tasks', 'tasks', '查询 Owner 任务列表', {
    token: 'ownerToken',
    query: { ownerId: '{{ownerId}}', status: 'PUBLISHED' },
  }),
  route('GET', '/tasks/summaries', '/tasks/summaries', 'tasks', '查询 Owner 任务摘要', {
    token: 'ownerToken',
    query: { ownerId: '{{ownerId}}', status: 'PUBLISHED' },
  }),
  route('GET', '/tasks/{id}', '/tasks/{{taskId}}', 'tasks', '获取任务详情', { token: 'ownerToken' }),
  route('PATCH', '/tasks/{id}', '/tasks/{{taskId}}', 'tasks', '更新任务基础信息', {
    token: 'ownerToken',
    body: { title: 'Postman 验证任务 - 已更新', description: '更新后的任务描述。', tags: ['postman'] },
  }),
  route('PATCH', '/tasks/{id}/status', '/tasks/{{taskId}}/status', 'tasks', '任务状态流转', {
    token: 'ownerToken',
    body: { status: 'PUBLISHED', actorId: '{{ownerId}}', reason: '发布给标注员领取', confirm: true },
  }),
  route('DELETE', '/tasks/{id}', '/tasks/{{taskId}}', 'tasks', '删除任务草稿', { token: 'ownerToken' }),
  route('PATCH', '/tasks/{id}/review-stage-config', '/tasks/{{taskId}}/review-stage-config', 'tasks', '配置审核阶段', {
    token: 'ownerToken',
    body: { actorId: '{{ownerId}}', stages: [{ type: 'RECHECK', enabled: true }] },
  }),
  route('GET', '/tasks/{id}/audit-logs', '/tasks/{{taskId}}/audit-logs', 'tasks', '查询任务审计日志', { token: 'ownerToken' }),

  route('POST', '/templates', '/templates', 'templates', '创建模板', {
    token: 'ownerToken',
    body: {
      name: 'Postman 验证模板',
      description: '用于 Postman API 文档验证的通用模板。',
      datasetKind: 'generic_json',
      actorId: '{{ownerId}}',
      schema: sampleSchema(),
    },
    save: { variable: 'templateId', paths: ['data.id'] },
  }),
  route('POST', '/templates/from-profile', '/templates/from-profile', 'templates', '从官方 DatasetProfile 创建模板', {
    token: 'ownerToken',
    body: { profile: 'preference_compare', actorId: '{{ownerId}}' },
    save: { variable: 'templateId', paths: ['data.id'] },
  }),
  route('GET', '/templates', '/templates', 'templates', '查询模板列表', { token: 'ownerToken' }),
  route('GET', '/templates/{id}/versions', '/templates/{{templateId}}/versions', 'templates', '查询模板版本', { token: 'ownerToken' }),
  route('GET', '/templates/{id}/versions/{versionId}/diff', '/templates/{{templateId}}/versions/{{versionId}}/diff', 'templates', '查询模板版本 Diff', { token: 'ownerToken' }),
  route('POST', '/templates/{id}/versions/{versionId}/restore', '/templates/{{templateId}}/versions/{{versionId}}/restore', 'templates', '恢复模板版本', { token: 'ownerToken' }),
  route('GET', '/templates/{id}', '/templates/{{templateId}}', 'templates', '获取模板详情', { token: 'ownerToken' }),
  route('PATCH', '/templates/{id}', '/templates/{{templateId}}', 'templates', '更新模板 Schema', {
    token: 'ownerToken',
    body: { name: 'Postman 验证模板 - 已更新', description: '更新模板说明。', schema: sampleSchema() },
  }),
  route('POST', '/templates/{id}/publish', '/templates/{{templateId}}/publish', 'templates', '发布模板版本', {
    token: 'ownerToken',
    body: { versionName: 'v1', actorId: '{{ownerId}}' },
  }),
  route('DELETE', '/templates/{id}', '/templates/{{templateId}}', 'templates', '删除模板草稿', { token: 'ownerToken' }),

  route('POST', '/tasks/{taskId}/items/import', '/tasks/{{taskId}}/items/import', 'datasets', '导入 JSON、JSONL 或 Excel 题目', {
    token: 'ownerToken',
    body: {
      datasetKind: 'generic_json',
      format: 'json',
      fileName: 'postman-sample.json',
      content: '[{"id":"P0001","prompt":"请判断回答质量","response_a":"回答 A","response_b":"回答 B"}]',
    },
  }),
  route('POST', '/tasks/{taskId}/items/import-zip', '/tasks/{{taskId}}/items/import-zip', 'datasets', '导入官方 datasets.zip', {
    token: 'ownerToken',
    body: { fileName: 'datasets.zip', contentBase64: '{{zipContentBase64}}' },
  }),
  route('GET', '/tasks/{taskId}/items', '/tasks/{{taskId}}/items', 'datasets', '查询任务题目', { token: 'ownerToken' }),
  route('PATCH', '/task-items/{id}', '/task-items/{{taskItemId}}', 'datasets', '更新题目 rawData 补丁', {
    token: 'ownerToken',
    body: { rawDataPatch: { prompt: '更新后的题目内容' } },
  }),

  route('GET', '/labeler/tasks', '/labeler/tasks', 'labeler', '查询任务广场', {
    token: 'labelerToken',
    query: { keyword: 'Postman', tag: 'api', claimStatus: 'available', labelerId: '{{labelerId}}' },
  }),
  route('POST', '/assignments/claim', '/assignments/claim', 'labeler', '领取任务', {
    token: 'labelerToken',
    body: { taskId: '{{taskId}}', labelerId: '{{labelerId}}' },
    save: { variable: 'assignmentId', paths: ['data.id', 'data.assignmentId', 'data.assignment.id'] },
  }),
  route('GET', '/assignments/{assignmentId}/workbench', '/assignments/{{assignmentId}}/workbench', 'labeler', '查询标注台数据', { token: 'labelerToken' }),
  route('GET', '/drafts/{assignmentId}', '/drafts/{{assignmentId}}', 'labeler', '查询草稿', { token: 'labelerToken' }),
  route('PUT', '/drafts/{assignmentId}', '/drafts/{{assignmentId}}', 'labeler', '保存草稿', {
    token: 'labelerToken',
    body: { actorId: '{{labelerId}}', answers: { answer: '这是草稿内容' } },
  }),
  route('POST', '/submissions', '/submissions', 'labeler', '提交单个 assignment 标注结果', {
    token: 'labelerToken',
    idempotency: true,
    body: { assignmentId: '{{assignmentId}}', actorId: '{{labelerId}}', answers: { answer: '最终标注结果' }, idempotencyKey: '{{idempotencyKey}}' },
    save: { variable: 'submissionId', paths: ['data.id', 'data.submissionId'] },
  }),
  route('POST', '/submissions/task', '/submissions/task', 'labeler', '提交整个任务标注结果', {
    token: 'labelerToken',
    idempotency: true,
    body: { taskId: '{{taskId}}', labelerId: '{{labelerId}}', actorId: '{{labelerId}}', currentAssignmentId: '{{assignmentId}}', currentAnswers: { answer: '最终标注结果' }, idempotencyKey: '{{idempotencyKey}}' },
    save: { variable: 'submissionId', paths: ['data.id', 'data.submissionId', 'data.submissions.0.id'] },
  }),
  route('GET', '/labeler/submissions', '/labeler/submissions', 'labeler', '查询标注员提交历史', {
    token: 'labelerToken',
    query: {
      labelerId: '{{labelerId}}',
      taskId: '{{taskId}}',
      status: 'AI_QUEUED',
      datasetKind: 'generic_json',
      itemId: '{{taskItemId}}',
    },
  }),
  route('GET', '/labeler/assignments', '/labeler/assignments', 'labeler', '查询标注员 assignment', {
    token: 'labelerToken',
    query: { labelerId: '{{labelerId}}', taskId: '{{taskId}}' },
  }),
  route('GET', '/labeler/assignment-tasks', '/labeler/assignment-tasks', 'labeler', '查询标注员任务聚合', {
    token: 'labelerToken',
    query: { labelerId: '{{labelerId}}' },
  }),
  route('GET', '/labeler/stats', '/labeler/stats', 'labeler', '查询标注员统计', {
    token: 'labelerToken',
    query: { labelerId: '{{labelerId}}', taskId: '{{taskId}}' },
  }),

  route('GET', '/ai-review/batches', '/ai-review/batches', 'ai', '查询 AI 预审批次', { token: 'agentToken', query: { status: 'PENDING' } }),
  route('GET', '/ai-review/batches/{batchId}', '/ai-review/batches/{{batchId}}', 'ai', '查询 AI 预审批次详情', { token: 'agentToken' }),
  route('GET', '/ai-review/jobs', '/ai-review/jobs', 'ai', '查询 AI 预审任务', { token: 'agentToken', query: { status: 'QUEUED' } }),
  route('POST', '/ai-review/jobs/{id}/retry', '/ai-review/jobs/{{jobId}}/retry', 'ai', '重试 AI 预审任务', { token: 'agentToken' }),
  route('POST', '/ai-review/jobs/{id}/complete', '/ai-review/jobs/{{jobId}}/complete', 'ai', '完成 AI 预审任务', {
    token: 'agentToken',
    body: { actorId: '{{agentId}}', decision: 'pass', scores: { overall: 90 }, comment: 'AI 预审通过', rawPrompt: '', rawOutput: '', structuredOutput: {}, modelMetadata: { provider: 'deepseek' } },
  }),
  route('GET', '/submissions/{submissionId}/ai-review', '/submissions/{{submissionId}}/ai-review', 'ai', '查询提交的 AI 预审详情', { token: 'agentToken' }),

  route('GET', '/reviews/pending/tasks', '/reviews/pending/tasks', 'reviewer', '查询待复核任务列表', {
    token: 'reviewerToken',
    query: { reviewerId: '{{reviewerId}}', aiDecision: 'pass' },
  }),
  route('GET', '/reviews/pending', '/reviews/pending', 'reviewer', '查询待人工复审题目', {
    token: 'reviewerToken',
    query: { reviewerId: '{{reviewerId}}', aiDecision: 'pass', taskId: '{{taskId}}' },
  }),
  route('GET', '/reviews/results', '/reviews/results', 'reviewer', '查询审核结果', { token: 'reviewerToken', query: { verdict: 'pass' } }),
  route('GET', '/reviews/{assignmentId}/rounds', '/reviews/{{assignmentId}}/rounds', 'reviewer', '查询提交轮次', { token: 'reviewerToken' }),
  route('GET', '/reviews/{assignmentId}/diff', '/reviews/{{assignmentId}}/diff', 'reviewer', '查询轮次 Diff', {
    token: 'reviewerToken',
    query: { fromRound: '1', toRound: '2' },
  }),
  route('POST', '/reviews/batch-pass', '/reviews/batch-pass', 'reviewer', '批量复审通过', {
    token: 'reviewerToken',
    body: { actorId: '{{reviewerId}}', submissionIds: ['{{submissionId}}'], comment: '批量通过' },
  }),
  route('POST', '/reviews/batch-reject', '/reviews/batch-reject', 'reviewer', '批量复审打回', {
    token: 'reviewerToken',
    body: { actorId: '{{reviewerId}}', submissionIds: ['{{submissionId}}'], reason: '批量打回原因' },
  }),
  route('POST', '/reviews/assign', '/reviews/assign', 'reviewer', '批量指派 Reviewer', {
    token: 'reviewerToken',
    body: { actorId: '{{ownerId}}', reviewerId: '{{reviewerId}}', submissionIds: ['{{submissionId}}'] },
  }),
  route('GET', '/reviews/{submissionId}', '/reviews/{{submissionId}}', 'reviewer', '查询复审详情', { token: 'reviewerToken' }),
  route('GET', '/reviews/{submissionId}/timeline', '/reviews/{{submissionId}}/timeline', 'reviewer', '查询审计时间线', { token: 'reviewerToken' }),
  route('POST', '/reviews/{submissionId}/start', '/reviews/{{submissionId}}/start', 'reviewer', '开始人工复审', {
    token: 'reviewerToken',
    body: { actorId: '{{reviewerId}}' },
  }),
  route('POST', '/reviews/{submissionId}/pass', '/reviews/{{submissionId}}/pass', 'reviewer', '人工复审通过', {
    token: 'reviewerToken',
    body: { actorId: '{{reviewerId}}', comment: '复审通过' },
  }),
  route('POST', '/reviews/{submissionId}/reject', '/reviews/{{submissionId}}/reject', 'reviewer', '人工复审打回', {
    token: 'reviewerToken',
    body: { actorId: '{{reviewerId}}', reason: '需要补充证据', fieldReviews: [{ fieldKey: 'answer', verdict: 'reject', comment: '请重新检查该字段' }] },
  }),
  route('POST', '/reviews/{submissionId}/revise-and-pass', '/reviews/{{submissionId}}/revise-and-pass', 'reviewer', '人工修订并通过', {
    token: 'reviewerToken',
    body: { actorId: '{{reviewerId}}', comment: '已修订并通过', revisedAnswers: { answer: 'Reviewer 修订后的结果' } },
  }),

  route('GET', '/tasks/{taskId}/review-rule', '/tasks/{{taskId}}/review-rule', 'ai', '查询任务 AI 预审规则', { token: 'agentToken' }),
  route('POST', '/tasks/{taskId}/review-rule', '/tasks/{{taskId}}/review-rule', 'ai', '保存任务 AI 预审规则', {
    token: 'agentToken',
    body: { name: '默认 AI 预审规则', promptTemplate: '请判断标注结果是否达标', dimensions: [{ key: 'accuracy', label: '准确性', maxScore: 100 }], passThreshold: 80, manualThreshold: 60, provider: 'deepseek', model: 'deepseek-chat', temperature: 0.2, actorId: '{{agentId}}' },
  }),

  route('POST', '/exports', '/exports', 'exports', '创建导出任务', {
    token: 'ownerToken',
    idempotency: true,
    body: { taskId: '{{taskId}}', requestedById: '{{ownerId}}', format: 'json', includeReviews: true, fieldMapping: {}, idempotencyKey: '{{idempotencyKey}}' },
    save: { variable: 'exportId', paths: ['data.id'] },
  }),
  route('GET', '/exports', '/exports', 'exports', '查询导出历史', { token: 'ownerToken', query: { taskId: '{{taskId}}' } }),
  route('GET', '/exports/{id}', '/exports/{{exportId}}', 'exports', '查询导出详情', { token: 'ownerToken' }),
  route('GET', '/exports/{id}/download', '/exports/{{exportId}}/download', 'exports', '下载导出文件', { token: 'ownerToken', binary: true }),
  route('POST', '/exports/{id}/retry', '/exports/{{exportId}}/retry', 'exports', '重试失败导出', { token: 'ownerToken' }),
  route('GET', '/tasks/{taskId}/export-preview', '/tasks/{{taskId}}/export-preview', 'exports', '预览终审通过数据的导出字段映射', {
    token: 'ownerToken',
    query: { includeReviews: 'true', fieldMapping: '{}' },
  }),

  route('GET', '/agent/task-flows', '/agent/task-flows', 'flows', '查询质检流转任务列表', { token: 'agentToken' }),
  route('GET', '/agent/task-flows/{taskId}/logs', '/agent/task-flows/{{taskId}}/logs', 'flows', '查询任务流转日志', { token: 'agentToken' }),
  route('GET', '/agent/task-flows/{taskId}', '/agent/task-flows/{{taskId}}', 'flows', '查询任务流转详情', { token: 'agentToken', query: { round: '1' } }),

  route('POST', '/schema/validate', '/schema/validate', 'system', '校验 Schema answers', {
    token: 'ownerToken',
    body: { schema: sampleSchema(), answers: { answer: '待校验内容' } },
  }),

  route('POST', '/llm/assist', '/llm/assist', 'llm', '调用 LLM 辅助生成', {
    token: 'labelerToken',
    body: { datasetKind: 'generic_json', rawData: { prompt: '请写一句话' }, answers: {}, targetFieldKey: 'answer', promptTemplate: '请生成标注建议' },
  }),
  route('POST', '/llm/assist/mock', '/llm/assist/mock', 'llm', '调用 LLM 模拟辅助生成', {
    token: 'labelerToken',
    body: { datasetKind: 'generic_json', rawData: { prompt: '请写一句话' }, answers: {}, targetFieldKey: 'answer', promptTemplate: '请生成标注建议' },
  }),
  route('POST', '/llm/template-fields/classify', '/llm/template-fields/classify', 'llm', '自动识别模板字段类型', {
    token: 'ownerToken',
    body: { fields: [{ key: 'prompt', label: '题目' }, { key: 'answer', label: '答案' }] },
  }),

  route('GET', '/debug/seed-status', '/debug/seed-status', 'debug', '查询种子数据状态', { public: true }),
  route('GET', '/debug/tasks', '/debug/tasks', 'debug', '查询调试任务数据', { public: true }),
  route('GET', '/debug/users', '/debug/users', 'debug', '查询调试用户数据', { public: true }),
  route('GET', '/debug/sample-schema', '/debug/sample-schema', 'debug', '查询示例 Schema', { public: true }),
];

const demoRouteKeys = new Set([
  routeKey('GET', '/health'),
  routeKey('POST', '/auth/login'),
  routeKey('GET', '/me'),
  routeKey('POST', '/templates/from-profile'),
  routeKey('GET', '/templates'),
  routeKey('GET', '/templates/{id}'),
  routeKey('POST', '/templates/{id}/publish'),
  routeKey('POST', '/tasks'),
  routeKey('GET', '/tasks'),
  routeKey('GET', '/tasks/{id}'),
  routeKey('PATCH', '/tasks/{id}/status'),
  routeKey('GET', '/tasks/{id}/audit-logs'),
  routeKey('POST', '/tasks/{taskId}/items/import'),
  routeKey('GET', '/tasks/{taskId}/items'),
  routeKey('GET', '/labeler/tasks'),
  routeKey('POST', '/assignments/claim'),
  routeKey('GET', '/assignments/{assignmentId}/workbench'),
  routeKey('GET', '/drafts/{assignmentId}'),
  routeKey('PUT', '/drafts/{assignmentId}'),
  routeKey('POST', '/submissions/task'),
  routeKey('GET', '/ai-review/batches'),
  routeKey('GET', '/ai-review/batches/{batchId}'),
  routeKey('GET', '/submissions/{submissionId}/ai-review'),
  routeKey('GET', '/reviews/pending/tasks'),
  routeKey('GET', '/reviews/pending'),
  routeKey('GET', '/reviews/{assignmentId}/rounds'),
  routeKey('GET', '/reviews/{assignmentId}/diff'),
  routeKey('GET', '/reviews/{submissionId}'),
  routeKey('GET', '/reviews/{submissionId}/timeline'),
  routeKey('POST', '/reviews/{submissionId}/start'),
  routeKey('POST', '/reviews/{submissionId}/pass'),
  routeKey('POST', '/reviews/{submissionId}/reject'),
  routeKey('POST', '/exports'),
  routeKey('GET', '/exports'),
  routeKey('GET', '/exports/{id}'),
  routeKey('GET', '/exports/{id}/download'),
  routeKey('GET', '/tasks/{taskId}/export-preview'),
  routeKey('GET', '/agent/task-flows'),
  routeKey('GET', '/agent/task-flows/{taskId}'),
  routeKey('GET', '/agent/task-flows/{taskId}/logs'),
  routeKey('POST', '/llm/assist'),
]);

function isDemoRoute(routeDef) {
  return demoRouteKeys.has(routeDef.key);
}

function route(method, openapiPath, postmanPath, folder, summary, options = {}) {
  const folderDef = folders.find((item) => item.id === folder);
  if (!folderDef) {
    throw new Error(`Unknown folder ${folder}`);
  }

  return {
    key: routeKey(method, openapiPath),
    method,
    openapiPath,
    postmanPath,
    folder,
    tag: folderDef.tag,
    summary,
    description: options.description ?? `${summary}。`,
    token: options.public ? null : options.token ?? 'ownerToken',
    query: options.query ?? {},
    body: options.body,
    variants: options.variants,
    save: options.save,
    idempotency: options.idempotency ?? false,
    binary: options.binary ?? false,
  };
}

function routeKey(method, openapiPath) {
  return `${method.toUpperCase()} ${openapiPath}`;
}

function loginVariant(name, account, passwordOrTokenVar, maybeTokenVar) {
  const password = maybeTokenVar ? passwordOrTokenVar : '1101101';
  const tokenVar = maybeTokenVar ?? passwordOrTokenVar;

  return {
    name,
    body: { account, password },
    tests: [
      'const json = pm.response.json();',
      `pm.environment.set(${JSON.stringify(tokenVar)}, json.data.token);`,
      `pm.test(${JSON.stringify(`${name} 保存 token`)}, () => pm.expect(pm.environment.get(${JSON.stringify(tokenVar)})).to.be.ok);`,
    ],
  };
}

function sampleSchema() {
  return {
    schemaVersion: '1.0.0',
    datasetKind: 'generic_json',
    fields: [
      { key: 'show_prompt', type: 'show_item', label: '题目内容', sourceKeys: ['prompt'] },
      { key: 'answer_field', fieldKey: 'answer', type: 'textarea', label: '标注结果', validation: { required: true } },
    ],
  };
}

function buildOpenApi() {
  const paths = {};

  for (const routeDef of routeDefinitions) {
    paths[routeDef.openapiPath] ??= {};
    paths[routeDef.openapiPath][routeDef.method.toLowerCase()] = buildOpenApiOperation(routeDef);
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'LabelHub API',
      version: '0.13.0',
      description: 'LabelHub API 文档源文件。方案 B 手工维护 OpenAPI，并由脚本生成 Postman Collection。',
    },
    servers: [
      { url: 'http://localhost:3000', description: '本地开发 API' },
      { url: 'http://115.190.153.31/api', description: '线上演示 API，经 nginx /api 代理到后端服务' },
    ],
    tags: folders.map(({ tag, name }) => ({ name: tag, description: name })),
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer' },
      },
      schemas: {
        Envelope: {
          type: 'object',
          required: ['data', 'requestId'],
          properties: {
            data: { description: '业务响应数据。', oneOf: [{ type: 'object', additionalProperties: true }, { type: 'array', items: { type: 'object', additionalProperties: true } }, { type: 'null' }] },
            requestId: { type: 'string', example: 'req_abc123' },
          },
        },
        ErrorEnvelope: {
          type: 'object',
          required: ['error', 'requestId'],
          properties: {
            error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } },
            requestId: { type: 'string', example: 'req_abc123' },
          },
        },
        GenericObject: { type: 'object', additionalProperties: true },
      },
    },
  };
}

function buildOpenApiOperation(routeDef) {
  const operation = {
    tags: [routeDef.tag],
    summary: routeDef.summary,
    description: routeDef.description,
    operationId: operationId(routeDef),
    parameters: buildOpenApiParameters(routeDef),
    responses: routeDef.binary
      ? { '200': { description: '文件下载', content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } } }
      : {
          [routeDef.method === 'POST' ? '201' : '200']: {
            description: '成功响应',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Envelope' } } },
          },
          '400': {
            description: '请求参数错误',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } },
          },
        },
  };

  if (routeDef.token) {
    operation.security = [{ bearerAuth: [] }];
  }

  if (routeDef.body !== undefined) {
    operation.requestBody = {
      required: routeDef.method !== 'GET',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/GenericObject' },
          example: routeDef.body,
        },
      },
    };
  }

  if (operation.parameters.length === 0) {
    delete operation.parameters;
  }

  return operation;
}

function buildOpenApiParameters(routeDef) {
  const parameters = [];
  const pathParams = [...routeDef.openapiPath.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);

  for (const name of pathParams) {
    parameters.push({ name, in: 'path', required: true, schema: { type: 'string' } });
  }

  for (const [name, value] of Object.entries(routeDef.query)) {
    parameters.push({
      name,
      in: 'query',
      required: false,
      schema: { type: 'string' },
      example: value,
    });
  }

  if (routeDef.idempotency) {
    parameters.push({
      name: 'idempotency-key',
      in: 'header',
      required: false,
      schema: { type: 'string' },
      example: '{{idempotencyKey}}',
    });
  }

  return parameters;
}

function operationId(routeDef) {
  return `${routeDef.method.toLowerCase()}_${routeDef.openapiPath.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '')}`;
}

function buildCollection(routes, name, description) {
  const collectionFolders = folders.map((folder) => ({
    name: folder.name,
    item: routes
      .filter((routeDef) => routeDef.folder === folder.id)
      .flatMap((routeDef) => buildCollectionItems(routeDef)),
  })).filter((folder) => folder.item.length > 0);

  return {
    info: {
      name,
      description,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    variable: environmentValues('http://localhost:3000').map(({ key, value }) => ({ key, value })),
    item: collectionFolders,
  };
}

function buildCollectionItems(routeDef) {
  if (routeDef.variants) {
    return routeDef.variants.map((variant) => buildCollectionItem(routeDef, variant));
  }

  return [buildCollectionItem(routeDef)];
}

function buildCollectionItem(routeDef, variant) {
  const itemName = variant?.name ?? routeDef.summary;
  const requestBody = variant?.body ?? routeDef.body;
  const headers = [];

  if (requestBody !== undefined) {
    headers.push({ key: 'Content-Type', value: 'application/json' });
  }

  if (routeDef.idempotency) {
    headers.push({ key: 'idempotency-key', value: '{{idempotencyKey}}' });
  }

  const request = {
    method: routeDef.method,
    header: headers,
    description: `${routeDef.method} ${routeDef.openapiPath}\n\n${routeDef.description}`,
    url: buildPostmanUrl(routeDef),
  };

  if (routeDef.token) {
    request.auth = {
      type: 'bearer',
      bearer: [{ key: 'token', value: `{{${routeDef.token}}}`, type: 'string' }],
    };
  }

  if (requestBody !== undefined) {
    request.body = {
      mode: 'raw',
      raw: JSON.stringify(requestBody, null, 2),
      options: { raw: { language: 'json' } },
    };
  }

  return {
    name: itemName,
    request,
    event: [{ listen: 'test', script: { type: 'text/javascript', exec: buildTestScript(routeDef, variant) } }],
  };
}

function buildPostmanUrl(routeDef) {
  const query = Object.entries(routeDef.query).map(([key, value]) => ({
    key,
    value: String(value),
    disabled: value === '',
  }));
  const rawQuery = query.filter((item) => !item.disabled).map((item) => `${encodeURIComponent(item.key)}=${encodeURIComponent(item.value)}`).join('&');

  return {
    raw: `{{baseUrl}}${routeDef.postmanPath}${rawQuery ? `?${rawQuery}` : ''}`,
    host: ['{{baseUrl}}'],
    path: routeDef.postmanPath.replace(/^\//, '').split('/'),
    ...(query.length ? { query } : {}),
  };
}

function buildTestScript(routeDef, variant) {
  const script = [
    "pm.test('HTTP 状态码成功', () => { pm.expect(pm.response.code).to.be.oneOf([200, 201]); });",
  ];

  if (variant?.tests) {
    script.push(...variant.tests);
  }

  if (routeDef.save) {
    script.push(
      'const json = pm.response.json();',
      'const pick = (source, path) => path.split(\'.\').reduce((value, key) => {',
      '  if (Array.isArray(value) && /^\\d+$/.test(key)) return value[Number(key)];',
      '  return value && typeof value === \'object\' ? value[key] : undefined;',
      '}, source);',
      `const savedValue = [${routeDef.save.paths.map((path) => JSON.stringify(path)).join(', ')}].map((path) => pick(json, path)).find(Boolean);`,
      `if (savedValue) pm.environment.set(${JSON.stringify(routeDef.save.variable)}, savedValue);`,
    );
  }

  return script;
}

function environmentValues(baseUrl) {
  return [
    { key: 'baseUrl', value: baseUrl, enabled: true },
    { key: 'ownerToken', value: '', enabled: true },
    { key: 'labelerToken', value: '', enabled: true },
    { key: 'secondLabelerToken', value: '', enabled: true },
    { key: 'reviewerToken', value: '', enabled: true },
    { key: 'agentToken', value: '', enabled: true },
    { key: 'ownerId', value: 'mock-owner', enabled: true },
    { key: 'labelerId', value: 'mock-labeler-wang-yu-yang', enabled: true },
    { key: 'secondLabelerId', value: 'mock-labeler-hou-shi-kang', enabled: true },
    { key: 'reviewerId', value: 'mock-reviewer', enabled: true },
    { key: 'agentId', value: 'mock-ai_agent', enabled: true },
    { key: 'templateId', value: '', enabled: true },
    { key: 'versionId', value: '', enabled: true },
    { key: 'taskId', value: '', enabled: true },
    { key: 'taskItemId', value: '', enabled: true },
    { key: 'assignmentId', value: '', enabled: true },
    { key: 'submissionId', value: '', enabled: true },
    { key: 'batchId', value: '', enabled: true },
    { key: 'jobId', value: '', enabled: true },
    { key: 'exportId', value: '', enabled: true },
    { key: 'idempotencyKey', value: 'postman-demo-001', enabled: true },
    { key: 'zipContentBase64', value: '', enabled: true },
  ];
}

function buildEnvironment(name, baseUrl) {
  return {
    name,
    values: environmentValues(baseUrl),
    _postman_variable_scope: 'environment',
    _postman_exported_using: 'LabelHub scripts/generate-postman-docs.mjs',
  };
}

function buildReadme() {
  const demoCount = routeDefinitions.filter(isDemoRoute).length;
  return [
    '# LabelHub Postman API 文档',
    '',
    '本目录由 `scripts/generate-postman-docs.mjs` 生成，属于方案 B：手工维护 OpenAPI，生成 Postman Collection。',
    '',
    '## 文件',
    '',
    '- `labelhub-demo.postman_collection.json`：主流程交付 Collection，只保留演示和对外交付需要的核心接口。',
    '- `labelhub-full.postman_collection.json`：工程覆盖 Collection，覆盖当前 controller 的全部接口。',
    '- `labelhub-local.postman_environment.json`：本地环境，默认 `http://localhost:3000`。',
    '- `labelhub-prod.postman_environment.json`：线上演示环境，默认 `http://115.190.153.31/api`。',
    '- `api-coverage.md`：生成时的接口覆盖清单。',
    '- `verification-report.md`：静态验证报告。',
    '- `runtime-smoke-report.md`：运行层 smoke 验证记录。',
    '',
    '## 应该导入哪个 Collection',
    '',
    '- 演示、交付、给非研发同学看：导入 `labelhub-demo.postman_collection.json`。',
    '- 排查接口覆盖、研发自测、确认 controller 全量路由：导入 `labelhub-full.postman_collection.json`。',
    '',
    '## 直接导入链接',
    '',
    '在 Postman 中选择 `Import -> Link`，按需粘贴以下链接：',
    '',
    '- Demo Collection：`https://raw.githubusercontent.com/gcomfident-crypto/Online-Label/zzx/develop/docs/api/postman/labelhub-demo.postman_collection.json`',
    '- Full Collection：`https://raw.githubusercontent.com/gcomfident-crypto/Online-Label/zzx/develop/docs/api/postman/labelhub-full.postman_collection.json`',
    '- 线上环境：`https://raw.githubusercontent.com/gcomfident-crypto/Online-Label/zzx/develop/docs/api/postman/labelhub-prod.postman_environment.json`',
    '- 本地环境：`https://raw.githubusercontent.com/gcomfident-crypto/Online-Label/zzx/develop/docs/api/postman/labelhub-local.postman_environment.json`',
    '',
    '## 使用步骤',
    '',
    '1. 在 Postman 导入 Demo Collection 链接。',
    '2. 导入 `labelhub-prod.postman_environment.json` 线上环境链接，或导入 `labelhub-local.postman_environment.json` 本地环境链接。',
    '3. 选择对应环境。',
    '4. 先运行 `00 Auth 登录` 文件夹里的登录请求，登录脚本会自动保存 token。',
    '5. 再按 Owner、Labeler、AI Agent、Reviewer、Export 的业务顺序执行接口。',
    '',
    '## Collection 边界',
    '',
    '- Demo Collection：' + demoCount + ' 个核心接口，不包含 debug、mock、内部重试、批量指派、底层 schema 校验等接口。',
    '- Full Collection：' + routeDefinitions.length + ' 个接口，必须和 `apps/api/src/**/*.controller.ts` 保持完全一致。',
    '',
    '## 重新生成',
    '',
    '```bash',
    'node scripts/generate-postman-docs.mjs',
    'node scripts/verify-postman-docs.mjs',
    '```',
    '',
    '## 命令行 smoke 验证',
    '',
    '没有 Postman 云端 API Key 时，可以用 Newman 本地运行标准 Postman Collection：',
    '',
    '```bash',
    'pnpm dlx newman run docs/api/postman/labelhub-demo.postman_collection.json -e docs/api/postman/labelhub-prod.postman_environment.json --folder "00 Auth 登录" --folder "01 System 系统检查" --reporters cli',
    '```',
    '',
    '## 成功标准',
    '',
    '- Demo Collection 能被 Postman 导入，且不暴露 debug/mock/internal/high-level 接口。',
    '- Full Collection 能被 Postman 导入，且覆盖 controller 的全部真实路由。',
    '- Local / Prod 环境变量完整。',
    '- 登录请求能自动保存不同角色 token。',
    '- `apps/api/src/**/*.controller.ts` 中的真实路由与 `docs/api/openapi.yaml`、Full Collection 覆盖一致。',
  ].join('\n') + '\n';
}

function buildCoverageMarkdown() {
  const demoRoutes = routeDefinitions.filter(isDemoRoute);
  const lines = [
    '# LabelHub API 覆盖清单',
    '',
    `生成时间：${new Date().toISOString()}`,
    '',
    `Full Collection 接口总数：${routeDefinitions.length}`,
    `Demo Collection 接口总数：${demoRoutes.length}`,
    '',
    '## Demo Collection 主流程接口',
    '',
    '| Method | Path | Folder | Summary |',
    '| --- | --- | --- | --- |',
  ];

  for (const routeDef of demoRoutes) {
    const folder = folders.find((item) => item.id === routeDef.folder)?.name ?? routeDef.folder;
    lines.push(`| ${routeDef.method} | \`${routeDef.openapiPath}\` | ${folder} | ${routeDef.summary} |`);
  }

  lines.push('', '## Full Collection 工程覆盖接口', '', '| Method | Path | Folder | Summary |', '| --- | --- | --- | --- |');

  for (const routeDef of routeDefinitions) {
    const folder = folders.find((item) => item.id === routeDef.folder)?.name ?? routeDef.folder;
    lines.push(`| ${routeDef.method} | \`${routeDef.openapiPath}\` | ${folder} | ${routeDef.summary} |`);
  }

  lines.push('');
  lines.push('说明：Full Collection 由验证脚本反扫 controller 做覆盖校验；Demo Collection 只保留主流程交付接口。');
  return `${lines.join('\n')}\n`;
}

function toYaml(value, indent = 0) {
  const spaces = ' '.repeat(indent);

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return value.map((item) => {
      if (isScalar(item)) {
        return `${spaces}- ${formatScalar(item)}`;
      }
      return `${spaces}-\n${toYaml(item, indent + 2)}`;
    }).join('\n');
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    return entries.map(([key, entryValue]) => {
      const renderedKey = /^[A-Za-z0-9_-]+$/.test(key) ? key : JSON.stringify(key);
      if (isScalar(entryValue)) {
        return `${spaces}${renderedKey}: ${formatScalar(entryValue)}`;
      }
      return `${spaces}${renderedKey}:\n${toYaml(entryValue, indent + 2)}`;
    }).join('\n');
  }

  return `${spaces}${formatScalar(value)}`;
}

function isScalar(value) {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

function formatScalar(value) {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  return String(value);
}

await mkdir(postmanDir, { recursive: true });
const demoRouteDefinitions = routeDefinitions.filter(isDemoRoute);
await writeFile(resolve(docsDir, 'openapi.yaml'), `${toYaml(buildOpenApi())}\n`, 'utf8');
await writeFile(resolve(postmanDir, 'labelhub-demo.postman_collection.json'), `${JSON.stringify(buildCollection(
  demoRouteDefinitions,
  'LabelHub Demo API',
  'LabelHub 主流程交付 Collection。只包含演示和对外交付需要的核心接口，不包含 debug、mock、内部重试和高阶维护接口。',
), null, 2)}\n`, 'utf8');
await writeFile(resolve(postmanDir, 'labelhub-full.postman_collection.json'), `${JSON.stringify(buildCollection(
  routeDefinitions,
  'LabelHub Full API',
  'LabelHub 工程覆盖 Collection。覆盖当前 controller 的全部真实接口，用于研发自测和覆盖率校验。',
), null, 2)}\n`, 'utf8');
await rm(resolve(postmanDir, 'labelhub.postman_collection.json'), { force: true });
await writeFile(resolve(postmanDir, 'labelhub-local.postman_environment.json'), `${JSON.stringify(buildEnvironment('LabelHub Local', 'http://localhost:3000'), null, 2)}\n`, 'utf8');
await writeFile(resolve(postmanDir, 'labelhub-prod.postman_environment.json'), `${JSON.stringify(buildEnvironment('LabelHub Prod', 'http://115.190.153.31/api'), null, 2)}\n`, 'utf8');
await writeFile(resolve(postmanDir, 'README.md'), buildReadme(), 'utf8');
await writeFile(resolve(postmanDir, 'api-coverage.md'), buildCoverageMarkdown(), 'utf8');

console.log(`Generated ${demoRouteDefinitions.length} demo routes and ${routeDefinitions.length} full routes into docs/api/postman`);
