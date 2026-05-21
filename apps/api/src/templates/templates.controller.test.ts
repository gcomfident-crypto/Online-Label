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
    };
    const controller = new TemplatesController(service);

    await expect(controller.create({ name: '新模板' })).resolves.toEqual({ id: 'template_1' });
    await expect(controller.list()).resolves.toEqual([{ id: 'template_1' }]);
    await expect(controller.get('template_1')).resolves.toEqual({ id: 'template_1' });
    await expect(controller.update('template_1', { name: '新版模板' })).resolves.toEqual({
      id: 'template_1',
      name: '新版模板',
    });
    await expect(controller.publish('template_1', { versionName: 'r1' })).resolves.toEqual({
      template: { id: 'template_1' },
    });
    await expect(controller.createFromProfile({ profile: 'qa_quality' })).resolves.toEqual({
      id: 'template_profile',
    });

    expect(service.create).toHaveBeenCalledWith({
      name: '新模板',
      description: undefined,
      datasetKind: 'generic_json',
      schema: undefined,
      actorId: undefined,
    });
    expect(service.update).toHaveBeenCalledWith('template_1', { name: '新版模板' });
    expect(service.publish).toHaveBeenCalledWith('template_1', { versionName: 'r1' });
    expect(service.createFromProfile).toHaveBeenCalledWith({ profile: 'qa_quality' });
  });
});
