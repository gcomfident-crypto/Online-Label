import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  claimAssignment,
  listMarketTasks,
  type MarketClaimStatus,
  type MarketTaskDto,
} from '../../api/assignments';
import { PageLoading } from '../../components/PageLoading';
import { TableEmptyState } from '../../components/TableEmptyState';
import { ToastViewport, useToastController } from '../../components/ToastViewport';
import { useAdaptiveTablePageSize } from '../../hooks/useAdaptiveTablePageSize';
import eyeIcon from '../../assets/eye.svg';

const LABELER_ID = 'user_labeler_li_lei';

const CLAIM_STATUS_OPTIONS: Array<{ label: string; value: MarketClaimStatus | 'ALL' }> = [
  { label: '领取状态：全部', value: 'ALL' },
  { label: '可领取', value: 'available' },
  { label: '已满额', value: 'full' },
  { label: '已截止', value: 'expired' },
];

const CLAIM_STATUS_LABELS: Record<MarketClaimStatus, string> = {
  available: '可领取',
  claimed: '已领取',
  limited: '不可领取',
  full: '已满额',
  expired: '已截止',
};

const DATASET_KIND_LABELS: Record<MarketTaskDto['datasetKind'], string> = {
  qa_quality: '问答质量',
  preference_compare: '偏好对比',
  generic_json: '通用 JSON',
};

const TASK_MARKET_FALLBACK_PAGE_SIZE = 7;
const TASK_MARKET_TABLE_ROW_HEIGHT = 66;

