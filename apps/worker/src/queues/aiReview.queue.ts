export const AI_REVIEW_QUEUE_NAME = 'ai-review';

export type AiReviewJobPayload = {
  submissionId: string;
  taskId: string;
  round: number;
  idempotencyKey: string;
};

export function buildAiReviewJobPayload(input: {
  submissionId: string;
  taskId: string;
  round: number;
}): AiReviewJobPayload {
  return {
    submissionId: input.submissionId,
    taskId: input.taskId,
    round: input.round,
    idempotencyKey: `${input.submissionId}:${input.round}:ai-review`,
  };
}
