import { describe, expect, it, vi } from 'vitest';

import { AssignmentsController } from './assignments.controller.ts';

describe('AssignmentsController', () => {
  it('暴露任务广场查询与领取接口并归一化参数', async () => {
    const service = {
      listMarketTasks: vi.fn().mockResolvedValue([{ id: 'task_1' }]),
      claim: vi.fn().mockResolvedValue({ assignmentId: 'assignment_1' }),
    };
    const controller = new AssignmentsController(service);

    await expect(
      controller.listMarketTasks(' 问答 ', ' 官方数据 ', 'available', ' user_labeler_1 '),
    ).resolves.toEqual([{ id: 'task_1' }]);
    await expect(
      controller.claim({
        taskId: ' task_1 ',
        labelerId: ' user_labeler_1 ',
      }),
    ).resolves.toEqual({ assignmentId: 'assignment_1' });

    expect(service.listMarketTasks).toHaveBeenCalledWith({
      keyword: '问答',
      tag: '官方数据',
      claimStatus: 'available',
      labelerId: 'user_labeler_1',
    });
    expect(service.claim).toHaveBeenCalledWith({
      taskId: 'task_1',
      labelerId: 'user_labeler_1',
    });
  });

  it('忽略未知领取状态并为缺省标注员使用演示账号', async () => {
    const service = {
      listMarketTasks: vi.fn().mockResolvedValue([]),
      claim: vi.fn().mockResolvedValue({ assignmentId: 'assignment_1' }),
    };
    const controller = new AssignmentsController(service);

    await controller.listMarketTasks('', '', 'archived', '');
    await controller.claim({ taskId: 'task_1' });

    expect(service.listMarketTasks).toHaveBeenCalledWith({});
    expect(service.claim).toHaveBeenCalledWith({
      taskId: 'task_1',
      labelerId: 'user_labeler_li_lei',
    });
  });
});
