import type { AiReviewJobPayload } from '../queues/aiReview.queue.ts';
import type { DatasetKind, LlmProvider, LlmReviewResult, StructuredOutputMode } from '../llm/LlmProvider.ts';
import { buildAiReviewPrompt } from '../prompts/aiReviewPrompts.ts';

type ReviewRuleRecord = {
  id: string;
  promptTemplate: string;
  promptVersion: number;
  dimensionVersion: number;
  provider: string;
  model: string;
  temperature: number;
  config: Record<string, unknown> | null;
};

type SubmissionRecord = {
  id: string;
  status: string;
  round: number;
  answers: Record<string, unknown>;
  assignment: {
    task: {
      id: string;
      template: {
        datasetKind: DatasetKind;
      };
      reviewRules: ReviewRuleRecord[];
    };
    taskItem: {
      rawData: Record<string, unknown>;
    };
  };
};

type AiReviewJobRecord = {
  id: string;
  attempts: number;
  maxAttempts: number;
  logs: unknown;
};

type AiReviewProcessorClient = {
  submission: {
    findUnique: (args: { where: { id: string }; include?: unknown }) => Promise<SubmissionRecord | null>;
    update: (args: { where: { id: string }; data: { status: string } }) => Promise<unknown>;
  };
  aiReviewJob: {
    findUnique: (args: { where: { idempotencyKey: string } }) => Promise<AiReviewJobRecord | null>;
    update: (args: { where: { idempotencyKey: string }; data: Record<string, unknown> }) => Promise<unknown>;
  };
  reviewRecord: {
    findUnique: (args: { where: { idempotencyKey: string } }) => Promise<Record<string, unknown> | null>;
    create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
  };
  auditLog: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  };
};

export type ProcessAiReviewResult = {
  verdict: 'pass' | 'reject' | 'manual';
  reused: boolean;
};

export async function processAiReviewJob(
  payload: AiReviewJobPayload,
  dependencies: { client: AiReviewProcessorClient; provider: LlmProvider },
): Promise<ProcessAiReviewResult> {
  const existing = await dependencies.client.reviewRecord.findUnique({
    where: { idempotencyKey: payload.idempotencyKey },
  });
  if (existing) {
    return {
      verdict: existing.decision === 'reject' ? 'reject' : existing.decision === 'manual' ? 'manual' : 'pass',
      reused: true,
    };
  }

  const submission = await dependencies.client.submission.findUnique({
    where: { id: payload.submissionId },
    include: {
      assignment: {
        include: {
          task: { include: { template: true, reviewRules: true } },
          taskItem: true,
        },
      },
    },
  });
  if (!submission) {
    throw new Error('提交记录不存在，无法执行 AI 预审。');
  }

  const job = await dependencies.client.aiReviewJob.findUnique({
    where: { idempotencyKey: payload.idempotencyKey },
  });
  const rule = submission.assignment.task.reviewRules[0];
  if (!rule) {
    throw new Error('任务缺少 AI 审核规则。');
  }

  await dependencies.client.aiReviewJob.update({
    where: { idempotencyKey: payload.idempotencyKey },
    data: {
      status: 'RUNNING',
      startedAt: new Date(),
      attempts: job?.attempts ?? 0,
      logs: appendLog(job?.logs, 'queue', 'Worker 开始处理 AI 预审任务。'),
    },
  });

  const structuredOutputMode = selectStructuredOutputMode(rule, dependencies.provider);
  const rawPrompt = buildAiReviewPrompt({
    datasetKind: submission.assignment.task.template.datasetKind,
    rawData: submission.assignment.taskItem.rawData,
    answers: submission.answers,
    rulePromptTemplate: rule.promptTemplate,
  });

  try {
    const review = await dependencies.provider.review({
      datasetKind: submission.assignment.task.template.datasetKind,
      rawPrompt,
      rawData: submission.assignment.taskItem.rawData,
      answers: submission.answers,
      structuredOutputMode,
    });
    assertStructuredReview(review);
    await persistReviewResult(payload, dependencies.client, submission, rule, rawPrompt, review);

    return { verdict: review.verdict, reused: false };
  } catch (error) {
    await persistReviewFailure(payload, dependencies.client, job, error);
    throw error;
  }
}

