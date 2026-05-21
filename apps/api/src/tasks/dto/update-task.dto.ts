import type { DistributionStrategy } from './create-task.dto.ts';

export type UpdateTaskDto = {
  title?: unknown;
  description?: unknown;
  richTextInstruction?: unknown;
  tags?: unknown;
  rewardRule?: unknown;
  quota?: unknown;
  deadline?: unknown;
  distributionStrategy?: unknown;
  aiPreReviewEnabled?: unknown;
  aiRuleName?: unknown;
  templateId?: unknown;
};

export type UpdateTaskInput = {
  title?: string;
  description?: string | null;
  richTextInstruction?: string | null;
  tags?: string[];
  rewardRule?: string | null;
  quota?: number | null;
  deadline?: string | null;
  distributionStrategy?: DistributionStrategy;
  aiPreReviewEnabled?: boolean;
  aiRuleName?: string | null;
  templateId?: string;
};
