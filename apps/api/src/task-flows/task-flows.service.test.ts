import { describe, expect, it, vi } from 'vitest';

import { TaskFlowsService } from './task-flows.service.ts';

const baseTime = new Date('2026-05-21T10:00:00.000Z');

describe('TaskFlowsService', () => {
  it('按任务级口径返回 5 个主流程节点和对应操作人时间', async () => {
    const task = createTask({
      items: Array.from({ length: 10 }, (_, index) => createItem(index + 1, {
        currentAiDecision: index < 2 ? 'pass' : 'reject',
        currentRound: 2,
        previousHumanDecision: index < 8 ? 'reject' : 'pass',
      })),
    });
    const service = createService([task]);

    const flows = await service.listTaskFlows();
    const detail = await service.getTaskFlow('task_model_compare_json');

    expect(flows).toHaveLength(1);
    expect(flows[0]).toMatchObject({
      taskId: 'task_model_compare_json',
      taskTitle: '模型对比 json',
      round: 2,
      currentStage: 'HUMAN_RE_REVIEW',
      totalItems: 10,
      submittedItems: 10,
      aiSummary: {
        completed: 10,
        passed: 2,
        rejected: 8,
      },
      reviewerSummary: {
        pending: 10,
        decided: 0,
      },
      finalSummary: {
        completed: 0,
        notCompleted: 10,
      },
    });
    expect(detail.lifecycleSteps).toEqual([
      expect.objectContaining({
        key: 'OWNER_PUBLISHED',
        label: 'Owner 发布',
        status: 'COMPLETED',
        actorRole: 'OWNER',
        actorName: '张泽鑫',
        occurredAt: '2026-05-20T09:00:00.000Z',
      }),
      expect.objectContaining({
        key: 'LABELER_SUBMITTED',
        label: 'Labeler 标注',
        status: 'COMPLETED',
        actorRole: 'LABELER',
        actorName: '王昱阳',
      }),
      expect.objectContaining({
        key: 'AI_PRECHECK',
        label: 'AI Agent 预审',
        status: 'COMPLETED',
        actorRole: 'AI_AGENT',
        actorName: 'AI Agent',
      }),
      expect.objectContaining({
        key: 'REVIEWER_CHECK',
        label: 'Reviewer 检查',
        status: 'CURRENT',
        actorRole: 'REVIEWER',
      }),
      expect.objectContaining({
        key: 'TASK_COMPLETED',
        label: '任务完成',
        status: 'PENDING',
        actorRole: null,
        actorName: null,
        occurredAt: null,
      }),
    ]);
    expect(detail.items).toHaveLength(10);
    expect(detail.items.map((item) => item.taskItem.externalId)).toEqual([
      'P0001',
      'P0002',
      'P0003',
      'P0004',
      'P0005',
      'P0006',
      'P0007',
      'P0008',
      'P0009',
      'P0010',
    ]);
    expect(detail.items[0]?.aiReview?.structuredOutput).toEqual({
      fieldReviews: [
        {
          fieldKey: 'comment',
          label: '对比说明',
          score: 94,
        },
      ],
    });
  });

  it('只有上一轮被 Reviewer 打回的题会显示 Labeler 已修改', async () => {
    const task = createTask({
      items: [
        createItem(1, { currentAiDecision: 'pass', currentRound: 2, previousHumanDecision: 'reject' }),
        createItem(2, { currentAiDecision: 'pass', currentRound: 2, previousHumanDecision: 'pass' }),
      ],
    });
    const service = createService([task]);

    const detail = await service.getTaskFlow('task_model_compare_json');

    expect(detail.items[0]?.labelerStatus).toBe('REVISED');
    expect(detail.items[1]?.labelerStatus).toBe('NOT_REQUIRED');
  });

  it('任务日志只记录阶段级事件，打回事件才携带题目列表', async () => {
    const task = createTask({
      items: [
        createItem(1, { currentAiDecision: 'pass', currentRound: 2, previousHumanDecision: 'reject' }),
        createItem(2, { currentAiDecision: 'reject', currentRound: 2, previousHumanDecision: 'pass' }),
      ],
    });
    const service = createService([task]);

    const logs = await service.getTaskFlowLogs('task_model_compare_json');

    expect(logs.map((log) => log.eventType)).toEqual([
      'OWNER_PUBLISHED',
      'LABELER_CLAIMED',
      'LABELER_SUBMITTED',
      'AI_PRECHECK_STARTED',
      'AI_PRECHECK_COMPLETED',
      'REVIEWER_RECEIVED',
      'REVIEWER_REJECTED',
      'LABELER_RESUBMITTED',
      'AI_RECHECK_STARTED',
      'AI_RECHECK_COMPLETED',
      'REVIEWER_RECEIVED',
    ]);
    expect(logs.map((log) => log.eventType)).not.toContain('AI_PRECHECK_ITEM_COMPLETED');
    expect(logs.map((log) => log.eventType)).not.toContain('REVIEWER_ITEM_COMPLETED');
    expect(logs.find((log) => log.eventType === 'AI_PRECHECK_COMPLETED')?.rejectedItemRefs).toEqual([]);
    expect(logs.find((log) => log.eventType === 'REVIEWER_REJECTED')?.rejectedItemRefs).toEqual([
      { itemId: 'item_1', externalId: 'P0001', index: 1 },
    ]);
    expect(logs.find((log) => log.eventType === 'AI_RECHECK_COMPLETED')?.rejectedItemRefs).toEqual([
      { itemId: 'item_2', externalId: 'P0002', index: 2 },
    ]);
    expect(logs.map((log) => log.message).join('\n')).not.toContain('提交了 2 道题');
    expect(logs.map((log) => log.message).join('\n')).not.toContain('总共预审');
    expect(logs.map((log) => log.message).join('\n')).not.toContain('建议通过');
  });

  it('未发生的主流程节点显示待处理且不伪造时间', async () => {
    const task = createTask({
      items: [
        createUnsubmittedItem(1),
      ],
    });
    const service = createService([task]);

    const detail = await service.getTaskFlow('task_model_compare_json');

    expect(detail.lifecycleSteps.map((step) => step.status)).toEqual([
      'COMPLETED',
      'PENDING',
      'PENDING',
      'PENDING',
      'PENDING',
    ]);
    expect(detail.lifecycleSteps.slice(1).every((step) => step.occurredAt === null)).toBe(true);
  });

  it('AI 预审任务失败时停留在 AI 预审阶段，不流转到 Labeler 修改或 Reviewer 检查', async () => {
    const task = createTask({
      items: [
        createAiFailedItem(1),
      ],
    });
    const service = createService([task]);

    const detail = await service.getTaskFlow('task_model_compare_json');

    expect(detail.currentStage).toBe('AI_PRECHECK');
    expect(detail.aiSummary).toMatchObject({
      failed: 1,
      completed: 0,
    });
    expect(detail.reviewerSummary).toMatchObject({
      pending: 0,
      decided: 0,
    });
    expect(detail.labelerRevisionSummary).toMatchObject({
      editable: 0,
      locked: 0,
    });
    expect(detail.items[0]).toMatchObject({
      aiStatus: 'FAILED',
      reviewerStatus: 'NOT_STARTED',
      labelerStatus: 'NOT_REQUIRED',
    });
    expect(detail.lifecycleSteps.find((step) => step.key === 'AI_PRECHECK')).toMatchObject({
      status: 'ACTION_REQUIRED',
    });
  });

  it('不展示 Owner 未发布的草稿任务', async () => {
    const publishedTask = createTask({ id: 'task_published', status: 'PUBLISHED' });
    const draftTask = createTask({ id: 'task_draft', status: 'DRAFT', title: '模版对比 草稿' });
    const service = createService([draftTask, publishedTask]);

    const flows = await service.listTaskFlows();

    expect(flows.map((flow) => flow.taskId)).toEqual(['task_published']);
    expect(flows.map((flow) => flow.taskTitle)).not.toContain('模版对比 草稿');
  });
});

