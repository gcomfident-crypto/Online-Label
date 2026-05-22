import { Link } from 'react-router-dom';

import { StatusTag } from '../../../components/StatusTag';
import type { TaskDto } from '../../../api/tasks';

type TaskTableProps = {
  tasks: TaskDto[];
  onPublish: (task: TaskDto) => void;
  onPause: (task: TaskDto) => void;
  onResume: (task: TaskDto) => void;
  onEnd: (task: TaskDto) => void;
};

type TaskActionsProps = Omit<TaskTableProps, 'tasks'> & {
  task: TaskDto;
};

const DISTRIBUTION_LABELS = {
  FIRST_COME_FIRST_SERVE: '先到先得',
  ASSIGNMENT: '指派',
  QUOTA_RACE: '配额抢单',
} as const;

export const TaskTable = ({ tasks, onPublish, onPause, onResume, onEnd }: TaskTableProps) => {
  return (
    <div className="task-table-scroll">
      <table className="task-table" aria-label="任务列表">
        <thead>
          <tr>
            <th>任务</th>
            <th>状态</th>
            <th>分发策略</th>
            <th>配额 / 进度</th>
            <th>截止时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id}>
              <td>
                <Link className="task-title-link" to={`/owner/tasks/${task.id}`}>
                  {task.title}
                </Link>
                <small>
                  {task.id} · Owner：张满 · 创建于 {formatDate(task.createdAt)}
                </small>
              </td>
              <td>
                <StatusTag group="task" status={task.status} size="sm" />
              </td>
              <td>{DISTRIBUTION_LABELS[task.distributionStrategy]}</td>
              <td>
                {task.quota ? `${task.itemCount.toLocaleString()} / ${task.quota.toLocaleString()}` : '—'}
                {task.quota ? (
                  <span className="task-progress">
                    <span style={{ width: `${Math.min(100, (task.itemCount / task.quota) * 100)}%` }} />
                  </span>
                ) : null}
              </td>
              <td>{task.deadline ? formatDate(task.deadline) : '—'}</td>
              <td>
                <TaskActions
                  task={task}
                  onPublish={onPublish}
                  onPause={onPause}
                  onResume={onResume}
                  onEnd={onEnd}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const TaskActions = ({ task, onPublish, onPause, onResume, onEnd }: TaskActionsProps) => {
  if (task.status === 'DRAFT') {
    return (
      <button type="button" onClick={() => onPublish(task)} aria-label={`发布 ${task.title}`}>
        发布
      </button>
    );
  }

  if (task.status === 'PUBLISHED') {
    return (
      <div className="task-table__actions">
        <button type="button" onClick={() => onPause(task)} aria-label={`暂停 ${task.title}`}>
          暂停
        </button>
        <button type="button" onClick={() => onEnd(task)} aria-label={`结束 ${task.title}`}>
          结束
        </button>
      </div>
    );
  }

  if (task.status === 'PAUSED') {
    return (
      <div className="task-table__actions">
        <button type="button" onClick={() => onResume(task)} aria-label={`恢复 ${task.title}`}>
          恢复
        </button>
        <button type="button" onClick={() => onEnd(task)} aria-label={`结束 ${task.title}`}>
          结束
        </button>
      </div>
    );
  }

  return <span>—</span>;
};

const formatDate = (value: string): string => value.slice(0, 10);

export { DISTRIBUTION_LABELS };
