import { describe, expect, it } from 'vitest';

import {
  assertTaskTransition,
  canTransitionAiReview,
  canTransitionExport,
  canTransitionHumanReview,
  canTransitionSubmission,
  canTransitionTask,
} from '.';

describe('任务状态机', () => {
  it('允许合法任务状态迁移', () => {
    expect(canTransitionTask('DRAFT', 'PUBLISHED')).toBe(true);
    expect(canTransitionTask('PUBLISHED', 'PAUSED')).toBe(true);
    expect(canTransitionTask('PAUSED', 'PUBLISHED')).toBe(true);
    expect(canTransitionTask('PUBLISHED', 'ENDED')).toBe(true);
    expect(canTransitionTask('PAUSED', 'ENDED')).toBe(true);
  });

  it('拒绝非法任务状态迁移并抛出中文错误', () => {
    expect(canTransitionTask('ENDED', 'PUBLISHED')).toBe(false);
    expect(() => assertTaskTransition('ENDED', 'PUBLISHED')).toThrow(
      /任务状态不能从 已完成 流转到 进行中/,
    );
  });
});

describe('提交状态机', () => {
  it('允许返修后重新提交', () => {
    expect(canTransitionSubmission('NEEDS_REVISION', 'SUBMITTED')).toBe(true);
  });

  it('允许关闭 AI 预审后提交直接进入人工复审', () => {
    expect(canTransitionSubmission('SUBMITTED', 'HUMAN_PENDING')).toBe(true);
  });

  it('确保人工复审通过后直接完成，不再进入待终审', () => {
    expect(canTransitionSubmission('RECHECK_REVIEWING', 'FINAL_APPROVED')).toBe(true);
    expect(canTransitionSubmission('RECHECK_REVIEWING', 'FINAL_PENDING')).toBe(false);
  });
});

describe('AI 审核状态机', () => {
  it('允许运行中进入可重试失败', () => {
    expect(canTransitionAiReview('RUNNING', 'FAILED_RETRYING')).toBe(true);
  });

  it('拒绝最终失败回到队列', () => {
    expect(canTransitionAiReview('FAILED_FINAL', 'QUEUED')).toBe(false);
  });
});

describe('人工审核状态机', () => {
  it('覆盖人工复审直接完成的后半段链路', () => {
    expect(canTransitionHumanReview('HUMAN_PENDING', 'RECHECK_REVIEWING')).toBe(
      true,
    );
    expect(
      canTransitionHumanReview('RECHECK_REVIEWING', 'RECHECK_APPROVED'),
    ).toBe(true);
    expect(
      canTransitionHumanReview('RECHECK_REVIEWING', 'FINAL_APPROVED'),
    ).toBe(true);
    expect(canTransitionHumanReview('RECHECK_APPROVED', 'FINAL_PENDING')).toBe(false);
  });

  it('允许人工复审打回到待修订', () => {
    expect(
      canTransitionHumanReview('RECHECK_REVIEWING', 'RECHECK_REJECTED'),
    ).toBe(true);
    expect(canTransitionHumanReview('RECHECK_REJECTED', 'NEEDS_REVISION')).toBe(
      true,
    );
  });
});

describe('导出状态机', () => {
  it('允许处理中导出成功', () => {
    expect(canTransitionExport('PROCESSING', 'SUCCEEDED')).toBe(true);
  });

  it('拒绝队列中直接导出成功', () => {
    expect(canTransitionExport('QUEUED', 'SUCCEEDED')).toBe(false);
  });
});
