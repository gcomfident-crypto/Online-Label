import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  claimAssignment,
  listMarketTasks,
  type MarketClaimStatus,
  type MarketTaskDto,
} from '../../api/assignments';
import { listTaskItems, type TaskItemDto } from '../../api/datasets';
import { PageLoading } from '../../components/PageLoading';
import { TableEmptyState } from '../../components/TableEmptyState';
import { ToastViewport, useToastController } from '../../components/ToastViewport';
import { useAdaptiveTablePageSize } from '../../hooks/useAdaptiveTablePageSize';
import { useSession } from '../../stores/sessionStore';
import { readPageDataCache, writePageDataCache } from '../../utils/pageDataCache';
import eyeIcon from '../../assets/eye.svg';
import getIcon from '../../assets/get.svg';

type TaskMarketSortField = 'taskId' | 'deadline';
type TaskMarketSortDirection = 'asc' | 'desc';

type ClaimStatusSummary = {
  available: number;
  expired: number;
  total: number;
};

const CLAIM_STATUS_OPTIONS: Array<{ label: string; summaryKey: keyof ClaimStatusSummary; value: MarketClaimStatus | 'ALL' }> = [
  { label: '全部', summaryKey: 'total', value: 'ALL' },
  { label: '可领取', summaryKey: 'available', value: 'available' },
  { label: '已截止', summaryKey: 'expired', value: 'expired' },
];

const CLAIM_STATUS_LABELS: Record<MarketClaimStatus, string> = {
  available: '可领取',
  claimed: '已领取',
  limited: '不可领取',
  full: '已满额',
  expired: '已截止',
};

const DATASET_IMPORT_FORMAT_LABELS = {
  json: 'JSON 文件',
  jsonl: 'JSONL 文件',
  csv: 'CSV 文件',
  xlsx: 'XLSX 文件',
  zip: 'ZIP 文件',
} as const;
const MARKET_PREVIEW_ITEM_LIMIT = 100;
const TASK_MARKET_FALLBACK_PAGE_SIZE = 7;
const TASK_MARKET_TABLE_ROW_HEIGHT = 66;

