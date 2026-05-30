import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { RendererSampleSchemaResponse } from '@labelhub/shared';

import { DebugController } from './debug.controller.ts';

const sampleSchemaResponse: RendererSampleSchemaResponse = {
  schemas: {
    qa_quality: {
      schemaVersion: '1.0.0',
      datasetKind: 'qa_quality',
      fields: [],
    },
    preference_compare: {
      schemaVersion: '1.0.0',
      datasetKind: 'preference_compare',
      fields: [],
    },
    title_cleanup: {
      schemaVersion: '1.0.0',
      datasetKind: 'generic_json',
      fields: [],
    },
  },
};

describe('DebugController', () => {
  it('returns seed count structure in development', async () => {
    const controller = new DebugController(
      {
        getSeedStatus: async () => ({
          users: 4,
          templates: 0,
          tasks: 0,
          taskItems: {
            qa_quality: 0,
            preference_compare: 0,
          },
        }),
        listTasks: async () => [],
        listUsers: async () => [],
        getSampleSchema: () => sampleSchemaResponse,
      },
      { NODE_ENV: 'development' },
    );

    await expect(controller.getSeedStatus()).resolves.toEqual({
      users: 4,
      templates: 0,
      tasks: 0,
      taskItems: {
        qa_quality: 0,
        preference_compare: 0,
      },
    });
  });

  it('development 环境返回 Renderer 调试示例 Schema', () => {
    const controller = new DebugController(
      {
        getSeedStatus: async () => ({
          users: 4,
          templates: 0,
          tasks: 0,
          taskItems: {
            qa_quality: 0,
            preference_compare: 0,
          },
        }),
        listTasks: async () => [],
        listUsers: async () => [],
        getSampleSchema: () => sampleSchemaResponse,
      },
      { NODE_ENV: 'development' },
    );

    expect(controller.getSampleSchema()).toEqual(sampleSchemaResponse);
  });

  it('hides debug routes in test', async () => {
    const controller = createHiddenDebugController({ NODE_ENV: 'test' });

    await expect(controller.getSeedStatus()).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('hides debug routes when NODE_ENV is unset', async () => {
    const controller = createHiddenDebugController({});

    await expect(controller.getSeedStatus()).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('hides debug routes in production', async () => {
    const controller = createHiddenDebugController({ NODE_ENV: 'production' });

    await expect(controller.getSeedStatus()).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

function createHiddenDebugController(env: { NODE_ENV?: string }): DebugController {
  return new DebugController(
    {
      getSeedStatus: async () => ({
        users: 0,
        templates: 0,
        tasks: 0,
        taskItems: { qa_quality: 0, preference_compare: 0 },
      }),
      listTasks: async () => [],
      listUsers: async () => [],
      getSampleSchema: () => sampleSchemaResponse,
    },
    env,
  );
}
