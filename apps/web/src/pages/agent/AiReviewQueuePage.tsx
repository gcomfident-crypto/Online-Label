import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { LabelHubSchema, ShowItemDisplayField } from '@labelhub/shared';

import { PageLoading } from '../../components/PageLoading';
import { TableEmptyState } from '../../components/TableEmptyState';
import { ToastViewport, useToastController } from '../../components/ToastViewport';
import { SchemaRenderer } from '../../features/schema-renderer';
import {
  getTaskFlow,
  getCachedTaskFlow,
  getCachedTaskFlowLogs,
  getTaskFlowLogs,
  listTaskFlows,
  prefetchTaskFlow,
  type TaskFlowAiStatus,
  type TaskFlowDetailDto,
  type TaskFlowFinalStatus,
  type TaskFlowItemDto,
  type TaskFlowLabelerStatus,
  type TaskFlowLifecycleStepDto,
  type TaskFlowLifecycleStepStatus,
  type TaskFlowLogDto,
  type TaskFlowReviewerStatus,
  type TaskFlowStage,
  type TaskFlowSummaryDto,
} from '../../api/taskFlows';

const FLOW_TABLE_PAGE_SIZE = 10;
const SHEET_EXIT_ANIMATION_MS = 260;
const AGENT_REVIEW_DISPLAY_SCHEMA_VERSION = 'agent-review-display-v1';

type FlowFilter = 'ALL' | 'ACTIVE' | 'FINAL_COMPLETED';
type FlowSortField = 'taskId' | 'updatedAt';
type FlowSortDirection = 'asc' | 'desc';
type ItemStatusBucket = 'aiProcessing' | 'failed' | 'finalApproved' | 'labelerProcessing' | 'reviewerPending';

type FlowStatusSummary = {
  active: number;
  finalCompleted: number;
  total: number;
};

const FLOW_SUMMARY_FILTERS: Array<{
  label: string;
  summaryKey: keyof FlowStatusSummary;
  value: FlowFilter;
}> = [
  { label: '总任务', summaryKey: 'total', value: 'ALL' },
  { label: '流转中', summaryKey: 'active', value: 'ACTIVE' },
  { label: '已完成', summaryKey: 'finalCompleted', value: 'FINAL_COMPLETED' },
];

const STAGE_LABELS: Record<TaskFlowStage, string> = {
  LABELING: 'Labeler 标注中',
  AI_PRECHECK: 'AI 预审中',
  HUMAN_REVIEW: 'Reviewer 复核中',
  LABELER_REVISION: 'Labeler 修改中',
  HUMAN_RE_REVIEW: 'Reviewer 复审中',
  FINAL_COMPLETED: '任务最终完成',
};

const AI_STATUS_LABELS: Record<TaskFlowAiStatus, string> = {
  NOT_STARTED: '未预审',
  QUEUED: '等待预审',
  RUNNING: '预审中',
  PASSED: '预审通过',
  REJECTED: '建议修改',
  SUCCEEDED: '预审完成',
  FAILED: '预审失败',
};

const REVIEWER_STATUS_LABELS: Record<TaskFlowReviewerStatus, string> = {
  NOT_STARTED: '未进入 Reviewer',
  PENDING: '待审核',
  PASSED: 'Reviewer 已标记通过',
  REJECTED: 'Reviewer 已标记打回',
};

const LABELER_STATUS_LABELS: Record<TaskFlowLabelerStatus, string> = {
  NOT_STARTED: '未开始标注',
  LOCKED: 'Labeler 禁止修改',
  NEEDS_REVISION: 'Labeler 可修改',
  REVISED: 'Labeler 已修改',
  NOT_REQUIRED: '无需 Labeler 修改',
};

const FINAL_STATUS_LABELS: Record<TaskFlowFinalStatus, string> = {
  NOT_FINAL: '未最终完成',
  FINAL_APPROVED: '任务最终完成',
};

const LIFECYCLE_STATUS_LABELS: Record<TaskFlowLifecycleStepStatus, string> = {
  COMPLETED: '完成',
  CURRENT: '进行中',
  PENDING: '待处理',
  ACTION_REQUIRED: '需处理',
  SKIPPED: '未启用',
};

