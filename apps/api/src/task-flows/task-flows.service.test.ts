import { describe, expect, it, vi } from 'vitest';

import { TaskFlowsService } from './task-flows.service.ts';

const baseTime = new Date('2026-05-21T10:00:00.000Z');

describe('TaskFlowsService', () => {
  it('按任务流转口径聚合 AI 完成数和 Reviewer 待复审数', async () => {
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
      name: '张满',
    },
    template: {
      name: '模型比较模板',
      schemaVersion: 'v2',
      schema: null,
    },
    items: [],
    ...overrides,
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
        updatedAt: new Date(baseTime.getTime() + index),
        assignee: {
          id: 'user_labeler',
          name: '李雷',
        },
        submissions: [
          createSubmission(index, 1, {
            status: options.previousHumanDecision === 'reject' ? 'NEEDS_REVISION' : 'FINAL_APPROVED',
            aiDecision: options.previousHumanDecision,
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
  const reviewRecords = [
    createReviewRecord(index, round, 'AI_PRECHECK', 'AI', options.aiDecision, submittedAt),
  ];

  if (options.humanDecision) {
    reviewRecords.push(createReviewRecord(index, round, 'RECHECK', 'HUMAN', options.humanDecision, submittedAt));
  }

  return {
    id: `submission_${index}_${round}`,
    status: options.status,
    round,
    answers: { winner: index % 2 === 0 ? 'A' : 'B' },
    schemaVersion: 'v2',
    submittedAt,
    reviewRecords,
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
        startedAt: submittedAt,
        finishedAt: submittedAt,
        updatedAt: submittedAt,
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
    createdAt,
  };
}
