import { describe, expect, it, vi } from 'vitest';

import { TasksController } from './tasks.controller.ts';

describe('TasksController', () => {
  it('暴露任务创建、列表、详情、保存、状态流转和审计日志接口', async () => {
    const service = {
      create: vi.fn().mockResolvedValue({ id: 'task_1', status: 'DRAFT' }),
      list: vi.fn().mockResolvedValue([{ id: 'task_1' }]),
      get: vi.fn().mockResolvedValue({ id: 'task_1' }),
      update: vi.fn().mockResolvedValue({ id: 'task_1', title: '新版任务' }),
      updateStatus: vi.fn().mockResolvedValue({ id: 'task_1', status: 'PUBLISHED' }),
      updateReviewStageConfig: vi.fn().mockResolvedValue({
        id: 'task_1',
        reviewStageConfig: ['INITIAL', 'RECHECK'],
      }),
      deleteTask: vi.fn().mockResolvedValue({ id: 'task_1' }),
      listAuditLogs: vi.fn().mockResolvedValue([{ toStatus: 'PUBLISHED' }]),
    };
    const controller = new TasksController(service);
    const legacyCreateBody = {
      title: ' 新任务 ',
      templateId: 'template_1',
      quota: '30',
      deadline: '2026-06-01T15:59:00.000Z',
      tags: ['问答', 7, '质检'],
      rewardPerItem: '0.30',
      perUserLimit: '12',
      monthlyRewardCap: '1500',
      actorId: 'user_owner_001',
    };

    await expect(controller.create(legacyCreateBody)).resolves.toEqual({ id: 'task_1', status: 'DRAFT' });
    await expect(controller.list('user_owner_001', 'PUBLISHED')).resolves.toEqual([{ id: 'task_1' }]);
    await expect(controller.get('task_1')).resolves.toEqual({ id: 'task_1' });
    await expect(controller.update('task_1', { title: '新版任务' })).resolves.toEqual({
      id: 'task_1',
      title: '新版任务',
    });
    await expect(
      controller.updateStatus('task_1', {
        status: 'PUBLISHED',
        actorId: 'user_owner_001',
        confirm: true,
      }),
    ).resolves.toEqual({ id: 'task_1', status: 'PUBLISHED' });
    await expect(
      controller.updateReviewStageConfig('task_1', {
        reviewStageConfig: ['INITIAL'],
        actorId: ' user_owner_001 ',
      }),
    ).resolves.toEqual({
      id: 'task_1',
      reviewStageConfig: ['INITIAL', 'RECHECK'],
    });
    await expect(controller.listAuditLogs('task_1')).resolves.toEqual([{ toStatus: 'PUBLISHED' }]);
    await expect(controller.deleteTask('task_1')).resolves.toEqual({ id: 'task_1' });

    expect(service.create).toHaveBeenCalledWith({
      title: '新任务',
      description: undefined,
      richTextInstruction: undefined,
      tags: ['问答', '质检'],
      rewardPerItem: 0.3,
      perUserLimit: 12,
      quota: 30,
      deadline: '2026-06-01T15:59:00.000Z',
      distributionStrategy: 'FIRST_COME_FIRST_SERVE',
      aiPreReviewEnabled: false,
      aiRuleName: undefined,
      templateId: 'template_1',
      actorId: 'user_owner_001',
    });
    expect(service.list).toHaveBeenCalledWith({
      ownerId: 'user_owner_001',
      status: 'PUBLISHED',
    });
    expect(service.updateStatus).toHaveBeenCalledWith('task_1', {
      status: 'PUBLISHED',
      actorId: 'user_owner_001',
      confirm: true,
      reason: undefined,
    });
    expect(service.updateReviewStageConfig).toHaveBeenCalledWith('task_1', {
      reviewStageConfig: ['INITIAL', 'RECHECK'],
      actorId: 'user_owner_001',
    });
    expect(service.deleteTask).toHaveBeenCalledWith('task_1');
  });
});
