import { describe, expect, it, vi } from 'vitest';

import { ReviewsController } from './reviews.controller.ts';

describe('ReviewsController', () => {
  it('暴露人工复审列表、详情、动作、批量和指派接口并归一化参数', async () => {
    const service = {
      listPending: vi.fn().mockResolvedValue([{ submissionId: 'submission_1' }]),
      listResults: vi.fn().mockResolvedValue([{ submissionId: 'submission_2' }]),
      getReview: vi.fn().mockResolvedValue({ submission: { id: 'submission_1' } }),
      getTimeline: vi.fn().mockResolvedValue([{ id: 'timeline_1' }]),
      startReview: vi.fn().mockResolvedValue({ submission: { id: 'submission_1' } }),
      passReview: vi.fn().mockResolvedValue({ submission: { id: 'submission_1' } }),
      rejectReview: vi.fn().mockResolvedValue({ submission: { id: 'submission_1' } }),
      reviseAndPass: vi.fn().mockResolvedValue({ submission: { id: 'submission_1' } }),
      batchPass: vi.fn().mockResolvedValue({ processedCount: 2 }),
      batchReject: vi.fn().mockResolvedValue({ processedCount: 1 }),
      assignReviews: vi.fn().mockResolvedValue({ processedCount: 2 }),
    };
    const diffService = {
      listRounds: vi.fn().mockResolvedValue([{ round: 1 }]),
      getDiff: vi.fn().mockResolvedValue({ changes: [] }),
    };
    const controller = new ReviewsController(service, diffService);

    await expect(controller.listPending(' reviewer_1 ', ' manual ')).resolves.toEqual([
      { submissionId: 'submission_1' },
    ]);
    await expect(controller.listResults(' reject ')).resolves.toEqual([{ submissionId: 'submission_2' }]);
    await expect(controller.getReview('submission_1')).resolves.toEqual({ submission: { id: 'submission_1' } });
    await expect(controller.getTimeline('submission_1')).resolves.toEqual([{ id: 'timeline_1' }]);
    await expect(controller.listRounds('assignment_1')).resolves.toEqual([{ round: 1 }]);
    await expect(controller.getDiff('assignment_1', '1', '2')).resolves.toEqual({ changes: [] });
    await expect(controller.start('submission_1', { actorId: ' reviewer_1 ' })).resolves.toEqual({
      submission: { id: 'submission_1' },
    });
    await expect(
      controller.pass('submission_1', { actorId: ' reviewer_1 ', comment: ' 同意通过。 ' }),
    ).resolves.toEqual({ submission: { id: 'submission_1' } });
    await expect(
      controller.reject('submission_1', {
        actorId: ' reviewer_1 ',
        reason: ' 证据不足。 ',
        fieldReviews: [
          {
            fieldKey: ' reason ',
            label: ' 判断理由 ',
            comment: ' 请补充判断依据。 ',
            value: '覆盖关键点。',
          },
          {
            fieldKey: '',
            label: '无效字段',
            comment: '不会进入服务层',
          },
        ],
      }),
    ).resolves.toEqual({ submission: { id: 'submission_1' } });
    await expect(
      controller.reviseAndPass('submission_1', {
        actorId: ' reviewer_1 ',
        comment: ' 已修订。 ',
        revisedAnswers: { quality: 'pass' },
      }),
    ).resolves.toEqual({ submission: { id: 'submission_1' } });
    await expect(
      controller.batchPass({
        actorId: ' reviewer_1 ',
        submissionIds: [' submission_1 ', 'submission_2', '', 'submission_1'],
        comment: ' 批量通过。 ',
      }),
    ).resolves.toEqual({ processedCount: 2 });
    await expect(
      controller.batchReject({
        actorId: ' reviewer_1 ',
        submissionIds: [' submission_2 '],
        reason: ' 批量打回。 ',
      }),
    ).resolves.toEqual({ processedCount: 1 });
    await expect(
      controller.assign({
        actorId: ' reviewer_lead ',
        reviewerId: ' reviewer_2 ',
        submissionIds: [' submission_1 ', 'submission_2'],
      }),
    ).resolves.toEqual({ processedCount: 2 });

    expect(service.listPending).toHaveBeenCalledWith({ reviewerId: 'reviewer_1', aiDecision: 'manual' });
    expect(service.listResults).toHaveBeenCalledWith({ verdict: 'reject' });
    expect(service.getReview).toHaveBeenCalledWith('submission_1');
    expect(service.getTimeline).toHaveBeenCalledWith('submission_1');
    expect(diffService.listRounds).toHaveBeenCalledWith('assignment_1');
    expect(diffService.getDiff).toHaveBeenCalledWith('assignment_1', { fromRound: 1, toRound: 2 });
    expect(service.startReview).toHaveBeenCalledWith('submission_1', { actorId: 'reviewer_1' });
    expect(service.passReview).toHaveBeenCalledWith('submission_1', {
      actorId: 'reviewer_1',
      comment: '同意通过。',
    });
    expect(service.rejectReview).toHaveBeenCalledWith('submission_1', {
      actorId: 'reviewer_1',
      reason: '证据不足。',
      fieldReviews: [
        {
          fieldKey: 'reason',
          label: '判断理由',
          comment: '请补充判断依据。',
          value: '覆盖关键点。',
        },
      ],
    });
    expect(service.reviseAndPass).toHaveBeenCalledWith('submission_1', {
      actorId: 'reviewer_1',
      comment: '已修订。',
      revisedAnswers: { quality: 'pass' },
    });
    expect(service.batchPass).toHaveBeenCalledWith({
      actorId: 'reviewer_1',
      submissionIds: ['submission_1', 'submission_2'],
      comment: '批量通过。',
    });
    expect(service.batchReject).toHaveBeenCalledWith({
      actorId: 'reviewer_1',
      submissionIds: ['submission_2'],
      reason: '批量打回。',
    });
    expect(service.assignReviews).toHaveBeenCalledWith({
      actorId: 'reviewer_lead',
      reviewerId: 'reviewer_2',
      submissionIds: ['submission_1', 'submission_2'],
    });
  });
});
