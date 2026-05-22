import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { ReviewsService } from './reviews.service.ts';

type AssignmentStatus =
  | 'SUBMITTED'
  | 'UNDER_RECHECK'
  | 'FINAL_PENDING'
  | 'NEEDS_REVISION';

type SubmissionStatus =
  | 'HUMAN_PENDING'
  | 'RECHECK_REVIEWING'
  | 'FINAL_PENDING'
  | 'NEEDS_REVISION';

type ReviewRecord = {
  id: string;
  submissionId: string;
  ruleId: string | null;
  stage: 'AI_PRECHECK' | 'RECHECK';
  reviewerId: string | null;
  assignedReviewerId: string | null;
  reviewerType: 'AI' | 'HUMAN';
  scores: Record<string, unknown>;
  decision: string | null;
  comment: string | null;
  revisedAnswers: Record<string, unknown> | null;
  rawPrompt: string | null;
  rawOutput: string | null;
  structuredOutput: Record<string, unknown> | null;
  modelMetadata: Record<string, unknown> | null;
  retryCount: number;
  idempotencyKey: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type AuditLog = {
  id: string;
  taskId: string;
  submissionId: string;
  fromStatus: string | null;
  toStatus: string;
  actorId: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

type Assignment = {
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
      datasetKind: 'qa_quality';
      schemaVersion: string;
    };
  };
  taskItem: {
    id: string;
    externalId: string;
    datasetKind: 'qa_quality';
    rawData: Record<string, unknown>;
  };
};

type Submission = {
  id: string;
  assignmentId: string;
  assignment: Assignment;
  status: SubmissionStatus;
  round: number;
  answers: Record<string, unknown>;
  schemaVersion: string;
  submittedAt: Date;
  reviewRecords: ReviewRecord[];
  auditLogs: AuditLog[];
  createdAt: Date;
  updatedAt: Date;
};

