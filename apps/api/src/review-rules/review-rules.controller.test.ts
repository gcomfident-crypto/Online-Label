import { describe, expect, it, vi } from 'vitest';

import { ReviewRulesController } from './review-rules.controller.ts';

describe('ReviewRulesController', () => {
  it('暴露任务 AI 审核规则查询和保存接口', async () => {
    const service = {
      getActiveRule: vi.fn().mockResolvedValue({ id: 'rule_1' }),
      saveRule: vi.fn().mockResolvedValue({ id: 'rule_2' }),
    };
    const controller = new ReviewRulesController(service);

    await expect(controller.get('task_qa')).resolves.toEqual({ id: 'rule_1' });
    await expect(
      controller.save('task_qa', {
        name: '  问答规则  ',
        promptTemplate: '  请输出结构化结果。  ',
        dimensions: [{ key: 'overall', label: '综合', maxScore: 100 }],
        passThreshold: '85',
        manualThreshold: '65',
        provider: 'deepseek',
        model: 'deepseek-chat',
        temperature: '0.2',
        actorId: 'user_owner_001',
      }),
    ).resolves.toEqual({ id: 'rule_2' });

    expect(service.getActiveRule).toHaveBeenCalledWith('task_qa');
    expect(service.saveRule).toHaveBeenCalledWith('task_qa', {
      name: '问答规则',
      promptTemplate: '请输出结构化结果。',
      dimensions: [{ key: 'overall', label: '综合', maxScore: 100 }],
      passThreshold: 85,
      manualThreshold: 65,
      provider: 'deepseek',
      model: 'deepseek-chat',
      temperature: 0.2,
      actorId: 'user_owner_001',
    });
  });
});
