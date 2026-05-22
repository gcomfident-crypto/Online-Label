import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { ReviewDiffService } from './diff.service.ts';

type SubmissionRecord = {
  id: string;
  assignmentId: string;
  status: string;
  round: number;
  answers: Record<string, unknown>;
  schemaVersion: string;
  submittedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

describe('ReviewDiffService', () => {
  it('按 assignment 查询不可变提交轮次', async () => {
    const service = createService();

    await expect(service.listRounds('assignment_1')).resolves.toEqual([
      expect.objectContaining({ submissionId: 'submission_round_1', round: 1, status: 'NEEDS_REVISION' }),
      expect.objectContaining({ submissionId: 'submission_round_2', round: 2, status: 'FINAL_PENDING' }),
    ]);
  });

  it('对比第 1 轮和第 2 轮 answers，标出新增、删除和修改字段', async () => {
    const service = createService();

    const diff = await service.getDiff('assignment_1', { fromRound: 1, toRound: 2 });

    expect(diff).toEqual(
      expect.objectContaining({
        assignmentId: 'assignment_1',
        fromRound: 1,
        toRound: 2,
        fromSubmissionId: 'submission_round_1',
        toSubmissionId: 'submission_round_2',
      }),
    );
    expect(diff.changes).toEqual([
      {
        fieldKey: 'added',
        type: 'added',
        before: null,
        after: '新字段',
      },
      {
        fieldKey: 'quality',
        type: 'changed',
        before: 'pass',
        after: 'excellent',
      },
      {
        fieldKey: 'removed',
        type: 'removed',
        before: '旧字段',
        after: null,
      },
      {
        fieldKey: 'tags',
        type: 'changed',
        before: ['事实', '完整'],
        after: ['事实', '充分'],
        addedItems: ['充分'],
        removedItems: ['完整'],
      },
    ]);
  });

  it('缺少指定轮次时返回明确错误', async () => {
    const service = createService();

    await expect(service.getDiff('assignment_1', { fromRound: 1, toRound: 3 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

function createService() {
  const now = new Date('2026-05-21T08:00:00.000Z');
  const submissions: SubmissionRecord[] = [
    createSubmission(now, {
      id: 'submission_round_1',
      status: 'NEEDS_REVISION',
      round: 1,
      answers: {
        quality: 'pass',
        removed: '旧字段',
        tags: ['事实', '完整'],
      },
    }),
    createSubmission(now, {
      id: 'submission_round_2',
      status: 'FINAL_PENDING',
      round: 2,
      answers: {
        added: '新字段',
        quality: 'excellent',
        tags: ['事实', '充分'],
      },
    }),
  ];

  return new ReviewDiffService({
    submission: {
      findMany: async (args: { where: { assignmentId: string }; orderBy: { round: 'asc' } }) =>
        submissions
          .filter((submission) => submission.assignmentId === args.where.assignmentId)
          .sort((left, right) => left.round - right.round),
    },
  });
}

function createSubmission(now: Date, input: Partial<SubmissionRecord>): SubmissionRecord {
  return {
    id: input.id ?? 'submission_1',
    assignmentId: input.assignmentId ?? 'assignment_1',
    status: input.status ?? 'AI_QUEUED',
    round: input.round ?? 1,
    answers: input.answers ?? {},
    schemaVersion: input.schemaVersion ?? 'qa-r1',
    submittedAt: input.submittedAt ?? now,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}
