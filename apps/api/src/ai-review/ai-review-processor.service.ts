import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { compileAiReviewPrompt, type AiReviewFieldRequirement } from '@labelhub/shared';

import { PrismaService } from '../prisma/prisma.service.ts';
import {
  AiReviewService,
  type AiReviewDetailDto,
  type CompleteAiReviewJobInput,
} from './ai-review.service.ts';

type AiReviewProcessorPrismaClient = {
  aiReviewJob: {
    findMany: (args?: {
      where?: Record<string, unknown>;
      orderBy?: unknown;
      take?: number;
    }) => Promise<Array<{
      id: string;
      submissionId: string;
      taskId: string;
      attempts: number;
      maxAttempts: number;
      logs: unknown;
    }>>;
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
  };
  reviewRule: {
    findFirst: (args: { where: Record<string, unknown>; orderBy?: unknown }) => Promise<ReviewRuleRecord | null>;
  };
};

type ReviewRuleRecord = {
  id: string;
  taskId: string;
  name: string;
  promptTemplate: string;
  promptVersion: number;
  dimensions: unknown;
  passThreshold: number;
  manualThreshold: number;
  provider: string;
  model: string;
  temperature: number;
  config: Record<string, unknown> | null;
};

export type AiReviewProcessorResult = {
  processed: number;
  passed: number;
  rejected: number;
  failed: number;
};

type AiReviewVerdict = {
  comment: string;
  decision: CompleteAiReviewJobInput['decision'];
  rawOutput: string;
  scores: Record<string, number>;
  structuredOutput: Record<string, unknown>;
};

type AiReviewFieldVerdict = {
  fieldKey: string;
  label: string;
  score: number;
  decision: CompleteAiReviewJobInput['decision'];
  comment: string;
  suggestions: string[];
};

type AiReviewContext = {
  answerData: Record<string, unknown>;
  fieldRequirements: readonly AiReviewFieldRequirement[];
  prompt: string;
};

const DEFAULT_PROCESSOR_LIMIT = 5;
const DEFAULT_POLL_INTERVAL_MS = 3000;
const UNSAFE_TERMS = ['违法', '违禁', '暴力', '色情', '仇恨', '自残', '诈骗', '毒品'];

@Injectable()
export class AiReviewProcessorService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(AiReviewProcessorService.name);
  private isProcessing = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(PrismaService)
    private readonly prisma: AiReviewProcessorPrismaClient,
    @Inject(AiReviewService)
    private readonly aiReviewService: Pick<AiReviewService, 'completeJob' | 'getSubmissionReview'>,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.AI_REVIEW_PROCESSOR_DISABLED === 'true') {
      return;
    }

    const intervalMs = processorIntervalMs();
    this.timer = setInterval(() => {
      void this.processQueuedJobs().catch((error) => {
        this.logger.error('AI 预审队列处理失败', error instanceof Error ? error.stack : String(error));
      });
    }, intervalMs);
    this.timer.unref?.();
    void this.processQueuedJobs().catch((error) => {
      this.logger.error('AI 预审队列启动处理失败', error instanceof Error ? error.stack : String(error));
    });
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async processQueuedJobs(input: { limit?: number } = {}): Promise<AiReviewProcessorResult> {
    const result: AiReviewProcessorResult = {
      processed: 0,
      passed: 0,
      rejected: 0,
      failed: 0,
    };

    if (this.isProcessing) {
      return result;
    }

    this.isProcessing = true;
    try {
      const jobs = await this.prisma.aiReviewJob.findMany({
        where: { status: 'QUEUED' },
        orderBy: [{ queuedAt: 'asc' }, { createdAt: 'asc' }],
        take: input.limit ?? DEFAULT_PROCESSOR_LIMIT,
      });

      for (const job of jobs) {
        try {
          const detail = await this.aiReviewService.getSubmissionReview(job.submissionId);
          const rule = await this.findActiveRule(job.taskId);
          const reviewContext = buildReviewContext(rule, detail);
          const verdict = evaluateWithMockAgent(detail, rule, reviewContext);

          await this.aiReviewService.completeJob(job.id, {
            decision: verdict.decision,
            scores: verdict.scores,
            comment: verdict.comment,
            rawPrompt: reviewContext.prompt,
            rawOutput: verdict.rawOutput,
            structuredOutput: verdict.structuredOutput,
            modelMetadata: {
              provider: rule.provider,
              model: rule.model,
              temperature: rule.temperature,
              latencyMs: 120,
              promptVersion: rule.promptVersion,
              structuredOutputMode: structuredOutputMode(rule),
            },
          });

          result.processed += 1;
          if (verdict.decision === 'pass') {
            result.passed += 1;
          } else {
            result.rejected += 1;
          }
        } catch (error) {
          result.failed += 1;
          await this.markJobFailed(job, error);
        }
      }

      return result;
    } finally {
      this.isProcessing = false;
    }
  }

  private async findActiveRule(taskId: string): Promise<ReviewRuleRecord> {
    const rule = await this.prisma.reviewRule.findFirst({
      where: {
        taskId,
        stage: 'AI_PRECHECK',
        enabled: true,
      },
      orderBy: [{ promptVersion: 'desc' }, { updatedAt: 'desc' }],
    });

    return rule ?? defaultReviewRule(taskId);
  }

  private async markJobFailed(
    job: { id: string; attempts: number; maxAttempts: number; logs: unknown },
    error: unknown,
  ): Promise<void> {
    const nextAttempts = job.attempts + 1;
    const message = error instanceof Error ? error.message : 'AI 预审处理失败。';
    await this.prisma.aiReviewJob.update({
      where: { id: job.id },
      data: {
        status: nextAttempts >= job.maxAttempts ? 'FAILED_FINAL' : 'FAILED_RETRYING',
        attempts: nextAttempts,
        lastError: message,
        finishedAt: new Date(),
        logs: [
          ...toLogArray(job.logs),
          {
            level: 'error',
            message,
            at: new Date().toISOString(),
          },
        ],
      },
    });
  }
}

