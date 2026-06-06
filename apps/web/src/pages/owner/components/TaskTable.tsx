import type { KeyboardEvent, MouseEvent, ReactNode, Ref } from 'react';

import { StatusTag } from '../../../components/StatusTag';
import type { TaskDto } from '../../../api/tasks';
import { TableEmptyState } from '../../../components/TableEmptyState';

export type TaskTableSortField = 'taskId' | 'createdAt' | 'deadline';
export type TaskTableSortDirection = 'asc' | 'desc';

type TaskTableProps = {
  currentPage: number;
  deletingTaskIds?: ReadonlySet<string>;
  enteringTaskIds?: ReadonlySet<string>;
  getTaskDisplayId?: (task: TaskDto) => string;
  sortDirection: TaskTableSortDirection;
  sortField: TaskTableSortField | null;
  tablePanelRef?: Ref<HTMLDivElement>;
  tasks: TaskDto[];
  totalPages: number;
  onSort: (field: TaskTableSortField) => void;
  onOpenTask: (task: TaskDto) => void;
  onPageChange: (page: number) => void;
  onPublish: (task: TaskDto) => void;
  onPause: (task: TaskDto) => void;
  onResume: (task: TaskDto) => void;
  onEnd: (task: TaskDto) => void;
  onDelete: (task: TaskDto) => void;
};

type TaskActionsProps = Pick<TaskTableProps, 'onPublish' | 'onPause' | 'onResume' | 'onEnd' | 'onDelete'> & {
  isDeleting: boolean;
  task: TaskDto;
};

const DISTRIBUTION_LABELS = {
  FIRST_COME_FIRST_SERVE: '先到先得',
  ASSIGNMENT: '指派',
  QUOTA_RACE: '配额抢单',
} as const;