describe('ReviewsService', () => {
  it('查询待复审列表时展示 AI 评分、AI 评语和指派过滤结果', async () => {
    const { service } = createService();

    const pending = await service.listPending({ reviewerId: 'reviewer_1' });

    expect(pending).toHaveLength(1);
    expect(pending[0]).toEqual(
      expect.objectContaining({
        submissionId: 'submission_1',
        taskTitle: '问答质量标注',
        externalId: 'qa_1',
        status: 'HUMAN_PENDING',
        aiDecision: 'pass',
        aiComment: '建议进入人工复审。',
        assignedReviewerId: 'reviewer_1',
      }),
    );
    expect(pending[0].aiScores).toEqual({ overall: 90 });
  });

  it('开始复审后 submission 进入 RECHECK_REVIEWING 且 assignment 进入 UNDER_RECHECK', async () => {
    const { service, db } = createService();

    const detail = await service.startReview('submission_1', { actorId: 'reviewer_1' });

    expect(detail.submission.status).toBe('RECHECK_REVIEWING');
    expect(db.assignments[0].status).toBe('UNDER_RECHECK');
    expect(db.auditLogs.at(-1)).toEqual(
      expect.objectContaining({
        fromStatus: 'HUMAN_PENDING',
        toStatus: 'RECHECK_REVIEWING',
        actorId: 'reviewer_1',
      }),
    );
  });

  it('复审通过后进入终审待办，不会直接进入终审通过', async () => {
    const { service, db } = createService();
    await service.startReview('submission_1', { actorId: 'reviewer_1' });

    const detail = await service.passReview('submission_1', {
      actorId: 'reviewer_1',
      comment: '同意 AI 预审结论。',
    });

    expect(detail.submission.status).toBe('FINAL_PENDING');
    expect(db.assignments[0].status).toBe('FINAL_PENDING');
    expect(db.submissions[0].status).not.toBe('FINAL_APPROVED');
    expect(db.reviewRecords.at(-1)).toEqual(
      expect.objectContaining({
        submissionId: 'submission_1',
        stage: 'RECHECK',
        reviewerType: 'HUMAN',
        reviewerId: 'reviewer_1',
        decision: 'recheck_pass',
        comment: '同意 AI 预审结论。',
      }),
    );
  });

  it('打回必须填写理由，并让 Labeler 可见上一轮意见', async () => {
    const { service, db } = createService();

    await expect(service.rejectReview('submission_1', { actorId: 'reviewer_1', reason: '  ' })).rejects.toBeInstanceOf(
      BadRequestException,
    );

    const detail = await service.rejectReview('submission_1', {
      actorId: 'reviewer_1',
      reason: '事实性依据不足，需要补充说明。',
    });

    expect(detail.submission.status).toBe('NEEDS_REVISION');
    expect(db.assignments[0].status).toBe('NEEDS_REVISION');
    expect(db.reviewRecords.at(-1)).toEqual(
      expect.objectContaining({
        decision: 'reject',
        comment: '事实性依据不足，需要补充说明。',
      }),
    );
  });

  it('直接修订并通过会保存 revisedAnswers 快照并进入终审待办', async () => {
    const { service, db } = createService();

    const detail = await service.reviseAndPass('submission_1', {
      actorId: 'reviewer_1',
      comment: '已补齐理由。',
      revisedAnswers: { quality: 'pass', reason: '补充后的人工修订理由。' },
    });

    expect(detail.submission.status).toBe('FINAL_PENDING');
    expect(detail.submission.answers).toEqual({ quality: 'pass', reason: '补充后的人工修订理由。' });
    expect(db.reviewRecords.at(-1)?.decision).toBe('revise_pass');
    expect(db.reviewRecords.at(-1)?.revisedAnswers).toEqual({
      quality: 'pass',
      reason: '补充后的人工修订理由。',
    });
  });

  it('支持批量通过、批量打回和指派审核员', async () => {
    const { service, db } = createService();

    await service.assignReviews({
      actorId: 'reviewer_lead',
      reviewerId: 'reviewer_2',
      submissionIds: ['submission_1', 'submission_2'],
    });
    expect(db.reviewRecords.filter((record) => record.assignedReviewerId === 'reviewer_2')).toHaveLength(2);

    const passResult = await service.batchPass({
      actorId: 'reviewer_2',
      submissionIds: ['submission_1'],
      comment: '批量同意。',
    });
    expect(passResult.processedCount).toBe(1);
    expect(db.submissions[0].status).toBe('FINAL_PENDING');

    const rejectResult = await service.batchReject({
      actorId: 'reviewer_2',
      submissionIds: ['submission_2'],
      reason: '批量打回原因。',
    });
    expect(rejectResult.processedCount).toBe(1);
    expect(db.submissions[1].status).toBe('NEEDS_REVISION');
    expect(db.auditLogs.at(-1)?.metadata).toEqual(
      expect.objectContaining({ action: 'HUMAN_REVIEW_BULK_REJECTED' }),
    );
  });

  it('批量通过遇到部分失败时返回逐条结果', async () => {
    const { service, db } = createService();
    db.submissions[1].status = 'FINAL_PENDING';

    const result = await service.batchPass({
      actorId: 'reviewer_2',
      submissionIds: ['submission_1', 'submission_2'],
      comment: '批量同意。',
    });

    expect(result.processedCount).toBe(1);
    expect(result.failedCount).toBe(1);
    expect(result.results).toEqual([
      expect.objectContaining({ submissionId: 'submission_1', status: 'SUCCEEDED' }),
      expect.objectContaining({
        submissionId: 'submission_2',
        status: 'FAILED',
        error: expect.objectContaining({
          code: 'SUBMISSION_NOT_REVIEWABLE',
          message: '只有待人工复审或复审中的提交可以执行人工复审。',
        }),
      }),
    ]);
  });
});

function createService() {
  const db = createReviewDb();
  const service = new ReviewsService(db.client as ConstructorParameters<typeof ReviewsService>[0]);

  return { service, db };
}

