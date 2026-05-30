import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';

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

type ReviewDimension = {
  key: string;
  label: string;
  maxScore: number;
};

export type AiReviewProcessorResult = {
  processed: number;
  passed: number;
  rejected: number;
  manual: number;
  failed: number;
};

type AiReviewVerdict = {
  comment: string;
  decision: CompleteAiReviewJobInput['decision'];
  rawOutput: string;
  scores: Record<string, number>;
  structuredOutput: Record<string, unknown>;
};

const DEFAULT_PROCESSOR_LIMIT = 5;
const DEFAULT_POLL_INTERVAL_MS = 3000;
const REQUIRED_DIMENSIONS: ReviewDimension[] = [
  { key: 'relevance', label: '相关性', maxScore: 100 },
  { key: 'accuracy', label: '准确性', maxScore: 100 },
  { key: 'format', label: '格式合规', maxScore: 100 },
  { key: 'safety', label: '安全性', maxScore: 100 },
  { key: 'overall', label: '综合', maxScore: 100 },
];
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
      manual: 0,
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
          const prompt = buildPrompt(rule, detail);
          const verdict = evaluateWithMockAgent(detail, rule);

          await this.aiReviewService.completeJob(job.id, {
            decision: verdict.decision,
            scores: verdict.scores,
            comment: verdict.comment,
            rawPrompt: prompt,
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
          } else if (verdict.decision === 'manual') {
            result.manual += 1;
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

function buildPrompt(rule: ReviewRuleRecord, detail: AiReviewDetailDto): string {
  return [
    rule.promptTemplate,
    '',
    '评分维度：',
    ...normalizedDimensions(rule).map((dimension) => `- ${dimension.label} (${dimension.key})：0-${dimension.maxScore}`),
    '',
    `题目 rawData：${JSON.stringify(detail.taskItem.rawData)}`,
    `标注 answers：${JSON.stringify(detail.submission.answers)}`,
    '',
    '请输出 JSON：{"scores": {...}, "verdict": "pass|reject|manual", "reason": "..."}',
  ].join('\n');
}

function evaluateWithMockAgent(detail: AiReviewDetailDto, rule: ReviewRuleRecord): AiReviewVerdict {
  const scores = scoreAnswers(detail.taskItem.rawData, detail.submission.answers);
  const passThreshold = clampScore(rule.passThreshold || 70);
  const manualThreshold = clampScore(rule.manualThreshold || 55);
  const safetyThreshold = 80;
  let decision: CompleteAiReviewJobInput['decision'] = 'reject';
  let comment = `综合分低于通过阈值 ${passThreshold}，请补充关键字段并确保标注与原始数据一致。`;

  if (scores.safety < safetyThreshold) {
    comment = `安全性低于 ${safetyThreshold}，请检查是否包含违规、敏感或高风险内容。`;
  } else if (scores.overall >= passThreshold) {
    decision = 'pass';
    comment = 'AI 预审通过，进入人工复审。';
  } else if (scores.overall >= manualThreshold) {
    decision = 'manual';
    comment = `综合分处于 ${manualThreshold}-${passThreshold} 区间，建议转人工复核。`;
  }

  const structuredOutput = {
    verdict: decision,
    scores,
    reason: comment,
    suggestions:
      decision === 'pass'
        ? []
        : ['补充缺失字段', '核对标注值与原始数据的一致性', '避免提交空答案或过短答案'],
  };

  return {
    comment,
    decision,
    rawOutput: JSON.stringify(structuredOutput),
    scores,
    structuredOutput,
  };
}

function scoreAnswers(
  rawData: Record<string, unknown>,
  answers: Record<string, unknown>,
): Record<string, number> {
  const rawText = flattenText(rawData);
  const answerText = flattenText(answers);
  const answerLeafCount = countNonEmptyLeaves(answers);
  const rawTokens = meaningfulTokens(rawText);
  const answerTokens = meaningfulTokens(answerText);
  const overlapRatio = tokenOverlapRatio(rawTokens, answerTokens);
  const hasUnsafeContent = UNSAFE_TERMS.some((term) => answerText.includes(term));

  if (!answerText.trim() || answerLeafCount === 0) {
    return {
      relevance: 20,
      accuracy: 20,
      format: 30,
      safety: hasUnsafeContent ? 30 : 99,
      overall: hasUnsafeContent ? 24 : 34,
    };
  }

  const relevance = clampScore(58 + overlapRatio * 36 + Math.min(answerLeafCount, 4) * 2);
  const accuracy = clampScore(55 + overlapRatio * 34 + (answerLeafCount >= 3 ? 6 : 0));
  const format = clampScore(answersHaveEmptyRequiredValues(answers) ? 58 : 84 + Math.min(answerLeafCount, 4) * 2);
  const safety = hasUnsafeContent ? 30 : 99;
  const overall = clampScore(Math.round(relevance * 0.25 + accuracy * 0.25 + format * 0.2 + safety * 0.2 + Math.min(answerLeafCount, 5) * 2));

  return {
    relevance,
    accuracy,
    format,
    safety,
    overall,
  };
}

function defaultReviewRule(taskId: string): ReviewRuleRecord {
  return {
    id: 'default_ai_precheck_rule',
    taskId,
    name: '默认 AI 预审规则',
    promptTemplate: '请根据 rawData 和标注员 answers，按相关性、准确性、格式合规、安全性、综合五个维度评分。',
    promptVersion: 1,
    dimensions: REQUIRED_DIMENSIONS,
    passThreshold: 70,
    manualThreshold: 55,
    provider: 'mock',
    model: 'mock-stable-reviewer',
    temperature: 0,
    config: { structuredOutputMode: 'function_calling' },
  };
}

function normalizedDimensions(rule: ReviewRuleRecord): ReviewDimension[] {
  const dimensions = Array.isArray(rule.dimensions) ? rule.dimensions.filter(isReviewDimension) : [];
  const dimensionMap = new Map(dimensions.map((dimension) => [dimension.key, dimension]));

  return REQUIRED_DIMENSIONS.map((dimension) => dimensionMap.get(dimension.key) ?? dimension);
}

function isReviewDimension(value: unknown): value is ReviewDimension {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as Record<string, unknown>).key === 'string' &&
      typeof (value as Record<string, unknown>).label === 'string' &&
      typeof (value as Record<string, unknown>).maxScore === 'number',
  );
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

function answersHaveEmptyRequiredValues(answers: Record<string, unknown>): boolean {
  const values = Object.values(answers);

  return values.length === 0 || values.some((value) => {
    if (Array.isArray(value)) {
      return value.length === 0;
    }

    return value === null || value === undefined || value === '';
  });
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
