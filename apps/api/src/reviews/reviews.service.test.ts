import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { ReviewsService } from './reviews.service.ts';

type AssignmentStatus =
  | 'SUBMITTED'
  | 'UNDER_RECHECK'
  | 'FINAL_APPROVED'
  | 'NEEDS_REVISION';

type SubmissionStatus =
  | 'AI_PASSED'
  | 'HUMAN_PENDING'
  | 'RECHECK_REVIEWING'
  | 'FINAL_APPROVED'
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
    deadline: Date | null;
    template: {
      id: string;
      name: string;
      datasetKind: 'qa_quality';
      schemaVersion: string;
      schema: Record<string, unknown>;
    } | null;
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

    expect(pending).toHaveLength(2);
    expect(pending.map((item) => item.submissionId).sort()).toEqual(['submission_1', 'submission_2']);
    expect(pending.find((item) => item.submissionId === 'submission_1')).toEqual(
      expect.objectContaining({
        submissionId: 'submission_1',
        taskTitle: '问答质量标注',
        externalId: 'qa_1',
        status: 'HUMAN_PENDING',
        aiDecision: 'pass',
        aiComment: '建议进入人工复审。',
        assignedReviewerId: 'reviewer_1',
        deadline: '2026-06-01T15:59:00.000Z',
      }),
    );
    expect(pending.find((item) => item.submissionId === 'submission_1')?.aiScores).toEqual({ overall: 90 });
    await expect(service.listPending({ reviewerId: 'unknown_reviewer' })).resolves.toEqual([]);
  });

  it('人工复审列表保留未带人工复审决策但已入库的任务项，避免待审视图被误清空', async () => {
    const { service, db } = createService();

    db.submissions.forEach((submission) => {
      submission.status = 'FINAL_APPROVED';
      submission.assignment.status = 'FINAL_APPROVED';
    });

    const pending = await service.listPending();

    expect(pending).toHaveLength(2);
    expect(pending.every((item) => item.status === 'FINAL_APPROVED')).toBe(true);
    expect(pending.map((item) => item.submissionId).sort()).toEqual(['submission_1', 'submission_2']);
    expect(pending.every((item) => item.roundStatus === 'completed' && item.pendingCount === 0)).toBe(true);
  });

  it('人工复审列表兼容没有关联模板的任务', async () => {
    const { service, db } = createService();
    db.assignments[0].task.template = null;

    const pending = await service.listPending({ reviewerId: 'reviewer_1' });
    const detail = await service.getReview('submission_1');

    expect(pending[0]).toEqual(
      expect.objectContaining({
        submissionId: 'submission_1',
        datasetKind: 'qa_quality',
      }),
    );
    expect(detail.task).toEqual(
      expect.objectContaining({
        datasetKind: 'qa_quality',
        templateName: '未关联模板',
        schema: null,
      }),
    );
  });

  it('人工复审详情返回模板 schema，供前端展示中文字段标题', async () => {
    const { service } = createService();

    const detail = await service.getReview('submission_1');

    expect(detail.task.schema).toMatchObject({
      schemaVersion: 'qa-r1',
      fields: [
        expect.objectContaining({ key: 'quality', label: '质量判断' }),
        expect.objectContaining({ key: 'reason', label: '判断理由' }),
      ],
    });
  });

  it('同一任务当前仍有 AI 打回题时，已通过题不能提前进入人工复审队列', async () => {
    const { service, db } = createService();
    db.submissions[1].status = 'NEEDS_REVISION';
    db.assignments[1].status = 'NEEDS_REVISION';
    db.reviewRecords = db.reviewRecords.map((record) =>
      record.submissionId === 'submission_2' && record.stage === 'AI_PRECHECK'
        ? {
            ...record,
            decision: 'reject',
            comment: '第 2 题当前 AI 预审打回。',
          }
        : record,
    );

    const pending = await service.listPending();

    expect(pending).toEqual([]);
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

  it('单题人工通过后不应立即标记完成，等待轮次内全部题目决策', async () => {
    const { service, db } = createService();
    await service.startReview('submission_1', { actorId: 'reviewer_1' });

    const detail = await service.passReview('submission_1', {
      actorId: 'reviewer_1',
      comment: '同意 AI 预审结论。',
    });

    expect(detail.submission.status).toBe('RECHECK_REVIEWING');
    expect(db.assignments[0].status).toBe('UNDER_RECHECK');
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
    expect(db.auditLogs.at(-1)).not.toEqual(
      expect.objectContaining({
        fromStatus: 'RECHECK_REVIEWING',
        toStatus: 'FINAL_APPROVED',
      }),
    );
  });

  it('单题已决策时 listPending 仍返回同一任务全部题目，不应提前收窄到已决项', async () => {
    const { service } = createService();

    await service.startReview('submission_1', { actorId: 'reviewer_1' });
    await service.passReview('submission_1', {
      actorId: 'reviewer_1',
      comment: '本轮先放行。',
    });

    const pending = await service.listPending();
    expect(pending).toHaveLength(2);
    expect(pending.map((item) => item.submissionId).sort()).toEqual(
      expect.arrayContaining(['submission_1', 'submission_2']),
    );
    const passedItem = pending.find((item) => item.submissionId === 'submission_1');
    const pendingItem = pending.find((item) => item.submissionId === 'submission_2');

    expect(passedItem).toEqual(
      expect.objectContaining({
        submissionId: 'submission_1',
        humanDecision: 'recheck_pass',
        roundStatus: 'partial_decided',
      }),
    );
    expect(pendingItem).toEqual(
      expect.objectContaining({
        submissionId: 'submission_2',
        roundStatus: 'partial_decided',
      }),
    );
  });

  it('轮次内所有题都做出决策后再统一收口：通过与打回混合结果', async () => {
    const { service, db } = createService();
    await service.startReview('submission_1', { actorId: 'reviewer_1' });
    await service.passReview('submission_1', {
      actorId: 'reviewer_1',
      comment: '同意 AI 预审结论。',
    });

    const detail = await service.rejectReview('submission_2', {
      actorId: 'reviewer_1',
      reason: '事实性依据不足，需要补充说明。',
    });

    expect(detail.submission.status).toBe('NEEDS_REVISION');
    expect(db.submissions[0].status).toBe('FINAL_APPROVED');
    expect(db.submissions[1].status).toBe('NEEDS_REVISION');
    expect(db.assignments[0].status).toBe('FINAL_APPROVED');
    expect(db.assignments[1].status).toBe('NEEDS_REVISION');
    expect(
      db.auditLogs.filter((item) => item.metadata?.action === 'HUMAN_REVIEW_APPROVED' || item.metadata?.action === 'HUMAN_REVIEW_REJECTED'),
    ).toHaveLength(2);
  });

  it('打回必须填写理由，并让 Labeler 可见上一轮意见', async () => {
    const { service, db } = createService();

    await expect(service.rejectReview('submission_1', { actorId: 'reviewer_1', reason: '  ' })).rejects.toBeInstanceOf(
      BadRequestException,
    );

    await service.passReview('submission_2', {
      actorId: 'reviewer_1',
      comment: '第 2 题通过。',
    });

    const detail = await service.rejectReview('submission_1', {
      actorId: 'reviewer_1',
      reason: '事实性依据不足，需要补充说明。',
      fieldReviews: [
        {
          fieldKey: 'reason',
          label: '判断理由',
          comment: '请补充完整判断依据。',
          value: '覆盖关键点。',
        },
      ],
    });

    expect(detail.submission.status).toBe('NEEDS_REVISION');
    expect(db.assignments[0].status).toBe('NEEDS_REVISION');
    expect(db.reviewRecords.at(-1)).toEqual(
      expect.objectContaining({
        decision: 'reject',
        comment: '事实性依据不足，需要补充说明。',
        structuredOutput: {
          verdict: 'reject',
          overallComment: '事实性依据不足，需要补充说明。',
          fieldReviews: [
            {
              fieldKey: 'reason',
              label: '判断理由',
              decision: 'reject',
              comment: '请补充完整判断依据。',
              suggestions: ['请补充完整判断依据。'],
              value: '覆盖关键点。',
            },
          ],
        },
      }),
    );
  });

  it('直接修订并通过会保存 revisedAnswers 快照，但不提前标记完成', async () => {
    const { service, db } = createService();

    await service.startReview('submission_1', { actorId: 'reviewer_1' });

    const detail = await service.reviseAndPass('submission_1', {
      actorId: 'reviewer_1',
      comment: '已补齐理由。',
      revisedAnswers: { quality: 'pass', reason: '补充后的人工修订理由。' },
    });

    expect(detail.submission.status).toBe('RECHECK_REVIEWING');
    expect(db.assignments[0].status).toBe('UNDER_RECHECK');
    expect(detail.submission.answers).toEqual({ quality: 'pass', reason: '补充后的人工修订理由。' });
    expect(db.reviewRecords.at(-1)?.decision).toBe('revise_pass');
    expect(db.reviewRecords.at(-1)?.revisedAnswers).toEqual({
      quality: 'pass',
      reason: '补充后的人工修订理由。',
    });
  });

  it('直接修订后不会单题提前收口，待轮次全部决策后统一收口', async () => {
    const { service, db } = createService();

    await service.startReview('submission_1', { actorId: 'reviewer_1' });
    await service.reviseAndPass('submission_1', {
      actorId: 'reviewer_1',
      comment: '先修订，等统一收口。',
      revisedAnswers: { quality: 'pass', reason: '补充后的人工修订理由。' },
    });

    const pendingBeforeFinalize = await service.listPending();
    expect(pendingBeforeFinalize).toHaveLength(2);
    expect(pendingBeforeFinalize.map((item) => item.submissionId)).toEqual(
      expect.arrayContaining(['submission_1', 'submission_2']),
    );

    const detail = await service.rejectReview('submission_2', {
      actorId: 'reviewer_1',
      reason: '补充依据仍不足，需进一步修订。',
    });

    expect(detail.submission.status).toBe('NEEDS_REVISION');
    expect(db.submissions[0].status).toBe('FINAL_APPROVED');
    expect(db.submissions[1].status).toBe('NEEDS_REVISION');
    expect(db.assignments[0].status).toBe('FINAL_APPROVED');
    expect(db.assignments[1].status).toBe('NEEDS_REVISION');
    const pendingAfterFinalize = await service.listPending();
    expect(pendingAfterFinalize).toHaveLength(2);
    expect(pendingAfterFinalize.map((item) => item.submissionId)).toEqual(
      expect.arrayContaining(['submission_1', 'submission_2']),
    );
    expect(pendingAfterFinalize.find((item) => item.submissionId === 'submission_1')?.status).toBe('FINAL_APPROVED');
    expect(pendingAfterFinalize.find((item) => item.submissionId === 'submission_2')?.status).toBe('NEEDS_REVISION');
  });

  it('打回题重提后 reviewer 列表仍返回整任务，但只有重提题待再次审核', async () => {
    const { service, db } = createService();

    await service.startReview('submission_1', { actorId: 'reviewer_1' });
    await service.passReview('submission_1', {
      actorId: 'reviewer_1',
      comment: '第 1 题通过。',
    });
    await service.rejectReview('submission_2', {
      actorId: 'reviewer_1',
      reason: '第 2 题需要补充依据。',
    });

    const resubmission = createSubmission('submission_2_round_2', db.assignments[1], 'HUMAN_PENDING');
    resubmission.round = 2;
    resubmission.submittedAt = new Date('2026-05-21T09:00:00.000Z');
    resubmission.createdAt = new Date('2026-05-21T09:00:00.000Z');
    resubmission.updatedAt = new Date('2026-05-21T09:00:00.000Z');
    db.submissions.push(resubmission);
    db.assignments[1].status = 'SUBMITTED';
    db.reviewRecords.push(
      createAiRecord('ai_record_2_round_2', 'submission_2_round_2', 'manual', '重提后需要人工复审。', { overall: 70 }),
    );

    const pending = await service.listPending();

    expect(pending.map((item) => item.submissionId).sort()).toEqual(['submission_1', 'submission_2_round_2']);
    expect(pending.find((item) => item.submissionId === 'submission_1')).toEqual(
      expect.objectContaining({
        status: 'FINAL_APPROVED',
        round: 1,
        humanDecision: 'recheck_pass',
        roundStatus: 'completed',
        pendingCount: 0,
      }),
    );
    expect(pending.find((item) => item.submissionId === 'submission_2_round_2')).toEqual(
      expect.objectContaining({
        status: 'HUMAN_PENDING',
        round: 2,
        humanDecision: null,
        roundStatus: 'in_progress',
        pendingCount: 1,
      }),
    );
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
    expect(db.submissions[0].status).toBe('RECHECK_REVIEWING');
    expect(db.assignments[0].status).toBe('UNDER_RECHECK');

    const rejectResult = await service.batchReject({
      actorId: 'reviewer_2',
      submissionIds: ['submission_2'],
      reason: '批量打回原因。',
    });
    expect(rejectResult.processedCount).toBe(1);
    expect(db.submissions[1].status).toBe('RECHECK_REVIEWING');
    expect(db.assignments[1].status).toBe('UNDER_RECHECK');
    expect(db.auditLogs.at(-1)?.metadata).toEqual(
      expect.objectContaining({ action: 'HUMAN_REVIEW_BULK_REJECTED' }),
    );
  });

  it('批量通过遇到部分失败时返回逐条结果', async () => {
    const { service, db } = createService();
    db.submissions[1].status = 'FINAL_APPROVED';

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
      task: {
        findMany: async () => [
          {
            id: 'task_qa',
            createdAt: new Date('2026-05-21T07:55:00.000Z'),
          },
        ],
      },
      submission: {
        findMany: async (args?: { where?: { status?: { in?: SubmissionStatus[] }; assignment?: { taskId?: string } } }) =>
          materializeSubmissions(submissions, reviewRecords, auditLogs).filter((submission) => {
            const allowed = args?.where?.status?.in;
            const taskId = args?.where?.assignment?.taskId;
            return (allowed ? allowed.includes(submission.status) : true) && (taskId ? submission.assignment.taskId === taskId : true);
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
      deadline: new Date('2026-06-01T15:59:00.000Z'),
      template: {
        id: 'template_qa',
        name: '问答质量官方模板',
        datasetKind: 'qa_quality',
        schemaVersion: 'qa-r1',
        schema: {
          schemaVersion: 'qa-r1',
          datasetKind: 'qa_quality',
          fields: [
            { key: 'quality', type: 'radio', label: '质量判断' },
            { key: 'reason', type: 'textarea', label: '判断理由' },
          ],
        },
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
