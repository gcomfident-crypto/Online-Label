import { describe, expect, it } from 'vitest';

import { buildSeedData } from '../../../prisma/seed.ts';

describe('buildSeedData', () => {
  it('builds stable base users and leaves business data empty', () => {
    const first = buildSeedData();
    const second = buildSeedData();

    expect(first.users).toHaveLength(5);
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
          id: 'user_labeler_han_mei_mei',
          name: '韩梅梅',
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

    expect(first.templates).toEqual([]);
    expect(first.tasks).toEqual([]);
    expect(first.taskItems).toEqual([]);
    expect(first.reviewRules).toEqual([]);
    expect(first.assignments).toEqual([]);
    expect(first.submissions).toEqual([]);
    expect(first.aiReviewJobs).toEqual([]);
    expect(first.reviewRecords).toEqual([]);
    expect(first.auditLogs).toEqual([]);
    expect(first.exportJobs).toEqual([]);
    expect(second).toEqual(first);
  });
});
