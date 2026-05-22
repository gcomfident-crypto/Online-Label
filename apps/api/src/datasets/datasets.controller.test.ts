import { describe, expect, it, vi } from 'vitest';

import { DatasetsController } from './datasets.controller.ts';

describe('DatasetsController', () => {
  it('转发导入、zip 导入、列表和单题更新请求', async () => {
    const service = {
      importItems: vi.fn().mockResolvedValue({ importedCount: 2 }),
      importZipItems: vi.fn().mockResolvedValue({ importedCount: 30 }),
      listItems: vi.fn().mockResolvedValue([{ id: 'item_1' }]),
      updateItem: vi.fn().mockResolvedValue({ id: 'item_1', rawData: { prompt: '更新后' } }),
    };
    const controller = new DatasetsController(service);

    await expect(
      controller.importItems('task_1', {
        datasetKind: 'qa_quality',
        format: 'jsonl',
        fileName: 'qa_quality.jsonl',
        content: '{"id":"qa_1"}',
      }),
    ).resolves.toEqual({ importedCount: 2 });
    await expect(
      controller.importZipItems('task_1', {
        fileName: 'datasets.zip',
        contentBase64: Buffer.from('zip-content').toString('base64'),
      }),
    ).resolves.toEqual({ importedCount: 30 });
    await expect(controller.listItems('task_1')).resolves.toEqual([{ id: 'item_1' }]);
    await expect(
      controller.updateItem('item_1', { rawDataPatch: { prompt: '更新后' } }),
    ).resolves.toEqual({ id: 'item_1', rawData: { prompt: '更新后' } });

    expect(service.importItems).toHaveBeenCalledWith('task_1', {
      datasetKind: 'qa_quality',
      format: 'jsonl',
      fileName: 'qa_quality.jsonl',
      content: '{"id":"qa_1"}',
    });
    expect(service.importZipItems).toHaveBeenCalledWith('task_1', {
      fileName: 'datasets.zip',
      content: Buffer.from('zip-content'),
    });
    expect(service.updateItem).toHaveBeenCalledWith('item_1', {
      rawDataPatch: { prompt: '更新后' },
    });
  });
});
