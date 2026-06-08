import { BadRequestException, NotFoundException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SchemaService } from '../schema/schema.service.ts';
import { SubmissionsService } from './submissions.service.ts';

type AssignmentStatus =
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'UNDER_RECHECK'
  | 'FINAL_PENDING'
  | 'FINAL_APPROVED'
  | 'NEEDS_REVISION'
  | 'CANCELLED';
type SubmissionStatus = 'AI_QUEUED' | 'AI_PASSED' | 'HUMAN_PENDING' | 'NEEDS_REVISION';

type ReviewRecordSummary = {
  stage?: string | null;
  reviewerType?: string | null;
  decision: string | null;
  createdAt: Date;
};

type SubmissionRecord = {
  id: string;
  assignmentId: string;
  status: SubmissionStatus;
  round: number;
  answers: Record<string, unknown>;
  schemaVersion: string;
  idempotencyKey: string | null;
  submittedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  reviewRecords?: ReviewRecordSummary[];
};

type DraftRecord = {
  id: string;
  assignmentId: string;
  answers: Record<string, unknown>;
  schemaVersion: string;
  createdAt: Date;
  updatedAt: Date;
};

type AssignmentRecord = {
  id: string;
  taskId: string;
  taskItemId: string;
  assigneeId: string;
  status: AssignmentStatus;
  claimedAt: Date;
  task: {
    id: string;
    title: string;
    aiPreReviewEnabled: boolean;
    template: {
      id: string;
      name: string;
      datasetKind: 'qa_quality' | 'preference_compare' | 'generic_json';
      schemaVersion: string;
      schema: Record<string, unknown>;
    };
  };
  taskItem: {
    id: string;
    externalId: string;
    datasetKind: 'qa_quality' | 'preference_compare' | 'generic_json';
    rawData: Record<string, unknown>;
    sortOrder: number;
  };
  submissions: SubmissionRecord[];
  drafts: DraftRecord[];
};

type MockSubmissionsPrisma = {
  task: {
    findMany: (args: { select: { id: true; createdAt: true }; orderBy: Array<{ createdAt: 'asc' } | { id: 'asc' }> }) => Promise<Array<{ id: string; createdAt: Date }>>;
  };
  assignment: {
    findUnique: (args: { where: { id: string } }) => Promise<AssignmentRecord | null>;
    findMany: (args?: { where?: Record<string, unknown>; include?: unknown }) => Promise<AssignmentRecord[]>;
    update: (args: { where: { id: string }; data: { status: AssignmentStatus } }) => Promise<AssignmentRecord>;
  };
  taskItem: {
    update: (args: { where: { id: string }; data: { status: 'COMPLETED' } }) => Promise<unknown>;
  };
  submission: {
    findFirst: (args: { where: { idempotencyKey: string } }) => Promise<SubmissionRecord | null>;
    create: (args: { data: Partial<SubmissionRecord> }) => Promise<SubmissionRecord>;
  };
  auditLog: {
    create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
  };
  aiReviewJob: {
    create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
  };
  $transaction: <TResult>(callback: (client: MockSubmissionsPrisma) => Promise<TResult>) => Promise<TResult>;
};