function createService(tasks: unknown[]): TaskFlowsService {
  return new TaskFlowsService({
    task: {
      findMany: vi.fn(async () => tasks),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        tasks.find((task) => (task as { id: string }).id === where.id) ?? null,
      ),
    },
  } as never);
}

function createTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task_model_compare_json',
    title: '模型对比 json',
    status: 'PUBLISHED',
    aiPreReviewEnabled: true,
    createdAt: new Date('2026-05-20T08:00:00.000Z'),
    updatedAt: new Date('2026-05-21T12:00:00.000Z'),
    createdById: 'user_owner',
    createdBy: {
      id: 'user_owner',
      name: '张泽鑫',
    },
    template: {
      name: '模型比较模板',
      schemaVersion: 'v2',
      schema: null,
    },
    auditLogs: [
      {
        id: 'audit_publish',
        taskId: 'task_model_compare_json',
        submissionId: null,
        fromStatus: 'DRAFT',
        toStatus: 'PUBLISHED',
        actorId: 'user_owner',
        actor: {
          id: 'user_owner',
          name: '张泽鑫',
        },
        reason: null,
        metadata: { action: 'TASK_PUBLISHED' },
        createdAt: new Date('2026-05-20T09:00:00.000Z'),
      },
    ],
    flowEvents: [],
    items: [],
    ...overrides,
  };
}

