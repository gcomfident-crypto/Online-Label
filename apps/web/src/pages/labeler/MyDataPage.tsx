import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import type { DatasetKind } from '@labelhub/shared';
import {
  listLabelerAssignments,
  type AssignmentStatus,
  type LabelerAssignmentDto,
} from '../../api/assignments';
import { PageLoading } from '../../components/PageLoading';
import { TableEmptyState } from '../../components/TableEmptyState';
import { ToastViewport, useToastController } from '../../components/ToastViewport';
import { useAdaptiveTablePageSize } from '../../hooks/useAdaptiveTablePageSize';

const LABELER_ID = 'user_labeler_li_lei';
const MY_DATA_FALLBACK_PAGE_SIZE = 7;
const MY_DATA_TABLE_ROW_HEIGHT = 66;

type LabelerStatusFilter = '' | 'IN_PROGRESS' | 'SUBMITTED' | 'NEEDS_REVISION';

const STATUS_OPTIONS: readonly {
  label: string;
  value: LabelerStatusFilter;
  summaryClassName: string;
}[] = [
  { label: '全部状态', value: '', summaryClassName: 'task-summary-card--total' },
  { label: '待标注', value: 'IN_PROGRESS', summaryClassName: 'task-summary-card--running' },
  { label: '已提交', value: 'SUBMITTED', summaryClassName: 'task-summary-card--done' },
  { label: '待修改', value: 'NEEDS_REVISION', summaryClassName: 'task-summary-card--paused' },
];

type WorkbenchNavigationState = {
  source: 'my-data-table';
};