function buildReviewContext(rule: ReviewRuleRecord, detail: AiReviewDetailDto): AiReviewContext {
  if (detail.task.templateSchema) {
    const compiledPrompt = compileAiReviewPrompt({
      schema: detail.task.templateSchema,
      rawData: detail.taskItem.rawData,
      answers: detail.submission.answers,
      reviewFieldKeys: Object.keys(detail.submission.answers),
      persona: rule.promptTemplate,
    });

    return {
      answerData: compiledPrompt.answerData,
      fieldRequirements: compiledPrompt.fieldRequirements,
      prompt: compiledPrompt.prompt,
    };
  }

  const fieldRequirements = Object.keys(detail.submission.answers).map<AiReviewFieldRequirement>((fieldKey) => ({
    fieldKey,
    label: fieldKey,
    type: 'text',
    required: false,
    requirement: '请判断该字段标注结果是否符合题目事实和任务要求。',
  }));

  return {
    answerData: detail.submission.answers,
    fieldRequirements,
    prompt: [
    rule.promptTemplate,
    '',
    `题目 rawData：${JSON.stringify(detail.taskItem.rawData)}`,
    `标注 answers：${JSON.stringify(detail.submission.answers)}`,
    '',
      '请只输出 JSON：{"verdict":"pass|reject","fieldReviews":[{"fieldKey":"...","label":"...","score":0,"decision":"pass|reject","comment":"...","suggestions":[]}],"overallComment":"..."}',
    ].join('\n'),
  };
}

function evaluateWithMockAgent(
  detail: AiReviewDetailDto,
  rule: ReviewRuleRecord,
  reviewContext: AiReviewContext,
): AiReviewVerdict {
  const passThreshold = clampScore(rule.passThreshold || 70);
  const fieldReviews = reviewContext.fieldRequirements.map((field) =>
    evaluateField(detail.taskItem.rawData, reviewContext.answerData, field, passThreshold),
  );
  const overallScore = aggregateFieldScore(fieldReviews);
  const decision = aggregateFieldDecision(fieldReviews);
  const comment = overallCommentForDecision(decision, fieldReviews);

  const structuredOutput = {
    verdict: decision,
    fieldReviews,
    overallScore,
    overallComment: comment,
  };
  const scores = {
    overall: overallScore ?? 0,
    fieldCount: fieldReviews.length,
    passedFieldCount: fieldReviews.filter((field) => field.decision === 'pass').length,
    rejectedFieldCount: fieldReviews.filter((field) => field.decision === 'reject').length,
  };

  return {
    comment,
    decision,
    rawOutput: JSON.stringify(structuredOutput),
    scores,
    structuredOutput,
  };
}

function evaluateField(
  rawData: Record<string, unknown>,
  answerData: Record<string, unknown>,
  field: AiReviewFieldRequirement,
  passThreshold: number,
): AiReviewFieldVerdict {
  const value = Object.prototype.hasOwnProperty.call(answerData, field.fieldKey) ? answerData[field.fieldKey] : null;
  const score = scoreFieldAnswer(rawData, value);
  const decision = score >= passThreshold ? 'pass' : 'reject';
  const isEmpty = countNonEmptyLeaves(value) === 0;

  if (decision === 'pass') {
    return {
      fieldKey: field.fieldKey,
      label: field.label,
      score,
      decision,
      comment: `${field.label} 的提交内容符合字段审核要求。`,
      suggestions: [],
    };
  }

  return {
    fieldKey: field.fieldKey,
    label: field.label,
    score,
    decision,
    comment: isEmpty
      ? `${field.label} 未填写，无法完成字段级 AI 预审。`
      : `${field.label} 的提交内容与题目材料或审核要求匹配度不足。`,
    suggestions: isEmpty
      ? [`请补充 ${field.label}。`]
      : [`请核对 ${field.label} 是否符合字段审核要求。`],
  };
}