describe('SubmissionsService', () => {
  beforeEach(() => {
    configureAiReviewEnv();
  });

  afterEach(() => {
    restoreAiReviewEnv();
  });

  it('提交合法答案时创建 AI_QUEUED 快照、round=1 并写入审计日志', async () => {
    const { service, submissions, assignments, auditLogs, completedItems, aiReviewJobs } = createService();

    const result = await service.submit({
      assignmentId: 'assignment_1',
      actorId: 'user_labeler_li_lei',
      answers: { quality: 'pass', comment: '回答基本正确。' },
    });

    expect(result).toEqual(
      expect.objectContaining({
        id: 'submission_1',
        assignmentId: 'assignment_1',
        status: 'AI_QUEUED',
        round: 1,
        schemaVersion: 'r1',
      }),
    );
    expect(submissions).toHaveLength(1);
    expect(assignments[0].status).toBe('SUBMITTED');
    expect(completedItems).toEqual(['item_qa_1']);
    expect(auditLogs[0]).toEqual(
      expect.objectContaining({
        taskId: 'task_qa',
        submissionId: 'submission_1',
        toStatus: 'AI_QUEUED',
        actorId: 'user_labeler_li_lei',
        metadata: { action: 'SUBMISSION_CREATED', assignmentId: 'assignment_1', round: 1 },
      }),
    );
    expect(aiReviewJobs).toEqual([
      expect.objectContaining({
        submissionId: 'submission_1',
        taskId: 'task_qa',
        round: 1,
        idempotencyKey: 'submission_1:1:ai-review',
        status: 'QUEUED',
        structuredOutputMode: 'json_schema',
        provider: 'deepseek',
        model: 'deepseek-chat',
      }),
    ]);
  });

  it('AI 预审模型未配置时拒绝单题提交且不创建任何副作用', async () => {
    clearAiReviewEnv();
    const { service, submissions, assignments, auditLogs, completedItems, aiReviewJobs } = createService();

    await expect(
      service.submit({
        assignmentId: 'assignment_1',
        actorId: 'user_labeler_li_lei',
        answers: { quality: 'pass', comment: '回答基本正确。' },
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'AI_REVIEW_MODEL_NOT_CONFIGURED',
        message: '当前无法提交：AI 预审模型未配置，请检查 DEEPSEEK_API_KEY、OPENAI_API_KEY、LLM_API_KEY 或 LLM_PROVIDER。',
      }),
    });
    expect(submissions).toHaveLength(0);
    expect(assignments[0].status).toBe('IN_PROGRESS');
    expect(completedItems).toHaveLength(0);
    expect(auditLogs).toHaveLength(0);
    expect(aiReviewJobs).toHaveLength(0);
  });

  it('任务未启用 AI 预审时单题提交直接进入人工复审且不创建 AI 任务', async () => {
    clearAiReviewEnv();
    const { service, submissions, assignments, auditLogs, completedItems, aiReviewJobs } = createService({
      aiPreReviewEnabled: false,
    });

    const result = await service.submit({
      assignmentId: 'assignment_1',
      actorId: 'user_labeler_li_lei',
      answers: { quality: 'pass', comment: '关闭 AI 后直接复审。' },
    });

    expect(result).toEqual(
      expect.objectContaining({
        id: 'submission_1',
        assignmentId: 'assignment_1',
        status: 'HUMAN_PENDING',
        round: 1,
      }),
    );
    expect(submissions).toHaveLength(1);
    expect(submissions[0].status).toBe('HUMAN_PENDING');
    expect(assignments[0].status).toBe('SUBMITTED');
    expect(completedItems).toEqual(['item_qa_1']);
    expect(auditLogs[0]).toEqual(
      expect.objectContaining({
        taskId: 'task_qa',
        submissionId: 'submission_1',
        toStatus: 'HUMAN_PENDING',
        actorId: 'user_labeler_li_lei',
      }),
    );
    expect(aiReviewJobs).toHaveLength(0);
  });

  it('打回后二次提交创建 round=2，不覆盖已有提交', async () => {
    const previousSubmission = createSubmission(new Date('2026-05-21T00:00:00.000Z'), {
      id: 'submission_previous',
      status: 'NEEDS_REVISION',
      round: 1,
      answers: { quality: 'pass' },
    });
    const { service, submissions } = createService({ submissions: [previousSubmission] });

    await expect(
      service.submit({
        assignmentId: 'assignment_1',
        actorId: 'user_labeler_li_lei',
        answers: { quality: 'excellent', comment: '已补充说明。' },
      }),
    ).resolves.toMatchObject({ round: 2 });
    expect(submissions.map((submission) => submission.id)).toEqual([
      'submission_previous',
      'submission_2',
    ]);
  });

  it('重复提交相同幂等键时返回既有提交且不重复写入副作用', async () => {
    const previousSubmission = createSubmission(new Date('2026-05-21T00:00:00.000Z'), {
      id: 'submission_idempotent',
      idempotencyKey: 'submit_idem_1',
      round: 1,
    });
    const { service, submissions, auditLogs, aiReviewJobs, completedItems } = createService({
      submissions: [previousSubmission],
    });

    const result = await service.submit({
      assignmentId: 'assignment_1',
      actorId: 'user_labeler_li_lei',
      answers: { quality: 'pass', comment: '重复点击提交。' },
      idempotencyKey: 'submit_idem_1',
    });

    expect(result.id).toBe('submission_idempotent');
    expect(submissions).toHaveLength(1);
    expect(auditLogs).toHaveLength(0);
    expect(aiReviewJobs).toHaveLength(0);
    expect(completedItems).toHaveLength(0);
  });

  it('任务级提交会使用当前题答案和其他题草稿批量入队 AI 预审', async () => {
    const now = new Date('2026-05-21T00:00:00.000Z');
    const secondAssignment = createAssignment(now, {
      id: 'assignment_2',
      taskItemId: 'item_qa_2',
      sortOrder: 2,
      externalId: 'qa_2',
      status: 'IN_PROGRESS',
      drafts: [
        createDraft(now, {
          id: 'draft_2',
          assignmentId: 'assignment_2',
          answers: { quality: 'excellent', comment: '第二题已保存草稿。' },
        }),
      ],
    });
    const { service, submissions, assignments, auditLogs, completedItems, aiReviewJobs } = createService({
      assignments: [secondAssignment],
    });

    const result = await service.submitTask({
      taskId: 'task_qa',
      labelerId: 'user_labeler_li_lei',
      actorId: 'user_labeler_li_lei',
      currentAssignmentId: 'assignment_1',
      currentAnswers: { quality: 'pass', comment: '当前题答案。' },
      idempotencyKey: 'task-submit-idem',
    });

    expect(result).toEqual(
      expect.objectContaining({
        taskId: 'task_qa',
        labelerId: 'user_labeler_li_lei',
        submittedCount: 2,
      }),
    );
    expect(result.submissions.map((submission) => submission.assignmentId)).toEqual([
      'assignment_1',
      'assignment_2',
    ]);
    expect(submissions).toHaveLength(2);
    expect(submissions.map((submission) => submission.answers)).toEqual([
      { quality: 'pass', comment: '当前题答案。' },
      { quality: 'excellent', comment: '第二题已保存草稿。' },
    ]);
    expect(assignments.map((assignment) => assignment.status)).toEqual(['SUBMITTED', 'SUBMITTED']);
    expect(completedItems).toEqual(['item_qa_1', 'item_qa_2']);
    expect(auditLogs).toHaveLength(2);
    expect(aiReviewJobs.map((job) => job.submissionId)).toEqual(['submission_1', 'submission_2']);
  });

  it('AI 预审模型未配置时拒绝任务级提交且不创建任何副作用', async () => {
    clearAiReviewEnv();
    const now = new Date('2026-05-21T00:00:00.000Z');
    const secondAssignment = createAssignment(now, {
      id: 'assignment_2',
      taskItemId: 'item_qa_2',
      sortOrder: 2,
      externalId: 'qa_2',
      status: 'IN_PROGRESS',
      drafts: [
        createDraft(now, {
          id: 'draft_2',
          assignmentId: 'assignment_2',
          answers: { quality: 'excellent', comment: '第二题已保存草稿。' },
        }),
      ],
    });
    const { service, submissions, assignments, auditLogs, completedItems, aiReviewJobs } = createService({
      assignments: [secondAssignment],
    });

    await expect(
      service.submitTask({
        taskId: 'task_qa',
        labelerId: 'user_labeler_li_lei',
        actorId: 'user_labeler_li_lei',
        currentAssignmentId: 'assignment_1',
        currentAnswers: { quality: 'pass', comment: '当前题答案。' },
        idempotencyKey: 'task-submit-idem',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'AI_REVIEW_MODEL_NOT_CONFIGURED',
        message: '当前无法提交：AI 预审模型未配置，请检查 DEEPSEEK_API_KEY、OPENAI_API_KEY、LLM_API_KEY 或 LLM_PROVIDER。',
      }),
    });
    expect(submissions).toHaveLength(0);
    expect(assignments.map((assignment) => assignment.status)).toEqual(['IN_PROGRESS', 'IN_PROGRESS']);
    expect(completedItems).toHaveLength(0);
    expect(auditLogs).toHaveLength(0);
    expect(aiReviewJobs).toHaveLength(0);
  });

  it('任务未启用 AI 预审时任务级提交批量进入人工复审且不创建 AI 任务', async () => {
    clearAiReviewEnv();
    const now = new Date('2026-05-21T00:00:00.000Z');
    const secondAssignment = createAssignment(now, {
      id: 'assignment_2',
      taskItemId: 'item_qa_2',
      sortOrder: 2,
      externalId: 'qa_2',
      status: 'IN_PROGRESS',
      aiPreReviewEnabled: false,
      drafts: [
        createDraft(now, {
          id: 'draft_2',
          assignmentId: 'assignment_2',
          answers: { quality: 'excellent', comment: '第二题已保存草稿。' },
        }),
      ],
    });
    const { service, submissions, auditLogs, completedItems, aiReviewJobs } = createService({
      aiPreReviewEnabled: false,
      assignments: [secondAssignment],
    });

    const result = await service.submitTask({
      taskId: 'task_qa',
      labelerId: 'user_labeler_li_lei',
      actorId: 'user_labeler_li_lei',
      currentAssignmentId: 'assignment_1',
      currentAnswers: { quality: 'pass', comment: '当前题答案。' },
      idempotencyKey: 'task-submit-no-ai',
    });

    expect(result.submissions.map((submission) => submission.status)).toEqual([
      'HUMAN_PENDING',
      'HUMAN_PENDING',
    ]);
    expect(submissions.map((submission) => submission.status)).toEqual([
      'HUMAN_PENDING',
      'HUMAN_PENDING',
    ]);
    expect(completedItems).toEqual(['item_qa_1', 'item_qa_2']);
    expect(auditLogs.map((log) => log.toStatus)).toEqual(['HUMAN_PENDING', 'HUMAN_PENDING']);
    expect(aiReviewJobs).toHaveLength(0);
  });

  it('任务级提交遇到未保存草稿的题目时不创建任何 AI 预审任务', async () => {
    const now = new Date('2026-05-21T00:00:00.000Z');
    const secondAssignment = createAssignment(now, {
      id: 'assignment_2',
      taskItemId: 'item_qa_2',
      sortOrder: 2,
      externalId: 'qa_2',
      status: 'ASSIGNED',
      drafts: [],
    });
    const { service, submissions, auditLogs, completedItems, aiReviewJobs } = createService({
      assignments: [secondAssignment],
    });

    await expect(
      service.submitTask({
        taskId: 'task_qa',
        labelerId: 'user_labeler_li_lei',
        actorId: 'user_labeler_li_lei',
        currentAssignmentId: 'assignment_1',
        currentAnswers: { quality: 'pass', comment: '当前题答案。' },
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'TASK_SUBMISSION_DRAFT_MISSING',
      }),
    });
    expect(submissions).toHaveLength(0);
    expect(auditLogs).toHaveLength(0);
    expect(completedItems).toHaveLength(0);
    expect(aiReviewJobs).toHaveLength(0);
  });

  it('后端 Schema 校验会阻止缺必填字段提交', async () => {
    const { service } = createService();

    await expect(
      service.submit({
        assignmentId: 'assignment_1',
        actorId: 'user_labeler_li_lei',
        answers: { comment: '缺少整体质量。' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('查询我的数据和统计时按标注员、状态、数据集和题目过滤', async () => {
    const now = new Date('2026-05-21T00:00:00.000Z');
    const { service } = createService({
      assignments: [
        createAssignment(now, {
          id: 'assignment_2',
          taskItemId: 'item_pref_1',
          externalId: 'pref_1',
          datasetKind: 'preference_compare',
          submissions: [
            createSubmission(now, {
              id: 'submission_pref_1',
              assignmentId: 'assignment_2',
              status: 'AI_PASSED',
              round: 1,
              answers: { preferred: 'A' },
            }),
          ],
        }),
      ],
      submissions: [
        createSubmission(now, {
          id: 'submission_qa_1',
          status: 'NEEDS_REVISION',
          round: 1,
          answers: { quality: 'pass' },
        }),
      ],
    });

    await expect(
      service.listLabelerSubmissions({
        labelerId: 'user_labeler_li_lei',
        status: 'NEEDS_REVISION',
        datasetKind: 'qa_quality',
        itemId: 'qa_1',
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        submissionId: 'submission_qa_1',
        assignmentId: 'assignment_1',
        externalId: 'qa_1',
        status: 'NEEDS_REVISION',
        datasetKind: 'qa_quality',
      }),
    ]);
    await expect(service.getLabelerStats({ labelerId: 'user_labeler_li_lei' })).resolves.toEqual(
      expect.objectContaining({
        submittedCount: 2,
        approvedCount: 1,
        rejectedCount: 1,
        needsRevisionCount: 1,
        totalAssignments: 2,
      }),
    );
  });

  it('查询标注员工作台任务列表时返回已领取但未提交的题目', async () => {
    const now = new Date('2026-05-21T00:00:00.000Z');
    const submittedAt = new Date('2026-05-21T08:00:00.000Z');
    const { service } = createService({
      assignments: [
        createAssignment(now, {
          id: 'assignment_2',
          taskItemId: 'item_qa_2',
          sortOrder: 2,
          externalId: 'qa_2',
          status: 'ASSIGNED',
          drafts: [
            createDraft(now, {
              assignmentId: 'assignment_2',
              answers: { quality: 'excellent' },
              updatedAt: new Date('2026-05-21T08:04:00.000Z'),
            }),
          ],
          submissions: [],
        }),
      ],
      submissions: [
        createSubmission(now, {
          id: 'submission_qa_1',
          status: 'AI_QUEUED',
          round: 1,
          submittedAt,
          reviewRecords: [
            {
              stage: 'AI_PRECHECK',
              reviewerType: 'AI',
              decision: 'reject',
              createdAt: new Date('2026-05-21T08:06:00.000Z'),
            },
          ],
        }),
      ],
    });

    await expect(service.listLabelerAssignments({ labelerId: 'user_labeler_li_lei' })).resolves.toEqual([
      expect.objectContaining({
        assignmentId: 'assignment_1',
        taskId: 'task_qa',
        taskTitle: '问答质量标注',
        taskItemId: 'item_qa_1',
        taskItemSortOrder: 1,
        externalId: 'qa_1',
        status: 'IN_PROGRESS',
        latestSubmissionStatus: 'AI_QUEUED',
        latestSubmittedAt: submittedAt.toISOString(),
        latestReviewStage: 'AI_PRECHECK',
        latestReviewerType: 'AI',
        latestReviewDecision: 'reject',
        round: 1,
      }),
      expect.objectContaining({
        assignmentId: 'assignment_2',
        taskItemId: 'item_qa_2',
        taskItemSortOrder: 2,
        externalId: 'qa_2',
        status: 'ASSIGNED',
        latestSubmissionStatus: null,
        latestSubmittedAt: null,
        draftAnswers: null,
        draftUpdatedAt: '2026-05-21T08:04:00.000Z',
        round: 0,
      }),
    ]);
  });

  it('提交不存在或已取消的领取记录返回明确错误', async () => {
    const { service } = createService({
      assignments: [createAssignment(new Date('2026-05-21T00:00:00.000Z'), { id: 'assignment_cancelled', status: 'CANCELLED' })],
    });

    await expect(
      service.submit({ assignmentId: 'missing', answers: { quality: 'pass' } }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.submit({ assignmentId: 'assignment_cancelled', answers: { quality: 'pass' } }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

const AI_REVIEW_ENV_KEYS = [
  'AI_REVIEW_PROVIDER',
  'LLM_PROVIDER',
  'DEEPSEEK_API_KEY',
  'OPENAI_API_KEY',
  'LLM_API_KEY',
  'LLM_API_BASE_URL',
  'AI_REVIEW_MODEL',
  'LLM_MODEL',
] as const;
type AiReviewEnvKey = (typeof AI_REVIEW_ENV_KEYS)[number];
const ORIGINAL_AI_REVIEW_ENV = AI_REVIEW_ENV_KEYS.reduce(
  (env, key) => ({ ...env, [key]: process.env[key] }),
  {} as Record<AiReviewEnvKey, string | undefined>,
);

function configureAiReviewEnv(): void {
  clearAiReviewEnv();
  process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
  process.env.LLM_MODEL = 'deepseek-chat';
}

function clearAiReviewEnv(): void {
  for (const key of AI_REVIEW_ENV_KEYS) {
    delete process.env[key];
  }
}

function restoreAiReviewEnv(): void {
  for (const key of AI_REVIEW_ENV_KEYS) {
    const value = ORIGINAL_AI_REVIEW_ENV[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function createService(
  overrides: {
    assignments?: AssignmentRecord[];
    aiPreReviewEnabled?: boolean;
    submissions?: SubmissionRecord[];
  } = {},
) {
  const now = new Date('2026-05-21T00:00:00.000Z');
  const assignments: AssignmentRecord[] = [
    createAssignment(now, {
      aiPreReviewEnabled: overrides.aiPreReviewEnabled,
      submissions: overrides.submissions ?? [],
    }),
    ...(overrides.assignments ?? []),
  ];
  const submissions = assignments.flatMap((assignment) => assignment.submissions);
  const completedItems: string[] = [];
  const auditLogs: Array<Record<string, unknown>> = [];
  const aiReviewJobs: Array<Record<string, unknown>> = [];

  const prisma: MockSubmissionsPrisma = {
    task: {
      findMany: async () => {
        const taskById = new Map<string, { id: string; createdAt: Date }>();
        for (const assignment of assignments) {
          taskById.set(assignment.taskId, {
            id: assignment.taskId,
            createdAt: now,
          });
        }

        return [...taskById.values()].sort((first, second) =>
          first.createdAt.getTime() === second.createdAt.getTime()
            ? first.id.localeCompare(second.id)
            : first.createdAt.getTime() - second.createdAt.getTime(),
        );
      },
    },
    assignment: {
      findUnique: async ({ where }) => assignments.find((assignment) => assignment.id === where.id) ?? null,
      findMany: async (args) =>
        assignments.filter(
          (assignment) =>
            (args?.where?.assigneeId === undefined || assignment.assigneeId === args.where.assigneeId) &&
            (args?.where?.taskId === undefined || assignment.taskId === args.where.taskId),
        ),
      update: async ({ where, data }) => {
        const assignment = assignments.find((candidate) => candidate.id === where.id);
        if (!assignment) {
          throw new Error('assignment missing');
        }

        assignment.status = data.status;
        return assignment;
      },
    },
    taskItem: {
      update: async ({ where }) => {
        completedItems.push(where.id);
        return {};
      },
    },
    submission: {
      findFirst: async ({ where }) =>
        submissions.find((submission) => submission.idempotencyKey === where.idempotencyKey) ?? null,
      create: async ({ data }) => {
        const assignment = assignments.find((candidate) => candidate.id === data.assignmentId);
        if (!assignment) {
          throw new Error('assignment missing');
        }

        const submission = createSubmission(now, {
          id: `submission_${submissions.length + 1}`,
          assignmentId: String(data.assignmentId),
          status: (data.status as SubmissionStatus | undefined) ?? 'AI_QUEUED',
          round: Number(data.round),
          answers: data.answers as Record<string, unknown>,
          schemaVersion: String(data.schemaVersion),
          idempotencyKey: (data.idempotencyKey as string | null | undefined) ?? null,
        });
        submissions.push(submission);
        assignment.submissions.push(submission);
        return submission;
      },
    },
    auditLog: {
      create: async ({ data }) => {
        auditLogs.push(data);
        return data;
      },
    },
    aiReviewJob: {
      create: async ({ data }) => {
        aiReviewJobs.push(data);
        return data;
      },
    },
    $transaction: async <TResult>(callback: (client: MockSubmissionsPrisma) => Promise<TResult>) =>
      callback(prisma),
  };

  return {
    assignments,
    auditLogs,
    aiReviewJobs,
    completedItems,
    service: new SubmissionsService(prisma, new SchemaService()),
    submissions,
  };
}

function createAssignment(
  now: Date,
  input: {
    id?: string;
    status?: AssignmentStatus;
    taskItemId?: string;
    sortOrder?: number;
    externalId?: string;
    datasetKind?: 'qa_quality' | 'preference_compare' | 'generic_json';
    aiPreReviewEnabled?: boolean;
    submissions?: SubmissionRecord[];
    drafts?: DraftRecord[];
  } = {},
): AssignmentRecord {
  const datasetKind = input.datasetKind ?? 'qa_quality';

  return {
    id: input.id ?? 'assignment_1',
    taskId: datasetKind === 'qa_quality' ? 'task_qa' : 'task_preference',
    taskItemId: input.taskItemId ?? 'item_qa_1',
    assigneeId: 'user_labeler_li_lei',
    status: input.status ?? 'IN_PROGRESS',
    claimedAt: now,
    task: {
      id: datasetKind === 'qa_quality' ? 'task_qa' : 'task_preference',
      title: datasetKind === 'qa_quality' ? '问答质量标注' : '偏好对比标注',
      aiPreReviewEnabled: input.aiPreReviewEnabled ?? true,
      template: {
        id: datasetKind === 'qa_quality' ? 'template_qa' : 'template_preference',
        name: datasetKind === 'qa_quality' ? '问答质量官方模板' : '偏好对比官方模板',
        datasetKind,
        schemaVersion: 'r1',
        schema: createSchema(datasetKind),
      },
    },
    taskItem: {
      id: input.taskItemId ?? 'item_qa_1',
      externalId: input.externalId ?? 'qa_1',
      datasetKind,
      rawData: { prompt: '如何判断回答质量？', model_answer: '检查事实性。' },
      sortOrder: input.sortOrder ?? 1,
    },
    submissions: input.submissions ?? [],
    drafts: input.drafts ?? [],
  };
}

function createSubmission(
  now: Date,
  input: Partial<SubmissionRecord> = {},
): SubmissionRecord {
  return {
    id: input.id ?? 'submission_1',
    assignmentId: input.assignmentId ?? 'assignment_1',
    status: input.status ?? 'AI_QUEUED',
    round: input.round ?? 1,
    answers: input.answers ?? { quality: 'pass' },
    schemaVersion: input.schemaVersion ?? 'r1',
    idempotencyKey: input.idempotencyKey ?? null,
    submittedAt: input.submittedAt ?? now,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    reviewRecords: input.reviewRecords ?? [],
  };
}

function createDraft(
  now: Date,
  input: Partial<DraftRecord> & { assignmentId: string },
): DraftRecord {
  return {
    id: input.id ?? `draft_${input.assignmentId}`,
    assignmentId: input.assignmentId,
    answers: input.answers ?? { quality: 'pass' },
    schemaVersion: input.schemaVersion ?? 'r1',
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}

function createSchema(datasetKind: AssignmentRecord['task']['template']['datasetKind']) {
  if (datasetKind === 'preference_compare') {
    return {
      schemaVersion: 'r1',
      datasetKind,
      fields: [
        {
          key: 'preferred',
          type: 'radio',
          label: '更优回答',
          required: true,
          options: [
            { label: '回答 A', value: 'A' },
            { label: '回答 B', value: 'B' },
          ],
        },
      ],
    };
  }

  return {
    schemaVersion: 'r1',
    datasetKind,
    fields: [
      {
        key: 'quality',
        type: 'radio',
        label: '整体质量',
        required: true,
        options: [
          { label: '合格', value: 'pass' },
          { label: '优秀', value: 'excellent' },
        ],
      },
      {
        key: 'comment',
        type: 'textarea',
        label: '审核意见',
      },
    ],
  };
}
