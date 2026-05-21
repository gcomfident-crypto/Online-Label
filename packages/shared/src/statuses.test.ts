import { describe, expect, it } from 'vitest';

import {
  FINAL_REVIEW_STATUS,
  TASK_STATUS,
  AI_REVIEW_STATUS_LABELS,
  EXPORT_STATUS_LABELS,
  FINAL_REVIEW_STATUS_LABELS,
  HUMAN_REVIEW_STATUS_LABELS,
  SUBMISSION_STATUS_LABELS,
  TASK_STATUS_LABELS,
} from '.';

describe('中文状态标签', () => {
  it('覆盖任务状态中文标签', () => {
    expect(TASK_STATUS.PUBLISHED).toBe('PUBLISHED');
    expect(Object.values(TASK_STATUS_LABELS)).toEqual(
      expect.arrayContaining(['草稿', '发布中', '已暂停', '已结束']),
    );
  });

  it('覆盖提交状态中文标签', () => {
    expect(Object.values(SUBMISSION_STATUS_LABELS)).toEqual(
      expect.arrayContaining(['草稿', '已提交', '已打回']),
    );
  });

  it('覆盖 AI 审核状态中文标签', () => {
    expect(Object.values(AI_REVIEW_STATUS_LABELS)).toEqual(
      expect.arrayContaining(['AI 预审中', 'AI 预审通过', 'AI 预审异常']),
    );
  });

  it('覆盖人工复审和终审状态中文标签', () => {
    expect(Object.values(HUMAN_REVIEW_STATUS_LABELS)).toEqual(
      expect.arrayContaining(['待人工复审', '复审通过', '已打回']),
    );
    expect(FINAL_REVIEW_STATUS.FINAL_APPROVED).toBe('FINAL_APPROVED');
    expect(Object.values(FINAL_REVIEW_STATUS_LABELS)).toEqual(
      expect.arrayContaining(['待终审', '终审通过', '已打回']),
    );
  });

  it('覆盖导出状态中文标签', () => {
    expect(Object.values(EXPORT_STATUS_LABELS)).toEqual(
      expect.arrayContaining(['等待导出', '导出中', '导出成功', '导出失败']),
    );
  });
});