function scoreFieldAnswer(
  rawData: Record<string, unknown>,
  answer: unknown,
): number {
  const answerText = flattenText(answer);
  const hasUnsafeContent = UNSAFE_TERMS.some((term) => answerText.includes(term));

  if (countNonEmptyLeaves(answer) === 0) {
    return hasUnsafeContent ? 24 : 34;
  }

  const rawTokens = meaningfulTokens(flattenText(rawData));
  const answerTokens = meaningfulTokens(answerText);
  const overlapRatio = tokenOverlapRatio(rawTokens, answerTokens);
  const shapeBonus = Array.isArray(answer) ? Math.min(answer.length, 3) * 4 : Math.min(answerText.length, 80) / 8;
  const safetyPenalty = hasUnsafeContent ? 45 : 0;

  return clampScore(68 + overlapRatio * 18 + shapeBonus - safetyPenalty);
}

function aggregateFieldDecision(fieldReviews: readonly AiReviewFieldVerdict[]): CompleteAiReviewJobInput['decision'] {
  if (fieldReviews.length === 0) {
    return 'reject';
  }
  if (fieldReviews.some((field) => field.decision !== 'pass')) {
    return 'reject';
  }

  return 'pass';
}

function aggregateFieldScore(fieldReviews: readonly AiReviewFieldVerdict[]): number | null {
  if (fieldReviews.length === 0) {
    return null;
  }

  return Math.round(fieldReviews.reduce((total, field) => total + field.score, 0) / fieldReviews.length);
}

function overallCommentForDecision(
  decision: CompleteAiReviewJobInput['decision'],
  fieldReviews: readonly AiReviewFieldVerdict[],
): string {
  if (fieldReviews.length === 0) {
    return '当前模板没有开启 AI 预审字段，无法完成字段级 AI 预审。';
  }

  if (decision === 'pass') {
    return '所有开启 AI 预审的字段均通过，进入人工复审。';
  }

  const failedLabels = fieldReviews
    .filter((field) => field.decision !== 'pass')
    .map((field) => field.label)
    .join('、');

  return `${failedLabels || '存在字段'} 未通过 AI 预审，建议打回给标注员修改。`;
}

function defaultReviewRule(taskId: string): ReviewRuleRecord {
  return {
    id: 'default_ai_precheck_rule',
    taskId,
    name: '默认 AI 预审规则',
    promptTemplate: '请根据 rawData 和标注员 answers，对开启 AI 预审的字段逐项输出字段级审核结果。',
    promptVersion: 1,
    dimensions: [],
    passThreshold: 70,
    manualThreshold: 55,
    provider: 'mock',
    model: 'mock-stable-reviewer',
    temperature: 0,
    config: { structuredOutputMode: 'function_calling' },
  };
}

function structuredOutputMode(rule: ReviewRuleRecord): string {
  return rule.config?.structuredOutputMode === 'json_schema' ? 'json_schema' : 'function_calling';
}

function flattenText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(flattenText).filter(Boolean).join(' ');
  }

  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).map(flattenText).filter(Boolean).join(' ');
  }

  return '';
}

function meaningfulTokens(text: string): string[] {
  return text
    .split(/[\s,，。；;、|/\\[\]{}()（）:："'`]+/)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length >= 2);
}

function tokenOverlapRatio(sourceTokens: string[], targetTokens: string[]): number {
  if (sourceTokens.length === 0 || targetTokens.length === 0) {
    return 0;
  }

  const targetText = targetTokens.join(' ');
  const matched = sourceTokens.filter((token) => targetText.includes(token)).length;

  return Math.min(1, matched / Math.min(sourceTokens.length, 8));
}

function countNonEmptyLeaves(value: unknown): number {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  if (Array.isArray(value)) {
    return value.reduce<number>((count, item) => count + countNonEmptyLeaves(item), 0);
  }

  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).reduce<number>(
      (count, item) => count + countNonEmptyLeaves(item),
      0,
    );
  }

  return 1;
}

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, Math.round(Number.isFinite(value) ? value : 0)));
}

function processorIntervalMs(): number {
  const intervalMs = Number(process.env.AI_REVIEW_POLL_INTERVAL_MS);

  return Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : DEFAULT_POLL_INTERVAL_MS;
}

function toLogArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    : [];
}
