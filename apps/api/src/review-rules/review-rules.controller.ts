import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';

import {
  ReviewRulesService,
  type ReviewDimensionDto,
  type ReviewRuleDto,
  type SaveReviewRuleInput,
} from './review-rules.service.ts';

type SaveReviewRuleBody = {
  name?: unknown;
  promptTemplate?: unknown;
  dimensions?: unknown;
  passThreshold?: unknown;
  manualThreshold?: unknown;
  provider?: unknown;
  model?: unknown;
  temperature?: unknown;
  actorId?: unknown;
};

@Controller()
export class ReviewRulesController {
  constructor(
    @Inject(ReviewRulesService)
    private readonly reviewRulesService: Pick<ReviewRulesService, 'getActiveRule' | 'saveRule'>,
  ) {}

  @Get('tasks/:taskId/review-rule')
  get(@Param('taskId') taskId: string): Promise<ReviewRuleDto> {
    return this.reviewRulesService.getActiveRule(taskId);
  }

  @Post('tasks/:taskId/review-rule')
  save(@Param('taskId') taskId: string, @Body() body: SaveReviewRuleBody): Promise<ReviewRuleDto> {
    return this.reviewRulesService.saveRule(taskId, normalizeSaveBody(body));
  }
}

function normalizeSaveBody(body: SaveReviewRuleBody): SaveReviewRuleInput {
  return {
    name: stringValue(body.name),
    promptTemplate: stringValue(body.promptTemplate),
    dimensions: dimensionArrayValue(body.dimensions),
    passThreshold: numberValue(body.passThreshold),
    manualThreshold: numberValue(body.manualThreshold),
    provider: stringValue(body.provider),
    model: stringValue(body.model),
    temperature: numberValue(body.temperature),
    actorId: stringValue(body.actorId),
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;

  return Number.isFinite(number) ? number : undefined;
}

function dimensionArrayValue(value: unknown): ReviewDimensionDto[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const dimensions = value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const candidate = item as Record<string, unknown>;
      const key = stringValue(candidate.key);
      const label = stringValue(candidate.label);
      const maxScore = numberValue(candidate.maxScore);

      return key && label && maxScore ? { key, label, maxScore } : null;
    })
    .filter((item): item is ReviewDimensionDto => item !== null);

  return dimensions.length > 0 ? dimensions : undefined;
}
