import { describe, expect, it, vi } from 'vitest';

import { TemplatesController } from './templates.controller.ts';

describe('TemplatesController', () => {
  it('暴露模板创建、列表、详情、保存、发布和官方模板入口', async () => {
    const service = {
      create: vi.fn().mockResolvedValue({ id: 'template_1' }),
      list: vi.fn().mockResolvedValue([{ id: 'template_1' }]),
      get: vi.fn().mockResolvedValue({ id: 'template_1' }),
      update: vi.fn().mockResolvedValue({ id: 'template_1', name: '新版模板' }),
      publish: vi.fn().mockResolvedValue({ template: { id: 'template_1' } }),
      createFromProfile: vi.fn().mockResolvedValue({ id: 'template_profile' }),
      deleteTemplate: vi.fn().mockResolvedValue({ id: 'template_1' }),
      listVersions: vi.fn().mockResolvedValue([{ id: 'template_v1', version: 1 }]),
      diffVersion: vi.fn().mockResolvedValue({ summary: { added: 0, removed: 0, changed: 0 }, sections: [] }),
      restoreVersion: vi.fn().mockResolvedValue({ restoredTemplate: { id: 'template_v1' } }),
    };
    const controller = new TemplatesController(service);

    await expect(controller.create({ name: '新模板' })).resolves.toEqual({ id: 'template_1' });
    await expect(controller.list()).resolves.toEqual([{ id: 'template_1' }]);
    await expect(controller.get('template_1')).resolves.toEqual({ id: 'template_1' });
    await expect(controller.update('template_1', { name: '新版模板' })).resolves.toEqual({
      id: 'template_1',
      name: '新版模板',
    });
    await expect(controller.publish('template_1', { versionName: 'v1' })).resolves.toEqual({
      template: { id: 'template_1' },
    });
    await expect(controller.createFromProfile({ profile: 'qa_quality' })).resolves.toEqual({
      id: 'template_profile',
    });
    await expect(controller.deleteTemplate('template_1')).resolves.toEqual({ id: 'template_1' });
    await expect(controller.listVersions('template_1')).resolves.toEqual([{ id: 'template_v1', version: 1 }]);
    await expect(controller.diffVersion('template_1', 'template_v1')).resolves.toEqual({
      summary: { added: 0, removed: 0, changed: 0 },
      sections: [],
    });
    await expect(controller.restoreVersion('template_1', 'template_v1')).resolves.toEqual({
      restoredTemplate: { id: 'template_v1' },
    });

    expect(service.create).toHaveBeenCalledWith({
      name: '新模板',
      description: undefined,
      datasetKind: 'generic_json',
      schema: undefined,
      actorId: undefined,
      parentTemplateId: undefined,
    });
    expect(service.update).toHaveBeenCalledWith('template_1', { name: '新版模板' });
    expect(service.publish).toHaveBeenCalledWith('template_1', { versionName: 'v1' });
    expect(service.createFromProfile).toHaveBeenCalledWith({ profile: 'qa_quality' });
    expect(service.deleteTemplate).toHaveBeenCalledWith('template_1');
    expect(service.listVersions).toHaveBeenCalledWith('template_1');
    expect(service.diffVersion).toHaveBeenCalledWith('template_1', 'template_v1');
    expect(service.restoreVersion).toHaveBeenCalledWith('template_1', 'template_v1');
  });
});
