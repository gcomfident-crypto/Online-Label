import { describe, expect, it } from 'vitest';

import { validateDatasetRecord } from '@labelhub/shared';
import { buildSeedData } from '../../../prisma/seed.ts';

describe('buildSeedData', () => {
  it('builds stable demo users, templates, tasks, and item counts', () => {
    const first = buildSeedData();
    const second = buildSeedData();

    expect(first.users).toHaveLength(4);
    expect(first.users).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'user_owner_zhang_man',
          name: '张满',
          role: 'OWNER',
        }),
        expect.objectContaining({
          id: 'user_labeler_li_lei',
          name: '李雷',
          role: 'LABELER',
        }),
        expect.objectContaining({
          id: 'user_reviewer_wang_fang',
          name: '王芳',
          role: 'REVIEWER',
        }),
        expect.objectContaining({
          id: 'user_ai_agent_system',
          name: '系统机审账号',
          role: 'AI_AGENT',
        }),
      ]),
    );

    expect(first.templates).toHaveLength(2);
    expect(first.templates.every((template) => template.status === 'PUBLISHED')).toBe(true);
    expect(first.templates.every((template) => template.version === 1)).toBe(true);
    expect(first.tasks.map((task) => task.id)).toEqual([
      'task_qa_quality_demo',
      'task_preference_compare_demo',
    ]);
    expect(first.tasks.every((task) => task.status === 'PUBLISHED')).toBe(true);
    expect(first.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          quota: 30,
          distributionStrategy: 'FIRST_COME_FIRST_SERVE',
          rewardRule: '0.30 元 / 条',
        }),
      ]),
    );
    expect(
      first.taskItems.filter((item) => item.datasetKind === 'qa_quality'),
    ).toHaveLength(30);
    expect(
      first.taskItems.filter((item) => item.datasetKind === 'preference_compare'),
    ).toHaveLength(12);
    expect(first.assignments).toHaveLength(2);
    expect(first.submissions).toHaveLength(3);
    expect(first.aiReviewJobs).toHaveLength(2);
    expect(first.reviewRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ decision: 'reject', reviewerType: 'HUMAN' }),
        expect.objectContaining({ decision: 'final_pass', stage: 'FINAL' }),
      ]),
    );
    expect(first.exportJobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'SUCCEEDED',
          format: 'json',
        }),
      ]),
    );
    for (const item of first.taskItems) {
      const rawData = item.rawData as Record<string, unknown>;

      expect(rawData.id).toBe(item.externalId);
      expect(validateDatasetRecord(item.datasetKind, rawData)).toEqual({
        ok: true,
        missingFields: [],
      });
    }
    expect(second).toEqual(first);
  });
});
