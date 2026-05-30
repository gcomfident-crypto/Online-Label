import { describe, expect, it } from 'vitest';

import {
  AI_REVIEW_STATUS,
  FINAL_REVIEW_STATUS,
  EXPORT_STATUS,
  TASK_STATUS,
  AI_REVIEW_STATUS_LABELS,
  EXPORT_STATUS_LABELS,
  FINAL_REVIEW_STATUS_LABELS,
  HUMAN_REVIEW_STATUS,
  HUMAN_REVIEW_STATUS_LABELS,
  SUBMISSION_STATUS,
  SUBMISSION_STATUS_LABELS,
  TASK_STATUS_LABELS,
} from '.';

describe('中文状态标签', () => {
  it('覆盖任务状态中文标签', () => {
    expect(TASK_STATUS.PUBLISHED).toBe('PUBLISHED');
    expect(Object.values(TASK_STATUS_LABELS)).toEqual(
      expect.arrayContaining(['草稿', '进行中', '已暂停', '已完成']),
    );
  });

  it('覆盖提交状态中文标签', () => {
    expect(SUBMISSION_STATUS.AI_REVIEWING).toBe('AI_REVIEWING');
    expect(SUBMISSION_STATUS.HUMAN_PENDING).toBe('HUMAN_PENDING');
    expect(SUBMISSION_STATUS.FINAL_PENDING).toBe('FINAL_PENDING');
    expect(SUBMISSION_STATUS.FINAL_APPROVED).toBe('FINAL_APPROVED');
    expect(SUBMISSION_STATUS.NEEDS_REVISION).toBe('NEEDS_REVISION');
    expect(Object.values(SUBMISSION_STATUS_LABELS)).toEqual(
      expect.arrayContaining([
        '草稿',
        '已提交',
        'AI 预审中',
        '待人工复审',
        '已完成',
        '已打回',
      ]),
    );
  });

  it('覆盖 AI 审核状态中文标签', () => {
    expect(AI_REVIEW_STATUS.QUEUED).toBe('QUEUED');
    expect(AI_REVIEW_STATUS.RUNNING).toBe('RUNNING');
    expect(Object.values(AI_REVIEW_STATUS_LABELS)).toEqual(
      expect.arrayContaining([
        '等待 AI 预审',
        'AI 预审中',
        'AI 预审通过',
        'AI 预审终止',
        '转人工处理',
      ]),
    );
  });

  it('覆盖人工复审状态中文标签', () => {
    expect(HUMAN_REVIEW_STATUS.RECHECK_REVIEWING).toBe('RECHECK_REVIEWING');
    expect(Object.values(HUMAN_REVIEW_STATUS_LABELS)).toEqual(
      expect.arrayContaining([
        '待人工复审',
        '人工复审中',
        '复审通过',
        '已完成',
        '已打回',
      ]),
    );
    expect(FINAL_REVIEW_STATUS.FINAL_APPROVED).toBe('FINAL_APPROVED');
    expect(Object.values(FINAL_REVIEW_STATUS_LABELS)).toEqual(
      expect.arrayContaining(['已完成', '已打回']),
    );
  });

  it('覆盖导出状态中文标签', () => {
    expect(EXPORT_STATUS.QUEUED).toBe('QUEUED');
    expect(EXPORT_STATUS.PROCESSING).toBe('PROCESSING');
    expect(Object.values(EXPORT_STATUS_LABELS)).toEqual(
      expect.arrayContaining(['等待导出', '导出中', '导出成功', '导出失败']),
    );
  });
});
