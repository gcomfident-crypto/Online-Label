import { describe, expect, it } from 'vitest';

import { StateMachineService } from './state-machine.service.ts';

describe('StateMachineService', () => {
  const service = new StateMachineService();

  it('allows valid task, submission, AI review, human review, and export transitions', () => {
    expect(() => service.assertTaskTransition('DRAFT', 'PUBLISHED')).not.toThrow();
    expect(() =>
      service.assertSubmissionTransition('SUBMITTED', 'AI_QUEUED'),
    ).not.toThrow();
    expect(() => service.assertAiReviewTransition('QUEUED', 'RUNNING')).not.toThrow();
    expect(() =>
      service.assertHumanReviewTransition('HUMAN_PENDING', 'RECHECK_REVIEWING'),
    ).not.toThrow();
    expect(() => service.assertExportTransition('QUEUED', 'PROCESSING')).not.toThrow();
  });

  it('throws simplified Chinese errors for invalid transitions', () => {
    expect(() => service.assertTaskTransition('DRAFT', 'ENDED')).toThrow(
      '任务状态不能从 草稿 流转到 已结束',
    );
    expect(() =>
      service.assertSubmissionTransition('SUBMITTED', 'FINAL_APPROVED'),
    ).toThrow('提交状态不能从 已提交 流转到 终审通过');
    expect(() => service.assertExportTransition('SUCCEEDED', 'PROCESSING')).toThrow(
      '导出状态不能从 导出成功 流转到 导出中',
    );
  });
});
