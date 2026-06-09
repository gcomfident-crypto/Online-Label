import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  listLabelerAssignmentTasks,
  type LabelerAssignmentDto,
  type LabelerAssignmentTaskDto,
} from '../../api/assignments';
import { PageLoading } from '../../components/PageLoading';
import { TableEmptyState } from '../../components/TableEmptyState';
import { ToastViewport, useToastController } from '../../components/ToastViewport';
import { useAdaptiveTablePageSize } from '../../hooks/useAdaptiveTablePageSize';

const LABELER_ID = 'user_labeler_li_lei';
const MY_DATA_FALLBACK_PAGE_SIZE = 7;
const MY_DATA_TABLE_ROW_HEIGHT = 66;

type LabelerStatusFilter = '' | 'IN_PROGRESS' | 'COMPLETED' | 'NEEDS_REVISION';
type LabelerTaskStatus = Exclude<LabelerStatusFilter, ''>;
type MyDataSortField = 'taskId' | 'latestSubmittedAt' | 'claimedAt';
type MyDataSortDirection = 'asc' | 'desc';

const STATUS_OPTIONS: readonly {
  label: string;
  value: LabelerStatusFilter;
  summaryClassName: string;
}[] = [
  { label: '全部状态', value: '', summaryClassName: 'task-summary-card--total' },
  { label: '进行中', value: 'IN_PROGRESS', summaryClassName: 'task-summary-card--running' },
  { label: '已完成', value: 'COMPLETED', summaryClassName: 'task-summary-card--done' },
  { label: '待修改', value: 'NEEDS_REVISION', summaryClassName: 'task-summary-card--paused' },
];

type WorkbenchNavigationState = {
  assignmentId: string;
  source: 'my-data-table';
  taskDisplayId: string;
  taskTitle: string;
};

