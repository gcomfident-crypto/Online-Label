import 'dotenv/config';

import { fileURLToPath } from 'node:url';

import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  createLabelHubSchema,
  type DatasetKind,
  type LabelHubSchema,
} from '@labelhub/shared';

type SeedUser = {
  id: string;
  name: string;
  role: 'OWNER' | 'LABELER' | 'REVIEWER' | 'AI_AGENT';
};

type SeedTemplate = {
  id: string;
  name: string;
  description: string;
  datasetKind: DatasetKind;
  schemaVersion: string;
  schema: Prisma.InputJsonValue;
  status: 'PUBLISHED';
  version: number;
  publishedAt: Date;
  createdById: string;
};

type SeedTask = {
  id: string;
  title: string;
  description: string;
  richTextInstruction: string;
  tags: string[];
  rewardRule: string;
  rewardPerItem: number;
  perUserLimit: number;
  quota: number;
  deadline: Date;
  distributionStrategy: 'FIRST_COME_FIRST_SERVE';
  aiPreReviewEnabled: boolean;
  aiRuleName: string | null;
  status: 'PUBLISHED';
  templateId: string;
  createdById: string;
};

type SeedTaskItem = {
  id: string;
  taskId: string;
  externalId: string;
  datasetKind: DatasetKind;
  rawData: Prisma.InputJsonValue;
  status: 'UNASSIGNED' | 'ASSIGNED' | 'COMPLETED';
  sortOrder: number;
};

export type SeedData = {
  users: SeedUser[];
  templates: SeedTemplate[];
  tasks: SeedTask[];
  taskItems: SeedTaskItem[];
  reviewRules: Prisma.ReviewRuleUncheckedCreateInput[];
  assignments: Prisma.AssignmentUncheckedCreateInput[];
  submissions: Prisma.SubmissionUncheckedCreateInput[];
  aiReviewJobs: Prisma.AiReviewJobUncheckedCreateInput[];
  reviewRecords: Prisma.ReviewRecordUncheckedCreateInput[];
  auditLogs: Prisma.AuditLogUncheckedCreateInput[];
  exportJobs: Prisma.ExportJobUncheckedCreateInput[];
};

export const SEED_USER_IDS = [
  'user_owner_zhang_man',
  'user_labeler_li_lei',
  'user_labeler_han_mei_mei',
  'user_reviewer_wang_fang',
  'user_ai_agent_system',
] as const;

export const SEED_TEMPLATE_IDS = [
  'template_qa_quality_official_draft',
  'template_preference_compare_official_draft',
] as const;

export const SEED_TASK_IDS = [
  'task_qa_quality_demo',
  'task_preference_compare_demo',
] as const;

const SCHEMA_VERSION = '2026-05-21.1';
const SEED_PUBLISHED_AT = new Date('2026-05-21T00:00:00.000Z');
const DEMO_TIME = new Date('2026-05-21T10:00:00.000Z');
const DEFAULT_DATABASE_URL =
  'postgresql://labelhub:labelhub_password@localhost:5432/labelhub?schema=public';

export function buildSeedData(): SeedData {
  const users: SeedUser[] = [
    { id: SEED_USER_IDS[0], name: '张泽鑫', role: 'OWNER' },
    { id: SEED_USER_IDS[1], name: '王昱阳', role: 'LABELER' },
    { id: SEED_USER_IDS[2], name: '侯士康', role: 'LABELER' },
    { id: SEED_USER_IDS[3], name: '鑫泽张', role: 'REVIEWER' },
    { id: SEED_USER_IDS[4], name: '系统机审账号', role: 'AI_AGENT' },
  ];

  return {
    users,
    templates: [],
    tasks: [],
    taskItems: [],
    reviewRules: [],
    assignments: [],
    submissions: [],
    aiReviewJobs: [],
    reviewRecords: [],
    auditLogs: [],
    exportJobs: [],
  };
}

