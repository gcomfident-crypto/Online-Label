import { describe, expect, it, vi } from 'vitest';

import { ExportsController } from './exports.controller.ts';

describe('ExportsController', () => {
  it('暴露导出创建、历史、详情、下载、重试和预览接口并归一化参数', async () => {
    const service = {
      createExport: vi.fn().mockResolvedValue({ id: 'export_1', status: 'QUEUED' }),
      listExports: vi.fn().mockResolvedValue([{ id: 'export_1' }]),
      getExport: vi.fn().mockResolvedValue({ id: 'export_1' }),
      downloadExport: vi.fn().mockResolvedValue({ filePath: 'storage/exports/export_1.json', fileName: 'export_1.json' }),
      retryExport: vi.fn().mockResolvedValue({ id: 'export_1', status: 'QUEUED' }),
      previewTaskExport: vi.fn().mockResolvedValue({ rows: [] }),
    };
    const controller = new ExportsController(service);
    const response = {
      download: vi.fn(),
    };

    await expect(
      controller.create({
        taskId: ' task_qa ',
        requestedById: ' user_owner_001 ',
        format: 'csv',
        includeReviews: true,
        fieldMapping: [{ source: 'rawData.prompt', target: 'prompt', enabled: true }],
      }),
    ).resolves.toEqual({ id: 'export_1', status: 'QUEUED' });
    await expect(controller.list(' task_qa ')).resolves.toEqual([{ id: 'export_1' }]);
    await expect(controller.get('export_1')).resolves.toEqual({ id: 'export_1' });
    await expect(controller.download('export_1', response)).resolves.toBeUndefined();
    await expect(controller.retry('export_1')).resolves.toEqual({ id: 'export_1', status: 'QUEUED' });
    await expect(
      controller.preview(
        'task_qa',
        'false',
        JSON.stringify([{ source: 'answers.comment', target: 'comment', enabled: true }]),
      ),
    ).resolves.toEqual({ rows: [] });

    expect(service.createExport).toHaveBeenCalledWith({
      taskId: 'task_qa',
      requestedById: 'user_owner_001',
      format: 'csv',
      includeReviews: true,
      fieldMapping: [{ source: 'rawData.prompt', target: 'prompt', enabled: true }],
      idempotencyKey: undefined,
    });
    expect(service.listExports).toHaveBeenCalledWith({ taskId: 'task_qa' });
    expect(service.getExport).toHaveBeenCalledWith('export_1');
    expect(service.downloadExport).toHaveBeenCalledWith('export_1');
    expect(response.download).toHaveBeenCalledWith('storage/exports/export_1.json', 'export_1.json');
    expect(service.retryExport).toHaveBeenCalledWith('export_1');
    expect(service.previewTaskExport).toHaveBeenCalledWith('task_qa', {
      includeReviews: false,
      fieldMapping: [{ source: 'answers.comment', target: 'comment', enabled: true }],
    });
  });
});