export const AiReviewQueuePage = () => {
  const [flows, setFlows] = useState<TaskFlowSummaryDto[]>([]);
  const [taskDisplayIdByTaskId, setTaskDisplayIdByTaskId] = useState<Map<string, string>>(new Map());
  const [keyword, setKeyword] = useState('');
  const [flowFilter, setFlowFilter] = useState<FlowFilter>('ALL');
  const [sortField, setSortField] = useState<FlowSortField | null>(null);
  const [sortDirection, setSortDirection] = useState<FlowSortDirection>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedFlow, setSelectedFlow] = useState<TaskFlowSummaryDto | TaskFlowDetailDto | null>(null);
  const [detail, setDetail] = useState<TaskFlowDetailDto | null>(null);
  const [taskLogs, setTaskLogs] = useState<TaskFlowLogDto[]>([]);
  const [isTaskLogStale, setIsTaskLogStale] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [selectedItemIndex, setSelectedItemIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isLogLoading, setIsLogLoading] = useState(false);
  const [isSheetClosing, setIsSheetClosing] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const { clearToasts, dismissToast, messages, showErrorToast } = useToastController();

  useEffect(() => {
    void loadFlows();
  }, []);

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    },
    [],
  );

  const flowSummary = useMemo<FlowStatusSummary>(
    () => ({
      active: flows.filter((flow) => flow.currentStage !== 'FINAL_COMPLETED').length,
      finalCompleted: flows.filter((flow) => flow.currentStage === 'FINAL_COMPLETED').length,
      total: flows.length,
    }),
    [flows],
  );

  const filteredFlows = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return flows.filter((flow) => {
      const taskDisplayId = taskDisplayIdByTaskId.get(flow.taskId) ?? flow.taskId;
      const matchesStatus =
        flowFilter === 'ALL' ||
        (flowFilter === 'FINAL_COMPLETED'
          ? flow.currentStage === 'FINAL_COMPLETED'
          : flow.currentStage !== 'FINAL_COMPLETED');

      if (!matchesStatus) {
        return false;
      }

      if (!normalizedKeyword) {
        return true;
      }

      return [
        taskDisplayId,
        flow.taskTitle,
        flow.templateName ?? '',
        flow.ownerName ?? '',
        STAGE_LABELS[flow.currentStage],
      ].some((value) => value.toLowerCase().includes(normalizedKeyword));
    });
  }, [flowFilter, flows, keyword, taskDisplayIdByTaskId]);

  const sortedFlows = useMemo(() => {
    if (!sortField) {
      return filteredFlows;
    }

    return [...filteredFlows].sort((left, right) =>
      compareTaskFlowsBySortField(left, right, sortField, sortDirection, taskDisplayIdByTaskId),
    );
  }, [filteredFlows, sortDirection, sortField, taskDisplayIdByTaskId]);

  const totalPages = Math.max(1, Math.ceil(sortedFlows.length / FLOW_TABLE_PAGE_SIZE));
  const paginatedFlows = useMemo(() => {
    const startIndex = (currentPage - 1) * FLOW_TABLE_PAGE_SIZE;

    return sortedFlows.slice(startIndex, startIndex + FLOW_TABLE_PAGE_SIZE);
  }, [currentPage, sortedFlows]);

  useEffect(() => {
    paginatedFlows.slice(0, 3).forEach((flow) => {
      prefetchTaskFlow(flow.taskId, flow.round ? { round: flow.round } : {});
    });
  }, [paginatedFlows]);

  useEffect(() => {
    setCurrentPage(1);
  }, [flowFilter, keyword, sortDirection, sortField]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const loadFlows = async () => {
    setIsLoading(true);
    try {
      const nextFlows = await listTaskFlows();
      setFlows(nextFlows);
      setTaskDisplayIdByTaskId(createTaskFlowDisplayIdMap(nextFlows));
      setSelectedFlow((current) =>
        current ? nextFlows.find((flow) => flow.taskId === current.taskId && flow.round === current.round) ?? current : current,
      );
    } catch {
      setFlows([]);
      showErrorToast('任务质检流水线加载失败，请稍后重试。');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenFlow = async (flow: TaskFlowSummaryDto) => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setIsSheetClosing(false);
    const cachedDetail = getCachedTaskFlow(flow.taskId, flow.round ? { round: flow.round } : {});
    const cachedLogs = getCachedTaskFlowLogs(flow.taskId);
    setSelectedFlow(flow);
    setDetail(cachedDetail);
    setTaskLogs(cachedLogs ?? []);
    setIsTaskLogStale(false);
    setIsLogOpen(false);
    setSelectedItemIndex(0);
    setIsDetailLoading(!cachedDetail);

    try {
      const nextDetail = await getTaskFlow(flow.taskId, flow.round ? { round: flow.round } : {});
      setDetail(nextDetail);
      setSelectedFlow(nextDetail);
    } catch {
      showErrorToast('任务质检流转详情加载失败，请稍后重试。');
      return;
    } finally {
      setIsDetailLoading(false);
    }

    try {
      const nextLogs = await getTaskFlowLogs(flow.taskId);
      setTaskLogs(nextLogs);
      setIsTaskLogStale(false);
    } catch {
      setTaskLogs([]);
      setIsTaskLogStale(true);
      showErrorToast('任务日志加载失败，右侧本题历史可能不完整。');
    }
  };

  const handleCloseDrawer = () => {
    if (!selectedFlow || isSheetClosing || closeTimerRef.current !== null) {
      return;
    }

    setIsSheetClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      setSelectedFlow(null);
      setDetail(null);
      setTaskLogs([]);
      setIsTaskLogStale(false);
      setIsLogOpen(false);
      setSelectedItemIndex(0);
      setIsSheetClosing(false);
      closeTimerRef.current = null;
    }, SHEET_EXIT_ANIMATION_MS);
  };

  const handleOpenLogs = async () => {
    const flow = detail ?? selectedFlow;
    if (!flow) {
      return;
    }

    setIsLogOpen(true);
    if (taskLogs.length > 0 && !isTaskLogStale) {
      setIsLogLoading(false);
      return;
    }

    setIsLogLoading(true);
    try {
      setTaskLogs(await getTaskFlowLogs(flow.taskId));
      if (isTaskLogStale) {
        clearToasts();
      }
      setIsTaskLogStale(false);
    } catch {
      setTaskLogs([]);
      setIsTaskLogStale(true);
      showErrorToast('任务日志加载失败，请稍后重试。');
    } finally {
      setIsLogLoading(false);
    }
  };

  const handleCloseLogs = () => {
    setIsLogOpen(false);
  };

  const handleSort = (field: FlowSortField) => {
    if (sortField === field) {
      setSortDirection((direction) => (direction === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortField(field);
    setSortDirection('asc');
  };

  return (
    <section className="ai-review-page agent-review-page" aria-labelledby="task-flow-title">
      <ToastViewport messages={messages} onDismiss={dismissToast} />

      <header className="agent-review-page__header">
        <div>
          <h1 id="task-flow-title">任务质检流水线</h1>
          <p className="task-management-table-description">
            按任务查看从创建、标注、AI 预审、Reviewer 复核、Labeler 修改到最终完成的全流程状态
          </p>
        </div>
      </header>

      {isLoading && flows.length === 0 ? (
        <PageLoading className="page-loading--compact" title="正在加载任务质检流水线" />
      ) : (
        <TaskFlowTable
          currentPage={currentPage}
          flowFilter={flowFilter}
          flowSummary={flowSummary}
          flows={paginatedFlows}
          keyword={keyword}
          selectedFlowKey={selectedFlow ? flowKey(selectedFlow) : null}
          sortDirection={sortDirection}
          sortField={sortField}
          taskDisplayIdByTaskId={taskDisplayIdByTaskId}
          totalPages={totalPages}
          onFlowFilterChange={setFlowFilter}
          onKeywordChange={setKeyword}
          onOpenFlow={(flow) => void handleOpenFlow(flow)}
          onPageChange={setCurrentPage}
          onSort={handleSort}
        />
      )}

      <TaskFlowSheetPortal>
        {selectedFlow ? (
          <TaskFlowSheet
            detail={detail}
            flow={detail ?? selectedFlow}
            isClosing={isSheetClosing}
            isLoading={isDetailLoading}
            isLogLoading={isLogLoading}
            isLogOpen={isLogOpen}
            isTaskLogStale={isTaskLogStale}
            selectedItemIndex={selectedItemIndex}
            taskLogs={taskLogs}
            onClose={handleCloseDrawer}
            onCloseLogs={handleCloseLogs}
            onOpenLogs={() => void handleOpenLogs()}
            onSelectItem={setSelectedItemIndex}
          />
        ) : null}
      </TaskFlowSheetPortal>
    </section>
  );
};

const TaskFlowSheetPortal = ({ children }: { children: ReactNode }) => {
  if (!children) {
    return null;
  }
  if (typeof document === 'undefined') {
    return <>{children}</>;
  }

  return createPortal(children, document.body);
};

const TaskFlowTable = ({
  currentPage,
  flowFilter,
  flowSummary,
  flows,
  keyword,
  onFlowFilterChange,
  onKeywordChange,
  onOpenFlow,
  onPageChange,
  onSort,
  selectedFlowKey,
  sortDirection,
  sortField,
  taskDisplayIdByTaskId,
  totalPages,
}: {
  currentPage: number;
  flowFilter: FlowFilter;
  flowSummary: FlowStatusSummary;
  flows: TaskFlowSummaryDto[];
  keyword: string;
  onFlowFilterChange: (status: FlowFilter) => void;
  onKeywordChange: (keyword: string) => void;
  onOpenFlow: (flow: TaskFlowSummaryDto) => void;
  onPageChange: (page: number) => void;
  onSort: (field: FlowSortField) => void;
  selectedFlowKey: string | null;
  sortDirection: FlowSortDirection;
  sortField: FlowSortField | null;
  taskDisplayIdByTaskId: ReadonlyMap<string, string>;
  totalPages: number;
}) => {
  const handleRowClick = (event: MouseEvent<HTMLTableRowElement>, flow: TaskFlowSummaryDto) => {
    if (shouldIgnoreRowOpen(event.target) || hasActiveTextSelection()) {
      return;
    }

    onOpenFlow(flow);
  };

  const handleRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, flow: TaskFlowSummaryDto) => {
    if (shouldIgnoreRowOpen(event.target)) {
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpenFlow(flow);
    }
  };

  return (
    <div className="task-management-table-card agent-review-table-panel">
      <div className="task-management-table-toolbar agent-review-table-toolbar">
        <section className="task-summary-grid template-summary-grid" role="region" aria-label="任务质检流转状态筛选">
          {FLOW_SUMMARY_FILTERS.map((item) => (
            <FlowSummaryCard
              key={item.value}
              isActive={flowFilter === item.value}
              label={item.label}
              status={item.value}
              value={flowSummary[item.summaryKey].toString()}
              onClick={() => onFlowFilterChange(item.value)}
            />
          ))}
        </section>
        <div className="task-filter-bar agent-review-filter">
          <input
            aria-label="搜索任务质检流水线"
            placeholder="搜索任务名 / Owner / 当前阶段"
            value={keyword}
            onChange={(event) => onKeywordChange(event.target.value)}
          />
        </div>
      </div>

      <div className="task-table-scroll" data-adaptive-table-viewport="true">
        <table className="task-table agent-review-batch-table" aria-label="任务质检流水线表格">
          <colgroup>
            <col className="task-table__col-id" />
            <col className="agent-review-batch-table__col-title" />
            <col className="agent-review-batch-table__col-labeler" />
            <col className="agent-review-batch-table__col-count" />
            <col className="agent-review-batch-table__col-count" />
            <col className="agent-review-batch-table__col-decision" />
          </colgroup>
          <thead>
            <tr>
              <th>
                <SortableFlowHeader
                  field="taskId"
                  label="任务ID"
                  sortDirection={sortDirection}
                  sortField={sortField}
                  onSort={onSort}
                />
              </th>
              <th>任务名称</th>
              <th>当前阶段</th>
              <th>AI 预审进度</th>
              <th>Reviewer 复核</th>
              <th>
                <SortableFlowHeader
                  field="updatedAt"
                  label="最近更新"
                  sortDirection={sortDirection}
                  sortField={sortField}
                  onSort={onSort}
                />
              </th>
            </tr>
          </thead>
          <tbody key={currentPage} className="task-table__body">
            {flows.length > 0 ? (
              flows.map((flow) => {
                const taskDisplayId = taskDisplayIdByTaskId.get(flow.taskId) ?? flow.taskId;

                return (
                  <tr
                    key={flowKey(flow)}
                    className={[
                      'task-table__row',
                      'agent-review-batch-table__row',
                      selectedFlowKey === flowKey(flow) ? 'is-active' : '',
                    ].filter(Boolean).join(' ')}
                    aria-label={`查看 ${taskDisplayId} ${flow.taskTitle} 质检流转详情`}
                    tabIndex={0}
                    onClick={(event) => handleRowClick(event, flow)}
                    onKeyDown={(event) => handleRowKeyDown(event, flow)}
                  >
                    <td className="task-table__id">
                      <TableCellInner>
                        <code>{taskDisplayId}</code>
                      </TableCellInner>
                    </td>
                    <td>
                      <TableCellInner>
                        <span className="task-title-link">{flow.taskTitle}</span>
                        <small>{templateLabel(flow)}</small>
                      </TableCellInner>
                    </td>
                    <td>
                      <TableCellInner>
                        <DecisionPill tone={stageTone(flow.currentStage)} label={STAGE_LABELS[flow.currentStage]} />
                      </TableCellInner>
                    </td>
                    <td>
                      <TableCellInner>
                        <span className="agent-review-batch-table__metric">
                          {flow.aiSummary.completed.toLocaleString()} / {flow.submittedItems.toLocaleString()} 预审完成
                        </span>
                        <small>通过 {flow.aiSummary.passed.toLocaleString()} · 打回 {flow.aiSummary.rejected.toLocaleString()}</small>
                      </TableCellInner>
                    </td>
                    <td>
                      <TableCellInner>
                        <span className="agent-review-batch-table__metric">
                          待审 {flow.reviewerSummary.pending.toLocaleString()} / {flow.submittedItems.toLocaleString()}
                        </span>
                        <small>已决策 {flow.reviewerSummary.decided.toLocaleString()} · 完成 {flow.finalSummary.completed.toLocaleString()}</small>
                      </TableCellInner>
                    </td>
                    <td className="task-table__date-column">
                      <TableCellInner>
                        <DateTimeCell value={flow.updatedAt} />
                      </TableCellInner>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr className="task-table__empty-row">
                <td colSpan={6}>
                  <TableEmptyState title="暂无任务质检流转记录" illustrationAlt="空任务质检流水线插画" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="task-table-pagination" aria-label="任务质检流水线分页">
        <button type="button" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}>
          上一页
        </button>
        <span aria-label="当前页码">
          第 {currentPage} / {totalPages} 页
        </span>
        <button type="button" disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)}>
          下一页
        </button>
      </div>
    </div>
  );
};

const FlowSummaryCard = ({
  isActive,
  label,
  onClick,
  status,
  value,
}: {
  isActive: boolean;
  label: string;
  onClick: () => void;
  status: FlowFilter;
  value: string;
}) => (
  <button
    className={[
      'task-summary-card',
      status === 'ALL' ? 'task-summary-card--total' : '',
      status === 'ACTIVE' ? 'task-summary-card--running' : '',
      status === 'FINAL_COMPLETED' ? 'task-summary-card--done' : '',
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

const TaskFlowSheet = ({
  detail,
  flow,
  isClosing,
  isLoading,
  isLogLoading,
  isLogOpen,
  isTaskLogStale,
  onClose,
  onCloseLogs,
  onOpenLogs,
  onSelectItem,
  selectedItemIndex,
  taskLogs,
}: {
  detail: TaskFlowDetailDto | null;
  flow: TaskFlowSummaryDto | TaskFlowDetailDto;
  isClosing: boolean;
  isLoading: boolean;
  isLogLoading: boolean;
  isLogOpen: boolean;
  isTaskLogStale: boolean;
  onClose: () => void;
  onCloseLogs: () => void;
  onOpenLogs: () => void;
  onSelectItem: (index: number) => void;
  selectedItemIndex: number;
  taskLogs: TaskFlowLogDto[];
}) => {
  const items = detail?.items ?? [];
  const selectedItem = items[Math.min(selectedItemIndex, Math.max(0, items.length - 1))] ?? null;
  const sheetRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || sheetRef.current?.contains(target)) {
        return;
      }

      onClose();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [onClose]);

  const handleOverlayMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className={isClosing ? 'agent-review-sheet-overlay is-closing' : 'agent-review-sheet-overlay'}
      role="presentation"
      onMouseDown={handleOverlayMouseDown}
    >
      <section
        ref={sheetRef}
        className={isClosing ? 'agent-review-batch-sheet is-closing' : 'agent-review-batch-sheet'}
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-review-detail-title"
      >
        <header className="agent-review-drawer-header">
          <section className="agent-review-detail-summary-card" aria-label="任务质检流转摘要">
            <div className="agent-review-detail-summary-card__top">
              <div className="agent-review-detail-summary-heading">
                <div className="agent-review-detail-summary-title-group">
                  <div className="agent-review-detail-summary-title-row">
                    <div className="agent-review-detail-summary-title-block">
                      <span className="agent-review-detail-summary-eyebrow">任务名称</span>
                      <h2 id="agent-review-detail-title" className="agent-review-detail-summary-card__title">
                        {flow.taskTitle}
                      </h2>
                    </div>
                  </div>
                </div>
              </div>
              <div className="agent-review-detail-actions">
                <button className="task-button task-button--ghost" type="button" onClick={onOpenLogs}>
                  任务日志
                </button>
                <button className="workbench-close-button" type="button" aria-label="关闭任务流转详情" onClick={onClose}>
                  <span aria-hidden="true">×</span>
                </button>
              </div>
            </div>
            <TaskFlowTimeline flow={flow} />
          </section>
        </header>

        {isLoading ? (
          <PageLoading className="page-loading--compact" title="正在加载任务流转详情" />
        ) : (
          <div className="agent-review-drawer-body">
            {items.length > 0 ? (
              <div className="agent-review-sheet-layout">
                <QuestionList items={items} selectedIndex={selectedItemIndex} onSelect={onSelectItem} />
                <div className="agent-review-sheet-main">
                  {selectedItem ? (
                    <>
                      <ItemFlowResultStrip item={selectedItem} />
                      <SubmissionContentPanel item={selectedItem} />
                      <AiReviewRecordPanel item={selectedItem} />
                      <ReviewerRecordPanel item={selectedItem} />
                    </>
                  ) : null}
                </div>
                {selectedItem ? <TraceSidebar item={selectedItem} isLogStale={isTaskLogStale} logs={taskLogs} /> : null}
              </div>
            ) : (
              <TableEmptyState title="暂无题目流转详情" illustrationAlt="空任务流转详情插画" />
            )}
          </div>
        )}
        {isLogOpen ? (
          <TaskFlowLogDialog
            flow={flow}
            isLoading={isLogLoading}
            logs={taskLogs}
            onClose={onCloseLogs}
          />
        ) : null}
      </section>
    </div>
  );
};

const QuestionList = ({
  items,
  onSelect,
  selectedIndex,
}: {
  items: TaskFlowItemDto[];
  onSelect: (index: number) => void;
  selectedIndex: number;
}) => {
  return (
    <aside className="agent-review-question-list" aria-label="任务内题目流转列表">
      <div className="agent-review-question-list__header">
        <strong>全部题目</strong>
        <span>{items.length.toLocaleString()} 题</span>
      </div>
      <div className="agent-review-question-list__items" role="tablist" aria-label="任务内题目切换">
        {items.map((item, index) => (
          <button
            key={item.taskItem.id}
            type="button"
            className={selectedIndex === index ? 'is-active' : ''}
            role="tab"
            aria-selected={selectedIndex === index}
            onClick={() => onSelect(index)}
          >
            <span className={`agent-review-question-list__dot is-${itemTone(item)}`} aria-hidden="true" />
            <span className="agent-review-question-list__text">
              <strong>Q{item.index}</strong>
              <small>{item.taskItem.externalId}</small>
            </span>
            <em className={`agent-review-field-decision is-${itemTone(item)}`}>{shortItemStatusLabel(item)}</em>
          </button>
        ))}
      </div>
    </aside>
  );
};

const ItemFlowResultStrip = ({ item }: { item: TaskFlowItemDto }) => {
  const meta = [
    item.submission ? `第 ${item.submission.round} 轮提交` : '尚未提交',
    item.assignment?.assigneeName ? `标注员 ${item.assignment.assigneeName}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <section className={`agent-review-result-strip is-${itemTone(item)}`} aria-label="当前题流转结果">
      <div>
        <strong>{shortItemStatusLabel(item)}</strong>
        <span>{meta}</span>
      </div>
      {item.humanReview?.comment ? (
        <p>
          Reviewer 说明：
          <span>{item.humanReview.comment}</span>
        </p>
      ) : null}
    </section>
  );
};

const SubmissionContentPanel = ({ item }: { item: TaskFlowItemDto }) => {
  const displaySchema = useMemo(() => createAgentReviewDisplaySchema(item), [item]);

  return (
    <article className="agent-review-card agent-review-card--submission">
      <PanelHeading title="题目与标注内容" meta={item.submission ? `第 ${item.submission.round} 轮提交` : '尚未提交'} />
      <div className="agent-review-submission-renderer">
        <SchemaRenderer
          mode="review"
          rawData={item.taskItem.rawData}
          schema={displaySchema}
          value={{}}
          onChange={noopSchemaRendererChange}
        />
        <AgentReviewSubmitSnapshotCard snapshot={item.submission?.answers ?? {}} title="Labeler 提交答案" />
      </div>
    </article>
  );
};

const AgentReviewSubmitSnapshotCard = ({
  snapshot,
  title,
}: {
  snapshot: Record<string, unknown>;
  title: string;
}) => {
  const entries = Object.entries(snapshot);
  const displayEntries = entries.length > 0 ? entries : [['agent_review_empty_answer', '未填写'] satisfies [string, unknown]];

  return (
    <article className="manual-review-submit-card is-highlight">
      <h3>{title}</h3>
      <dl>
        {displayEntries.map(([key, value]) => {
          const label = key === 'agent_review_empty_answer' ? '提交答案' : formatPreviewFieldLabel(key);

          return (
            <div key={key}>
              <dt>
                <span>{label}</span>
                {label !== key && key !== 'agent_review_empty_answer' ? <small>{key}</small> : null}
              </dt>
              <dd>{formatReviewSubmitSnapshotValue(value)}</dd>
            </div>
          );
        })}
      </dl>
    </article>
  );
};

const AiReviewRecordPanel = ({ item }: { item: TaskFlowItemDto }) => (
  <article className={`agent-review-card agent-review-card--comment is-${aiTone(item.aiStatus)}`}>
    <PanelHeading title="预审记录" />
    <div className="agent-review-comment-box">
      <strong>{AI_STATUS_LABELS[item.aiStatus]}</strong>
      <p>{item.aiReview?.comment ?? item.latestAiJob?.lastError ?? '当前题没有 AI 预审结论。'}</p>
    </div>
    {item.aiReview ? <ScoreList scores={item.aiReview.scores} /> : null}
  </article>
);

const ReviewerRecordPanel = ({ item }: { item: TaskFlowItemDto }) => (
  <article className={`agent-review-card agent-review-card--comment is-${reviewerTone(item.reviewerStatus)}`}>
    <PanelHeading title="Reviewer 复核记录" meta={item.humanReview ? formatDateTimeSecond(item.humanReview.createdAt) : '等待人工复核'} />
    <div className="agent-review-comment-box">
      <strong>{REVIEWER_STATUS_LABELS[item.reviewerStatus]}</strong>
      <p>{item.humanReview?.comment ?? '当前题还没有 Reviewer 本轮复核结论。'}</p>
    </div>
  </article>
);

const TraceSidebar = ({
  isLogStale,
  item,
  logs,
}: {
  isLogStale: boolean;
  item: TaskFlowItemDto;
  logs: TaskFlowLogDto[];
}) => {
  const events = itemTraceEvents(item, logs);

  return (
  <aside className="agent-review-trace-sidebar" aria-label="本题历史">
    <section className="agent-review-trace-card agent-review-trace-current" aria-label={`本题历史（Q${item.index}）`}>
      <header className="agent-review-trace-current__header">
        <div>
          <span>本题历史</span>
          <h3>
            Q{item.index} · {item.taskItem.externalId}
          </h3>
        </div>
        <span className={`agent-review-trace-status is-${itemTone(item)}`}>{shortItemStatusLabel(item)}</span>
      </header>
      {isLogStale ? (
        <p className="agent-review-trace-warning" role="alert">
          完整历史加载失败，当前仅展示本题最新记录。请点击任务日志重试。
        </p>
      ) : null}
      <ol className="agent-review-trace-timeline" aria-label="本题历史记录">
        {events.map((event) => (
          <TraceTimelineItem event={event} key={event.key} />
        ))}
      </ol>
    </section>
  </aside>
  );
};

const TaskFlowTimeline = ({ flow }: { flow: TaskFlowSummaryDto | TaskFlowDetailDto }) => {
  const steps = flow.lifecycleSteps;
  const [activeStep, setActiveStep] = useState<{
    key: TaskFlowLifecycleStepDto['key'];
    step: TaskFlowLifecycleStepDto;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    if (!activeStep) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('.agent-review-task-timeline li')) {
        return;
      }

      setActiveStep(null);
    };
    const handleScroll = () => setActiveStep(null);

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [activeStep]);

  const showStepPopover = (target: HTMLElement, step: TaskFlowLifecycleStepDto) => {
    const targetRect = target.getBoundingClientRect();
    const dotRect = target.querySelector<HTMLElement>('.agent-review-task-timeline__dot')?.getBoundingClientRect() ?? targetRect;

    setActiveStep({
      key: step.key,
      step,
      x: dotRect.left + dotRect.width / 2,
      y: targetRect.bottom + 10,
    });
  };

  return (
    <section className="agent-review-task-progress" aria-label="流程进度">
      <ol className="agent-review-task-timeline" aria-label="当前任务时间线">
        {steps.map((step, index) => (
          <li
            key={step.key}
            tabIndex={0}
            aria-label={`${step.label}，${LIFECYCLE_STATUS_LABELS[step.status]}`}
            className={[
              `is-${lifecycleTone(step.status)}`,
              `is-${step.status.toLowerCase().replace('_', '-')}`,
              step.status === 'COMPLETED' ? 'is-complete' : '',
            ].filter(Boolean).join(' ')}
            onBlur={() => setActiveStep(null)}
            onClick={(event) => showStepPopover(event.currentTarget, step)}
            onFocus={(event) => showStepPopover(event.currentTarget, step)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setActiveStep(null);
              }
            }}
            onMouseEnter={(event) => showStepPopover(event.currentTarget, step)}
            onMouseLeave={() => setActiveStep(null)}
          >
            <div className="agent-review-task-timeline__rail">
              <span className="agent-review-task-timeline__dot" aria-hidden="true">
                {step.status === 'COMPLETED' ? <TimelineCheckIcon /> : null}
              </span>
              {index < steps.length - 1 ? (
                <span
                  className="agent-review-task-timeline__track"
                  style={{ background: taskFlowTrackBackground(step.status, steps[index + 1]?.status) }}
                  aria-hidden="true"
                />
              ) : null}
            </div>
            <div className="agent-review-task-timeline__content">
              <strong>{step.label}</strong>
            </div>
          </li>
        ))}
      </ol>
      {activeStep
        ? createPortal(
            <TaskFlowStepPopover flow={flow} position={{ x: activeStep.x, y: activeStep.y }} step={activeStep.step} />,
            document.body,
          )
        : null}
    </section>
  );
};

const TaskFlowStepPopover = ({
  flow,
  position,
  step,
}: {
  flow: TaskFlowSummaryDto | TaskFlowDetailDto;
  position: { x: number; y: number };
  step: TaskFlowLifecycleStepDto;
}) => {
  const rows = taskFlowStepPopoverRows(flow, step);

  if (rows.length === 0) {
    return null;
  }

  return (
    <aside
      className="agent-review-task-popover"
      role="tooltip"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      <dl className="agent-review-task-popover__details">
        {rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
};

const TimelineCheckIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 12.5 9.4 17 19 7" />
  </svg>
);

const TimelineMetaIcon = ({ type }: { type: 'bot' | 'clock' | 'user' }) => {
  if (type === 'clock') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3.2 2" />
      </svg>
    );
  }

  if (type === 'bot') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="6" y="8" width="12" height="10" rx="3" />
        <path d="M12 5v3M9 18v2M15 18v2M8.8 12h.1M15.1 12h.1" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 19c.9-3.4 3.2-5.1 6.5-5.1s5.6 1.7 6.5 5.1" />
    </svg>
  );
};

const TaskFlowLogDialog = ({
  flow,
  isLoading,
  logs,
  onClose,
}: {
  flow: TaskFlowSummaryDto | TaskFlowDetailDto;
  isLoading: boolean;
  logs: TaskFlowLogDto[];
  onClose: () => void;
}) => (
  <aside className="agent-review-log-dialog agent-review-card" role="dialog" aria-label={`任务日志 · ${flow.taskTitle}`}>
    <header className="agent-review-card__heading">
      <div>
        <h3>任务日志 · {flow.taskTitle}</h3>
        <span>按真实流转时间记录关键阶段事件</span>
      </div>
      <button className="workbench-close-button" type="button" aria-label="关闭任务日志" onClick={onClose}>
        <span aria-hidden="true">×</span>
      </button>
    </header>
    {isLoading ? (
      <PageLoading className="page-loading--compact" title="正在加载任务日志" />
    ) : logs.length > 0 ? (
      <ol className="agent-review-trace-timeline" aria-label="任务日志时间线">
        {logs.map((log) => (
          <li className={`is-${logTone(log)}`} key={log.id}>
            <span className="agent-review-trace-timeline__dot" aria-hidden="true" />
            <div className="agent-review-trace-timeline__body">
              <time>{formatDateTimeSecond(log.occurredAt)}</time>
              <strong>{logEventLabel(log.eventType)}</strong>
              {isUsefulTaskLogMessage(log.message) ? <p>{log.message}</p> : null}
              <small>{log.actorName ?? actorRoleLabel(log.actorRole)}</small>
              {log.rejectedItemRefs.length > 0 ? (
                <div className="agent-review-log-rejected-items" aria-label="打回题目">
                  {log.rejectedItemRefs.map((item) => (
                    <span className="agent-review-field-decision is-reject" key={`${log.id}:${item.itemId}`}>
                      <span>Q{item.index}</span>
                      <span>{item.externalId}</span>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    ) : (
      <TableEmptyState title="暂无任务日志" illustrationAlt="空任务日志插画" />
    )}
  </aside>
);

type StatusTone = 'pass' | 'reject' | 'pending' | 'pendingReview' | 'failed';

const DecisionPill = ({ label, tone }: { label: string; tone: StatusTone }) => (
  <span className={`agent-review-decision-pill is-${tone}`}>
    <span className="status-tag__dot" aria-hidden="true" />
    {label}
  </span>
);

const SummaryStatusPill = ({ stage }: { stage: TaskFlowStage }) => (
  <span className={`agent-review-detail-summary-status is-${stageTone(stage)}`}>
    {STAGE_LABELS[stage]}
  </span>
);

const ScoreList = ({ scores }: { scores: Record<string, unknown> }) => {
  const entries = Object.entries(scores).filter(([, value]) => typeof value === 'number' || typeof value === 'string');

  if (entries.length === 0) {
    return null;
  }

  return (
    <dl className="agent-review-trace-identifiers">
      {entries.map(([key, value]) => (
        <TraceSummaryItem key={key} label={formatScoreLabel(key)} value={formatScoreValue(value)} />
      ))}
    </dl>
  );
};

const TraceSummaryItem = ({ label, value }: { label: string; value: ReactNode }) => (
  <div>
    <dt>{label}</dt>
    <dd>{value || '未记录'}</dd>
  </div>
);

type TraceEvent = {
  key: string;
  title: string;
  description: string;
  actorName?: string | null;
  round?: number;
  time: string | null;
  tone: StatusTone;
};

const TraceTimelineItem = ({ event }: { event: TraceEvent }) => (
  <li className={`is-${event.tone}`}>
    <span className="agent-review-trace-timeline__dot" aria-hidden="true" />
    <div className="agent-review-trace-timeline__body">
      <time>{event.time ? formatDateTimeSecond(event.time) : '未发生'}</time>
      <strong>{event.title}</strong>
      {event.description ? <p>{event.description}</p> : null}
      {event.actorName || event.round ? (
        <small>{[event.actorName, event.round ? `第 ${event.round} 轮` : null].filter(Boolean).join(' · ')}</small>
      ) : null}
    </div>
  </li>
);

const TableCellInner = ({ children }: { children: ReactNode }) => (
  <div className="task-table__cell-inner">{children}</div>
);

const PanelHeading = ({ meta, title }: { meta?: ReactNode; title: string }) => (
  <div className="agent-review-card__heading">
    <h3>{title}</h3>
    {meta ? <span>{meta}</span> : null}
  </div>
);

const SortableFlowHeader = ({
  field,
  label,
  sortDirection,
  sortField,
  onSort,
}: {
  field: FlowSortField;
  label: string;
  sortDirection: FlowSortDirection;
  sortField: FlowSortField | null;
  onSort: (field: FlowSortField) => void;
}) => {
  const isActive = sortField === field;
  const icon = isActive ? (sortDirection === 'asc' ? '↑' : '↓') : '⇅';

  return (
    <button
      aria-label={`按${label}排序`}
      aria-pressed={isActive}
      className={`task-table__sortable-header agent-review-batch-table__sortable-header${isActive ? ' is-active' : ''}`}
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

const DateTimeCell = ({ value }: { value?: string | null }) => {
  const { date, time } = splitDateTimeMinute(value);

  return (
    <span className="task-date-cell">
      <span className="task-date-cell__date">{date}</span>
      <small className="task-date-cell__time">{time}</small>
    </span>
  );
};

function createTaskFlowDisplayIdMap(flows: TaskFlowSummaryDto[]): Map<string, string> {
  const sortedFlows = [...flows].sort((left, right) => {
    const createdAtDiff = parseTimestamp(left.taskCreatedAt) - parseTimestamp(right.taskCreatedAt);

    return createdAtDiff === 0 ? left.taskId.localeCompare(right.taskId) : createdAtDiff;
  });

  return new Map(sortedFlows.map((flow, index) => [flow.taskId, taskDisplayId(flow.taskId, index + 1)]));
}

function taskDisplayId(taskId: string, sequence: number): string {
  return /^T-\d+$/i.test(taskId) ? taskId : `T-${sequence.toString().padStart(3, '0')}`;
}

function flowKey(flow: Pick<TaskFlowSummaryDto, 'round' | 'taskId'>): string {
  return `${flow.taskId}:round${flow.round}`;
}

function compareTaskFlowsBySortField(
  left: TaskFlowSummaryDto,
  right: TaskFlowSummaryDto,
  sortField: FlowSortField,
  sortDirection: FlowSortDirection,
  taskDisplayIdByTaskId: ReadonlyMap<string, string>,
): number {
  const multiplier = sortDirection === 'asc' ? 1 : -1;

  if (sortField === 'updatedAt') {
    const diff = parseTimestamp(left.updatedAt) - parseTimestamp(right.updatedAt);
    return diff === 0 ? left.taskId.localeCompare(right.taskId) : diff * multiplier;
  }

  const leftDisplayId = taskDisplayIdByTaskId.get(left.taskId) ?? left.taskId;
  const rightDisplayId = taskDisplayIdByTaskId.get(right.taskId) ?? right.taskId;
  const leftNumber = parseDisplayIdNumber(leftDisplayId);
  const rightNumber = parseDisplayIdNumber(rightDisplayId);

  if (leftNumber !== null && rightNumber !== null && leftNumber !== rightNumber) {
    return (leftNumber - rightNumber) * multiplier;
  }

  const displayIdDiff = leftDisplayId.localeCompare(rightDisplayId);
  return displayIdDiff === 0 ? left.taskId.localeCompare(right.taskId) : displayIdDiff * multiplier;
}

function parseDisplayIdNumber(value: string): number | null {
  const match = /^T-(\d+)$/i.exec(value);
  if (!match?.[1]) {
    return null;
  }

  const parsed = Number.parseInt(match[1], 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseTimestamp(value?: string | null): number {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function templateLabel(flow: Pick<TaskFlowSummaryDto, 'templateName' | 'templateVersion'>): string {
  return [flow.templateName ?? '未绑定模板', flow.templateVersion ? `版本 ${flow.templateVersion}` : ''].filter(Boolean).join(' · ');
}

function stageTone(stage: TaskFlowStage): StatusTone {
  if (stage === 'FINAL_COMPLETED') {
    return 'pass';
  }
  if (stage === 'LABELER_REVISION') {
    return 'reject';
  }
  if (stage === 'AI_PRECHECK') {
    return 'pending';
  }
  return 'pending';
}

function aiTone(status: TaskFlowAiStatus): StatusTone {
  if (status === 'PASSED' || status === 'SUCCEEDED') {
    return 'pass';
  }
  if (status === 'REJECTED') {
    return 'reject';
  }
  if (status === 'FAILED') {
    return 'failed';
  }
  return 'pending';
}

function reviewerTone(status: TaskFlowReviewerStatus): StatusTone {
  if (status === 'PASSED') {
    return 'pass';
  }
  if (status === 'REJECTED') {
    return 'reject';
  }
  return 'pending';
}

function labelerTone(status: TaskFlowLabelerStatus): StatusTone {
  if (status === 'NEEDS_REVISION') {
    return 'reject';
  }
  if (status === 'REVISED' || status === 'NOT_REQUIRED') {
    return 'pass';
  }
  return 'pending';
}

function lifecycleTone(status: TaskFlowLifecycleStepStatus): StatusTone {
  if (status === 'COMPLETED' || status === 'SKIPPED') {
    return 'pass';
  }
  if (status === 'ACTION_REQUIRED') {
    return 'reject';
  }
  return 'pending';
}

function taskFlowStepPopoverRows(
  _flow: TaskFlowSummaryDto | TaskFlowDetailDto,
  step: TaskFlowLifecycleStepDto,
): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];

  if (step.actorName) {
    rows.push({ label: '经办人', value: step.actorName });
  }

  if (step.occurredAt) {
    rows.push({ label: '时间', value: formatDateTimeSecond(step.occurredAt) });
  }

  return rows;
}

function taskFlowStepColor(status: TaskFlowLifecycleStepStatus | undefined): string {
  if (status === 'COMPLETED') {
    return '#269449';
  }

  if (status === 'CURRENT' || status === 'ACTION_REQUIRED') {
    return '#ff7900';
  }

  return '#cfd4dc';
}

function taskFlowTrackBackground(
  fromStatus: TaskFlowLifecycleStepStatus,
  toStatus: TaskFlowLifecycleStepStatus | undefined,
): string {
  const fromColor = taskFlowStepColor(fromStatus);
  const toColor = taskFlowStepColor(toStatus);

  if (toColor === '#cfd4dc') {
    return toColor;
  }

  if (fromColor === toColor) {
    return fromColor;
  }

  return `linear-gradient(90deg, ${fromColor} 0%, ${toColor} 100%)`;
}

function logTone(log: TaskFlowLogDto): StatusTone {
  if (log.eventType === 'REVIEWER_REJECTED' || log.rejectedItemRefs.length > 0) {
    return 'reject';
  }
  if (log.eventType === 'TASK_COMPLETED') {
    return 'pass';
  }
  return 'pending';
}

function actorRoleLabel(role: TaskFlowLogDto['actorRole']): string {
  if (role === 'OWNER') {
    return 'Owner';
  }
  if (role === 'LABELER') {
    return 'Labeler';
  }
  if (role === 'AI_AGENT') {
    return 'AI Agent';
  }
  if (role === 'REVIEWER') {
    return 'Reviewer';
  }

  return '系统';
}

function isUsefulTaskLogMessage(message: string): boolean {
  if (
    message === 'Owner 发布了任务。' ||
    message === 'AI Agent 开始本轮预审。' ||
    message === '任务流转到 Reviewer 检查。'
  ) {
    return false;
  }

  if (
    /领取了任务。$/.test(message) ||
    /提交了整个任务的标注结果。$/.test(message) ||
    /完成本轮预审/.test(message)
  ) {
    return false;
  }

  return true;
}

function logEventLabel(eventType: TaskFlowLogDto['eventType']): string {
  const labels: Record<TaskFlowLogDto['eventType'], string> = {
    OWNER_PUBLISHED: 'Owner 发布任务',
    LABELER_CLAIMED: 'Labeler 领取任务',
    LABELER_SUBMITTED: 'Labeler 提交标注结果',
    LABELER_RESUBMITTED: 'Labeler 重新提交',
    AI_PRECHECK_STARTED: '开始预审',
    AI_PRECHECK_COMPLETED: '完成预审',
    AI_RECHECK_STARTED: 'AI Agent 开始复审',
    AI_RECHECK_COMPLETED: '完成复审',
    REVIEWER_RECEIVED: '流转到 Reviewer',
    REVIEWER_CHECK_COMPLETED: 'Reviewer 完成检查',
    REVIEWER_REJECTED: 'Reviewer 打回任务',
    TASK_COMPLETED: '任务完成',
  };

  return labels[eventType];
}

function itemTone(item: TaskFlowItemDto): StatusTone {
  if (item.finalStatus === 'FINAL_APPROVED') {
    return 'pass';
  }
  if (item.reviewerStatus === 'PENDING' || item.aiStatus === 'PASSED' || item.aiStatus === 'SUCCEEDED') {
    return 'pendingReview';
  }
  if (item.labelerStatus === 'NEEDS_REVISION' || item.reviewerStatus === 'REJECTED' || item.aiStatus === 'REJECTED') {
    return 'reject';
  }
  if (item.aiStatus === 'FAILED') {
    return 'failed';
  }
  return 'pending';
}

function itemBucket(item: TaskFlowItemDto | null): ItemStatusBucket {
  if (!item) {
    return 'reviewerPending';
  }
  if (item.finalStatus === 'FINAL_APPROVED') {
    return 'finalApproved';
  }
  if (item.aiStatus === 'FAILED') {
    return 'failed';
  }
  if (item.labelerStatus === 'NEEDS_REVISION' || item.reviewerStatus === 'REJECTED' || item.aiStatus === 'REJECTED') {
    return 'labelerProcessing';
  }
  if (item.reviewerStatus === 'PENDING' || item.aiStatus === 'PASSED' || item.aiStatus === 'SUCCEEDED') {
    return 'reviewerPending';
  }
  return 'aiProcessing';
}

function shortItemStatusLabel(item: TaskFlowItemDto): string {
  const labels: Record<ItemStatusBucket, string> = {
    aiProcessing: 'AI处理中',
    failed: '异常',
    finalApproved: '已完成',
    labelerProcessing: '待修改',
    reviewerPending: '待人工复审',
  };

  return labels[itemBucket(item)];
}

const noopSchemaRendererChange = () => undefined;

function createAgentReviewDisplaySchema(item: TaskFlowItemDto): LabelHubSchema {
  return {
    schemaVersion: item.submission?.schemaVersion ?? AGENT_REVIEW_DISPLAY_SCHEMA_VERSION,
    datasetKind: item.taskItem.datasetKind,
    fields: [
      {
        key: 'agent_review_raw_data',
        type: 'show_item',
        label: '题目原始数据',
        sourceKeys: Object.keys(item.taskItem.rawData),
        displayConfig: {
          layout: 'field_list',
          fields: createShowItemDisplayFields(item.taskItem.rawData),
        },
      },
    ],
  };
}

function createShowItemDisplayFields(rawData: Record<string, unknown>): ShowItemDisplayField[] {
  return Object.entries(rawData).map(([sourceKey, value]) => ({
    sourceKey,
    label: formatPreviewFieldLabel(sourceKey),
    format: showItemDisplayFormat(sourceKey, value),
    maxLines: typeof value === 'string' && value.length > 220 ? 8 : undefined,
  }));
}

function showItemDisplayFormat(sourceKey: string, value: unknown): ShowItemDisplayField['format'] | undefined {
  if (value && typeof value === 'object') {
    return 'json';
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const normalizedKey = sourceKey.toLowerCase();

  if (normalizedKey.includes('json')) {
    return 'json';
  }

  if (normalizedKey.includes('code') || normalizedKey.includes('sql')) {
    return 'code';
  }

  if (value.includes('\n') || value.length > 96) {
    return 'long_text';
  }

  return undefined;
}

function formatReviewSubmitSnapshotValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join('、');
  }

  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value);
  }

  if (value === null || value === undefined || value === '') {
    return '未填写';
  }

  return String(value);
}

function itemTraceEvents(item: TaskFlowItemDto, logs: TaskFlowLogDto[]): TraceEvent[] {
  const logEvents = logs
    .filter((log) => logAppliesToItem(log, item))
    .map((log) => itemLogToTraceEvent(log, item));

  if (logEvents.length > 0) {
    return logEvents.sort((left, right) => timestampValue(left.time) - timestampValue(right.time));
  }

  return itemSnapshotTraceEvents(item);
}

function itemSnapshotTraceEvents(item: TaskFlowItemDto): TraceEvent[] {
  const events: TraceEvent[] = [];

  if (item.submission) {
    events.push({
      key: 'submitted',
      title: item.submission.round > 1 ? 'Labeler 重新提交' : 'Labeler 提交',
      description: `第 ${item.submission.round} 轮提交`,
      time: item.submission.submittedAt,
      tone: 'pass',
    });
  }

  const aiTime = item.aiReview?.createdAt ?? item.latestAiJob?.finishedAt ?? item.latestAiJob?.updatedAt ?? null;
  if (aiTime) {
    events.push({
      key: 'ai',
      title: 'AI 预审',
      description: item.aiReview?.decision ? `AI ${reviewDecisionLabel(item.aiReview.decision)}` : AI_STATUS_LABELS[item.aiStatus],
      time: aiTime,
      tone: aiTone(item.aiStatus),
    });
  }

  if (item.humanReview) {
    events.push({
      key: 'reviewer',
      title: 'Reviewer 复核',
      description: item.humanReview.decision ? `Reviewer ${reviewDecisionLabel(item.humanReview.decision)}` : REVIEWER_STATUS_LABELS[item.reviewerStatus],
      time: item.humanReview.createdAt,
      tone: reviewerTone(item.reviewerStatus),
    });
  }

  if (item.finalStatus === 'FINAL_APPROVED') {
    events.push({
      key: 'final',
      title: '题目完成',
      description: '最终通过',
      time: item.humanReview?.createdAt ?? item.submission?.submittedAt ?? null,
      tone: 'pass',
    });
  }

  return events.sort((left, right) => timestampValue(left.time) - timestampValue(right.time));
}

function logAppliesToItem(log: TaskFlowLogDto, item: TaskFlowItemDto): boolean {
  const refs = log.itemRefs.length > 0 ? log.itemRefs : log.rejectedItemRefs;

  return refs.some((ref) => itemRefMatchesItem(ref, item));
}

function itemRefMatchesItem(
  ref: TaskFlowLogDto['itemRefs'][number] | TaskFlowLogDto['rejectedItemRefs'][number],
  item: TaskFlowItemDto,
): boolean {
  return ref.itemId === item.taskItem.id || ref.externalId === item.taskItem.externalId || ref.index === item.index;
}

function itemLogToTraceEvent(log: TaskFlowLogDto, item: TaskFlowItemDto): TraceEvent {
  const isRejectedItem = log.rejectedItemRefs.some((ref) => itemRefMatchesItem(ref, item));

  return {
    key: `log:${log.id}`,
    title: itemLogTitle(log.eventType, isRejectedItem),
    description: itemLogDescription(log, isRejectedItem),
    actorName: log.actorName ?? actorRoleLabel(log.actorRole),
    round: log.round,
    time: log.occurredAt,
    tone: itemLogTone(log, isRejectedItem),
  };
}

function itemLogTitle(eventType: TaskFlowLogDto['eventType'], isRejectedItem: boolean): string {
  const labels: Record<TaskFlowLogDto['eventType'], string> = {
    OWNER_PUBLISHED: '任务发布',
    LABELER_CLAIMED: 'Labeler 领取',
    LABELER_SUBMITTED: 'Labeler 提交',
    LABELER_RESUBMITTED: 'Labeler 重新提交',
    AI_PRECHECK_STARTED: '进入预审',
    AI_PRECHECK_COMPLETED: isRejectedItem ? '预审建议修改' : '预审通过',
    AI_RECHECK_STARTED: '进入 AI 复审',
    AI_RECHECK_COMPLETED: isRejectedItem ? '复审仍需修改' : '复审通过',
    REVIEWER_RECEIVED: '进入 Reviewer',
    REVIEWER_CHECK_COMPLETED: 'Reviewer 通过',
    REVIEWER_REJECTED: isRejectedItem ? 'Reviewer 打回' : 'Reviewer 通过',
    TASK_COMPLETED: '题目完成',
  };

  return labels[eventType];
}

function itemLogDescription(log: TaskFlowLogDto, isRejectedItem: boolean): string {
  if (log.eventType === 'OWNER_PUBLISHED') {
    return '';
  }

  if (log.eventType === 'LABELER_CLAIMED') {
    return '';
  }

  if (log.eventType === 'AI_PRECHECK_STARTED') {
    return '';
  }

  if (log.eventType === 'AI_RECHECK_STARTED') {
    return '';
  }

  if (log.eventType === 'REVIEWER_RECEIVED') {
    return '';
  }

  if (log.eventType === 'AI_PRECHECK_COMPLETED' || log.eventType === 'AI_RECHECK_COMPLETED') {
    return '';
  }

  if (log.eventType === 'REVIEWER_REJECTED') {
    return '';
  }

  if (log.eventType === 'LABELER_RESUBMITTED') {
    return '';
  }

  if (log.eventType === 'LABELER_SUBMITTED') {
    return '';
  }

  return log.message;
}

function itemLogTone(log: TaskFlowLogDto, isRejectedItem: boolean): StatusTone {
  if (isRejectedItem) {
    return 'reject';
  }

  if (
    log.eventType === 'AI_PRECHECK_COMPLETED' ||
    log.eventType === 'AI_RECHECK_COMPLETED' ||
    log.eventType === 'REVIEWER_CHECK_COMPLETED' ||
    log.eventType === 'REVIEWER_REJECTED' ||
    log.eventType === 'TASK_COMPLETED'
  ) {
    return 'pass';
  }

  return 'pending';
}

function reviewDecisionLabel(decision: string): string {
  if (decision === 'pass') {
    return '通过';
  }
  if (decision === 'reject') {
    return '打回';
  }
  if (decision === 'manual') {
    return '转人工';
  }
  return decision;
}

function timestampValue(value?: string | null): number {
  if (!value) {
    return Number.MAX_SAFE_INTEGER;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

const PREVIEW_FIELD_LABELS: Record<string, string> = {
  annotator_note: '标注备注',
  dimensions: '评估维度',
  id: '题目编号',
  lang: '语言',
  margin: '差距判断',
  model_a: '模型 A',
  model_b: '模型 B',
  preferred: '选择结果',
  prompt: '题目',
  response_a: '模型 A 回复',
  response_b: '模型 B 回复',
  safety_flag: '安全标记',
  task_type: '任务类型',
};

const SCORE_FIELD_LABELS: Record<string, string> = {
  fieldCount: '检查字段',
  overall: '综合分',
  passedFieldCount: '通过字段',
  rejectedFieldCount: '打回字段',
};

function formatScoreLabel(key: string): string {
  return SCORE_FIELD_LABELS[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim();
}

function formatScoreValue(value: unknown): string {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1);
  }

  return formatPreviewScalar(value);
}

function formatPreviewFieldLabel(key: string): string {
  return PREVIEW_FIELD_LABELS[key] ?? key.replace(/_/g, ' ');
}

function formatPreviewScalar(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '未记录';
  }

  if (typeof value === 'boolean') {
    return value ? '是' : '否';
  }

  if (typeof value === 'string') {
    if (value === 'true') {
      return '是';
    }
    if (value === 'false') {
      return '否';
    }
    if (value === 'zh') {
      return '中文';
    }
    if (value === 'en') {
      return '英文';
    }

    return value;
  }

  if (typeof value === 'number') {
    return String(value);
  }

  return JSON.stringify(value);
}

function splitDateTimeMinute(value?: string | null): { date: string; time: string } {
  if (!value) {
    return { date: '未记录', time: '' };
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { date: value, time: '' };
  }

  return {
    date: date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }),
    time: date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
  };
}

function formatDateTimeSecond(value?: string | null): string {
  if (!value) {
    return '未记录';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function shouldIgnoreRowOpen(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('button, a, input, textarea, select'));
}

function hasActiveTextSelection(): boolean {
  const selection = typeof window === 'undefined' ? null : window.getSelection();
  return Boolean(selection && selection.toString().trim());
}
