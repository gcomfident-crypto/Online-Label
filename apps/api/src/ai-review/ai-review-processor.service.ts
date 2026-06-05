import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { compileAiReviewPrompt, type AiReviewFieldRequirement } from '@labelhub/shared';

import {
  normalizeAiReviewProvider,
  resolveAiReviewRuntimeConfig,
  resolveAiReviewRuntimeModel,
  resolveAiReviewRuntimeProvider,
} from '../common/ai-review-runtime.ts';
import { PrismaService } from '../prisma/prisma.service.ts';
import { LlmService, type LlmAiReviewResult } from '../llm/llm.service.ts';
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
  modelMetadata: Record<string, unknown>;
  rawOutput: string;
  scores: Record<string, number>;
  structuredOutput: Record<string, unknown>;
};

type AiReviewContext = {
  answerData: Record<string, unknown>;
  fieldRequirements: readonly AiReviewFieldRequirement[];
  prompt: string;
};

const DEFAULT_PROCESSOR_LIMIT = 5;
const DEFAULT_POLL_INTERVAL_MS = 3000;

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
    @Inject(LlmService)
    private readonly llmService: Pick<LlmService, 'reviewSubmission'>,
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
          const verdict = await evaluateWithAgent(detail, rule, reviewContext, this.llmService);

          await this.aiReviewService.completeJob(job.id, {
            decision: verdict.decision,
            scores: verdict.scores,
            comment: verdict.comment,
            rawPrompt: reviewContext.prompt,
            rawOutput: verdict.rawOutput,
            structuredOutput: verdict.structuredOutput,
            modelMetadata: verdict.modelMetadata,
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

    return resolveRuntimeReviewRule(rule ?? defaultReviewRule(taskId));
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

async function evaluateWithAgent(
  detail: AiReviewDetailDto,
  rule: ReviewRuleRecord,
  reviewContext: AiReviewContext,
  llmService: Pick<LlmService, 'reviewSubmission'>,
): Promise<AiReviewVerdict> {
  const result: LlmAiReviewResult = await llmService.reviewSubmission({
    answers: reviewContext.answerData,
    datasetKind: detail.task.datasetKind,
    fieldRequirements: reviewContext.fieldRequirements,
    model: rule.model,
    passThreshold: rule.passThreshold,
    provider: rule.provider,
    rawData: detail.taskItem.rawData,
    rawPrompt: reviewContext.prompt,
    structuredOutputMode: structuredOutputMode(rule),
    temperature: rule.temperature,
  });

  return {
    ...result,
    modelMetadata: {
      ...result.modelMetadata,
      promptVersion: rule.promptVersion,
      structuredOutputMode: structuredOutputMode(rule),
    },
  };
}

function defaultReviewRule(taskId: string): ReviewRuleRecord {
  const runtimeConfig = resolveAiReviewRuntimeConfig(process.env);

  return {
    id: 'default_ai_precheck_rule',
    taskId,
    name: '默认 AI 预审规则',
    promptTemplate: '请根据 rawData 和标注员 answers，对开启 AI 预审的字段逐项输出字段级审核结果。',
    promptVersion: 1,
    dimensions: [],
    passThreshold: 70,
    manualThreshold: 55,
    provider: runtimeConfig.provider,
    model: runtimeConfig.model,
    temperature: 0,
    config: { structuredOutputMode: runtimeConfig.structuredOutputMode },
  };
}

function resolveRuntimeReviewRule(rule: ReviewRuleRecord): ReviewRuleRecord {
  const provider = normalizeAiReviewProvider(rule.provider);

  if (provider !== 'mock') {
    return provider === rule.provider ? rule : { ...rule, provider };
  }

  const runtimeProvider = resolveAiReviewRuntimeProvider(process.env);

  return {
    ...rule,
    provider: runtimeProvider,
    model: resolveAiReviewRuntimeModel(runtimeProvider, process.env),
    config: {
      ...(rule.config ?? {}),
      structuredOutputMode: 'json_schema',
    },
  };
}

function structuredOutputMode(rule: ReviewRuleRecord): string {
  return rule.config?.structuredOutputMode === 'json_schema' ? 'json_schema' : 'function_calling';
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
