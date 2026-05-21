import { describe, expect, it } from 'vitest';

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
    expect(first.tasks.map((task) => task.id)).toEqual([
      'task_qa_quality_demo',
      'task_preference_compare_demo',
    ]);
    expect(
      first.taskItems.filter((item) => item.datasetKind === 'qa_quality'),
    ).toHaveLength(30);
    expect(
      first.taskItems.filter((item) => item.datasetKind === 'preference_compare'),
    ).toHaveLength(12);
    expect(second).toEqual(first);
  });
});