export const TaskTable = ({
  currentPage,
  deletingTaskIds = EMPTY_TASK_ID_SET,
  enteringTaskIds = EMPTY_TASK_ID_SET,
  getTaskDisplayId = defaultTaskDisplayId,
  sortDirection,
  sortField,
  tablePanelRef,
  tasks,
  totalPages,
  onSort,
  onOpenTask,
  onPageChange,
  onPublish,
  onPause,
  onResume,
  onEnd,
  onDelete,
}: TaskTableProps) => {
  const handleTaskRowClick = (event: MouseEvent<HTMLTableRowElement>, task: TaskDto) => {
    if (deletingTaskIds.has(task.id) || shouldIgnoreTaskRowOpen(event.target) || hasActiveTextSelection()) {
      return;
    }

    onOpenTask(task);
  };

  const handleTaskRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, task: TaskDto) => {
    if (deletingTaskIds.has(task.id) || shouldIgnoreTaskRowOpen(event.target)) {
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpenTask(task);
    }
  };

  return (
    <div className="task-table-panel" ref={tablePanelRef}>
      <div className="task-table-scroll" data-adaptive-table-viewport="true">
        <table className="task-table" aria-label="任务列表">
          <colgroup>
            <col className="task-table__col-id" />
            <col className="task-table__col-title" />
            <col className="task-table__col-status" />
            <col className="task-table__col-owner" />
            <col className="task-table__col-progress" />
            <col className="task-table__col-created" />
            <col className="task-table__col-deadline" />
            <col className="task-table__col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th>
                <SortableTaskHeader
                  field="taskId"
                  label="任务ID"
                  sortDirection={sortDirection}
                  sortField={sortField}
                  onSort={onSort}
                />
              </th>
              <th>任务名</th>
              <th>状态</th>
              <th>创建人</th>
              <th>进度</th>
              <th>
                <SortableTaskHeader
                  field="createdAt"
                  label="创建时间"
                  sortDirection={sortDirection}
                  sortField={sortField}
                  onSort={onSort}
                />
              </th>
              <th>
                <SortableTaskHeader
                  field="deadline"
                  label="截止时间"
                  sortDirection={sortDirection}
                  sortField={sortField}
                  onSort={onSort}
                />
              </th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody key={currentPage} className="task-table__body">
            {tasks.length > 0 ? (
              tasks.map((task) => {
                const isDeleting = deletingTaskIds.has(task.id);
                const isEntering = enteringTaskIds.has(task.id) && !isDeleting;

                return (
                  <tr
                    key={task.id}
                    className={[
                      'task-table__row',
                      isDeleting ? 'is-removing' : '',
                      isEntering ? 'is-entering' : '',
                    ].filter(Boolean).join(' ')}
                    tabIndex={isDeleting ? -1 : 0}
                    onClick={(event) => handleTaskRowClick(event, task)}
                    onKeyDown={(event) => handleTaskRowKeyDown(event, task)}
                  >
                    <td className="task-table__id">
                      <code>{getTaskDisplayId(task)}</code>
                    </td>
                    <td>
                      <TaskTableCellInner>
                        <button
                          className="task-title-link"
                          type="button"
                          disabled={isDeleting}
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpenTask(task);
                          }}
                        >
                          {task.title}
                        </button>
                      </TaskTableCellInner>
                    </td>
                    <td>
                      <TaskTableCellInner>
                        <StatusTag group="task" status={task.status} size="sm" />
                      </TaskTableCellInner>
                    </td>
                    <td>
                      <TaskTableCellInner>{formatTaskCreator(task.createdById)}</TaskTableCellInner>
                    </td>
                    <td>
                      <TaskTableCellInner>
                        <TaskProgressCell task={task} />
                      </TaskTableCellInner>
                    </td>
                    <td className="task-table__date-column">
                      <TaskTableCellInner>
                        <DateTimeCell value={task.createdAt} />
                      </TaskTableCellInner>
                    </td>
                    <td className="task-table__date-column">
                      <TaskTableCellInner>
                        {task.deadline ? <DateTimeCell value={task.deadline} /> : '—'}
                      </TaskTableCellInner>
                    </td>
                    <td>
                      <TaskTableCellInner>
                        <TaskActions
                          isDeleting={isDeleting}
                          task={task}
                          onPublish={onPublish}
                          onPause={onPause}
                          onResume={onResume}
                          onEnd={onEnd}
                          onDelete={onDelete}
                        />
                      </TaskTableCellInner>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr className="task-table__empty-row">
                <td colSpan={8}>
                  <TableEmptyState title="当前没有任务哦" illustrationAlt="空任务列表插画" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="task-table-pagination" aria-label="任务列表分页">
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          上一页
        </button>
        <span aria-label="当前页码">
          第 {currentPage} / {totalPages} 页
        </span>
        <button
          type="button"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
        >
          下一页
        </button>
      </div>
    </div>
  );
};

const defaultTaskDisplayId = (task: TaskDto): string => task.id;
const EMPTY_TASK_ID_SET = new Set<string>();

const TaskTableCellInner = ({ children }: { children: ReactNode }) => (
  <div className="task-table__cell-inner">{children}</div>
);

const SortableTaskHeader = ({
  field,
  label,
  sortDirection,
  sortField,
  onSort,
}: {
  field: TaskTableSortField;
  label: string;
  sortDirection: TaskTableSortDirection;
  sortField: TaskTableSortField | null;
  onSort: (field: TaskTableSortField) => void;
}) => {
  const isActive = sortField === field;
  const icon = isActive ? (sortDirection === 'asc' ? '↑' : '↓') : '⇅';

  return (
    <button
      aria-label={`按${label}排序`}
      aria-pressed={isActive}
      className={`task-table__sortable-header${isActive ? ' is-active' : ''}`}
      type="button"
      onClick={() => onSort(field)}
    >
      <span>{label}</span>
      <span aria-hidden="true" className="task-table__sort-icon">
        {icon}
      </span>
    </button>
  );
};

const TaskActions = ({ isDeleting, task, onPublish, onPause, onResume, onEnd, onDelete }: TaskActionsProps) => {
  const canPublish = task.status === 'DRAFT';
  const canResume = task.status === 'PAUSED';
  const canPause = task.status === 'PUBLISHED';
  const canEnd = task.status === 'PUBLISHED' || task.status === 'PAUSED';
  const canDelete = task.status !== 'ENDED';

  return (
    <div className="task-table__actions">
      <TaskActionIconButton
        icon="publish"
        label={`${canResume ? '恢复' : '发布'} ${task.title}`}
        disabled={isDeleting || (!canPublish && !canResume)}
        onClick={() => (canResume ? onResume(task) : onPublish(task))}
      />
      <TaskActionIconButton
        icon="pause"
        label={`暂停 ${task.title}`}
        disabled={isDeleting || !canPause}
        onClick={() => onPause(task)}
      />
      <TaskActionIconButton
        icon="end"
        label={`结束 ${task.title}`}
        disabled={isDeleting || !canEnd}
        onClick={() => onEnd(task)}
      />
      <TaskActionIconButton
        icon="delete"
        label={`删除 ${task.title}`}
        disabled={isDeleting || !canDelete}
        onClick={() => onDelete(task)}
      />
    </div>
  );
};

const TaskActionIconButton = ({
  disabled,
  icon,
  label,
  onClick,
}: {
  disabled: boolean;
  icon: 'delete' | 'end' | 'pause' | 'publish';
  label: string;
  onClick: () => void;
}) => (
  <button
    className={`task-table-action task-table-action--icon task-table-action--${icon}`}
    type="button"
    disabled={disabled}
    onClick={(event) => {
      event.stopPropagation();
      onClick();
    }}
    aria-label={label}
    title={label}
  >
    <TaskActionIcon icon={icon} />
  </button>
);

const TaskActionIcon = ({ icon }: { icon: 'delete' | 'end' | 'pause' | 'publish' }) => {
  if (icon === 'publish') {
    return (
      <svg
        aria-hidden="true"
        className="task-table-action__icon task-table-action__icon--publish"
        viewBox="0 0 1024 1024"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M880.724 112l0.645 0.029 0.705 0.039 0.566 0.042c1.533 0.127 3.046 0.365 4.53 0.708a31.835 31.835 0 0 1 8.91 3.519l0.757 0.455 0.162 0.101a31.745 31.745 0 0 1 5.287 4.149 31.81 31.81 0 0 1 5.068 6.361 31.797 31.797 0 0 1 3.724 8.996 31.6 31.6 0 0 1 0.922 7.535 32.178 32.178 0 0 1-1.85 10.794L665.017 890.12c-9.37 28.11-48.458 29.39-59.82 2.37l-0.337-0.828-132.896-339.625-339.625-132.898c-27.592-10.798-26.869-49.9 0.698-59.864l0.844-0.293 735.334-245.112a31.933 31.933 0 0 1 3.595-1.05 31.851 31.851 0 0 1 4.559-0.712l0.601-0.043c0.431-0.028 0.863-0.047 1.296-0.064h1.458z m-73.956 150.485L534.086 535.167l98.165 250.864 174.517-523.546z m-45.255-45.254L237.967 391.745l250.865 98.167 272.68-272.68z"
          fill="#306DF8"
        />
      </svg>
    );
  }

  if (icon === 'pause') {
    return (
      <svg
        aria-hidden="true"
        className="task-table-action__icon task-table-action__icon--pause"
        viewBox="0 0 1024 1024"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M512 64c247.424 0 448 200.576 448 448S759.424 960 512 960 64 759.424 64 512 264.576 64 512 64z m0 68c-209.868 0-380 170.132-380 380s170.132 380 380 380 380-170.132 380-380-170.132-380-380-380zM400 352c17.673 0 32 14.327 32 32v256c0 17.673-14.327 32-32 32-17.673 0-32-14.327-32-32V384c0-17.673 14.327-32 32-32z m225 0c17.673 0 32 14.327 32 32v256c0 17.673-14.327 32-32 32-17.673 0-32-14.327-32-32V384c0-17.673 14.327-32 32-32z"
          fill="#306DF8"
        />
      </svg>
    );
  }

  if (icon === 'end') {
    return (
      <svg
        aria-hidden="true"
        className="task-table-action__icon task-table-action__icon--end"
        viewBox="0 0 1024 1024"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M512 64c247.424 0 448 200.576 448 448S759.424 960 512 960 64 759.424 64 512 264.576 64 512 64z m0 64c-212.077 0-384 171.923-384 384s171.923 384 384 384 384-171.923 384-384-171.923-384-384-384z m104 248c17.673 0 32 14.327 32 32v208c0 17.673-14.327 32-32 32H408c-17.673 0-32-14.327-32-32V408c0-17.673 14.327-32 32-32h208z"
          fill="#306DF8"
        />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      className="task-table-action__icon task-table-action__icon--delete"
      viewBox="0 0 1024 1024"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M836.6 339.2c-21.5 0-39 16.5-39 36.9v419.7c0 49.5-42.6 89.9-94.9 89.9H320.2c-52.3 0-94.9-40.3-94.9-89.9V376.1c0-20.4-17.5-36.9-39-36.9s-39 16.5-39 36.9v419.7c0 90.3 77.6 163.7 173 163.7h382.4c95.4 0 173-73.4 173-163.7V376.1c-0.1-20.4-17.6-36.9-39.1-36.9zM919.8 193H718.4l-81.5-89.9c-21.9-24.1-53.8-38-87.4-38h-86.6c-35.8 0-68.9 15.3-90.9 42L301.2 193H103c-21.5 0-39 16.5-39 36.9s17.5 36.9 39 36.9h217.3c12 0 23.4-5.2 30.8-14.2l82.5-100.1c7.1-8.6 17.8-13.6 29.3-13.6h86.6c10.9 0 21.2 4.5 28.3 12.3L670.9 254c7.4 8.2 18.2 12.9 29.6 12.9h219.3c21.5 0 39-16.5 39-36.9s-17.5-37-39-37zM447.2 754.5V420.1c0-20.4-17.5-36.9-39-36.9s-39 16.5-39 36.9v334.4c0 20.4 17.5 36.9 39 36.9 21.6 0.1 39-16.5 39-36.9z m206.4 0V420.1c0-20.4-17.5-36.9-39-36.9-21.6 0-39 16.5-39 36.9v334.4c0 20.4 17.5 36.9 39 36.9 21.5 0.1 39-16.5 39-36.9z"
        fill="currentColor"
      />
    </svg>
  );
};

const TaskProgressCell = ({ task }: { task: TaskDto }) => {
  const totalCount = task.quota ?? task.itemCount ?? 0;

  if (totalCount <= 0) {
    return <span className="task-progress-empty">—</span>;
  }

  const completedCount = Math.min(task.completedItemCount ?? 0, totalCount);
  const progressPercent = Math.min(100, (completedCount / totalCount) * 100);
  const progressPercentLabel = formatProgressPercent(progressPercent);

  return (
    <div className="task-progress-cell">
      <div className="task-progress-cell__header">
        <span className="task-progress-cell__count">
          {completedCount.toLocaleString()} / {totalCount.toLocaleString()} 题
        </span>
        <strong>{progressPercentLabel}</strong>
      </div>
      <span
        className="task-progress"
        role="progressbar"
        aria-label={`${task.title} 完成进度`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progressPercent)}
        aria-valuetext={`${completedCount.toLocaleString()} / ${totalCount.toLocaleString()}，${progressPercentLabel}`}
      >
        <span className="task-progress__fill" style={{ width: `${progressPercent}%` }} />
      </span>
    </div>
  );
};

const DateTimeCell = ({ value }: { value?: string | null }) => {
  const { date, time } = splitDateTimeMinute(value);

  return (
    <span className="task-date-cell">
      <span className="task-date-cell__date">{date}</span>
      <small className="task-date-cell__time">{time}</small>
    </span>
  );
};

const splitDateTimeMinute = (value?: string | null): { date: string; time: string } => {
  if (!value) {
    return { date: '—', time: '' };
  }

  const [date, time = ''] = value.slice(0, 16).replace('T', ' ').split(' ');

  return { date, time };
};

const formatProgressPercent = (value: number): string => {
  const rounded = Math.round(value * 10) / 10;

  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
};

const shouldIgnoreTaskRowOpen = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(target.closest('button, a, input, textarea, select, [role="button"]'));
};

const hasActiveTextSelection = (): boolean => {
  const selection = window.getSelection?.();

  return Boolean(selection && selection.type === 'Range' && selection.toString().trim());
};

const TASK_CREATOR_NAMES: Record<string, string> = {
  user_owner_001: '张满',
  user_owner_zhang_man: '张满',
};

const formatTaskCreator = (createdById: string | null): string => {
  if (!createdById) {
    return '—';
  }

  return TASK_CREATOR_NAMES[createdById] ?? createdById;
};

export { DISTRIBUTION_LABELS };