function createReviewDb() {
  const assignments: Assignment[] = [
    createAssignment('assignment_1', 'qa_1', 'SUBMITTED'),
    createAssignment('assignment_2', 'qa_2', 'SUBMITTED'),
  ];
  const submissions: Submission[] = [
    createSubmission('submission_1', assignments[0], 'HUMAN_PENDING'),
    createSubmission('submission_2', assignments[1], 'HUMAN_PENDING'),
  ];
  const reviewRecords: ReviewRecord[] = [
    createAiRecord('ai_record_1', 'submission_1', 'pass', '建议进入人工复审。', { overall: 90 }),
    createAiRecord('ai_record_2', 'submission_2', 'manual', '需要人工判断。', { overall: 62 }),
    createAssignedRecord('assign_record_1', 'submission_1', 'reviewer_1'),
  ];
  const auditLogs: AuditLog[] = [
    createAuditLog('audit_1', 'submission_1', null, 'HUMAN_PENDING', 'AI 自动预审通过。'),
  ];
  const db = {
    assignments,
    submissions,
    reviewRecords,
    auditLogs,
    client: {
      submission: {
        findMany: async (args?: { where?: { status?: { in?: SubmissionStatus[] } } }) =>
          materializeSubmissions(submissions, reviewRecords, auditLogs).filter((submission) => {
            const allowed = args?.where?.status?.in;
            return allowed ? allowed.includes(submission.status) : true;
          }),
        findUnique: async (args: { where: { id: string } }) =>
          materializeSubmissions(submissions, reviewRecords, auditLogs).find((submission) => submission.id === args.where.id) ?? null,
        update: async (args: { where: { id: string }; data: Partial<Submission> }) => {
          const submission = submissions.find((item) => item.id === args.where.id);
          if (!submission) {
            throw new Error('测试提交不存在。');
          }
          Object.assign(submission, args.data, { updatedAt: new Date('2026-05-21T08:30:00.000Z') });
          const updatedSubmission = materializeSubmissions(submissions, reviewRecords, auditLogs).find(
            (item) => item.id === submission.id,
          );
          if (!updatedSubmission) {
            throw new Error('测试提交更新失败。');
          }

          return updatedSubmission;
        },
      },
      assignment: {
        update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
          const assignment = assignments.find((item) => item.id === args.where.id);
          if (!assignment) {
            throw new Error('测试领取记录不存在。');
          }
          assignment.status = args.data.status as AssignmentStatus;
          return assignment;
        },
      },
      reviewRecord: {
        create: async (args: { data: Partial<ReviewRecord> }) => {
          const record = {
            id: `review_${reviewRecords.length + 1}`,
            ruleId: null,
            scores: {},
            rawPrompt: null,
            rawOutput: null,
            structuredOutput: null,
            modelMetadata: null,
            retryCount: 0,
            idempotencyKey: null,
            assignedReviewerId: null,
            revisedAnswers: null,
            createdAt: new Date('2026-05-21T08:35:00.000Z'),
            updatedAt: new Date('2026-05-21T08:35:00.000Z'),
            ...args.data,
          } as ReviewRecord;
          reviewRecords.push(record);
          return record;
        },
      },
      auditLog: {
        create: async (args: { data: Partial<AuditLog> }) => {
          const log = {
            id: `audit_${auditLogs.length + 1}`,
            taskId: 'task_qa',
            submissionId: args.data.submissionId ?? 'submission_1',
            fromStatus: args.data.fromStatus ?? null,
            toStatus: args.data.toStatus ?? 'UNKNOWN',
            actorId: args.data.actorId ?? null,
            reason: args.data.reason ?? null,
            metadata: args.data.metadata ?? null,
            createdAt: new Date('2026-05-21T08:36:00.000Z'),
            updatedAt: new Date('2026-05-21T08:36:00.000Z'),
          } as AuditLog;
          auditLogs.push(log);
          return log;
        },
      },
      $transaction: async <TResult>(callback: (client: ConstructorParameters<typeof ReviewsService>[0]) => Promise<TResult>) =>
        callback(db.client as ConstructorParameters<typeof ReviewsService>[0]),
    },
  };

  return db;
}

