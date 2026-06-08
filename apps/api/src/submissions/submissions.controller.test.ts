import { describe, expect, it, vi } from 'vitest';

import { SubmissionsController } from './submissions.controller.ts';

describe('SubmissionsController', () => {
  it('暴露提交、我的数据和统计接口并归一化参数', async () => {
    const service = {
      submit: vi.fn().mockResolvedValue({ id: 'submission_1' }),
      submitTask: vi.fn().mockResolvedValue({ taskId: 'task_qa', submittedCount: 2 }),
      listLabelerAssignments: vi.fn().mockResolvedValue([{ assignmentId: 'assignment_1' }]),
      listLabelerAssignmentTasks: vi.fn().mockResolvedValue([{ taskId: 'task_qa' }]),
      listLabelerSubmissions: vi.fn().mockResolvedValue([{ submissionId: 'submission_1' }]),
      getLabelerStats: vi.fn().mockResolvedValue({ submittedCount: 1 }),
    };
    const controller = new SubmissionsController(service);

    await expect(
      controller.submit({
        assignmentId: ' assignment_1 ',
        actorId: ' user_labeler_li_lei ',
        answers: { quality: 'pass' },
      }),
    ).resolves.toEqual({ id: 'submission_1' });
    await expect(
      controller.submitTask(
        {
          taskId: ' task_qa ',
          labelerId: ' user_labeler_li_lei ',
          actorId: ' user_labeler_li_lei ',
          currentAssignmentId: ' assignment_1 ',
          currentAnswers: { quality: 'pass' },
          idempotencyKey: ' task-submit-1 ',
        },
        ' header-idem ',
      ),
    ).resolves.toEqual({ taskId: 'task_qa', submittedCount: 2 });
    await expect(
      controller.listLabelerSubmissions(
        ' user_labeler_li_lei ',
        'task_qa',
        'NEEDS_REVISION',
        'qa_quality',
        'qa_1',
      ),
    ).resolves.toEqual([{ submissionId: 'submission_1' }]);
    await expect(controller.getLabelerStats(' user_labeler_li_lei ', 'task_qa')).resolves.toEqual({
      submittedCount: 1,
    });
    await expect(controller.listLabelerAssignments(' user_labeler_li_lei ', 'task_qa')).resolves.toEqual([
      { assignmentId: 'assignment_1' },
    ]);
    await expect(controller.listLabelerAssignmentTasks(' user_labeler_li_lei ')).resolves.toEqual([
      { taskId: 'task_qa' },
    ]);

    expect(service.submit).toHaveBeenCalledWith({
      assignmentId: 'assignment_1',
      actorId: 'user_labeler_li_lei',
      answers: { quality: 'pass' },
      idempotencyKey: undefined,
    });
    expect(service.submitTask).toHaveBeenCalledWith({
      taskId: 'task_qa',
      labelerId: 'user_labeler_li_lei',
      actorId: 'user_labeler_li_lei',
      currentAssignmentId: 'assignment_1',
      currentAnswers: { quality: 'pass' },
      idempotencyKey: 'header-idem',
    });
    expect(service.listLabelerSubmissions).toHaveBeenCalledWith({
      labelerId: 'user_labeler_li_lei',
      taskId: 'task_qa',
      status: 'NEEDS_REVISION',
      datasetKind: 'qa_quality',
      itemId: 'qa_1',
    });
    expect(service.getLabelerStats).toHaveBeenCalledWith({
      labelerId: 'user_labeler_li_lei',
      taskId: 'task_qa',
    });
    expect(service.listLabelerAssignments).toHaveBeenCalledWith({
      labelerId: 'user_labeler_li_lei',
      taskId: 'task_qa',
    });
    expect(service.listLabelerAssignmentTasks).toHaveBeenCalledWith({
      labelerId: 'user_labeler_li_lei',
    });
  });

  it('缺省标注员使用演示账号，非对象 answers 归一为空对象', async () => {
    const service = {
      submit: vi.fn().mockResolvedValue({ id: 'submission_1' }),
      submitTask: vi.fn().mockResolvedValue({ taskId: 'task_qa', submittedCount: 0 }),
      listLabelerAssignments: vi.fn().mockResolvedValue([]),
      listLabelerAssignmentTasks: vi.fn().mockResolvedValue([]),
      listLabelerSubmissions: vi.fn().mockResolvedValue([]),
      getLabelerStats: vi.fn().mockResolvedValue({ submittedCount: 0 }),
    };
    const controller = new SubmissionsController(service);

    await controller.submit({ assignmentId: 'assignment_1', answers: [] });
    await controller.submitTask({ taskId: 'task_qa', currentAnswers: [] });
    await controller.listLabelerSubmissions('', '', '', '', '');
    await controller.getLabelerStats('', '');
    await controller.listLabelerAssignments('', '');

    expect(service.submit).toHaveBeenCalledWith({
      assignmentId: 'assignment_1',
      actorId: undefined,
      answers: {},
      idempotencyKey: undefined,
    });
    expect(service.submitTask).toHaveBeenCalledWith({
      taskId: 'task_qa',
      labelerId: 'user_labeler_li_lei',
      actorId: undefined,
      currentAssignmentId: undefined,
      currentAnswers: {},
      idempotencyKey: undefined,
    });
    expect(service.listLabelerSubmissions).toHaveBeenCalledWith({
      labelerId: 'user_labeler_li_lei',
    });
    expect(service.getLabelerStats).toHaveBeenCalledWith({
      labelerId: 'user_labeler_li_lei',
    });
    expect(service.listLabelerAssignments).toHaveBeenCalledWith({
      labelerId: 'user_labeler_li_lei',
    });
  });
});