export async function seed(prisma = createPrismaClient()): Promise<void> {
  const data = buildSeedData();

  for (const user of data.users) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: {
        name: user.name,
        role: user.role,
      },
      create: user,
    });
  }

  for (const template of data.templates) {
    await prisma.taskTemplate.upsert({
      where: { id: template.id },
      update: {
        name: template.name,
        description: template.description,
        datasetKind: template.datasetKind,
        schemaVersion: template.schemaVersion,
        schema: template.schema,
        status: template.status,
        version: template.version,
        publishedAt: template.publishedAt,
        createdById: template.createdById,
      },
      create: template,
    });
  }

  for (const task of data.tasks) {
    await prisma.task.upsert({
      where: { id: task.id },
      update: {
        title: task.title,
        description: task.description,
        richTextInstruction: task.richTextInstruction,
        tags: task.tags,
        rewardRule: task.rewardRule,
        rewardPerItem: task.rewardPerItem,
        perUserLimit: task.perUserLimit,
        quota: task.quota,
        deadline: task.deadline,
        distributionStrategy: task.distributionStrategy,
        aiPreReviewEnabled: task.aiPreReviewEnabled,
        aiRuleName: task.aiRuleName,
        status: task.status,
        templateId: task.templateId,
        createdById: task.createdById,
      },
      create: task,
    });
  }

  for (const item of data.taskItems) {
    await prisma.taskItem.upsert({
      where: {
        taskId_externalId: {
          taskId: item.taskId,
          externalId: item.externalId,
        },
      },
      update: {
        datasetKind: item.datasetKind,
        rawData: item.rawData,
        status: item.status,
        sortOrder: item.sortOrder,
      },
      create: item,
    });
  }

  for (const rule of data.reviewRules) {
    await prisma.reviewRule.upsert({
      where: { id: rule.id },
      update: {
        taskId: rule.taskId,
        stage: rule.stage,
        name: rule.name,
        promptTemplate: rule.promptTemplate,
        promptVersion: rule.promptVersion,
        dimensions: rule.dimensions,
        dimensionVersion: rule.dimensionVersion,
        passThreshold: rule.passThreshold,
        manualThreshold: rule.manualThreshold,
        provider: rule.provider,
        model: rule.model,
        temperature: rule.temperature,
        config: rule.config,
        enabled: rule.enabled,
        createdById: rule.createdById,
      },
      create: rule,
    });
  }

  for (const assignment of data.assignments) {
    await prisma.assignment.upsert({
      where: { id: assignment.id },
      update: {
        taskId: assignment.taskId,
        taskItemId: assignment.taskItemId,
        assigneeId: assignment.assigneeId,
        status: assignment.status,
        claimedAt: assignment.claimedAt,
      },
      create: assignment,
    });
  }

  for (const submission of data.submissions) {
    await prisma.submission.upsert({
      where: { id: submission.id },
      update: {
        assignmentId: submission.assignmentId,
        status: submission.status,
        round: submission.round,
        answers: submission.answers,
        schemaVersion: submission.schemaVersion,
        idempotencyKey: submission.idempotencyKey,
        submittedAt: submission.submittedAt,
      },
      create: submission,
    });
  }

  for (const job of data.aiReviewJobs) {
    await prisma.aiReviewJob.upsert({
      where: { id: job.id },
      update: {
        submissionId: job.submissionId,
        taskId: job.taskId,
        round: job.round,
        idempotencyKey: job.idempotencyKey,
        status: job.status,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        structuredOutputMode: job.structuredOutputMode,
        provider: job.provider,
        model: job.model,
        lastError: job.lastError,
        logs: job.logs,
        queuedAt: job.queuedAt,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
      },
      create: job,
    });
  }

  for (const record of data.reviewRecords) {
    await prisma.reviewRecord.upsert({
      where: { id: record.id },
      update: {
        submissionId: record.submissionId,
        ruleId: record.ruleId,
        stage: record.stage,
        reviewerId: record.reviewerId,
        assignedReviewerId: record.assignedReviewerId,
        reviewerType: record.reviewerType,
        scores: record.scores,
        decision: record.decision,
        comment: record.comment,
        revisedAnswers: record.revisedAnswers,
        rawPrompt: record.rawPrompt,
        rawOutput: record.rawOutput,
        structuredOutput: record.structuredOutput,
        modelMetadata: record.modelMetadata,
        retryCount: record.retryCount,
        idempotencyKey: record.idempotencyKey,
      },
      create: record,
    });
  }

  for (const auditLog of data.auditLogs) {
    await prisma.auditLog.upsert({
      where: { id: auditLog.id },
      update: {
        taskId: auditLog.taskId,
        submissionId: auditLog.submissionId,
        fromStatus: auditLog.fromStatus,
        toStatus: auditLog.toStatus,
        actorId: auditLog.actorId,
        reason: auditLog.reason,
        metadata: auditLog.metadata,
      },
      create: auditLog,
    });
  }

  for (const exportJob of data.exportJobs) {
    await prisma.exportJob.upsert({
      where: { id: exportJob.id },
      update: {
        taskId: exportJob.taskId,
        requestedById: exportJob.requestedById,
        status: exportJob.status,
        format: exportJob.format,
        idempotencyKey: exportJob.idempotencyKey,
        fieldMapping: exportJob.fieldMapping,
        includeReviews: exportJob.includeReviews,
        filters: exportJob.filters,
        filePath: exportJob.filePath,
        resultUrl: exportJob.resultUrl,
        errorMessage: exportJob.errorMessage,
        finishedAt: exportJob.finishedAt,
      },
      create: exportJob,
    });
  }
}

