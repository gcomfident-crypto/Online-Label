import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { FinalReviewService } from './final-review.service.ts';

type AssignmentStatus = 'FINAL_PENDING' | 'NEEDS_REVISION';
type SubmissionStatus = 'FINAL_PENDING' | 'FINAL_APPROVED' | 'NEEDS_REVISION';
type ReviewStage = 'AI_PRECHECK' | 'RECHECK' | 'FINAL';

type ReviewRecord = {
  id: string;
  submissionId: string;
  ruleId: string | null;
  stage: ReviewStage;
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

describe('FinalReviewService', () => {
  it('只查询待终审提交，并保留 AI 与复审上下文', async () => {
    const { service } = createService();

    const pending = await service.listFinalPending();

    expect(pending).toHaveLength(1);
    expect(pending[0]).toEqual(
      expect.objectContaining({
        submissionId: 'submission_final',
        assignmentId: 'assignment_final',
        taskTitle: '问答质量标注',
        externalId: 'qa_final',
        status: 'FINAL_PENDING',
        aiDecision: 'pass',
        assignedReviewerId: 'reviewer_1',
      }),
    );
  });

  it('终审通过后写入 FINAL 审核记录并标记为 FINAL_APPROVED', async () => {
    const { service, db } = createService();

    const detail = await service.finalPass('submission_final', {
      actorId: 'final_reviewer',
      comment: '终审确认通过。',
    });

    expect(detail.submission.status).toBe('FINAL_APPROVED');
    expect(db.submissions[0].status).toBe('FINAL_APPROVED');
    expect(db.reviewRecords.at(-1)).toEqual(
      expect.objectContaining({
        submissionId: 'submission_final',
        stage: 'FINAL',
        reviewerType: 'HUMAN',
        reviewerId: 'final_reviewer',
        assignedReviewerId: 'reviewer_1',
        decision: 'final_pass',
        comment: '终审确认通过。',
      }),
    );
    expect(db.auditLogs.at(-1)).toEqual(
      expect.objectContaining({
        fromStatus: 'FINAL_PENDING',
        toStatus: 'FINAL_APPROVED',
        actorId: 'final_reviewer',
        metadata: { action: 'FINAL_REVIEW_APPROVED' },
      }),
    );
  });

  it('终审打回必须填写理由，并让 Labeler 可再次修改', async () => {
    const { service, db } = createService();

    await expect(
      service.finalReject('submission_final', { actorId: 'final_reviewer', reason: '  ' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const detail = await service.finalReject('submission_final', {
      actorId: 'final_reviewer',
      reason: '终审发现证据不足，需要补充。',
    });

    expect(detail.submission.status).toBe('NEEDS_REVISION');
    expect(db.assignments[0].status).toBe('NEEDS_REVISION');
    expect(db.reviewRecords.at(-1)).toEqual(
      expect.objectContaining({
        stage: 'FINAL',
        decision: 'final_reject',
        comment: '终审发现证据不足，需要补充。',
      }),
    );
    expect(db.auditLogs.at(-1)).toEqual(
      expect.objectContaining({
        fromStatus: 'FINAL_PENDING',
        toStatus: 'NEEDS_REVISION',
        reason: '终审发现证据不足，需要补充。',
        metadata: { action: 'FINAL_REVIEW_REJECTED' },
      }),
    );
  });
});

function createService() {
  const db = createFinalReviewDb();
  const service = new FinalReviewService(db.client as ConstructorParameters<typeof FinalReviewService>[0]);

  return { service, db };
}

function createFinalReviewDb() {
  const assignments: Assignment[] = [createAssignment('assignment_final', 'qa_final', 'FINAL_PENDING')];
  const submissions: Submission[] = [
    createSubmission('submission_final', assignments[0], 'FINAL_PENDING'),
    createSubmission('submission_done', createAssignment('assignment_done', 'qa_done', 'FINAL_PENDING'), 'FINAL_APPROVED'),
  ];
  const reviewRecords: ReviewRecord[] = [
    createAiRecord('ai_record_1', 'submission_final', 'pass', 'AI 预审通过。', { overall: 92 }),
    createRecheckRecord('recheck_record_1', 'submission_final', 'reviewer_1'),
  ];
  const auditLogs: AuditLog[] = [];
  const db = {
    assignments,
    submissions,
    reviewRecords,
    auditLogs,
    client: {
      submission: {
        findMany: async (args?: { where?: { status?: SubmissionStatus } }) =>
          materializeSubmissions(submissions, reviewRecords, auditLogs).filter((submission) =>
            args?.where?.status ? submission.status === args.where.status : true,
          ),
        findUnique: async (args: { where: { id: string } }) =>
          materializeSubmissions(submissions, reviewRecords, auditLogs).find((submission) => submission.id === args.where.id) ??
          null,
        update: async (args: { where: { id: string }; data: Partial<Submission> }) => {
          const submission = submissions.find((item) => item.id === args.where.id);
          if (!submission) {
            throw new Error('测试提交不存在。');
          }
          Object.assign(submission, args.data, { updatedAt: new Date('2026-05-21T09:30:00.000Z') });
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
        update: async (args: { where: { id: string }; data: { status: AssignmentStatus } }) => {
          const assignment = assignments.find((item) => item.id === args.where.id);
          if (!assignment) {
            throw new Error('测试领取记录不存在。');
          }
          assignment.status = args.data.status;
          return assignment;
        },
      },
      reviewRecord: {
        create: async (args: { data: Partial<ReviewRecord> }) => {
          const record = {
            id: `final_review_${reviewRecords.length + 1}`,
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
            createdAt: new Date('2026-05-21T09:35:00.000Z'),
            updatedAt: new Date('2026-05-21T09:35:00.000Z'),
            ...args.data,
          } as ReviewRecord;
          reviewRecords.push(record);
          return record;
        },
      },
      auditLog: {
        create: async (args: { data: Partial<AuditLog> }) => {
          const log = {
            id: `final_audit_${auditLogs.length + 1}`,
            taskId: args.data.taskId ?? 'task_qa',
            submissionId: args.data.submissionId ?? 'submission_final',
            fromStatus: args.data.fromStatus ?? null,
            toStatus: args.data.toStatus ?? 'UNKNOWN',
            actorId: args.data.actorId ?? null,
            reason: args.data.reason ?? null,
            metadata: args.data.metadata ?? null,
            createdAt: new Date('2026-05-21T09:36:00.000Z'),
            updatedAt: new Date('2026-05-21T09:36:00.000Z'),
          } as AuditLog;
          auditLogs.push(log);
          return log;
        },
      },
      $transaction: async <TResult>(callback: (client: ConstructorParameters<typeof FinalReviewService>[0]) => Promise<TResult>) =>
        callback(db.client as ConstructorParameters<typeof FinalReviewService>[0]),
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
    round: 2,
    answers: { quality: 'pass', reason: '第二轮补充后覆盖关键点。' },
    schemaVersion: 'qa-r1',
    submittedAt: new Date('2026-05-21T09:00:00.000Z'),
    reviewRecords: [],
    auditLogs: [],
    createdAt: new Date('2026-05-21T09:00:00.000Z'),
    updatedAt: new Date('2026-05-21T09:00:00.000Z'),
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
    modelMetadata: { provider: 'mock', model: 'mock-stable-reviewer' },
    retryCount: 0,
    idempotencyKey: `${submissionId}:2:ai-review`,
    createdAt: new Date('2026-05-21T09:02:00.000Z'),
    updatedAt: new Date('2026-05-21T09:02:00.000Z'),
  };
}

function createRecheckRecord(id: string, submissionId: string, reviewerId: string): ReviewRecord {
  return {
    ...createAiRecord(id, submissionId, 'recheck_pass', '复审通过。', {}),
    stage: 'RECHECK',
    reviewerId,
    assignedReviewerId: reviewerId,
    reviewerType: 'HUMAN',
    rawPrompt: null,
    rawOutput: null,
    structuredOutput: null,
    modelMetadata: null,
    idempotencyKey: null,
  };
}
