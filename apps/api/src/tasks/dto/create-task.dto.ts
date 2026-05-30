import type { TaskStatus } from '@labelhub/shared';

export type DistributionStrategy = 'FIRST_COME_FIRST_SERVE' | 'ASSIGNMENT' | 'QUOTA_RACE';

export type CreateTaskDto = {
  title?: unknown;
  description?: unknown;
  richTextInstruction?: unknown;
  tags?: unknown;
  rewardRule?: unknown;
  rewardPerItem?: unknown;
  perUserLimit?: unknown;
  quota?: unknown;
  deadline?: unknown;
  distributionStrategy?: unknown;
  aiPreReviewEnabled?: unknown;
  aiRuleName?: unknown;
  templateId?: unknown;
  actorId?: unknown;
};

export type CreateTaskInput = {
  title: string;
  description?: string | null;
  richTextInstruction?: string | null;
  tags?: string[];
  rewardRule?: string | null;
  rewardPerItem?: number | null;
  perUserLimit?: number | null;
  quota?: number | null;
  deadline?: string | null;
  distributionStrategy?: DistributionStrategy;
  aiPreReviewEnabled?: boolean;
  aiRuleName?: string | null;
  templateId?: string | null;
  actorId: string;
  status?: TaskStatus;
};
