import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { DraftsService } from './drafts.service.ts';

type AssignmentStatus =
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'UNDER_RECHECK'
  | 'FINAL_PENDING'
  | 'FINAL_APPROVED'
  | 'NEEDS_REVISION'
  | 'CANCELLED';

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
    description: string | null;
    richTextInstruction: string | null;
    tags: string[];
    rewardRule: string | null;
    quota: number | null;
    deadline: Date | null;
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
    status: 'UNASSIGNED' | 'ASSIGNED' | 'COMPLETED';
    sortOrder: number;
  };
  drafts: DraftRecord[];
  submissions: Array<{
    id: string;
    status: 'SUBMITTED' | 'AI_QUEUED' | 'NEEDS_REVISION';
    round: number;
    answers: Record<string, unknown>;
    schemaVersion: string;
    submittedAt: Date;
    reviewRecords: Array<{
      decision: string | null;
      comment?: string | null;
      scores: Record<string, unknown>;
      createdAt: Date;
    }>;
  }>;
};

type MockDraftsPrisma = {
  assignment: {
    findUnique: (args: { where: { id: string } }) => Promise<AssignmentRecord | null>;
    update: (args: { where: { id: string }; data: { status: AssignmentStatus } }) => Promise<AssignmentRecord>;
  };
  draft: {
    findUnique: (args: { where: { assignmentId: string } }) => Promise<DraftRecord | null>;
    upsert: (args: {
      where: { assignmentId: string };
      update: Partial<DraftRecord>;
      create: Partial<DraftRecord>;
    }) => Promise<DraftRecord>;
  };
  auditLog: {
    create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
  };
};