export const MyDataPage = () => {
  const navigate = useNavigate();
  const [allTaskGroups, setAllTaskGroups] = useState<LabelerTaskGroup[]>([]);
  const [statusFilter, setStatusFilter] = useState<LabelerStatusFilter>('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [sortField, setSortField] = useState<MyDataSortField | null>(null);
  const [sortDirection, setSortDirection] = useState<MyDataSortDirection>('asc');
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const { dismissToast, messages, showErrorToast } = useToastController();
  const { containerRef: myDataTableContainerRef, pageSize: myDataPageSize } = useAdaptiveTablePageSize({
    fallbackPageSize: MY_DATA_FALLBACK_PAGE_SIZE,
    rowHeight: MY_DATA_TABLE_ROW_HEIGHT,
  });

  useEffect(() => {
    void loadMyData();
  }, []);

  const filteredTaskGroups = useMemo(() => {
    const keyword = searchKeyword.trim();

    return allTaskGroups.filter((taskGroup) => {
      if (statusFilter && !matchesTaskGroupStatusFilter(taskGroup, statusFilter)) {
        return false;
      }

      if (keyword && !matchesTaskGroupKeyword(taskGroup, keyword)) {
        return false;
      }

      return true;
    });
  }, [allTaskGroups, searchKeyword, statusFilter]);
  const taskGroups = useMemo(() => {
    if (!sortField) {
      return filteredTaskGroups;
    }

    return [...filteredTaskGroups].sort((firstGroup, secondGroup) =>
      compareMyDataTaskGroupsBySortField(firstGroup, secondGroup, sortField, sortDirection),
    );
  }, [filteredTaskGroups, sortDirection, sortField]);
  const statusSummary = useMemo(
    () =>
      STATUS_OPTIONS.reduce<Record<LabelerStatusFilter, number>>(
        (summary, option) => {
          const matchingTaskGroups = option.value
            ? allTaskGroups.filter((taskGroup) => matchesTaskGroupStatusFilter(taskGroup, option.value))
            : allTaskGroups;

          summary[option.value] = matchingTaskGroups.length;
          return summary;
        },
        {
          '': 0,
          IN_PROGRESS: 0,
          COMPLETED: 0,
          NEEDS_REVISION: 0,
        },
      ),
    [allTaskGroups],
  );
  const totalPages = Math.max(1, Math.ceil(taskGroups.length / myDataPageSize));
  const paginatedTaskGroups = useMemo(() => {
    const startIndex = (currentPage - 1) * myDataPageSize;

    return taskGroups.slice(startIndex, startIndex + myDataPageSize);
  }, [currentPage, myDataPageSize, taskGroups]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchKeyword, sortDirection, sortField, statusFilter]);

  const loadMyData = async () => {
    setIsLoading(true);
    try {
      const nextTaskGroups = await listLabelerAssignmentTasks({ labelerId: LABELER_ID });
      setAllTaskGroups(nextTaskGroups);
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : '工作台加载失败。');
    } finally {
      setIsLoading(false);
    }
  };

  const navigateToWorkbench = useCallback(
    (assignment: LabelerAssignmentDto, taskDisplayId: string, taskTitle: string) => {
      navigate(workbenchHref(assignment), {
        state: { assignmentId: assignment.assignmentId, source: 'my-data-table', taskDisplayId, taskTitle } as WorkbenchNavigationState,
      });
    },
    [navigate],
  );

  const handleSort = (field: MyDataSortField) => {
    if (sortField === field) {
      setSortDirection((currentDirection) => (currentDirection === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortField(field);
    setSortDirection('asc');
  };

  return (
    <section className="my-data-page labeler-task-workspace" aria-labelledby="my-data-title">
      <ToastViewport messages={messages} onDismiss={dismissToast} />
      <div className="my-data-header">
        <div>
          <h1 id="my-data-title">工作台</h1>
        </div>
        <p className="task-management-table-description">
          汇总已领取任务的标注进度、状态、截止时间和待处理数量，帮助标注员快速回到下一条任务
        </p>
      </div>

      <div className="task-management-table-card my-data-table-scroll" ref={myDataTableContainerRef}>
        <div className="task-management-table-toolbar my-data-table-toolbar">
          <div className="task-summary-grid my-data-status-grid" aria-label="工作台状态筛选">
            {STATUS_OPTIONS.map((option) => {
              const isActive = statusFilter === option.value;

              return (
                <button
                  key={option.value || 'ALL'}
                  className={[
                    'task-summary-card',
                    option.summaryClassName,
                    isActive ? 'is-active' : '',
                  ].filter(Boolean).join(' ')}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setStatusFilter(option.value)}
                >
                  <span>{option.label}</span>
                  <strong>{statusSummary[option.value]}</strong>
                </button>
              );
            })}
          </div>

          <div className="task-filter-bar my-data-search-bar">
            <input
              aria-label="搜索任务"
              placeholder="搜索任务名 / 题目 ID / 外部 ID"
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <PageLoading title="正在加载工作台" description="正在同步已领取任务。" />
        ) : (
          <>
          <div className="task-table-scroll my-data-table-frame" data-adaptive-table-viewport="true">
            <table className="task-table my-data-table" aria-label="工作台任务列表">
              <thead>
                <tr>
                  <th>
                    <SortableMyDataHeader
                      field="taskId"
                      label="任务ID"
                      sortDirection={sortDirection}
                      sortField={sortField}
                      onSort={handleSort}
                    />
                  </th>
                  <th>任务名</th>
                  <th>已领取题目</th>
                  <th>进度</th>
                  <th>
                    <SortableMyDataHeader
                      field="latestSubmittedAt"
                      label="最近提交"
                      sortDirection={sortDirection}
                      sortField={sortField}
                      onSort={handleSort}
                    />
                  </th>
                  <th>
                    <SortableMyDataHeader
                      field="claimedAt"
                      label="领取时间"
                      sortDirection={sortDirection}
                      sortField={sortField}
                      onSort={handleSort}
                    />
                  </th>
                </tr>
              </thead>
              <tbody key={currentPage}>
                {paginatedTaskGroups.length > 0 ? paginatedTaskGroups.map((taskGroup) => (
                  <tr
                    key={taskGroup.taskId}
                    className="my-data-table__row my-data-table__row--task"
                    tabIndex={0}
                    onClick={() =>
                      navigateToWorkbench(taskGroup.nextAssignment, taskGroup.taskDisplayId, taskGroup.taskTitle)
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        navigateToWorkbench(taskGroup.nextAssignment, taskGroup.taskDisplayId, taskGroup.taskTitle);
                      }
                    }}
                  >
                    <td className="task-table__id">
                      <MyDataTableCell>
                        <code>{taskGroup.taskDisplayId}</code>
                      </MyDataTableCell>
                    </td>
                    <td>
                      <MyDataTableCell>
                        <strong>{taskGroup.taskTitle}</strong>
                      </MyDataTableCell>
                    </td>
                    <td>
                      <MyDataTableCell>
                        <strong>{taskGroup.assignmentCount.toLocaleString()} 条</strong>
                      </MyDataTableCell>
                    </td>
                    <td>
                      <MyDataTableCell>
                        <TaskProgressSummary taskGroup={taskGroup} />
                      </MyDataTableCell>
                    </td>
                    <td>
                      <MyDataTableCell>
                        {taskGroup.latestSubmittedAt ? formatDateTime(taskGroup.latestSubmittedAt) : '-'}
                      </MyDataTableCell>
                    </td>
                    <td>
                      <MyDataTableCell>{formatClaimedAtRange(taskGroup.claimedAtStart, taskGroup.claimedAtEnd)}</MyDataTableCell>
                    </td>
                  </tr>
                )) : (
                  <tr className="task-table__empty-row">
                    <td colSpan={6}>
                      <TableEmptyState
                        title="暂无领取任务"
                        description="领取任务后会在这里查看待标注题目、提交进度和返回标注页入口"
                        illustrationAlt="空工作台任务列表插画"
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="task-table-pagination my-data-table-pagination" aria-label="工作台任务列表分页">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((page) => page - 1)}
            >
              上一页
            </button>
            <span aria-label="当前页码">
              第 {currentPage} / {totalPages} 页
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((page) => page + 1)}
            >
              下一页
            </button>
          </div>
          </>
        )}
      </div>
    </section>
  );
};