export const MyDataPage = () => {
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState<LabelerAssignmentDto[]>([]);
  const [statusFilter, setStatusFilter] = useState<LabelerStatusFilter>('');
  const [searchKeyword, setSearchKeyword] = useState('');
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

  const filteredAssignments = useMemo(() => {
    const keyword = searchKeyword.trim();

    return assignments.filter((assignment) => {
      if (statusFilter && !matchesStatusFilter(assignment, statusFilter)) {
        return false;
      }

      if (
        keyword &&
        !assignment.externalId.includes(keyword) &&
        !assignment.taskItemId.includes(keyword) &&
        !assignment.taskTitle.includes(keyword)
      ) {
        return false;
      }

      return true;
    });
  }, [assignments, searchKeyword, statusFilter]);
  const taskGroups = useMemo(() => groupAssignmentsByTask(filteredAssignments), [filteredAssignments]);
  const statusSummary = useMemo(
    () =>
      STATUS_OPTIONS.reduce<Record<LabelerStatusFilter, number>>(
        (summary, option) => {
          const matchingAssignments = option.value
            ? assignments.filter((assignment) => matchesStatusFilter(assignment, option.value))
            : assignments;

          summary[option.value] = groupAssignmentsByTask(matchingAssignments).length;
          return summary;
        },
        {
          '': 0,
          IN_PROGRESS: 0,
          SUBMITTED: 0,
          NEEDS_REVISION: 0,
        },
      ),
    [assignments],
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
  }, [searchKeyword, statusFilter]);

  const loadMyData = async () => {
    setIsLoading(true);
    try {
      const nextAssignments = await listLabelerAssignments({ labelerId: LABELER_ID });
      setAssignments(nextAssignments);
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : '工作台加载失败。');
    } finally {
      setIsLoading(false);
    }
  };

  const navigateToWorkbench = useCallback(
    (assignment: LabelerAssignmentDto) => {
      navigate(workbenchHref(assignment), { state: { source: 'my-data-table' } as WorkbenchNavigationState });
    },
    [navigate],
  );

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
                  <th>任务</th>
                  <th>类型</th>
                  <th>已领取题目</th>
                  <th>进度</th>
                  <th>最近提交</th>
                  <th>领取时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody key={currentPage}>
                {paginatedTaskGroups.length > 0 ? paginatedTaskGroups.map((taskGroup) => (
                  <tr
                    key={taskGroup.taskId}
                    className="my-data-table__row my-data-table__row--task"
                    tabIndex={0}
                    onClick={() => navigateToWorkbench(taskGroup.nextAssignment)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        navigateToWorkbench(taskGroup.nextAssignment);
                      }
                    }}
                  >
                    <td>
                      <strong>{taskGroup.taskTitle}</strong>
                      <small>{taskGroup.templateName} · {taskGroup.schemaVersion}</small>
                    </td>
                    <td>{DATASET_KIND_LABELS[taskGroup.datasetKind]}</td>
                    <td>
                      <strong>{taskGroup.assignments.length.toLocaleString()} 条</strong>
                      <small>下一条 {taskGroup.nextAssignment.externalId}</small>
                    </td>
                    <td>
                      <TaskProgressSummary taskGroup={taskGroup} />
                    </td>
                    <td>{taskGroup.latestSubmittedAt ? formatDateTime(taskGroup.latestSubmittedAt) : '-'}</td>
                    <td>{formatClaimedAtRange(taskGroup.assignments)}</td>
                    <td>
                      <Link
                        className="primary-link"
                        aria-label={`继续标注 ${taskGroup.taskTitle}`}
                        to={workbenchHref(taskGroup.nextAssignment)}
                        state={{ source: 'my-data-table' } as WorkbenchNavigationState}
                        onClick={(event) => event.stopPropagation()}
                      >
                        继续标注
                      </Link>
                    </td>
                  </tr>
                )) : (
                  <tr className="task-table__empty-row">
                    <td colSpan={7}>
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

type LabelerTaskGroup = {
  taskId: string;
  taskTitle: string;
  datasetKind: DatasetKind;
  templateName: string;
  schemaVersion: string;
  assignments: LabelerAssignmentDto[];
  latestSubmittedAt: string | null;
  nextAssignment: LabelerAssignmentDto;
};

const workbenchHref = (assignment: LabelerAssignmentDto): string =>
  `/labeler/tasks/${assignment.taskId}/items/${assignment.taskItemId}?assignmentId=${assignment.assignmentId}`;

const DATASET_KIND_LABELS: Record<DatasetKind, string> = {
  qa_quality: '问答质量',
  preference_compare: '偏好对比',
  generic_json: '通用 JSON',
};

const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  ASSIGNED: '待标注',
  IN_PROGRESS: '待标注',
  SUBMITTED: '已提交',
  UNDER_RECHECK: '复审中',
  FINAL_PENDING: '待完成',
  FINAL_APPROVED: '已完成',
  NEEDS_REVISION: '待修改',
  CANCELLED: '已取消',
};

const TASK_STATUS_ORDER: AssignmentStatus[] = [
  'NEEDS_REVISION',
  'ASSIGNED',
  'IN_PROGRESS',
  'UNDER_RECHECK',
  'FINAL_PENDING',
  'FINAL_APPROVED',
  'SUBMITTED',
  'CANCELLED',
];

const formatDateTime = (value: string): string => value.slice(0, 16).replace('T', ' ');

const groupAssignmentsByTask = (assignments: LabelerAssignmentDto[]): LabelerTaskGroup[] => {
  const groupMap = new Map<string, LabelerAssignmentDto[]>();

  for (const assignment of assignments) {
    const current = groupMap.get(assignment.taskId) ?? [];
    current.push(assignment);
    groupMap.set(assignment.taskId, current);
  }

  return [...groupMap.values()]
    .map((groupAssignments) => {
      const sortedAssignments = [...groupAssignments].sort(compareAssignmentsForDisplay);
      const firstAssignment = sortedAssignments[0];

      return {
        taskId: firstAssignment.taskId,
        taskTitle: firstAssignment.taskTitle,
        datasetKind: firstAssignment.datasetKind,
        templateName: firstAssignment.templateName,
        schemaVersion: firstAssignment.schemaVersion,
        assignments: sortedAssignments,
        latestSubmittedAt: latestSubmittedAt(sortedAssignments),
        nextAssignment: nextAssignmentToLabel(sortedAssignments),
      };
    })
    .sort((first, second) => {
      const firstClaimedAt = first.assignments[0]?.claimedAt ?? '';
      const secondClaimedAt = second.assignments[0]?.claimedAt ?? '';

      return secondClaimedAt.localeCompare(firstClaimedAt);
    });
};