describe('DraftsService', () => {
  it('草稿可按 assignment 覆盖保存并把 assignment 置为进行中', async () => {
    const { service, drafts, auditLogs, assignments } = createService();

    const firstDraft = await service.saveDraft('assignment_1', {
      actorId: 'user_labeler_li_lei',
      answers: { quality: 'pass' },
    });
    const secondDraft = await service.saveDraft('assignment_1', {
      actorId: 'user_labeler_li_lei',
      answers: { quality: 'excellent', comment: '回答完整。' },
    });

    expect(firstDraft.id).toBe('draft_1');
    expect(secondDraft.answers).toEqual({ quality: 'excellent', comment: '回答完整。' });
    expect(drafts).toHaveLength(1);
    expect(assignments[0].status).toBe('IN_PROGRESS');
    expect(auditLogs.map((auditLog) => auditLog.metadata)).toEqual([
      { action: 'DRAFT_SAVED', assignmentId: 'assignment_1' },
      { action: 'DRAFT_SAVED', assignmentId: 'assignment_1' },
    ]);
  });

  it('工作台查询返回题目、Schema、草稿和提交历史', async () => {
    const { service } = createService({
      drafts: [{ answers: { quality: 'pass' } }],
      submissions: [
        {
          id: 'submission_1',
          status: 'NEEDS_REVISION',
          round: 1,
          answers: { quality: 'pass' },
          schemaVersion: 'r1',
          submittedAt: new Date('2026-05-21T02:00:00.000Z'),
          reviewRecords: [
            {
              decision: '打回',
              scores: { reason: '请补充判断依据。' },
              createdAt: new Date('2026-05-21T03:00:00.000Z'),
            },
          ],
        },
      ],
    });

    await expect(service.getWorkbench('assignment_1')).resolves.toEqual(
      expect.objectContaining({
        assignment: expect.objectContaining({ id: 'assignment_1', status: 'ASSIGNED' }),
        task: expect.objectContaining({ title: '问答质量标注', schemaVersion: 'r1' }),
        taskItem: expect.objectContaining({ externalId: 'qa_1' }),
        draft: expect.objectContaining({ answers: { quality: 'pass' } }),
        rejectionNotice: expect.objectContaining({ reason: '请补充判断依据。' }),
        submissionHistory: [
          expect.objectContaining({
            id: 'submission_1',
            round: 1,
            status: 'NEEDS_REVISION',
          }),
        ],
      }),
    );
  });

  it('上一轮打回原因优先展示审核记录 comment', async () => {
    const { service } = createService({
      submissions: [
        {
          id: 'submission_1',
          status: 'NEEDS_REVISION',
          round: 1,
          answers: { quality: 'pass' },
          schemaVersion: 'r1',
          submittedAt: new Date('2026-05-21T02:00:00.000Z'),
          reviewRecords: [
            {
              decision: 'reject',
              comment: '人工复审认为依据不足，请补充说明。',
              scores: {},
              createdAt: new Date('2026-05-21T03:00:00.000Z'),
            },
          ],
        },
      ],
    });

    await expect(service.getWorkbench('assignment_1')).resolves.toEqual(
      expect.objectContaining({
        rejectionNotice: expect.objectContaining({
          reason: '人工复审认为依据不足，请补充说明。',
        }),
      }),
    );
  });

  it('保存草稿时拒绝缺失 assignment、已取消 assignment 和非对象 answers', async () => {
    const { service } = createService({
      assignments: [{ id: 'assignment_cancelled', status: 'CANCELLED' }],
    });

    await expect(service.saveDraft('missing', { answers: {} })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.saveDraft('assignment_cancelled', { answers: {} })).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.saveDraft('assignment_1', { answers: [] as unknown as Record<string, unknown> }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

function createService(
  overrides: {
    assignments?: Array<Partial<AssignmentRecord> & { id: string }>;
    drafts?: Array<Partial<DraftRecord>>;
    submissions?: AssignmentRecord['submissions'];
  } = {},
) {
  const now = new Date('2026-05-21T00:00:00.000Z');
  const assignments: AssignmentRecord[] = [
    createAssignment(now, {
      id: 'assignment_1',
      drafts: overrides.drafts?.map((draft, index) => createDraft(now, draft, index + 1)) ?? [],
      submissions: overrides.submissions ?? [],
    }),
    ...(overrides.assignments?.map((assignment) =>
      createAssignment(now, {
        id: assignment.id,
        status: assignment.status,
        drafts: [],
        submissions: [],
      }),
    ) ?? []),
  ];
  const drafts: DraftRecord[] = assignments.flatMap((assignment) => assignment.drafts);
  const auditLogs: Array<Record<string, unknown>> = [];

  const prisma: MockDraftsPrisma = {
    assignment: {
      findUnique: async ({ where }) => assignments.find((assignment) => assignment.id === where.id) ?? null,
      update: async ({ where, data }) => {
        const assignment = assignments.find((candidate) => candidate.id === where.id);
        if (!assignment) {
          throw new Error('assignment missing');
        }

        assignment.status = data.status;
        return assignment;
      },
    },
    draft: {
      findUnique: async ({ where }) =>
        drafts.find((draft) => draft.assignmentId === where.assignmentId) ?? null,
      upsert: async ({ where, update, create }) => {
        const existingDraft = drafts.find((draft) => draft.assignmentId === where.assignmentId);
        if (existingDraft) {
          Object.assign(existingDraft, update, { updatedAt: now });
          return existingDraft;
        }

        const draft = createDraft(now, {
          id: `draft_${drafts.length + 1}`,
          assignmentId: create.assignmentId,
          answers: create.answers,
          schemaVersion: create.schemaVersion,
        });
        drafts.push(draft);
        assignments.find((assignment) => assignment.id === draft.assignmentId)?.drafts.push(draft);
        return draft;
      },
    },
    auditLog: {
      create: async ({ data }) => {
        auditLogs.push(data);
        return data;
      },
    },
  };

  return {
    assignments,
    auditLogs,
    drafts,
    service: new DraftsService(prisma),
  };
}

function createAssignment(
  now: Date,
  input: {
    id: string;
    status?: AssignmentStatus;
    drafts: DraftRecord[];
    submissions: AssignmentRecord['submissions'];
  },
): AssignmentRecord {
  return {
    id: input.id,
    taskId: 'task_qa',
    taskItemId: 'item_qa_1',
    assigneeId: 'user_labeler_li_lei',
    status: input.status ?? 'ASSIGNED',
    claimedAt: now,
    task: {
      id: 'task_qa',
      title: '问答质量标注',
      description: '检查回答是否解决核心诉求。',
      richTextInstruction: '请补充判断依据。',
      tags: ['问答', '官方数据'],
      rewardRule: '0.30 元 / 条',
      quota: 30,
      deadline: new Date('2026-06-01T15:59:00.000Z'),
      template: {
        id: 'template_qa',
        name: '问答质量官方模板',
        datasetKind: 'qa_quality',
        schemaVersion: 'r1',
        schema: {
          schemaVersion: 'r1',
          datasetKind: 'qa_quality',
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
          ],
        },
      },
    },
    taskItem: {
      id: 'item_qa_1',
      externalId: 'qa_1',
      datasetKind: 'qa_quality',
      rawData: { prompt: '如何判断回答质量？', model_answer: '检查事实性。' },
      status: 'ASSIGNED',
      sortOrder: 1,
    },
    drafts: input.drafts,
    submissions: input.submissions,
  };
}

function createDraft(
  now: Date,
  input: Partial<DraftRecord> = {},
  sequence = 1,
): DraftRecord {
  return {
    id: input.id ?? `draft_${sequence}`,
    assignmentId: input.assignmentId ?? 'assignment_1',
    answers: input.answers ?? {},
    schemaVersion: input.schemaVersion ?? 'r1',
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}
