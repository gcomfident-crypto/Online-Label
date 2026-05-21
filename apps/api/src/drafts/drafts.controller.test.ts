import { describe, expect, it, vi } from 'vitest';

import { DraftsController } from './drafts.controller.ts';

describe('DraftsController', () => {
  it('暴露工作台、读取草稿和保存草稿接口', async () => {
    const service = {
      getWorkbench: vi.fn().mockResolvedValue({ assignment: { id: 'assignment_1' } }),
      getDraft: vi.fn().mockResolvedValue({ id: 'draft_1' }),
      saveDraft: vi.fn().mockResolvedValue({ id: 'draft_1', answers: { quality: 'pass' } }),
    };
    const controller = new DraftsController(service);

    await expect(controller.getWorkbench('assignment_1')).resolves.toEqual({
      assignment: { id: 'assignment_1' },
    });
    await expect(controller.getDraft('assignment_1')).resolves.toEqual({ id: 'draft_1' });
    await expect(
      controller.saveDraft('assignment_1', {
        actorId: ' user_labeler_li_lei ',
        answers: { quality: 'pass' },
      }),
    ).resolves.toEqual({ id: 'draft_1', answers: { quality: 'pass' } });

    expect(service.getWorkbench).toHaveBeenCalledWith('assignment_1');
    expect(service.getDraft).toHaveBeenCalledWith('assignment_1');
    expect(service.saveDraft).toHaveBeenCalledWith('assignment_1', {
      actorId: 'user_labeler_li_lei',
      answers: { quality: 'pass' },
    });
  });

  it('保存草稿时把非对象 answers 归一为空对象', async () => {
    const service = {
      getWorkbench: vi.fn(),
      getDraft: vi.fn(),
      saveDraft: vi.fn().mockResolvedValue({ id: 'draft_1' }),
    };
    const controller = new DraftsController(service);

    await controller.saveDraft('assignment_1', { answers: [] });

    expect(service.saveDraft).toHaveBeenCalledWith('assignment_1', {
      actorId: undefined,
      answers: {},
    });
  });
});
