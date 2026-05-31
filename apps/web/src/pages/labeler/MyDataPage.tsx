import { useEffect, useMemo, useState } from 'react';
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

const STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '待标注', value: 'IN_PROGRESS' },
  { label: '已提交', value: 'SUBMITTED' },
  { label: '待修改', value: 'NEEDS_REVISION' },
  { label: '待完成', value: 'FINAL_PENDING' },
];

const DATASET_KIND_OPTIONS: Array<{ label: string; value: DatasetKind | 'ALL' }> = [
  { label: '全部类型', value: 'ALL' },
  { label: '问答质量', value: 'qa_quality' },
  { label: '偏好对比', value: 'preference_compare' },
  { label: '通用 JSON', value: 'generic_json' },
];

export const MyDataPage = () => {
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState<LabelerAssignmentDto[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [datasetKind, setDatasetKind] = useState<DatasetKind | 'ALL'>('ALL');
  const [itemId, setItemId] = useState('');
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
    const keyword = itemId.trim();

    return assignments.filter((assignment) => {
      if (statusFilter && !matchesStatusFilter(assignment, statusFilter)) {
        return false;
      }

      if (datasetKind !== 'ALL' && assignment.datasetKind !== datasetKind) {
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
  }, [assignments, datasetKind, itemId, statusFilter]);
  const taskGroups = useMemo(() => groupAssignmentsByTask(filteredAssignments), [filteredAssignments]);
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
  }, [datasetKind, itemId, statusFilter]);

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

  return (
    <section className="my-data-page labeler-task-workspace" aria-labelledby="my-data-title">
      <ToastViewport messages={messages} onDismiss={dismissToast} />
      <div className="my-data-header">
        <div>
          <h1 id="my-data-title">工作台</h1>
        </div>
      </div>

      <div className="my-data-filter">
        <select
          aria-label="任务状态筛选"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          aria-label="数据集筛选"
          value={datasetKind}
          onChange={(event) => setDatasetKind(event.target.value as DatasetKind | 'ALL')}
        >
          {DATASET_KIND_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          aria-label="题目 ID 筛选"
          placeholder="题目 ID 或外部 ID"
          value={itemId}
          onChange={(event) => setItemId(event.target.value)}
        />
        <button type="button" onClick={() => void loadMyData()}>
          筛选
        </button>
      </div>

      {isLoading ? (
        <PageLoading title="正在加载工作台" description="正在同步已领取任务。" />
      ) : (
        <div className="task-management-table-card my-data-table-scroll" ref={myDataTableContainerRef}>
          <div className="labeler-list-panel-heading">
            <div>
              <h2>已领取任务列表</h2>
            </div>
            <small>{taskGroups.length.toLocaleString()} 条任务</small>
          </div>
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
                    onClick={() => navigate(workbenchHref(taskGroup.nextAssignment))}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        navigate(workbenchHref(taskGroup.nextAssignment));
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
        </div>
      )}
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

function matchesStatusFilter(assignment: LabelerAssignmentDto, statusFilter: string): boolean {
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
