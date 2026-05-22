import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { DatasetKind } from '@labelhub/shared';

import { PrismaService } from '../prisma/prisma.service.ts';

type ReviewStage = 'AI_PRECHECK';

export type ReviewDimensionDto = {
  key: string;
  label: string;
  maxScore: number;
};

export type ReviewRuleDto = {
  id: string;
  taskId: string;
  stage: ReviewStage;
  name: string;
  promptTemplate: string;
  promptVersion: number;
  dimensions: ReviewDimensionDto[];
  dimensionVersion: number;
  passThreshold: number;
  manualThreshold: number;
  provider: string;
  model: string;
  temperature: number;
  structuredOutputMode: 'function_calling' | 'json_schema';
  enabled: boolean;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SaveReviewRuleInput = {
  name?: string;
  promptTemplate?: string;
  dimensions?: ReviewDimensionDto[];
  passThreshold?: number;
  manualThreshold?: number;
  provider?: string;
  model?: string;
  temperature?: number;
  actorId?: string;
};

type ReviewRuleRecord = {
  id: string;
  taskId: string;
  stage: ReviewStage;
  name: string;
  promptTemplate: string;
  promptVersion: number;
  dimensions: unknown;
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

type TaskRecord = {
  id: string;
  template: {
    datasetKind: DatasetKind;
  };
};

type ReviewRulesPrismaClient = {
  task: {
    findUnique: (args: { where: { id: string }; include?: unknown }) => Promise<TaskRecord | null>;
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
  };
  reviewRule: {
    findFirst: (args: { where: Record<string, unknown>; orderBy?: unknown }) => Promise<ReviewRuleRecord | null>;
    create: (args: { data: Record<string, unknown> }) => Promise<ReviewRuleRecord>;
  };
};

const TASK_INCLUDE = {
  template: {
    select: {
      datasetKind: true,
    },
  },
} as const;

@Injectable()
export class ReviewRulesService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: ReviewRulesPrismaClient,
  ) {}

  async getActiveRule(taskId: string): Promise<ReviewRuleDto> {
    const task = await this.findTaskOrThrow(taskId);
    const current = await this.findCurrentRule(taskId);
    if (current) {
      return toReviewRuleDto(current);
    }

    const defaults = defaultRuleForDataset(task.template.datasetKind);
    const rule = await this.prisma.reviewRule.create({
      data: {
        taskId,
        stage: 'AI_PRECHECK',
        name: defaults.name,
        promptTemplate: defaults.promptTemplate,
        promptVersion: 1,
        dimensions: defaults.dimensions,
        dimensionVersion: 1,
        passThreshold: defaults.passThreshold,
        manualThreshold: defaults.manualThreshold,
        provider: 'mock',
        model: 'mock-stable-reviewer',
        temperature: 0,
        config: {
          structuredOutputMode: 'function_calling',
          datasetKind: task.template.datasetKind,
        },
        enabled: true,
        createdById: null,
      },
    });
    await this.prisma.task.update({
      where: { id: taskId },
      data: {
        aiPreReviewEnabled: true,
        aiRuleName: defaults.name,
      },
    });

    return toReviewRuleDto(rule);
  }

  async saveRule(taskId: string, input: SaveReviewRuleInput): Promise<ReviewRuleDto> {
    await this.findTaskOrThrow(taskId);
    const current = await this.findCurrentRule(taskId);
    const normalized = normalizeRuleInput(input, current);
    const rule = await this.prisma.reviewRule.create({
      data: {
        taskId,
        stage: 'AI_PRECHECK',
        name: normalized.name,
        promptTemplate: normalized.promptTemplate,
        promptVersion: (current?.promptVersion ?? 0) + 1,
        dimensions: normalized.dimensions,
        dimensionVersion: (current?.dimensionVersion ?? 0) + 1,
        passThreshold: normalized.passThreshold,
        manualThreshold: normalized.manualThreshold,
        provider: normalized.provider,
        model: normalized.model,
        temperature: normalized.temperature,
        config: {
          structuredOutputMode: normalized.provider === 'mock' ? 'function_calling' : 'json_schema',
        },
        enabled: true,
        createdById: input.actorId ?? null,
      },
    });
    await this.prisma.task.update({
      where: { id: taskId },
      data: {
        aiPreReviewEnabled: true,
        aiRuleName: rule.name,
      },
    });

    return toReviewRuleDto(rule);
  }

  private async findTaskOrThrow(taskId: string): Promise<TaskRecord> {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: TASK_INCLUDE,
    });

    if (!task) {
      throw new NotFoundException({
        code: 'TASK_NOT_FOUND',
        message: '任务不存在或已被删除。',
      });
    }

    return task;
  }

  private findCurrentRule(taskId: string): Promise<ReviewRuleRecord | null> {
    return this.prisma.reviewRule.findFirst({
      where: {
        taskId,
        stage: 'AI_PRECHECK',
        enabled: true,
      },
      orderBy: [{ promptVersion: 'desc' }, { dimensionVersion: 'desc' }, { updatedAt: 'desc' }],
    });
  }
}

