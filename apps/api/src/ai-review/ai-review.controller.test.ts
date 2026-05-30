import { describe, expect, it, vi } from 'vitest';

import { AiReviewController } from './ai-review.controller.ts';

describe('AiReviewController', () => {
  it('暴露 AI 队列、重试和单条机审详情接口', async () => {
    const service = {
      listBatches: vi.fn().mockResolvedValue([{ batchId: 'task-submit-1' }]),
      getBatchReview: vi.fn().mockResolvedValue({ batchId: 'task-submit-1', items: [] }),
      listJobs: vi.fn().mockResolvedValue([{ id: 'job_1' }]),
      retryJob: vi.fn().mockResolvedValue({ id: 'job_1', status: 'QUEUED' }),
      completeJob: vi.fn().mockResolvedValue({ submission: { id: 'submission_1', status: 'HUMAN_PENDING' } }),
      getSubmissionReview: vi.fn().mockResolvedValue({ submission: { id: 'submission_1' } }),
    };
    const controller = new AiReviewController(service);

    await expect(controller.listBatches('PENDING')).resolves.toEqual([{ batchId: 'task-submit-1' }]);
    await expect(controller.getBatchReview('task-submit-1')).resolves.toEqual({
      batchId: 'task-submit-1',
      items: [],
    });
    await expect(controller.listJobs('FAILED_FINAL')).resolves.toEqual([{ id: 'job_1' }]);
    await expect(controller.retryJob('job_1')).resolves.toEqual({ id: 'job_1', status: 'QUEUED' });
    await expect(
      controller.completeJob('job_1', {
        actorId: 'ai_agent_1',
        decision: ' pass ',
        scores: { overall: 91 },
        comment: '  AI 预审通过。 ',
      }),
    ).resolves.toEqual({ submission: { id: 'submission_1', status: 'HUMAN_PENDING' } });
    await expect(controller.getSubmissionReview('submission_1')).resolves.toEqual({
      submission: { id: 'submission_1' },
    });

    expect(service.listBatches).toHaveBeenCalledWith({ status: 'PENDING' });
    expect(service.getBatchReview).toHaveBeenCalledWith('task-submit-1');
    expect(service.listJobs).toHaveBeenCalledWith({ status: 'FAILED_FINAL' });
    expect(service.retryJob).toHaveBeenCalledWith('job_1');
    expect(service.completeJob).toHaveBeenCalledWith('job_1', {
      actorId: 'ai_agent_1',
      decision: 'pass',
      scores: { overall: 91 },
      comment: 'AI 预审通过。',
    });
    expect(service.getSubmissionReview).toHaveBeenCalledWith('submission_1');
  });
});
