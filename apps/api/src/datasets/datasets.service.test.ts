import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { DatasetsService, type TaskItemRecord } from './datasets.service.ts';

describe('DatasetsService', () => {
  it('导入 JSONL 后按 taskId 和 externalId upsert 题目', async () => {
    const { service, taskItems } = createService();

    const result = await service.importItems('task_qa', {
      datasetKind: 'qa_quality',
      format: 'jsonl',
      fileName: 'qa_quality.jsonl',
      content: [
        JSON.stringify(createQaRecord('qa_1')),
        JSON.stringify(createQaRecord('qa_2')),
      ].join('\n'),
    });

    expect(result.importedCount).toBe(2);
    expect(result.errorCount).toBe(0);
    expect(taskItems).toHaveLength(2);
    expect(taskItems[0]).toMatchObject({
      taskId: 'task_qa',
      externalId: 'qa_1',
      datasetKind: 'qa_quality',
      status: 'UNASSIGNED',
      sortOrder: 1,
    });
  });

  it('导入题目数据后持久化文件摘要供任务刷新后回显', async () => {
    const { service, persistedDatasetImportSummaries } = createService();

    await service.importItems('task_qa', {
      datasetKind: 'qa_quality',
      format: 'json',
      fileName: 'qa_refresh.json',
      content: JSON.stringify([createQaRecord('qa_refresh_1')]),
    });

    expect(persistedDatasetImportSummaries).toEqual([
      expect.objectContaining({
        taskId: 'task_qa',
        datasetKind: 'qa_quality',
        importedCount: 1,
        files: [
          expect.objectContaining({
            fileName: 'qa_refresh.json',
            format: 'json',
            importedCount: 1,
          }),
        ],
      }),
    ]);
  });

  it('拒绝和任务模板 profile 不一致的导入', async () => {
    const { service } = createService();

    await expect(
      service.importItems('task_qa', {
        datasetKind: 'preference_compare',
        format: 'json',
        fileName: 'preference_compare.json',
        content: JSON.stringify([]),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('查询题目列表并支持 rawData 字段合并更新', async () => {
    const { service } = createService({
      taskItems: [
        createTaskItem({
          id: 'item_2',
          externalId: 'qa_2',
          rawData: createQaRecord('qa_2'),
          sortOrder: 2,
        }),
        createTaskItem({
          id: 'item_1',
          externalId: 'qa_1',
          rawData: createQaRecord('qa_1'),
          sortOrder: 1,
        }),
      ],
    });

    await expect(service.listItems('task_qa')).resolves.toMatchObject([
      { id: 'item_1', externalId: 'qa_1' },
      { id: 'item_2', externalId: 'qa_2' },
    ]);

    await expect(
      service.updateItem('item_1', { rawDataPatch: { reviewer_note: '需要补充事实依据' } }),
    ).resolves.toMatchObject({
      id: 'item_1',
      rawData: expect.objectContaining({ reviewer_note: '需要补充事实依据' }),
    });
  });

  it('查询不存在题目返回 NotFoundException', async () => {
    const { service } = createService();

    await expect(service.updateItem('missing', { rawDataPatch: { foo: 'bar' } })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

function createQaRecord(id: string) {
  return {
    id,
    prompt: `问题 ${id}`,
    model_answer: `回答 ${id}`,
    expected_dimensions: ['事实准确', '信息完整'],
  };
}

function createTaskItem(overrides: Partial<TaskItemRecord> = {}): TaskItemRecord {
  const now = new Date('2026-05-21T00:00:00.000Z');

  return {
    id: 'item_1',
    taskId: 'task_qa',
    externalId: 'qa_1',
    datasetKind: 'qa_quality',
    rawData: createQaRecord('qa_1'),
    status: 'UNASSIGNED',
    sortOrder: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createService(overrides: { taskItems?: TaskItemRecord[] } = {}) {
  const taskItems = overrides.taskItems ?? [];
  const persistedDatasetImportSummaries: unknown[] = [];
  const now = new Date('2026-05-21T00:00:00.000Z');
  const prisma = {
    task: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === 'task_qa'
          ? {
              id: 'task_qa',
              template: { datasetKind: 'qa_quality' as const },
            }
          : null,
      update: async ({ data }: { data: { datasetImportSummary?: unknown } }) => {
        persistedDatasetImportSummaries.push(data.datasetImportSummary);
        return {};
      },
    },
    taskItem: {
      count: async ({ where }: { where: { taskId: string } }) =>
        taskItems.filter((item) => item.taskId === where.taskId).length,
      upsert: async ({
        where,
        update,
        create,
      }: {
        where: { taskId_externalId: { taskId: string; externalId: string } };
        update: Partial<TaskItemRecord>;
        create: Partial<TaskItemRecord>;
      }) => {
        const index = taskItems.findIndex(
          (item) =>
            item.taskId === where.taskId_externalId.taskId &&
            item.externalId === where.taskId_externalId.externalId,
        );

        if (index >= 0) {
          taskItems[index] = { ...taskItems[index], ...update, updatedAt: now };
          return taskItems[index];
        }

        const item = createTaskItem({
          ...create,
          id: create.id ?? `item_${taskItems.length + 1}`,
          status: create.status ?? 'UNASSIGNED',
          createdAt: now,
          updatedAt: now,
        });
        taskItems.push(item);
        return item;
      },
      findMany: async ({ where }: { where: { taskId: string } }) =>
        taskItems
          .filter((item) => item.taskId === where.taskId)
          .sort((left, right) => left.sortOrder - right.sortOrder),
      findUnique: async ({ where }: { where: { id: string } }) =>
        taskItems.find((item) => item.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Partial<TaskItemRecord> }) => {
        const index = taskItems.findIndex((item) => item.id === where.id);
        taskItems[index] = { ...taskItems[index], ...data, updatedAt: now };
        return taskItems[index];
      },
    },
  };

  return {
    persistedDatasetImportSummaries,
    taskItems,
    service: new DatasetsService(prisma),
  };
}