export const TaskMarketPage = () => {
  const [tasks, setTasks] = useState<MarketTaskDto[]>([]);
  const [keyword, setKeyword] = useState('');
  const [tag, setTag] = useState('');
  const [claimStatus, setClaimStatus] = useState<MarketClaimStatus | 'ALL'>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [claimingTaskId, setClaimingTaskId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [previewTask, setPreviewTask] = useState<MarketTaskDto | null>(null);
  const { dismissToast, messages, showErrorToast, showStatusToast } = useToastController();
  const { containerRef: marketTableContainerRef, pageSize: marketPageSize } = useAdaptiveTablePageSize({
    fallbackPageSize: TASK_MARKET_FALLBACK_PAGE_SIZE,
    rowHeight: TASK_MARKET_TABLE_ROW_HEIGHT,
  });

  useEffect(() => {
    void loadTasks();
  }, []);

  const tagOptions = useMemo(
    () => [...new Set(tasks.flatMap((task) => task.tags))].slice(0, 8),
    [tasks],
  );
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
  const totalPages = Math.max(1, Math.ceil(tasks.length / marketPageSize));
  const paginatedTasks = useMemo(() => {
    const startIndex = (currentPage - 1) * marketPageSize;

    return tasks.slice(startIndex, startIndex + marketPageSize);
  }, [currentPage, marketPageSize, tasks]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const loadTasks = async (
    overrides: Partial<{
      keyword: string;
      tag: string;
      claimStatus: MarketClaimStatus | 'ALL';
    }> = {},
  ) => {
    const nextKeyword = overrides.keyword ?? keyword;
    const nextTag = overrides.tag ?? tag;
    const nextClaimStatus = overrides.claimStatus ?? claimStatus;

    setIsLoading(true);
    try {
      const nextTasks = await listMarketTasks({
        keyword: nextKeyword.trim() || undefined,
        tag: nextTag.trim() || undefined,
        claimStatus: nextClaimStatus,
        labelerId: LABELER_ID,
      });
      setTasks(nextTasks.filter(isVisibleMarketTask));
      setCurrentPage(1);
    } catch (error) {
      setTasks([]);
      setCurrentPage(1);
      showErrorToast(error instanceof Error ? error.message : '任务接口请求失败，请稍后重试。');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClaim = async (task: MarketTaskDto) => {
    setClaimingTaskId(task.id);
    try {
      const assignment = await claimAssignment({
        taskId: task.id,
        labelerId: LABELER_ID,
      });
      const workbenchLink = `/labeler/tasks/${assignment.taskId}/items/${assignment.taskItemId}?assignmentId=${assignment.assignmentId}`;
      showStatusToast(
        `已领取任务「${task.title}」，`,
        {
          actionHref: workbenchLink,
          actionLabel: '现在去标注',
          className: 'toast--claim-task',
        },
      );
      await loadTasks();
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : '领取任务失败。');
    } finally {
      setClaimingTaskId(null);
    }
  };

  return (
    <section className="task-market-page" aria-labelledby="labeler-market-title">
      <ToastViewport messages={messages} onDismiss={dismissToast} />
      <h1 id="labeler-market-title">任务广场</h1>

      <div className="task-market-filter">
        <input
          aria-label="搜索任务"
          placeholder="搜索任务名、模板或标签"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
        <select
          aria-label="标签筛选"
          value={tag}
          onChange={(event) => setTag(event.target.value)}
        >
          <option value="">全部标签</option>
          {tagOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <select
          aria-label="领取状态筛选"
          value={claimStatus}
          onChange={(event) => setClaimStatus(event.target.value as MarketClaimStatus | 'ALL')}
        >
          {CLAIM_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => void loadTasks()}>
          筛选
        </button>
      </div>

      {isLoading ? (
        <PageLoading title="正在加载任务广场" description="正在获取可领取任务、题目数和标签筛选项。" />
      ) : (
        <div className="task-management-table-card task-market-table-panel" ref={marketTableContainerRef}>
          <div className="labeler-list-panel-heading" aria-label="待领取任务列表概览">
            <div className="labeler-list-panel-heading__title">
              <h2>待领取任务列表</h2>
              <span>{tasks.length.toLocaleString()} 个任务</span>
            </div>
            <small>按更新时间倒序</small>
          </div>
          <div className="task-table-scroll task-market-table-frame" data-adaptive-table-viewport="true">
            <table className="task-table task-market-table" aria-label="任务广场列表">
              <colgroup>
                <col className="task-market-table__col-id" />
                <col className="task-market-table__col-title" />
                <col className="task-market-table__col-owner" />
                <col className="task-market-table__col-status" />
                <col className="task-market-table__col-template" />
                <col className="task-market-table__col-limit" />
                <col className="task-market-table__col-progress" />
                <col className="task-market-table__col-deadline" />
                <col className="task-market-table__col-actions" />
              </colgroup>
              <thead>
                <tr>
                  <th>任务ID</th>
                  <th>任务名</th>
                  <th>发布者</th>
                  <th>状态</th>
                  <th>评测模板</th>
                  <th>领取范围</th>
                  <th>进度</th>
                  <th>截止时间</th>
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
                          <span>{task.rewardRule ?? '未设置奖励'}</span>
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
                        <div className="task-market-table__template">
                          <span>{task.templateName}</span>
                          <small>{DATASET_KIND_LABELS[task.datasetKind]}</small>
                        </div>
                      </TaskTableCellInner>
                    </td>
                    <td>
                      <TaskTableCellInner>{formatClaimScope(task)}</TaskTableCellInner>
                    </td>
                    <td>
                      <TaskTableCellInner>
                        <MarketTaskProgressCell task={task} />
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
                            className="task-market-table__preview-button"
                            type="button"
                            aria-label={`预览 ${task.title}`}
                            onClick={() => setPreviewTask(task)}
                          >
                            <img className="task-market-table__preview-icon" src={eyeIcon} alt="" aria-hidden="true" />
                            预览
                          </button>
                          <button
                            className="primary-action task-market-table__claim-button"
                            type="button"
                            aria-label={`${claimButtonText(task, claimingTaskId)} ${task.title}`}
                            disabled={!canClaim(task) || claimingTaskId === task.id}
                            onClick={() => void handleClaim(task)}
                          >
                            {claimButtonText(task, claimingTaskId)}
                          </button>
                        </div>
                      </TaskTableCellInner>
                    </td>
                  </tr>
                )) : (
                  <tr className="task-table__empty-row">
                    <td colSpan={9}>
                      <TableEmptyState
                        title="暂无可领取任务"
                        description="调整关键词、标签或领取状态后再试"
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
        </div>
      )}

      {previewTask ? (
        <TaskPreviewDialog task={previewTask} onClose={() => setPreviewTask(null)} />
      ) : null}
    </section>
  );
};

const canClaim = (task: MarketTaskDto): boolean => {
  return task.claimStatus === 'available' && task.remainingCount > 0;
};

const isVisibleMarketTask = (task: MarketTaskDto): boolean =>
  !task.claimedByMe && task.claimStatus !== 'claimed';

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

const progressPercent = (task: MarketTaskDto): number => {
  const total = task.quota ?? task.itemCount;
  if (total <= 0) {
    return 0;
  }

  return Math.min(100, (task.assignedCount / total) * 100);
};

const formatClaimScope = (_task: MarketTaskDto): string => '整任务';

const formatMarketTaskDisplayId = (sequence: number): string => `T-${sequence.toString().padStart(4, '0')}`;

const marketTaskSequenceTime = (task: MarketTaskDto): number => {
  const updatedTime = Date.parse(task.updatedAt);
  if (Number.isFinite(updatedTime)) {
    return updatedTime;
  }

  const createdTime = Date.parse(task.createdAt);
  return Number.isFinite(createdTime) ? createdTime : 0;
};

const TaskTableCellInner = ({ children }: { children: ReactNode }) => (
  <div className="task-table__cell-inner">{children}</div>
);

const TaskPreviewDialog = ({
  task,
  onClose,
}: {
  task: MarketTaskDto;
  onClose: () => void;
}) => {
  const previewItems = task.previewItems ?? [];
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
              {task.templateName} · {DATASET_KIND_LABELS[task.datasetKind]} · 共 {previewItems.length.toLocaleString()} 条样例
            </p>
          </div>
          <button className="task-market-preview-close" type="button" aria-label="关闭预览" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="task-dataset-preview-modal__body">
          {previewItems.length > 0 ? (
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
    '--status-dot-color': '#00A676',
    '--status-text-color': '#007F5F',
    '--status-bg-color': '#E6F7F1',
  },
  claimed: {
    '--status-dot-color': '#2F6BFF',
    '--status-text-color': '#1D4ED8',
    '--status-bg-color': '#EFF6FF',
  },
  limited: {
    '--status-dot-color': '#D97706',
    '--status-text-color': '#92400E',
    '--status-bg-color': '#FFF7E6',
  },
  full: {
    '--status-dot-color': '#475569',
    '--status-text-color': '#334155',
    '--status-bg-color': '#E2E8F0',
  },
  expired: {
    '--status-dot-color': '#94A3B8',
    '--status-text-color': '#64748B',
    '--status-bg-color': '#F1F5F9',
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

const MarketTaskProgressCell = ({ task }: { task: MarketTaskDto }) => {
  const total = task.quota ?? task.itemCount;

  if (total <= 0) {
    return <span className="task-progress-empty">—</span>;
  }

  const progress = progressPercent(task);

  return (
    <div className="task-progress-cell">
      <div className="task-progress-cell__meta">
        <span>
          {task.assignedCount.toLocaleString()} / {total.toLocaleString()}
        </span>
        <small>{formatProgressPercent(progress)}</small>
      </div>
      <span className="task-progress">
        <span style={{ width: `${progress}%` }} />
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