function createUnsubmittedItem(index: number) {
  const externalId = `P${index.toString().padStart(4, '0')}`;

  return {
    id: `item_${index}`,
    externalId,
    datasetKind: 'generic_json',
    rawData: { prompt: `题目 ${index}` },
    status: 'ASSIGNED',
    sortOrder: index,
    assignments: [
      {
        id: `assignment_${index}`,
        assigneeId: 'user_labeler',
        status: 'ASSIGNED',
        claimedAt: new Date(baseTime.getTime() + index),
        updatedAt: new Date(baseTime.getTime() + index),
        assignee: {
          id: 'user_labeler',
          name: '王昱阳',
        },
        submissions: [],
      },
    ],
  };
}

function createAiFailedItem(index: number) {
  const submittedAt = new Date(baseTime.getTime() + 1000 + index);

  return {
    id: `item_failed_${index}`,
    externalId: `P${index.toString().padStart(4, '0')}`,
    datasetKind: 'generic_json',
    rawData: { prompt: `题目 ${index}` },
    status: 'ASSIGNED',
    sortOrder: index,
    assignments: [
      {
        id: `assignment_failed_${index}`,
        assigneeId: 'user_labeler',
        status: 'SUBMITTED',
        claimedAt: new Date(baseTime.getTime() + index),
        updatedAt: new Date(baseTime.getTime() + index),
        assignee: {
          id: 'user_labeler',
          name: '王昱阳',
        },
        submissions: [
          {
            id: `submission_failed_${index}`,
            status: 'AI_QUEUED',
            round: 1,
            answers: { winner: 'A' },
            schemaVersion: 'v2',
            submittedAt,
            reviewRecords: [],
            auditLogs: [],
            aiReviewJobs: [
              {
                id: `job_failed_${index}`,
                status: 'FAILED_FINAL',
                attempts: 3,
                maxAttempts: 3,
                provider: 'deepseek',
                model: 'deepseek-chat',
                lastError: 'AI 预审模型未配置。',
                queuedAt: submittedAt,
                startedAt: new Date(submittedAt.getTime() + 1),
                finishedAt: new Date(submittedAt.getTime() + 2),
                updatedAt: new Date(submittedAt.getTime() + 2),
              },
            ],
          },
        ],
      },
    ],
  };
}

