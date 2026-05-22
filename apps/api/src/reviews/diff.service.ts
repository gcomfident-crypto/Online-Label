import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.ts';

type SubmissionRoundRecord = {
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

type ReviewDiffPrismaClient = {
  submission: {
    findMany: (args: { where: { assignmentId: string }; orderBy: { round: 'asc' } }) => Promise<SubmissionRoundRecord[]>;
  };
};

export type SubmissionRoundDto = {
  submissionId: string;
  assignmentId: string;
  status: string;
  round: number;
  answers: Record<string, unknown>;
  schemaVersion: string;
  submittedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type SubmissionFieldDiffDto = {
  fieldKey: string;
  type: 'added' | 'removed' | 'changed';
  before: unknown;
  after: unknown;
  addedItems?: unknown[];
  removedItems?: unknown[];
};

export type SubmissionDiffDto = {
  assignmentId: string;
  fromRound: number;
  toRound: number;
  fromSubmissionId: string;
  toSubmissionId: string;
  changes: SubmissionFieldDiffDto[];
};

@Injectable()
export class ReviewDiffService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: ReviewDiffPrismaClient,
  ) {}

  async listRounds(assignmentId: string): Promise<SubmissionRoundDto[]> {
    const rounds = await this.findRounds(assignmentId);

    return rounds.map(toSubmissionRoundDto);
  }

  async getDiff(
    assignmentId: string,
    input: { fromRound: number; toRound: number },
  ): Promise<SubmissionDiffDto> {
    const fromRound = normalizeRound(input.fromRound);
    const toRound = normalizeRound(input.toRound);
    if (fromRound === toRound) {
      throw new BadRequestException({
        code: 'REVIEW_DIFF_ROUNDS_SAME',
        message: '请选择两个不同轮次进行对比。',
      });
    }

    const rounds = await this.findRounds(assignmentId);
    const fromSubmission = rounds.find((submission) => submission.round === fromRound);
    const toSubmission = rounds.find((submission) => submission.round === toRound);
    if (!fromSubmission || !toSubmission) {
      throw new NotFoundException({
        code: 'REVIEW_DIFF_ROUND_NOT_FOUND',
        message: '指定轮次不存在，无法生成 Diff。',
      });
    }

    return {
      assignmentId,
      fromRound,
      toRound,
      fromSubmissionId: fromSubmission.id,
      toSubmissionId: toSubmission.id,
      changes: diffAnswers(fromSubmission.answers, toSubmission.answers),
    };
  }

  private async findRounds(assignmentId: string): Promise<SubmissionRoundRecord[]> {
    if (!assignmentId.trim()) {
      throw new BadRequestException({
        code: 'REVIEW_DIFF_ASSIGNMENT_REQUIRED',
        message: '缺少领取记录 ID，无法查询提交轮次。',
      });
    }

    const rounds = await this.prisma.submission.findMany({
      where: { assignmentId },
      orderBy: { round: 'asc' },
    });
    if (rounds.length === 0) {
      throw new NotFoundException({
        code: 'REVIEW_ROUNDS_NOT_FOUND',
        message: '该领取记录暂无提交轮次。',
      });
    }

    return rounds;
  }
}

function toSubmissionRoundDto(submission: SubmissionRoundRecord): SubmissionRoundDto {
  return {
    submissionId: submission.id,
    assignmentId: submission.assignmentId,
    status: submission.status,
    round: submission.round,
    answers: submission.answers,
    schemaVersion: submission.schemaVersion,
    submittedAt: submission.submittedAt.toISOString(),
    createdAt: submission.createdAt.toISOString(),
    updatedAt: submission.updatedAt.toISOString(),
  };
}

function diffAnswers(
  beforeAnswers: Record<string, unknown>,
  afterAnswers: Record<string, unknown>,
): SubmissionFieldDiffDto[] {
  const fieldKeys = Array.from(new Set([...Object.keys(beforeAnswers), ...Object.keys(afterAnswers)])).sort();

  return fieldKeys.flatMap<SubmissionFieldDiffDto>((fieldKey) => {
    const hasBefore = Object.prototype.hasOwnProperty.call(beforeAnswers, fieldKey);
    const hasAfter = Object.prototype.hasOwnProperty.call(afterAnswers, fieldKey);
    const before = beforeAnswers[fieldKey];
    const after = afterAnswers[fieldKey];

    if (!hasBefore && hasAfter) {
      return [{ fieldKey, type: 'added' as const, before: null, after }];
    }
    if (hasBefore && !hasAfter) {
      return [{ fieldKey, type: 'removed' as const, before, after: null }];
    }
    if (sameValue(before, after)) {
      return [];
    }

    return [
      {
        fieldKey,
        type: 'changed' as const,
        before,
        after,
        ...arrayItemDiff(before, after),
      },
    ];
  });
}

function arrayItemDiff(before: unknown, after: unknown): Pick<SubmissionFieldDiffDto, 'addedItems' | 'removedItems'> {
  if (!Array.isArray(before) || !Array.isArray(after)) {
    return {};
  }

  return {
    addedItems: after.filter((item) => !before.some((candidate) => sameValue(candidate, item))),
    removedItems: before.filter((item) => !after.some((candidate) => sameValue(candidate, item))),
  };
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizeRound(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new BadRequestException({
      code: 'REVIEW_DIFF_ROUND_INVALID',
      message: '轮次必须是正整数。',
    });
  }

  return value;
}