export function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg(resolveDatabaseUrl()),
  });
}

function resolveDatabaseUrl(): string {
  return process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function createQaQualitySchema(): LabelHubSchema {
  return createLabelHubSchema({
    schemaVersion: SCHEMA_VERSION,
    datasetKind: 'qa_quality',
    fields: [
      {
        key: 'quality',
        type: 'radio',
        label: '整体质量',
        options: [
          { label: '优秀', value: 'excellent' },
          { label: '合格', value: 'pass' },
          { label: '需修改', value: 'needs_revision' },
        ],
        validation: { required: true },
      },
      {
        key: 'issues',
        type: 'checkbox',
        label: '问题类型',
        options: [
          { label: '事实错误', value: 'factual_error' },
          { label: '遗漏关键信息', value: 'missing_key_info' },
          { label: '表达不清', value: 'unclear' },
          { label: '格式不符合要求', value: 'format_issue' },
        ],
      },
      {
        key: 'comment',
        type: 'textarea',
        label: '审核意见',
        placeholder: '说明判断依据或需要修订的内容',
      },
    ],
  });
}

function createPreferenceCompareSchema(): LabelHubSchema {
  return createLabelHubSchema({
    schemaVersion: SCHEMA_VERSION,
    datasetKind: 'preference_compare',
    fields: [
      {
        key: 'preferred',
        type: 'radio',
        label: '更优回答',
        options: [
          { label: '回答 A', value: 'A' },
          { label: '回答 B', value: 'B' },
          { label: '质量相当', value: 'tie' },
        ],
        validation: { required: true },
      },
      {
        key: 'preference_reason',
        type: 'checkbox',
        label: '选择依据',
        options: [
          { label: '更准确', value: 'more_accurate' },
          { label: '更完整', value: 'more_complete' },
          { label: '更易读', value: 'more_readable' },
          { label: '更安全', value: 'safer' },
        ],
      },
      {
        key: 'comment',
        type: 'textarea',
        label: '对比说明',
        placeholder: '简要说明偏好判断',
      },
    ],
  });
}

function createQaQualityItems(): SeedTaskItem[] {
  return Array.from({ length: 30 }, (_, index) => {
    const itemNumber = index + 1;
    const externalId = `qa_quality_${String(itemNumber).padStart(2, '0')}`;

    return {
      id: `item_${externalId}`,
      taskId: SEED_TASK_IDS[0],
      externalId,
      datasetKind: 'qa_quality',
      status: itemNumber === 1 ? 'COMPLETED' : 'UNASSIGNED',
      sortOrder: itemNumber,
      rawData: toPrismaJson({
        id: externalId,
        prompt: `用户问题 ${itemNumber}：如何判断回答是否解决了核心诉求？`,
        model_answer: `示例回答 ${itemNumber}：先确认问题目标，再检查事实依据、步骤完整性和表达清晰度。`,
        expected_dimensions: ['事实准确', '信息完整', '表达清晰', '无安全风险'],
        reference: `参考要点 ${itemNumber}：覆盖事实性、完整性、清晰度和安全边界。`,
        tags: ['问答质量', '演示数据'],
      }),
    };
  });
}

function createPreferenceCompareItems(): SeedTaskItem[] {
  return Array.from({ length: 12 }, (_, index) => {
    const itemNumber = index + 1;
    const externalId = `preference_compare_${String(itemNumber).padStart(2, '0')}`;

    return {
      id: `item_${externalId}`,
      taskId: SEED_TASK_IDS[1],
      externalId,
      datasetKind: 'preference_compare',
      status: itemNumber === 1 ? 'ASSIGNED' : 'UNASSIGNED',
      sortOrder: itemNumber,
      rawData: toPrismaJson({
        id: externalId,
        prompt: `对比题 ${itemNumber}：请给新用户解释 LabelHub 的任务草稿状态。`,
        response_a: `回答 A-${itemNumber}：草稿状态表示任务仍可编辑，尚未正式发布给标注员。`,
        response_b: `回答 B-${itemNumber}：草稿通常代表任务未发布，可以继续调整模板、题目和说明。`,
        dimensions: ['准确性', '完整性', '可读性', '安全性'],
        safety_flag: false,
      }),
    };
  });
}

function createReviewRules(): Prisma.ReviewRuleUncheckedCreateInput[] {
  return [
    {
      id: 'rule_qa_quality_ai_precheck',
      taskId: SEED_TASK_IDS[0],
      stage: 'AI_PRECHECK',
      name: '问答质量 AI 预审规则',
      promptTemplate: '请从事实性、完整性、表达质量和安全性四个维度审核问答质量，并输出结构化 JSON。',
      promptVersion: 1,
      dimensions: toPrismaJson(['事实性', '完整性', '表达质量', '安全性']),
      dimensionVersion: 1,
      passThreshold: 80,
      manualThreshold: 60,
      provider: 'deepseek',
      model: 'deepseek-chat',
      temperature: 0,
      config: toPrismaJson({ structuredOutputMode: 'json_schema' }),
      enabled: true,
      createdById: SEED_USER_IDS[0],
    },
    {
      id: 'rule_preference_compare_ai_precheck',
      taskId: SEED_TASK_IDS[1],
      stage: 'AI_PRECHECK',
      name: '偏好对比 AI 预审规则',
      promptTemplate: '请检查 A/B 偏好结论是否与理由一致，并输出结构化 JSON。',
      promptVersion: 1,
      dimensions: toPrismaJson(['偏好一致性', '理由充分性', '安全性']),
      dimensionVersion: 1,
      passThreshold: 80,
      manualThreshold: 60,
      provider: 'deepseek',
      model: 'deepseek-chat',
      temperature: 0,
      config: toPrismaJson({ structuredOutputMode: 'json_schema' }),
      enabled: true,
      createdById: SEED_USER_IDS[0],
    },
  ];
}

function createDemoAssignments(): Prisma.AssignmentUncheckedCreateInput[] {
  return [
    {
      id: 'assignment_qa_quality_final_demo',
      taskId: SEED_TASK_IDS[0],
      taskItemId: 'item_qa_quality_01',
      assigneeId: SEED_USER_IDS[1],
      status: 'FINAL_PENDING',
      claimedAt: DEMO_TIME,
    },
    {
      id: 'assignment_preference_pending_demo',
      taskId: SEED_TASK_IDS[1],
      taskItemId: 'item_preference_compare_01',
      assigneeId: SEED_USER_IDS[1],
      status: 'SUBMITTED',
      claimedAt: DEMO_TIME,
    },
  ];
}

function createDemoSubmissions(): Prisma.SubmissionUncheckedCreateInput[] {
  return [
    {
      id: 'submission_qa_quality_round1_demo',
      assignmentId: 'assignment_qa_quality_final_demo',
      status: 'NEEDS_REVISION',
      round: 1,
      answers: toPrismaJson({
        quality: 'pass',
        issues: ['missing_key_info'],
        comment: '回答覆盖了核心事实，但缺少安全边界说明。',
      }),
      schemaVersion: SCHEMA_VERSION,
      idempotencyKey: 'demo:qa_quality:round1',
      submittedAt: new Date('2026-05-21T10:05:00.000Z'),
    },
    {
      id: 'submission_qa_quality_round2_demo',
      assignmentId: 'assignment_qa_quality_final_demo',
      status: 'FINAL_APPROVED',
      round: 2,
      answers: toPrismaJson({
        quality: 'excellent',
        issues: [],
        comment: '已补充事实依据、完整性说明和安全边界。',
      }),
      schemaVersion: SCHEMA_VERSION,
      idempotencyKey: 'demo:qa_quality:round2',
      submittedAt: new Date('2026-05-21T10:25:00.000Z'),
    },
    {
      id: 'submission_preference_pending_demo',
      assignmentId: 'assignment_preference_pending_demo',
      status: 'HUMAN_PENDING',
      round: 1,
      answers: toPrismaJson({
        preferred: 'B',
        preference_reason: ['more_complete', 'more_readable'],
        comment: '回答 B 解释了草稿可编辑和未发布两个关键点。',
      }),
      schemaVersion: SCHEMA_VERSION,
      idempotencyKey: 'demo:preference_compare:round1',
      submittedAt: new Date('2026-05-21T10:35:00.000Z'),
    },
  ];
}

function createDemoAiReviewJobs(): Prisma.AiReviewJobUncheckedCreateInput[] {
  return [
    {
      id: 'ai_job_qa_quality_round2_demo',
      submissionId: 'submission_qa_quality_round2_demo',
      taskId: SEED_TASK_IDS[0],
      round: 2,
      idempotencyKey: 'demo:qa_quality:round2:ai-review',
      status: 'SUCCEEDED',
      attempts: 1,
      maxAttempts: 3,
      structuredOutputMode: 'json_schema',
      provider: 'deepseek',
      model: 'deepseek-chat',
      lastError: null,
      logs: toPrismaJson([{ level: 'info', message: 'AI 预审通过。' }]),
      queuedAt: new Date('2026-05-21T10:25:03.000Z'),
      startedAt: new Date('2026-05-21T10:25:05.000Z'),
      finishedAt: new Date('2026-05-21T10:25:07.000Z'),
    },
    {
      id: 'ai_job_preference_pending_demo',
      submissionId: 'submission_preference_pending_demo',
      taskId: SEED_TASK_IDS[1],
      round: 1,
      idempotencyKey: 'demo:preference_compare:round1:ai-review',
      status: 'MANUAL_FALLBACK',
      attempts: 3,
      maxAttempts: 3,
      structuredOutputMode: 'json_schema',
      provider: 'deepseek',
      model: 'deepseek-chat',
      lastError: 'Mock AI 连续三次返回需人工确认，已转人工复审。',
      logs: toPrismaJson([{ level: 'warn', message: '触发人工兜底。' }]),
      queuedAt: new Date('2026-05-21T10:35:03.000Z'),
      startedAt: new Date('2026-05-21T10:35:05.000Z'),
      finishedAt: new Date('2026-05-21T10:35:09.000Z'),
    },
  ];
}

function createDemoReviewRecords(): Prisma.ReviewRecordUncheckedCreateInput[] {
  return [
    createReviewRecord({
      id: 'review_qa_quality_round1_reject_demo',
      submissionId: 'submission_qa_quality_round1_demo',
      stage: 'RECHECK',
      reviewerType: 'HUMAN',
      reviewerId: SEED_USER_IDS[3],
      decision: 'reject',
      comment: '事实性依据不足，需要补充说明。',
      scores: { overall: 62 },
      idempotencyKey: 'demo:qa_quality:round1:human-reject',
    }),
    createReviewRecord({
      id: 'review_qa_quality_round2_ai_demo',
      submissionId: 'submission_qa_quality_round2_demo',
      ruleId: 'rule_qa_quality_ai_precheck',
      stage: 'AI_PRECHECK',
      reviewerType: 'AI',
      decision: 'pass',
      comment: '结构化评分通过，建议进入人工复审。',
      scores: { overall: 91, factuality: 92, completeness: 88, safety: 95 },
      idempotencyKey: 'demo:qa_quality:round2:ai-record',
      modelMetadata: { provider: 'deepseek', model: 'deepseek-chat', totalTokens: 128 },
    }),
    createReviewRecord({
      id: 'review_qa_quality_round2_pass_demo',
      submissionId: 'submission_qa_quality_round2_demo',
      stage: 'RECHECK',
      reviewerType: 'HUMAN',
      reviewerId: SEED_USER_IDS[3],
      decision: 'recheck_pass',
      comment: '二次提交已满足要求，进入终审。',
      scores: { overall: 90 },
      idempotencyKey: 'demo:qa_quality:round2:human-pass',
    }),
    createReviewRecord({
      id: 'review_qa_quality_round2_final_demo',
      submissionId: 'submission_qa_quality_round2_demo',
      stage: 'FINAL',
      reviewerType: 'HUMAN',
      reviewerId: SEED_USER_IDS[3],
      decision: 'final_pass',
      comment: '终审通过，可进入导出。',
      scores: { overall: 94 },
      idempotencyKey: 'demo:qa_quality:round2:final-pass',
    }),
    createReviewRecord({
      id: 'review_preference_round1_ai_demo',
      submissionId: 'submission_preference_pending_demo',
      ruleId: 'rule_preference_compare_ai_precheck',
      stage: 'AI_PRECHECK',
      reviewerType: 'AI',
      decision: 'manual',
      comment: '偏好理由需要人工确认，已转人工兜底。',
      scores: { overall: 68, consistency: 72, safety: 90 },
      idempotencyKey: 'demo:preference_compare:round1:ai-record',
      modelMetadata: { provider: 'deepseek', model: 'deepseek-chat', totalTokens: 112 },
    }),
  ];
}

function createReviewRecord(input: {
  id: string;
  submissionId: string;
  ruleId?: string;
  stage: 'AI_PRECHECK' | 'RECHECK' | 'FINAL';
  reviewerType: 'AI' | 'HUMAN';
  reviewerId?: string;
  decision: string;
  comment: string;
  scores: Record<string, number>;
  idempotencyKey: string;
  modelMetadata?: Record<string, unknown>;
}): Prisma.ReviewRecordUncheckedCreateInput {
  return {
    id: input.id,
    submissionId: input.submissionId,
    ruleId: input.ruleId,
    stage: input.stage,
    reviewerId: input.reviewerId,
    assignedReviewerId: input.reviewerType === 'HUMAN' ? input.reviewerId : SEED_USER_IDS[3],
    reviewerType: input.reviewerType,
    scores: toPrismaJson(input.scores),
    decision: input.decision,
    comment: input.comment,
    revisedAnswers: toPrismaJson({}),
    rawPrompt: input.reviewerType === 'AI' ? '请按官方规则输出结构化审核 JSON。' : null,
    rawOutput: input.reviewerType === 'AI' ? '{"verdict":"pass"}' : null,
    structuredOutput: toPrismaJson({ verdict: input.decision, reason: input.comment }),
    modelMetadata: toPrismaJson(input.modelMetadata ?? {}),
    retryCount: input.decision === 'manual' ? 2 : 0,
    idempotencyKey: input.idempotencyKey,
  };
}

function createDemoAuditLogs(): Prisma.AuditLogUncheckedCreateInput[] {
  return [
    createAuditLog('audit_qa_round1_reject_demo', 'submission_qa_quality_round1_demo', 'HUMAN_PENDING', 'NEEDS_REVISION', '人工复审打回。'),
    createAuditLog('audit_qa_round2_recheck_pass_demo', 'submission_qa_quality_round2_demo', 'HUMAN_PENDING', 'FINAL_PENDING', '人工复审通过，进入终审。'),
    createAuditLog('audit_qa_round2_final_pass_demo', 'submission_qa_quality_round2_demo', 'FINAL_PENDING', 'FINAL_APPROVED', '终审通过。'),
    createAuditLog('audit_preference_manual_demo', 'submission_preference_pending_demo', 'AI_REVIEWING', 'HUMAN_PENDING', 'AI 转人工兜底。'),
  ];
}

function createAuditLog(
  id: string,
  submissionId: string,
  fromStatus: string,
  toStatus: string,
  reason: string,
): Prisma.AuditLogUncheckedCreateInput {
  return {
    id,
    taskId: submissionId.includes('preference') ? SEED_TASK_IDS[1] : SEED_TASK_IDS[0],
    submissionId,
    fromStatus,
    toStatus,
    actorId: toStatus === 'HUMAN_PENDING' ? SEED_USER_IDS[4] : SEED_USER_IDS[3],
    reason,
    metadata: toPrismaJson({ source: 'demo_seed' }),
  };
}

function createDemoExportJobs(): Prisma.ExportJobUncheckedCreateInput[] {
  return [
    {
      id: 'export_qa_quality_json_demo',
      taskId: SEED_TASK_IDS[0],
      requestedById: SEED_USER_IDS[0],
      status: 'SUCCEEDED',
      format: 'json',
      idempotencyKey: 'demo:qa_quality:export:json',
      fieldMapping: toPrismaJson([
        { source: 'rawData.id', target: 'id', enabled: true },
        { source: 'rawData.prompt', target: 'prompt', enabled: true },
        { source: 'answers.comment', target: 'comment', enabled: true },
        { source: 'review.human_verdict', target: 'human_verdict', enabled: true },
      ]),
      includeReviews: true,
      filters: toPrismaJson({ status: 'FINAL_APPROVED' }),
      filePath: 'storage/exports/demo-qa-quality.json',
      resultUrl: null,
      errorMessage: null,
      finishedAt: new Date('2026-05-21T10:45:00.000Z'),
    },
  ];
}

function isDirectRun(moduleUrl: string, argvPath?: string): boolean {
  if (!argvPath) {
    return false;
  }

  return fileURLToPath(moduleUrl) === argvPath;
}

if (isDirectRun(import.meta.url, process.argv[1])) {
  const prisma = createPrismaClient();

  seed(prisma)
    .then(async () => {
      await prisma.$disconnect();
      console.log('LabelHub seed 数据已写入。');
    })
    .catch(async (error: unknown) => {
      await prisma.$disconnect();
      console.error(error);
      process.exitCode = 1;
    });
}