export const TaskMarketPage = () => {
  const session = useSession();
  const labelerId = session?.user.id ?? '';
  const taskMarketCacheKey = useMemo(() => createTaskMarketCacheKey(labelerId), [labelerId]);
  const cachedTasks = useMemo(() => {
    const cachedValue = readPageDataCache(taskMarketCacheKey, isMarketTaskDtoArray);

    return cachedValue ? cachedValue.filter(isVisibleMarketTask) : null;
  }, [taskMarketCacheKey]);
  const [tasks, setTasks] = useState<MarketTaskDto[]>(cachedTasks ?? []);
  const [keyword, setKeyword] = useState('');
  const [claimStatus, setClaimStatus] = useState<MarketClaimStatus | 'ALL'>('ALL');
  const [sortField, setSortField] = useState<TaskMarketSortField | null>(null);
  const [sortDirection, setSortDirection] = useState<TaskMarketSortDirection>('asc');
  const [isLoading, setIsLoading] = useState(cachedTasks === null);
  const [claimingTaskId, setClaimingTaskId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [previewTask, setPreviewTask] = useState<MarketTaskDto | null>(null);
  const [previewItems, setPreviewItems] = useState<MarketTaskDto['previewItems']>([]);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const { dismissToast, messages, showErrorToast, showStatusToast } = useToastController();
  const { containerRef: marketTableContainerRef, pageSize: marketPageSize } = useAdaptiveTablePageSize({
    fallbackPageSize: TASK_MARKET_FALLBACK_PAGE_SIZE,
    rowHeight: TASK_MARKET_TABLE_ROW_HEIGHT,
  });

  useEffect(() => {
    const nextCachedTasks = readPageDataCache(taskMarketCacheKey, isMarketTaskDtoArray);
    setTasks(nextCachedTasks ?? []);
    setIsLoading(nextCachedTasks === null);
    void loadTasks(labelerId, taskMarketCacheKey);
  }, [labelerId, taskMarketCacheKey]);

  const taskDisplayIdMap = useMemo(() => {
    const chronologicalTasks = [...tasks].sort((first, second) => {
      const firstTime = marketTaskSequenceTime(first);
      const secondTime = marketTaskSequenceTime(second);
      if (firstTime !== secondTime) {
        return firstTime - secondTime;
      }

      return first.id.localeCompare(second.id);
    });

    return new Map(chronologicalTasks.map((task, index) => [task.id, formatMarketTaskDisplayId(index + 1)]));
  }, [tasks]);
  const filteredTasks = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return tasks.filter((task) => {
      const matchesStatus = claimStatus === 'ALL' || task.claimStatus === claimStatus;
      const taskDisplayId = taskDisplayIdMap.get(task.id) ?? task.id;
      const matchesKeyword =
        normalizedKeyword.length === 0 ||
        [
          task.title,
          task.description,
          task.templateName,
          task.ownerName,
          task.ownerId,
          task.id,
          taskDisplayId,
          ...task.tags,
        ]
          .filter((value): value is string => typeof value === 'string')
          .some((value) => value.toLowerCase().includes(normalizedKeyword));

      return matchesStatus && matchesKeyword;
    });
  }, [claimStatus, keyword, taskDisplayIdMap, tasks]);
  const sortedTasks = useMemo(() => {
    if (!sortField) {
      return filteredTasks;
    }

    return [...filteredTasks].sort((left, right) => {
      const compareResult = compareTaskMarketTasksBySortField(left, right, sortField, sortDirection, taskDisplayIdMap);

      if (compareResult !== 0) {
        return compareResult;
      }

      const leftTaskId = taskDisplayIdMap.get(left.id) ?? left.id;
      const rightTaskId = taskDisplayIdMap.get(right.id) ?? right.id;

      return leftTaskId.localeCompare(rightTaskId);
    });
  }, [filteredTasks, sortDirection, sortField, taskDisplayIdMap]);
  const claimStatusSummary = useMemo<ClaimStatusSummary>(
    () => ({
      total: tasks.length,
      available: tasks.filter((task) => task.claimStatus === 'available').length,
      expired: tasks.filter((task) => task.claimStatus === 'expired').length,
    }),
    [tasks],
  );
  const totalPages = Math.max(1, Math.ceil(sortedTasks.length / marketPageSize));
  const paginatedTasks = useMemo(() => {
    const startIndex = (currentPage - 1) * marketPageSize;

    return sortedTasks.slice(startIndex, startIndex + marketPageSize);
  }, [currentPage, marketPageSize, sortedTasks]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [claimStatus, keyword, sortDirection, sortField]);

  const loadTasks = async (activeLabelerId: string, cacheKey: string) => {
    if (!activeLabelerId) {
      setTasks([]);
      setCurrentPage(1);
      setIsLoading(false);
      showErrorToast('缺少当前标注员身份，无法加载任务广场。请重新登录。');
      return;
    }

    setIsLoading((current) => current && tasks.length === 0);
    try {
      const nextTasks = await listMarketTasks({
        labelerId: activeLabelerId,
      });
      const visibleTasks = nextTasks.filter(isVisibleMarketTask);
      writePageDataCache(cacheKey, visibleTasks);
      setTasks(visibleTasks);
      setCurrentPage(1);
    } catch (error) {
      if (tasks.length === 0) {
        setTasks([]);
        setCurrentPage(1);
      }
      showErrorToast(error instanceof Error ? error.message : '任务接口请求失败，请稍后重试。');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClaim = async (task: MarketTaskDto) => {
    if (!labelerId) {
      showErrorToast('缺少当前标注员身份，无法领取任务。请重新登录。');
      return;
    }

    setClaimingTaskId(task.id);
    try {
      const assignment = await claimAssignment({
        taskId: task.id,
        labelerId,
      });
      const taskRouteId = /^T-\d+$/i.test(assignment.taskId) ? assignment.taskId : 'claimed-task';
      const itemRouteId = assignment.taskItem.externalId || assignment.taskItemId;
      const workbenchLink = `/labeler/tasks/${encodeURIComponent(taskRouteId)}/items/${encodeURIComponent(itemRouteId)}?assignmentId=${encodeURIComponent(assignment.assignmentId)}`;
      showStatusToast(
        `已领取任务「${task.title}」，`,
        {
          actionHref: workbenchLink,
          actionLabel: '现在去标注',
          className: 'toast--claim-task',
        },
      );
      await loadTasks(labelerId, taskMarketCacheKey);
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : '领取任务失败。');
    } finally {
      setClaimingTaskId(null);
    }
  };

  const handleSort = (field: TaskMarketSortField) => {
    if (sortField === field) {
      setSortDirection((currentDirection) => (currentDirection === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortField(field);
    setSortDirection('asc');
  };

  const handlePreviewTask = (task: MarketTaskDto) => {
    setPreviewTask(task);
    setPreviewItems(task.previewItems ?? []);
    setIsPreviewLoading((task.previewItems ?? []).length === 0);

    if ((task.previewItems ?? []).length > 0) {
      return;
    }

    void listTaskItems(task.id)
      .then((items) => {
        setPreviewItems(toMarketPreviewItems(items));
      })
      .catch((error) => {
        setPreviewTask(null);
        setPreviewItems([]);
        showErrorToast(error instanceof Error ? error.message : '任务内容预览加载失败。');
      })
      .finally(() => {
        setIsPreviewLoading(false);
      });
  };

  return (
    <section className="task-market-page" aria-labelledby="labeler-market-title">
      <ToastViewport messages={messages} onDismiss={dismissToast} />
      <div className="task-market-page-title">
        <h1 id="labeler-market-title">任务广场</h1>
        <p className="task-management-table-description">
          浏览可领取的数据标注任务，查看任务要求、奖励、截止时间和领取状态，快速进入标注工作
        </p>
      </div>

      <div className="task-management-table-card task-market-table-panel" ref={marketTableContainerRef}>
        <div className="task-management-table-toolbar task-market-table-toolbar">
          <div className="task-summary-grid task-market-claim-status-grid" aria-label="领取状态筛选">
            {CLAIM_STATUS_OPTIONS.map((option) => (
              <ClaimStatusFilterCard
                key={option.value}
                isActive={claimStatus === option.value}
                label={option.label}
                status={option.value}
                value={claimStatusSummary[option.summaryKey].toString()}
                onClick={() => setClaimStatus(option.value)}
              />
            ))}
          </div>

          <div className="task-filter-bar task-market-filter">
            <input
              aria-label="搜索任务"
              placeholder="搜索任务名 / ID / 发布者"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
          </div>
        </div>

        {isLoading && tasks.length === 0 ? (
          <PageLoading title="正在加载任务广场" description="正在获取可领取任务和题目数。" />
        ) : (
          <>
          <div className="task-table-scroll task-market-table-frame" data-adaptive-table-viewport="true">
            <table className="task-table task-market-table" aria-label="任务广场列表">
              <colgroup>
                <col className="task-market-table__col-id" />
                <col className="task-market-table__col-title" />
                <col className="task-market-table__col-owner" />
                <col className="task-market-table__col-status" />
                <col className="task-market-table__col-item-count" />
                <col className="task-market-table__col-reward" />
                <col className="task-market-table__col-deadline" />
                <col className="task-market-table__col-actions" />
              </colgroup>
              <thead>
                <tr>
                  <th>
                    <SortableTaskMarketHeader
                      field="taskId"
                      label="任务ID"
                      sortDirection={sortDirection}
                      sortField={sortField}
                      onSort={handleSort}
                    />
                  </th>
                  <th>任务名</th>
                  <th>发布者</th>
                  <th>状态</th>
                  <th>题目数</th>
                  <th>报酬</th>
                  <th>
                    <SortableTaskMarketHeader
                      field="deadline"
                      label="截止时间"
                      sortDirection={sortDirection}
                      sortField={sortField}
                      onSort={handleSort}
                    />
                  </th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody key={currentPage} className="task-table__body">
                {paginatedTasks.length > 0 ? paginatedTasks.map((task) => (
                  <tr className="task-table__row" key={task.id}>
                    <td className="task-table__id">
                      <TaskTableCellInner>
                        <code>{taskDisplayIdMap.get(task.id) ?? task.id}</code>
                      </TaskTableCellInner>
                    </td>
                    <td>
                      <TaskTableCellInner>
                        <div className="task-market-table__title">
                          <strong>{task.title}</strong>
                        </div>
                      </TaskTableCellInner>
                    </td>
                    <td>
                      <TaskTableCellInner>
                        <span className="task-market-table__owner">{task.ownerName ?? task.ownerId ?? '未记录'}</span>
                      </TaskTableCellInner>
                    </td>
                    <td>
                      <TaskTableCellInner>
                        <ClaimStatusTag status={task.claimStatus} />
                      </TaskTableCellInner>
                    </td>
                    <td>
                      <TaskTableCellInner>
                        <MarketTaskItemCountCell task={task} />
                      </TaskTableCellInner>
                    </td>
                    <td>
                      <TaskTableCellInner>
                        <span className="task-market-table__reward">{task.rewardRule ?? '未设置奖励'}</span>
                      </TaskTableCellInner>
                    </td>
                    <td className="task-table__date-column">
                      <TaskTableCellInner>
                        {task.deadline ? <DateTimeCell value={task.deadline} /> : '—'}
                      </TaskTableCellInner>
                    </td>
                    <td>
                      <TaskTableCellInner>
                        <div className="task-market-table__actions">
                          <button
                            className="task-table-action task-table-action--icon task-market-table__preview-button"
                            type="button"
                            aria-label={`预览 ${task.title}`}
                            onClick={() => handlePreviewTask(task)}
                          >
                            <img className="task-market-table__preview-icon" src={eyeIcon} alt="" aria-hidden="true" />
                          </button>
                          <button
                            className="task-table-action task-table-action--icon task-market-table__claim-button"
                            type="button"
                            aria-label={`${claimButtonText(task, claimingTaskId)} ${task.title}`}
                            disabled={!canClaim(task) || claimingTaskId === task.id}
                            onClick={() => void handleClaim(task)}
                          >
                            <img className="task-market-table__claim-icon" src={getIcon} alt="" aria-hidden="true" />
                          </button>
                        </div>
                      </TaskTableCellInner>
                    </td>
                  </tr>
                )) : (
                  <tr className="task-table__empty-row">
                    <td colSpan={8}>
                      <TableEmptyState
                        title="暂无可领取任务"
                        description="调整关键词或领取状态后再试"
                        illustrationAlt="空任务广场列表插画"
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="task-table-pagination" aria-label="任务广场分页">
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

      {previewTask ? (
        <TaskPreviewDialog
          isLoading={isPreviewLoading}
          previewItems={previewItems}
          task={previewTask}
          onClose={() => {
            setPreviewTask(null);
            setPreviewItems([]);
            setIsPreviewLoading(false);
          }}
        />
      ) : null}
    </section>
  );
};

function createTaskMarketCacheKey(labelerId: string): string {
  return `labelhub.labeler.market.${labelerId || 'anonymous'}.v2`;
}

const canClaim = (task: MarketTaskDto): boolean => {
  return task.claimStatus === 'available' && task.remainingCount > 0;
};

function isVisibleMarketTask(task: MarketTaskDto): boolean {
  return task.assignedCount === 0 && !task.claimedByMe && task.claimStatus !== 'claimed' && task.claimStatus !== 'full';
}

const claimButtonText = (task: MarketTaskDto, claimingTaskId: string | null): string => {
  if (claimingTaskId === task.id) {
    return '领取中';
  }

  if (task.claimedByMe || task.claimStatus === 'claimed') {
    return '已领取';
  }

  if (!canClaim(task)) {
    return '不可领取';
  }

  return '领取题目';
};

const formatMarketTaskDisplayId = (sequence: number): string => `T-${sequence.toString().padStart(3, '0')}`;

const marketTaskSequenceTime = (task: MarketTaskDto): number => {
  const updatedTime = Date.parse(task.updatedAt);
  if (Number.isFinite(updatedTime)) {
    return updatedTime;
  }

  const createdTime = Date.parse(task.createdAt);
  return Number.isFinite(createdTime) ? createdTime : 0;
};

const parseTaskMarketDisplayId = (taskDisplayId: string): number | null => {
  const match = /^T-(\d+)$/i.exec(taskDisplayId);

  if (!match || !match[1]) {
    return null;
  }

  const value = Number.parseInt(match[1], 10);

  return Number.isFinite(value) ? value : null;
};

const marketTaskDeadlineTime = (task: MarketTaskDto): number | null => {
  if (!task.deadline) {
    return null;
  }

  const timestamp = Date.parse(task.deadline);

  return Number.isFinite(timestamp) ? timestamp : null;
};

const compareTaskMarketTasksBySortField = (
  left: MarketTaskDto,
  right: MarketTaskDto,
  sortField: TaskMarketSortField,
  sortDirection: TaskMarketSortDirection,
  taskDisplayIdMap: Map<string, string>,
): number => {
  const directionMultiplier = sortDirection === 'asc' ? 1 : -1;

  if (sortField === 'deadline') {
    const leftDeadline = marketTaskDeadlineTime(left);
    const rightDeadline = marketTaskDeadlineTime(right);
    const leftHasDeadline = leftDeadline !== null;
    const rightHasDeadline = rightDeadline !== null;

    if (!leftHasDeadline && !rightHasDeadline) {
      return 0;
    }

    if (!leftHasDeadline) {
      return 1;
    }

    if (!rightHasDeadline) {
      return -1;
    }

    if (leftDeadline !== rightDeadline) {
      return (leftDeadline - rightDeadline) * directionMultiplier;
    }

    return 0;
  }

  const leftDisplayId = taskDisplayIdMap.get(left.id) ?? left.id;
  const rightDisplayId = taskDisplayIdMap.get(right.id) ?? right.id;
  const leftSequence = parseTaskMarketDisplayId(leftDisplayId);
  const rightSequence = parseTaskMarketDisplayId(rightDisplayId);

  if (leftSequence !== null && rightSequence !== null) {
    if (leftSequence !== rightSequence) {
      return (leftSequence - rightSequence) * directionMultiplier;
    }

    return 0;
  }

  return leftDisplayId.localeCompare(rightDisplayId) * directionMultiplier;
};

const TaskTableCellInner = ({ children }: { children: ReactNode }) => (
  <div className="task-table__cell-inner">{children}</div>
);

const SortableTaskMarketHeader = ({
  field,
  label,
  sortDirection,
  sortField,
  onSort,
}: {
  field: TaskMarketSortField;
  label: string;
  sortDirection: TaskMarketSortDirection;
  sortField: TaskMarketSortField | null;
  onSort: (field: TaskMarketSortField) => void;
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

const ClaimStatusFilterCard = ({
  isActive,
  label,
  onClick,
  status,
  value,
}: {
  isActive: boolean;
  label: string;
  onClick: () => void;
  status: MarketClaimStatus | 'ALL';
  value: string;
}) => (
  <button
    className={[
      'task-summary-card',
      status === 'ALL' ? 'task-summary-card--total' : '',
      status === 'available' ? 'task-summary-card--done' : '',
      status === 'expired' ? 'task-summary-card--paused' : '',
      isActive ? 'is-active' : '',
    ].filter(Boolean).join(' ')}
    type="button"
    aria-pressed={isActive}
    onClick={onClick}
  >
    <span>{label}</span>
    <strong>{value}</strong>
  </button>
);

const TaskPreviewDialog = ({
  isLoading,
  previewItems,
  task,
  onClose,
}: {
  isLoading: boolean;
  previewItems: MarketTaskDto['previewItems'];
  task: MarketTaskDto;
  onClose: () => void;
}) => {
  const fields = collectTaskPreviewFields(previewItems);

  return (
    <div
      className="task-dataset-preview-overlay task-dataset-preview-overlay--entering"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        className="task-dataset-preview-modal task-dataset-preview-modal--entering"
        role="dialog"
        aria-modal="true"
        aria-label={`任务内容预览 · ${task.title}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="task-dataset-preview-modal__header">
          <div>
            <h2>任务内容预览 · {task.title}</h2>
            <p>
              {formatTaskPreviewMeta(task, previewItems.length)}
            </p>
          </div>
          <button className="task-market-preview-close" type="button" aria-label="关闭预览" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="task-dataset-preview-modal__body">
          {isLoading ? (
            <div className="task-dataset-preview-empty">正在加载预览数据</div>
          ) : previewItems.length > 0 ? (
            <div className="task-dataset-preview-table-scroll">
              <table className="task-dataset-preview-table" aria-label="任务内容预览表格">
                <thead>
                  <tr>
                    <th>序号</th>
                    <th>外部 ID</th>
                    {fields.map((field) => (
                      <th key={field}>{field}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewItems.map((item, index) => (
                    <tr key={item.id}>
                      <td>{index + 1}</td>
                      <td>{item.externalId}</td>
                      {fields.map((field) => (
                        <td key={field}>{formatPreviewValue(item.rawData[field])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="task-dataset-preview-empty">暂无可预览题目</div>
          )}
        </div>
      </section>
    </div>
  );
};

const collectTaskPreviewFields = (items: MarketTaskDto['previewItems']): string[] => {
  const fields = new Set<string>();

  for (const item of items) {
    for (const field of Object.keys(item.rawData)) {
      fields.add(field);

      if (fields.size >= 8) {
        return Array.from(fields);
      }
    }
  }

  return Array.from(fields);
};

const toMarketPreviewItems = (items: readonly TaskItemDto[]): MarketTaskDto['previewItems'] =>
  items.slice(0, MARKET_PREVIEW_ITEM_LIMIT).map((item) => ({
    id: item.id,
    externalId: item.externalId,
    rawData: item.rawData,
  }));

const formatTaskPreviewMeta = (task: MarketTaskDto, previewCount: number): string => {
  const sourceLabel = formatDatasetImportSource(task);
  const countLabel = formatTaskPreviewCount(task, previewCount);

  return [task.templateName, sourceLabel, countLabel].filter(Boolean).join(' · ');
};

const formatDatasetImportSource = (task: MarketTaskDto): string | null => {
  const files = task.datasetImportSummary?.files ?? [];

  if (files.length === 0) {
    return null;
  }

  if (files.length === 1) {
    const file = files[0];
    const formatLabel = DATASET_IMPORT_FORMAT_LABELS[file.format] ?? file.format.toUpperCase();

    return `${formatLabel} · ${file.fileName}`;
  }

  return `多文件导入 · ${files.length.toLocaleString()} 个文件`;
};

const formatTaskPreviewCount = (task: MarketTaskDto, previewCount: number): string => {
  const totalCount = resolveTaskTotalCount(task);

  if (previewCount > 0 && previewCount < totalCount) {
    return `共 ${totalCount.toLocaleString()} 题，当前预览前 ${previewCount.toLocaleString()} 题`;
  }

  return `共 ${totalCount.toLocaleString()} 题`;
};

const resolveTaskTotalCount = (task: MarketTaskDto): number => {
  if (task.itemCount > 0) {
    return task.itemCount;
  }

  return task.datasetImportSummary?.importedCount ?? 0;
};

const formatPreviewValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

type ClaimStatusStyle = CSSProperties & {
  '--status-dot-color': string;
  '--status-text-color': string;
  '--status-bg-color': string;
};

const CLAIM_STATUS_STYLES: Record<MarketClaimStatus, ClaimStatusStyle> = {
  available: {
    '--status-dot-color': '#0FB86B',
    '--status-text-color': '#0FB86B',
    '--status-bg-color': '#E8F7EF',
  },
  claimed: {
    '--status-dot-color': '#2E5BFF',
    '--status-text-color': '#2E5BFF',
    '--status-bg-color': '#E6F0FF',
  },
  limited: {
    '--status-dot-color': '#D97706',
    '--status-text-color': '#D97706',
    '--status-bg-color': '#FFF7E6',
  },
  full: {
    '--status-dot-color': '#475569',
    '--status-text-color': '#334155',
    '--status-bg-color': '#E2E8F0',
  },
  expired: {
    '--status-dot-color': '#DC2626',
    '--status-text-color': '#DC2626',
    '--status-bg-color': '#FEF2F2',
  },
};

const ClaimStatusTag = ({ status }: { status: MarketClaimStatus }) => (
  <span
    className="status-tag status-tag--sm status-tag--task"
    style={CLAIM_STATUS_STYLES[status]}
  >
    <span className="status-tag__dot" aria-hidden="true" />
    {CLAIM_STATUS_LABELS[status]}
  </span>
);

const MarketTaskItemCountCell = ({ task }: { task: MarketTaskDto }) => {
  const total = resolveTaskTotalCount(task);

  return (
    <span className="task-market-table__item-count">
      {total > 0 ? `${total.toLocaleString()} 题` : '—'}
    </span>
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

function isMarketTaskDtoArray(value: unknown): value is MarketTaskDto[] {
  return Array.isArray(value);
}