const MyDataTableCell = ({ children }: { children: ReactNode }) => (
  <div className="my-data-table__cell">{children}</div>
);

const SortableMyDataHeader = ({
  field,
  label,
  sortDirection,
  sortField,
  onSort,
}: {
  field: MyDataSortField;
  label: string;
  sortDirection: MyDataSortDirection;
  sortField: MyDataSortField | null;
  onSort: (field: MyDataSortField) => void;
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

type LabelerTaskGroup = LabelerAssignmentTaskDto;

const workbenchHref = (assignment: LabelerAssignmentDto): string =>
  `/labeler/tasks/${encodeURIComponent(assignment.taskDisplayId || assignment.taskId)}/items/${encodeURIComponent(assignment.externalId || assignment.taskItemId)}`;

const formatDateTime = (value: string): string => value.slice(0, 16).replace('T', ' ');

const TaskProgressSummary = ({ taskGroup }: { taskGroup: LabelerTaskGroup }) => {
  const taskStatus = taskGroup.status;

  return (
    <div className="labeler-task-progress-summary">
      {taskStatus === 'COMPLETED' ? (
        <span
          className="labeler-assignment-status labeler-assignment-status--final_approved"
        >
          已完成
        </span>
      ) : taskStatus === 'NEEDS_REVISION' ? (
        <span className="labeler-assignment-status labeler-assignment-status--needs_revision">
          待修改
        </span>
      ) : taskGroup.isWaitingAiReview ? (
        <span className="labeler-assignment-status labeler-assignment-status--ai_review">
          AI预审
        </span>
      ) : (
        <span className="labeler-assignment-status labeler-assignment-status--in_progress">
          进行中
        </span>
      )}
    </div>
  );
};

function matchesTaskGroupStatusFilter(taskGroup: LabelerTaskGroup, statusFilter: LabelerStatusFilter): boolean {
  return taskGroup.status === statusFilter;
}

function matchesTaskGroupKeyword(taskGroup: LabelerTaskGroup, keyword: string): boolean {
  return (
    taskGroup.taskDisplayId.includes(keyword) ||
    taskGroup.taskId.includes(keyword) ||
    taskGroup.taskTitle.includes(keyword) ||
    taskGroup.searchText.includes(keyword)
  );
}

function compareMyDataTaskGroupsBySortField(
  firstGroup: LabelerTaskGroup,
  secondGroup: LabelerTaskGroup,
  field: MyDataSortField,
  direction: MyDataSortDirection,
): number {
  const multiplier = direction === 'asc' ? 1 : -1;

  if (field === 'taskId') {
    const firstIdNumber = parseMyDataTaskSortIdNumber(firstGroup.taskDisplayId);
    const secondIdNumber = parseMyDataTaskSortIdNumber(secondGroup.taskDisplayId);

    if (firstIdNumber !== null && secondIdNumber !== null && firstIdNumber !== secondIdNumber) {
      return (firstIdNumber - secondIdNumber) * multiplier;
    }

    const displayIdDiff = firstGroup.taskDisplayId.localeCompare(secondGroup.taskDisplayId, 'zh-CN', {
      numeric: true,
    });

    return displayIdDiff === 0
      ? firstGroup.taskId.localeCompare(secondGroup.taskId) * multiplier
      : displayIdDiff * multiplier;
  }

  if (field === 'latestSubmittedAt') {
    return compareNullableMyDataTimestamps(
      firstGroup.latestSubmittedAt,
      secondGroup.latestSubmittedAt,
      direction,
      firstGroup,
      secondGroup,
    );
  }

  return compareNullableMyDataTimestamps(
    firstGroup.claimedAtStart,
    secondGroup.claimedAtStart,
    direction,
    firstGroup,
    secondGroup,
  );
}

function compareNullableMyDataTimestamps(
  firstValue: string | null | undefined,
  secondValue: string | null | undefined,
  direction: MyDataSortDirection,
  firstGroup: LabelerTaskGroup,
  secondGroup: LabelerTaskGroup,
): number {
  const firstTimestamp = parseMyDataTaskSortTimestamp(firstValue);
  const secondTimestamp = parseMyDataTaskSortTimestamp(secondValue);

  if (firstTimestamp === null && secondTimestamp === null) {
    return compareMyDataTaskGroupFallback(firstGroup, secondGroup);
  }

  if (firstTimestamp === null) {
    return 1;
  }

  if (secondTimestamp === null) {
    return -1;
  }

  const diff = firstTimestamp - secondTimestamp;

  return diff === 0 ? compareMyDataTaskGroupFallback(firstGroup, secondGroup) : diff * (direction === 'asc' ? 1 : -1);
}

function compareMyDataTaskGroupFallback(firstGroup: LabelerTaskGroup, secondGroup: LabelerTaskGroup): number {
  const displayIdDiff = firstGroup.taskDisplayId.localeCompare(secondGroup.taskDisplayId, 'zh-CN', { numeric: true });

  return displayIdDiff === 0 ? firstGroup.taskId.localeCompare(secondGroup.taskId) : displayIdDiff;
}

function parseMyDataTaskSortIdNumber(value: string): number | null {
  const numericPart = value.match(/\d+/g)?.at(-1);

  if (!numericPart) {
    return null;
  }

  const parsed = Number.parseInt(numericPart, 10);

  return Number.isNaN(parsed) ? null : parsed;
}

function parseMyDataTaskSortTimestamp(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);

  return Number.isNaN(parsed) ? null : parsed;
}

function formatClaimedAtRange(firstClaimedAt: string | null, lastClaimedAt: string | null): string {
  if (!firstClaimedAt) {
    return '-';
  }

  if (!lastClaimedAt || firstClaimedAt.slice(0, 16) === lastClaimedAt.slice(0, 16)) {
    return formatDateTime(firstClaimedAt);
  }

  return `${formatDateTime(firstClaimedAt)} - ${formatDateTime(lastClaimedAt)}`;
}
