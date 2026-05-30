import type { TaskDto } from '../../api/tasks';

const BUSINESS_TASK_ID_PATTERN = /^T-\d+$/i;

export const createTaskDisplayIdMap = (tasks: TaskDto[]): Map<string, string> => {
  const sortedTasks = [...tasks].sort((left, right) => {
    const createdAtDiff = taskCreatedAtTimestamp(left) - taskCreatedAtTimestamp(right);

    return createdAtDiff === 0 ? left.id.localeCompare(right.id) : createdAtDiff;
  });

  return new Map(
    sortedTasks.map((task, index) => [
      task.id,
      BUSINESS_TASK_ID_PATTERN.test(task.id) ? task.id : formatGeneratedTaskDisplayId(index + 1),
    ]),
  );
};

export const taskCreatedAtTimestamp = (task: TaskDto): number => {
  const timestamp = Date.parse(task.createdAt);

  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const formatGeneratedTaskDisplayId = (sequence: number): string => `T-${sequence.toString().padStart(4, '0')}`;
