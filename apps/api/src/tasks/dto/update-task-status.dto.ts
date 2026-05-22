import type { TaskStatus } from '@labelhub/shared';

export type UpdateTaskStatusDto = {
  status?: unknown;
  actorId?: unknown;
  reason?: unknown;
  confirm?: unknown;
};

export type UpdateTaskStatusInput = {
  status: TaskStatus;
  actorId?: string;
  reason?: string;
  confirm?: boolean;
};
