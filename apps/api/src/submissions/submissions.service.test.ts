import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { SchemaService } from '../schema/schema.service.ts';
import { SubmissionsService } from './submissions.service.ts';

type AssignmentStatus = 'ASSIGNED' | 'IN_PROGRESS' | 'SUBMITTED' | 'CANCELLED';
type SubmissionStatus = 'AI_QUEUED' | 'AI_PASSED' | 'NEEDS_REVISION';

type SubmissionRecord = {
  id: string;
  assignmentId: string;
  status: SubmissionStatus;
  round: number;
  answers: Record<string, unknown>;
  schemaVersion: string;
  submittedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

type AssignmentRecord = {
  id: string;
  taskId: string;
  taskItemId: string;
  assigneeId: string;
  status: AssignmentStatus;
  task: {
    id: string;
    title: string;
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
  };
  submissions: SubmissionRecord[];
};

type MockSubmissionsPrisma = {
  assignment: {
    findUnique: (args: { where: { id: string } }) => Promise<AssignmentRecord | null>;
    findMany: () => Promise<AssignmentRecord[]>;
    update: (args: { where: { id: string }; data: { status: AssignmentStatus } }) => Promise<AssignmentRecord>;
  };
  taskItem: {
    update: (args: { where: { id: string }; data: { status: 'COMPLETED' } }) => Promise<unknown>;
  };
  submission: {
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
      }),
    ]);
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

function createService(
  overrides: {
    assignments?: AssignmentRecord[];
    submissions?: SubmissionRecord[];
  } = {},
) {
  const now = new Date('2026-05-21T00:00:00.000Z');
  const assignments: AssignmentRecord[] = [
    createAssignment(now, { submissions: overrides.submissions ?? [] }),
    ...(overrides.assignments ?? []),
  ];
  const submissions = assignments.flatMap((assignment) => assignment.submissions);
  const completedItems: string[] = [];
  const auditLogs: Array<Record<string, unknown>> = [];
  const aiReviewJobs: Array<Record<string, unknown>> = [];

  const prisma: MockSubmissionsPrisma = {
    assignment: {
      findUnique: async ({ where }) => assignments.find((assignment) => assignment.id === where.id) ?? null,
      findMany: async () => assignments,
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
    externalId?: string;
    datasetKind?: 'qa_quality' | 'preference_compare' | 'generic_json';
    submissions?: SubmissionRecord[];
  } = {},
): AssignmentRecord {
  const datasetKind = input.datasetKind ?? 'qa_quality';

  return {
    id: input.id ?? 'assignment_1',
    taskId: datasetKind === 'qa_quality' ? 'task_qa' : 'task_preference',
    taskItemId: input.taskItemId ?? 'item_qa_1',
    assigneeId: 'user_labeler_li_lei',
    status: input.status ?? 'IN_PROGRESS',
    task: {
      id: datasetKind === 'qa_quality' ? 'task_qa' : 'task_preference',
      title: datasetKind === 'qa_quality' ? '问答质量标注' : '偏好对比标注',
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
    },
    submissions: input.submissions ?? [],
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
    submittedAt: input.submittedAt ?? now,
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
