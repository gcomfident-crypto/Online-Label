import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { DebugController } from './debug.controller.ts';

describe('DebugController', () => {
  it('returns seed count structure outside production', async () => {
    const controller = new DebugController(
      {
        getSeedStatus: async () => ({
          users: 4,
          templates: 2,
          tasks: 2,
          taskItems: {
            qa_quality: 30,
            preference_compare: 12,
          },
        }),
        listTasks: async () => [],
        listUsers: async () => [],
      },
      { NODE_ENV: 'test' },
    );

    await expect(controller.getSeedStatus()).resolves.toEqual({
      users: 4,
      templates: 2,
      tasks: 2,
      taskItems: {
        qa_quality: 30,
        preference_compare: 12,
      },
    });
  });

  it('hides debug routes in production', async () => {
    const controller = new DebugController(
      {
        getSeedStatus: async () => ({
          users: 0,
          templates: 0,
          tasks: 0,
          taskItems: { qa_quality: 0, preference_compare: 0 },
        }),
        listTasks: async () => [],
        listUsers: async () => [],
      },
      { NODE_ENV: 'production' },
    );

    await expect(controller.getSeedStatus()).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
