import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { ReviewRulesService } from './review-rules.service.ts';

describe('ReviewRulesService', () => {
  it('查询缺省规则时按 qa_quality profile 初始化默认 AI 审核规则', async () => {
    const { service, prisma, reviewRules } = createService();

    const rule = await service.getActiveRule('task_qa');

    expect(rule.taskId).toBe('task_qa');
    expect(rule.name).toBe('问答质量 AI 预审 v1');
    expect(rule.promptTemplate).toContain('prompt');
    expect(rule.promptTemplate).toContain('model_answer');
    expect(rule.promptTemplate).toContain('reference');
    expect(rule.promptTemplate).toContain('expected_dimensions');
    expect(rule.dimensions.map((dimension) => dimension.key)).toEqual([
      'relevance',
      'accuracy',
      'format',
      'safety',
      'overall',
    ]);
    expect(rule.provider).toBe('deepseek');
    expect(rule.model).toBe('deepseek-chat');
    expect(rule.structuredOutputMode).toBe('json_schema');
    expect(reviewRules).toHaveLength(1);
    expect(prisma.task.update).toHaveBeenCalledWith({
      where: { id: 'task_qa' },
      data: {
        aiPreReviewEnabled: true,
        aiRuleName: '问答质量 AI 预审 v1',
      },
    });
  });

  it('保存规则时创建新版本，不覆盖旧版本', async () => {
    const { service, reviewRules } = createService({
      reviewRules: [
        createRuleRecord({
          id: 'rule_old',
          promptVersion: 2,
          dimensionVersion: 3,
          promptTemplate: '旧 Prompt',
        }),
      ],
    });

    const rule = await service.saveRule('task_qa', {
      name: '问答质量人工修订规则',
      promptTemplate: '新 Prompt：必须输出 JSON。',
      dimensions: [{ key: 'overall', label: '综合', maxScore: 100 }],
      passThreshold: 88,
      manualThreshold: 70,
      provider: 'deepseek',
      model: 'deepseek-chat',
      temperature: 0.1,
      actorId: 'user_owner_001',
    });

    expect(rule.promptVersion).toBe(3);
    expect(rule.dimensionVersion).toBe(4);
    expect(rule.promptTemplate).toBe('新 Prompt：必须输出 JSON。');
    expect(rule.dimensions).toEqual([{ key: 'overall', label: '综合', maxScore: 100 }]);
    expect(rule.provider).toBe('deepseek');
    expect(reviewRules).toHaveLength(2);
    expect(reviewRules[0]?.promptTemplate).toBe('旧 Prompt');
  });

  it('保存规则时拒绝 mock 服务商，避免生成本地假评语', async () => {
    const { service, reviewRules } = createService();

    await expect(
      service.saveRule('task_qa', {
        name: '问答质量 AI 预审 v2',
        promptTemplate: '请输出真实模型字段级评语。',
        dimensions: [{ key: 'overall', label: '综合', maxScore: 100 }],
        provider: 'mock',
        model: 'mock-stable-reviewer',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.saveRule('task_qa', {
        name: '问答质量 AI 预审 v2',
        promptTemplate: '请输出真实模型字段级评语。',
        dimensions: [{ key: 'overall', label: '综合', maxScore: 100 }],
        provider: 'mock',
        model: 'mock-stable-reviewer',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'REVIEW_RULE_PROVIDER_MOCK_DISABLED',
      }),
    });
    expect(reviewRules).toHaveLength(0);
  });

  it('任务不存在时返回 NotFoundException', async () => {
    const { service } = createService({ task: null });

    await expect(service.getActiveRule('missing_task')).rejects.toBeInstanceOf(NotFoundException);
  });
});

function createService(input: { task?: TaskRecord | null; reviewRules?: ReviewRuleRecord[] } = {}) {
  const now = new Date('2026-05-21T00:00:00.000Z');
  const task = input.task === undefined ? createTaskRecord('qa_quality') : input.task;
  const reviewRules = [...(input.reviewRules ?? [])];
  const prisma = {
    task: {
      findUnique: vi.fn(async () => task),
      update: vi.fn(async () => task),
    },
    reviewRule: {
      findFirst: vi.fn(async () => reviewRules.at(-1) ?? null),
      create: vi.fn(async ({ data }: { data: Partial<ReviewRuleRecord> }) => {
        const record = createRuleRecord({
          id: `rule_${reviewRules.length + 1}`,
          taskId: String(data.taskId),
          stage: (data.stage as ReviewRuleRecord['stage']) ?? 'AI_PRECHECK',
          name: String(data.name),
          promptTemplate: String(data.promptTemplate),
          promptVersion: Number(data.promptVersion ?? 1),
          dimensions: data.dimensions as ReviewDimension[],
          dimensionVersion: Number(data.dimensionVersion ?? 1),
          passThreshold: Number(data.passThreshold ?? 80),
          manualThreshold: Number(data.manualThreshold ?? 60),
          provider: String(data.provider ?? 'deepseek'),
          model: String(data.model ?? 'deepseek-chat'),
          temperature: Number(data.temperature ?? 0),
          config: (data.config as Record<string, unknown> | null | undefined) ?? null,
          createdById: (data.createdById as string | null | undefined) ?? null,
          createdAt: now,
          updatedAt: now,
        });
        reviewRules.push(record);
        return record;
      }),
    },
  };

  return {
    prisma,
    reviewRules,
    service: new ReviewRulesService(prisma),
  };
}

type TaskRecord = {
  id: string;
  template: {
    datasetKind: 'qa_quality' | 'preference_compare' | 'generic_json';
  };
};

type ReviewDimension = {
  key: string;
  label: string;
  maxScore: number;
};

type ReviewRuleRecord = {
  id: string;
  taskId: string;
  stage: 'AI_PRECHECK';
  name: string;
  promptTemplate: string;
  promptVersion: number;
  dimensions: ReviewDimension[];
  dimensionVersion: number;
  passThreshold: number;
  manualThreshold: number;
  provider: string;
  model: string;
  temperature: number;
  config: Record<string, unknown> | null;
  enabled: boolean;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function createTaskRecord(datasetKind: TaskRecord['template']['datasetKind']): TaskRecord {
  return {
    id: 'task_qa',
    template: { datasetKind },
  };
}

function createRuleRecord(input: Partial<ReviewRuleRecord> = {}): ReviewRuleRecord {
  const now = new Date('2026-05-21T00:00:00.000Z');

  return {
    id: input.id ?? 'rule_1',
    taskId: input.taskId ?? 'task_qa',
    stage: input.stage ?? 'AI_PRECHECK',
    name: input.name ?? '问答质量 AI 预审 v1',
    promptTemplate: input.promptTemplate ?? '默认 Prompt',
    promptVersion: input.promptVersion ?? 1,
    dimensions: input.dimensions ?? [{ key: 'overall', label: '综合', maxScore: 100 }],
    dimensionVersion: input.dimensionVersion ?? 1,
    passThreshold: input.passThreshold ?? 80,
    manualThreshold: input.manualThreshold ?? 60,
    provider: input.provider ?? 'deepseek',
    model: input.model ?? 'deepseek-chat',
    temperature: input.temperature ?? 0,
    config: input.config ?? null,
    enabled: input.enabled ?? true,
    createdById: input.createdById ?? null,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}