function selectStructuredOutputMode(rule: ReviewRuleRecord, provider: LlmProvider): StructuredOutputMode {
  if (rule.config?.structuredOutputMode === 'json_schema') {
    return 'json_schema';
  }

  return provider.capabilities.supportsFunctionCalling ? 'function_calling' : 'json_schema';
}

async function persistReviewResult(
  payload: AiReviewJobPayload,
  client: AiReviewProcessorClient,
  submission: SubmissionRecord,
  rule: ReviewRuleRecord,
  rawPrompt: string,
  review: LlmReviewResult,
) {
  const submissionStatus = review.verdict === 'reject' ? 'NEEDS_REVISION' : 'HUMAN_PENDING';
  await client.reviewRecord.create({
    data: {
      submissionId: payload.submissionId,
      ruleId: rule.id,
      stage: 'AI_PRECHECK',
      reviewerType: 'AI',
      scores: review.scores,
      decision: review.verdict,
      comment: review.reason,
      rawPrompt,
      rawOutput: review.rawOutput,
      structuredOutput: review.structuredOutput,
      modelMetadata: {
        ...review.modelMetadata,
        promptVersion: rule.promptVersion,
        dimensionVersion: rule.dimensionVersion,
      },
      retryCount: 0,
      idempotencyKey: payload.idempotencyKey,
    },
  });
  await client.submission.update({
    where: { id: payload.submissionId },
    data: { status: submissionStatus },
  });
  await client.aiReviewJob.update({
    where: { idempotencyKey: payload.idempotencyKey },
    data: {
      status: 'SUCCEEDED',
      finishedAt: new Date(),
      lastError: null,
      logs: [{ level: 'verdict', message: `结构化输出：${review.verdict}` }],
    },
  });
  await client.auditLog.create({
    data: {
      taskId: submission.assignment.task.id,
      submissionId: payload.submissionId,
      fromStatus: 'AI_REVIEWING',
      toStatus: submissionStatus,
      metadata: {
        action: 'AI_REVIEW_COMPLETED',
        verdict: review.verdict,
        idempotencyKey: payload.idempotencyKey,
      },
    },
  });
}

async function persistReviewFailure(
  payload: AiReviewJobPayload,
  client: AiReviewProcessorClient,
  job: AiReviewJobRecord | null,
  error: unknown,
) {
  const attempts = (job?.attempts ?? 0) + 1;
  const isFinal = attempts >= (job?.maxAttempts ?? 3);
  await client.aiReviewJob.update({
    where: { idempotencyKey: payload.idempotencyKey },
    data: {
      status: isFinal ? 'MANUAL_FALLBACK' : 'FAILED_RETRYING',
      attempts,
      lastError: error instanceof Error ? error.message : 'AI 预审失败。',
      finishedAt: isFinal ? new Date() : null,
      logs: appendLog(job?.logs, isFinal ? 'manual' : 'retry', error instanceof Error ? error.message : 'AI 预审失败。'),
    },
  });

  if (isFinal) {
    await client.submission.update({
      where: { id: payload.submissionId },
      data: { status: 'HUMAN_PENDING' },
    });
  }
}

function assertStructuredReview(review: LlmReviewResult): void {
  if (!['pass', 'reject', 'manual'].includes(review.verdict)) {
    throw new Error('结构化输出异常：verdict 不合法。');
  }

  if (!review.scores || typeof review.scores !== 'object' || Array.isArray(review.scores)) {
    throw new Error('结构化输出异常：scores 不合法。');
  }
}

function appendLog(value: unknown, level: string, message: string): Array<Record<string, unknown>> {
  const logs = Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    : [];

  return [...logs, { level, message, at: new Date().toISOString() }];
}