function materializeSubmissions(
  submissions: Submission[],
  reviewRecords: ReviewRecord[],
  auditLogs: AuditLog[],
): Submission[] {
  return submissions.map((submission) => ({
    ...submission,
    assignment: {
      ...submission.assignment,
      task: { ...submission.assignment.task },
      taskItem: { ...submission.assignment.taskItem },
    },
    reviewRecords: reviewRecords
      .filter((record) => record.submissionId === submission.id)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    auditLogs: auditLogs
      .filter((log) => log.submissionId === submission.id)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
  }));
}

function createAssignment(id: string, externalId: string, status: AssignmentStatus): Assignment {
  return {
    id,
    taskId: 'task_qa',
    taskItemId: `item_${externalId}`,
    assigneeId: 'labeler_1',
    status,
    task: {
      id: 'task_qa',
      title: '问答质量标注',
      template: {
        id: 'template_qa',
        name: '问答质量官方模板',
        datasetKind: 'qa_quality',
        schemaVersion: 'qa-r1',
      },
    },
    taskItem: {
      id: `item_${externalId}`,
      externalId,
      datasetKind: 'qa_quality',
      rawData: { prompt: '如何判断回答质量？', model_answer: '检查事实性。' },
    },
  };
}

function createSubmission(id: string, assignment: Assignment, status: SubmissionStatus): Submission {
  return {
    id,
    assignmentId: assignment.id,
    assignment,
    status,
    round: 1,
    answers: { quality: 'pass', reason: '覆盖关键点。' },
    schemaVersion: 'qa-r1',
    submittedAt: new Date('2026-05-21T08:00:00.000Z'),
    reviewRecords: [],
    auditLogs: [],
    createdAt: new Date('2026-05-21T08:00:00.000Z'),
    updatedAt: new Date('2026-05-21T08:00:00.000Z'),
  };
}

function createAiRecord(
  id: string,
  submissionId: string,
  decision: string,
  comment: string,
  scores: Record<string, unknown>,
): ReviewRecord {
  return {
    id,
    submissionId,
    ruleId: 'rule_qa',
    stage: 'AI_PRECHECK',
    reviewerId: null,
    assignedReviewerId: null,
    reviewerType: 'AI',
    scores,
    decision,
    comment,
    revisedAnswers: null,
    rawPrompt: 'AI 预审 Prompt',
    rawOutput: '{"verdict":"pass"}',
    structuredOutput: { verdict: decision, scores },
    modelMetadata: { provider: 'mock', model: 'mock-stable-reviewer', totalTokens: 96 },
    retryCount: 0,
    idempotencyKey: `${submissionId}:1:ai-review`,
    createdAt: new Date('2026-05-21T08:02:00.000Z'),
    updatedAt: new Date('2026-05-21T08:02:00.000Z'),
  };
}

function createAssignedRecord(id: string, submissionId: string, assignedReviewerId: string): ReviewRecord {
  return {
    ...createAiRecord(id, submissionId, 'assigned', '已指派审核员。', {}),
    stage: 'RECHECK',
    reviewerId: 'reviewer_lead',
    assignedReviewerId,
    reviewerType: 'HUMAN',
    rawPrompt: null,
    rawOutput: null,
    structuredOutput: null,
    modelMetadata: null,
    idempotencyKey: null,
  };
}

function createAuditLog(
  id: string,
  submissionId: string,
  fromStatus: string | null,
  toStatus: string,
  reason: string,
): AuditLog {
  return {
    id,
    taskId: 'task_qa',
    submissionId,
    fromStatus,
    toStatus,
    actorId: 'user_ai_agent_system',
    reason,
    metadata: { action: 'AI_REVIEW_SUCCEEDED' },
    createdAt: new Date('2026-05-21T08:03:00.000Z'),
    updatedAt: new Date('2026-05-21T08:03:00.000Z'),
  };
}