const TaskProgressSummary = ({ taskGroup }: { taskGroup: LabelerTaskGroup }) => {
  const counts = countAssignmentsByStatus(taskGroup.assignments);
  const statusEntries = TASK_STATUS_ORDER
    .map((status) => ({ status, count: counts.get(status) ?? 0 }))
    .filter((entry) => entry.count > 0);

  return (
    <div className="labeler-task-progress-summary">
      {statusEntries.map((entry) => (
        <span
          key={entry.status}
          className={`labeler-assignment-status labeler-assignment-status--${entry.status.toLowerCase()}`}
        >
          {ASSIGNMENT_STATUS_LABELS[entry.status] ?? entry.status}
          {entry.count > 1 ? ` ${entry.count}` : ''}
        </span>
      ))}
    </div>
  );
};

function matchesStatusFilter(assignment: LabelerAssignmentDto, statusFilter: LabelerStatusFilter): boolean {
  if (statusFilter === 'IN_PROGRESS') {
    return assignment.status === 'IN_PROGRESS' || assignment.status === 'ASSIGNED';
  }

  return assignment.status === statusFilter;
}

function compareAssignmentsForDisplay(first: LabelerAssignmentDto, second: LabelerAssignmentDto): number {
  return compareAssignmentsByItemOrder(first, second);
}

function nextAssignmentToLabel(assignments: LabelerAssignmentDto[]): LabelerAssignmentDto {
  const orderedAssignments = [...assignments].sort(compareAssignmentsByItemOrder);

  return (
    orderedAssignments.find((assignment) => assignment.status === 'ASSIGNED' || assignment.status === 'IN_PROGRESS') ??
    orderedAssignments.find((assignment) => assignment.status === 'NEEDS_REVISION') ??
    orderedAssignments[0]
  );
}

function compareAssignmentsByItemOrder(first: LabelerAssignmentDto, second: LabelerAssignmentDto): number {
  if (first.taskItemSortOrder !== second.taskItemSortOrder) {
    return first.taskItemSortOrder - second.taskItemSortOrder;
  }

  return first.externalId.localeCompare(second.externalId, 'zh-CN', { numeric: true });
}

function latestSubmittedAt(assignments: LabelerAssignmentDto[]): string | null {
  return assignments.reduce<string | null>((latest, assignment) => {
    if (!assignment.latestSubmittedAt) {
      return latest;
    }

    return !latest || assignment.latestSubmittedAt > latest ? assignment.latestSubmittedAt : latest;
  }, null);
}

function countAssignmentsByStatus(assignments: LabelerAssignmentDto[]): Map<AssignmentStatus, number> {
  return assignments.reduce<Map<AssignmentStatus, number>>((counts, assignment) => {
    counts.set(assignment.status, (counts.get(assignment.status) ?? 0) + 1);
    return counts;
  }, new Map());
}

function formatClaimedAtRange(assignments: LabelerAssignmentDto[]): string {
  const claimedAtValues = assignments.map((assignment) => assignment.claimedAt).sort();
  const firstClaimedAt = claimedAtValues[0];
  const lastClaimedAt = claimedAtValues[claimedAtValues.length - 1];

  if (!firstClaimedAt) {
    return '-';
  }

  if (!lastClaimedAt || firstClaimedAt.slice(0, 16) === lastClaimedAt.slice(0, 16)) {
    return formatDateTime(firstClaimedAt);
  }

  return `${formatDateTime(firstClaimedAt)} - ${formatDateTime(lastClaimedAt)}`;
}