function createItem(
  index: number,
  options: {
    currentAiDecision: 'pass' | 'reject';
    currentRound: number;
    previousHumanDecision: 'pass' | 'reject';
  },
) {
  const externalId = `P${index.toString().padStart(4, '0')}`;

  return {
    id: `item_${index}`,
    externalId,
    datasetKind: 'generic_json',
    rawData: { prompt: `题目 ${index}` },
    status: 'ASSIGNED',
    sortOrder: index,
    assignments: [
      {
        id: `assignment_${index}`,
        assigneeId: 'user_labeler',
        status: 'UNDER_RECHECK',
        claimedAt: new Date(baseTime.getTime() - 3600_000 + index),
        updatedAt: new Date(baseTime.getTime() + index),
        assignee: {
          id: 'user_labeler',
          name: '王昱阳',
        },
        submissions: [
          createSubmission(index, 1, {
            status: options.previousHumanDecision === 'reject' ? 'NEEDS_REVISION' : 'FINAL_APPROVED',
            aiDecision: 'pass',
            humanDecision: options.previousHumanDecision,
          }),
          createSubmission(index, options.currentRound, {
            status: 'RECHECK_REVIEWING',
            aiDecision: options.currentAiDecision,
            humanDecision: null,
          }),
        ],
      },
    ],
  };
}

function createSubmission(
  index: number,
  round: number,
  options: {
    aiDecision: 'pass' | 'reject';
    humanDecision: 'pass' | 'reject' | null;
    status: string;
  },
) {
  const submittedAt = new Date(baseTime.getTime() + round * 1000 + index);
  const aiReviewedAt = new Date(submittedAt.getTime() + 2);
  const humanReviewedAt = new Date(submittedAt.getTime() + 4);
  const reviewRecords = [
    createReviewRecord(index, round, 'AI_PRECHECK', 'AI', options.aiDecision, aiReviewedAt),
  ];

  if (options.humanDecision) {
    reviewRecords.push(createReviewRecord(index, round, 'RECHECK', 'HUMAN', options.humanDecision, humanReviewedAt));
  }

  return {
    id: `submission_${index}_${round}`,
    status: options.status,
    round,
    answers: { winner: index % 2 === 0 ? 'A' : 'B' },
    schemaVersion: 'v2',
    submittedAt,
    reviewRecords,
    auditLogs: [
      {
        id: `audit_ai_start_${index}_${round}`,
        taskId: 'task_model_compare_json',
        submissionId: `submission_${index}_${round}`,
        fromStatus: 'AI_QUEUED',
        toStatus: 'AI_REVIEWING',
        actorId: null,
        actor: null,
        reason: null,
        metadata: { action: 'AI_REVIEW_STARTED', jobId: `job_${index}_${round}` },
        createdAt: new Date(submittedAt.getTime() + 1),
      },
      {
        id: `audit_to_human_${index}_${round}`,
        taskId: 'task_model_compare_json',
        submissionId: `submission_${index}_${round}`,
        fromStatus: 'AI_PASSED',
        toStatus: 'HUMAN_PENDING',
        actorId: null,
        actor: null,
        reason: null,
        metadata: { action: 'AI_REVIEW_TO_HUMAN_PENDING', jobId: `job_${index}_${round}` },
        createdAt: new Date(submittedAt.getTime() + 3),
      },
    ],
    aiReviewJobs: [
      {
        id: `job_${index}_${round}`,
        status: 'SUCCEEDED',
        attempts: 1,
        maxAttempts: 3,
        provider: 'mock',
        model: 'mock-reviewer',
        lastError: null,
        queuedAt: submittedAt,
        startedAt: new Date(submittedAt.getTime() + 1),
        finishedAt: aiReviewedAt,
        updatedAt: aiReviewedAt,
      },
    ],
  };
}

function createReviewRecord(
  index: number,
  round: number,
  stage: string,
  reviewerType: string,
  decision: 'pass' | 'reject',
  createdAt: Date,
) {
  return {
    id: `review_${stage}_${reviewerType}_${index}_${round}`,
    stage,
    reviewerType,
    reviewerId: reviewerType === 'HUMAN' ? 'user_reviewer' : null,
    assignedReviewerId: reviewerType === 'HUMAN' ? 'user_reviewer' : null,
    decision,
    comment: decision === 'reject' ? '需要修改。' : '可以通过。',
    scores: { overall: decision === 'reject' ? 62 : 94 },
    structuredOutput: reviewerType === 'AI'
      ? {
          fieldReviews: [
            {
              fieldKey: 'comment',
              label: '对比说明',
              score: decision === 'reject' ? 62 : 94,
            },
          ],
        }
      : null,
    createdAt,
  };
}
