import { describe, expect, it, vi } from 'vitest';

import { AiReviewController } from './ai-review.controller.ts';

describe('AiReviewController', () => {
  it('暴露 AI 队列、重试和单条机审详情接口', async () => {
    const service = {
      listJobs: vi.fn().mockResolvedValue([{ id: 'job_1' }]),
      retryJob: vi.fn().mockResolvedValue({ id: 'job_1', status: 'QUEUED' }),
      getSubmissionReview: vi.fn().mockResolvedValue({ submission: { id: 'submission_1' } }),
    };
    const controller = new AiReviewController(service);

    await expect(controller.listJobs('FAILED_FINAL')).resolves.toEqual([{ id: 'job_1' }]);
    await expect(controller.retryJob('job_1')).resolves.toEqual({ id: 'job_1', status: 'QUEUED' });
    await expect(controller.getSubmissionReview('submission_1')).resolves.toEqual({
      submission: { id: 'submission_1' },
    });

    expect(service.listJobs).toHaveBeenCalledWith({ status: 'FAILED_FINAL' });
    expect(service.retryJob).toHaveBeenCalledWith('job_1');
    expect(service.getSubmissionReview).toHaveBeenCalledWith('submission_1');
  });
});