function normalizeRuleInput(input: SaveReviewRuleInput, current: ReviewRuleRecord | null) {
  const dimensions = input.dimensions ?? toReviewDimensions(current?.dimensions);
  if (dimensions.length === 0) {
    throw new BadRequestException({
      code: 'REVIEW_RULE_DIMENSIONS_REQUIRED',
      message: 'AI 审核规则至少需要一个评分维度。',
    });
  }

  return {
    name: input.name?.trim() || current?.name || 'AI 预审规则',
    promptTemplate: input.promptTemplate?.trim() || current?.promptTemplate || defaultRuleForDataset('generic_json').promptTemplate,
    dimensions,
    passThreshold: clampScore(input.passThreshold ?? current?.passThreshold ?? 80),
    manualThreshold: clampScore(input.manualThreshold ?? current?.manualThreshold ?? 60),
    provider: input.provider?.trim() || current?.provider || 'mock',
    model: input.model?.trim() || current?.model || 'mock-stable-reviewer',
    temperature: clampTemperature(input.temperature ?? current?.temperature ?? 0),
  };
}

function defaultRuleForDataset(datasetKind: DatasetKind) {
  if (datasetKind === 'preference_compare') {
    return {
      name: '偏好对比 AI 预审 v1',
      promptTemplate:
        '请根据 prompt、response_a、response_b、dimensions 和标注员 answers，输出偏好一致性、理由质量、安全风险与 verdict。',
      dimensions: [
        { key: 'agreement', label: '偏好一致性', maxScore: 100 },
        { key: 'margin', label: '优势程度', maxScore: 100 },
        { key: 'reasoning', label: '理由质量', maxScore: 100 },
        { key: 'safety', label: '安全风险', maxScore: 100 },
        { key: 'overall', label: '综合', maxScore: 100 },
      ],
      passThreshold: 80,
      manualThreshold: 60,
    };
  }

  if (datasetKind === 'qa_quality') {
    return {
      name: '问答质量 AI 预审 v1',
      promptTemplate:
        '请根据 prompt、model_answer、reference、expected_dimensions 和标注员 answers，输出相关性、准确性、格式合规、安全性、综合分与 verdict。',
      dimensions: [
        { key: 'relevance', label: '相关性', maxScore: 100 },
        { key: 'accuracy', label: '准确性', maxScore: 100 },
        { key: 'format', label: '格式合规', maxScore: 100 },
        { key: 'safety', label: '安全性', maxScore: 100 },
        { key: 'overall', label: '综合', maxScore: 100 },
      ],
      passThreshold: 80,
      manualThreshold: 60,
    };
  }

  return {
    name: '通用 JSON AI 预审 v1',
    promptTemplate: '请根据 rawData 和标注员 answers 输出结构化评分、verdict、reason 与 suggestions。',
    dimensions: [{ key: 'overall', label: '综合', maxScore: 100 }],
    passThreshold: 80,
    manualThreshold: 60,
  };
}

function toReviewRuleDto(record: ReviewRuleRecord): ReviewRuleDto {
  return {
    id: record.id,
    taskId: record.taskId,
    stage: record.stage,
    name: record.name,
    promptTemplate: record.promptTemplate,
    promptVersion: record.promptVersion,
    dimensions: toReviewDimensions(record.dimensions),
    dimensionVersion: record.dimensionVersion,
    passThreshold: record.passThreshold,
    manualThreshold: record.manualThreshold,
    provider: record.provider,
    model: record.model,
    temperature: record.temperature,
    structuredOutputMode: structuredOutputMode(record.config),
    enabled: record.enabled,
    createdById: record.createdById,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toReviewDimensions(value: unknown): ReviewDimensionDto[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isReviewDimension);
}

function isReviewDimension(value: unknown): value is ReviewDimensionDto {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const dimension = value as Record<string, unknown>;

  return (
    typeof dimension.key === 'string' &&
    typeof dimension.label === 'string' &&
    typeof dimension.maxScore === 'number'
  );
}

function structuredOutputMode(config: Record<string, unknown> | null): 'function_calling' | 'json_schema' {
  return config?.structuredOutputMode === 'json_schema' ? 'json_schema' : 'function_calling';
}

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
}

function clampTemperature(value: number): number {
  return Math.min(2, Math.max(0, Number.isFinite(value) ? value : 0));
}
