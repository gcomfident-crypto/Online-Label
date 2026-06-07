import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { PageLoading } from '../../components/PageLoading';
import { TableEmptyState } from '../../components/TableEmptyState';
import { ToastViewport, useToastController } from '../../components/ToastViewport';
import {
  getTaskFlow,
  listTaskFlows,
  type TaskFlowAiStatus,
  type TaskFlowDetailDto,
  type TaskFlowFinalStatus,
  type TaskFlowItemDto,
  type TaskFlowLabelerStatus,
  type TaskFlowReviewerStatus,
  type TaskFlowStage,
  type TaskFlowSummaryDto,
} from '../../api/taskFlows';

const FLOW_TABLE_PAGE_SIZE = 10;
const SHEET_EXIT_ANIMATION_MS = 260;

type FlowFilter = 'ALL' | 'ACTIVE' | 'FINAL_COMPLETED';
type FlowSortField = 'taskId' | 'updatedAt';
type FlowSortDirection = 'asc' | 'desc';
type ItemStatusBucket = 'inProgress' | 'reviewerPending' | 'revision' | 'finalApproved';

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
  { label: '最终完成', summaryKey: 'finalCompleted', value: 'FINAL_COMPLETED' },
];

const ITEM_STATUS_TABS: Array<{ label: string; value: ItemStatusBucket }> = [
  { label: '流转中', value: 'inProgress' },
  { label: '待复审', value: 'reviewerPending' },
  { label: '待修改', value: 'revision' },
  { label: '最终完成', value: 'finalApproved' },
];

const STAGE_LABELS: Record<TaskFlowStage, string> = {
  LABELING: 'Labeler 标注中',
  AI_PRECHECK: 'AI 预审中',
  HUMAN_REVIEW: 'Reviewer 复核中',
  LABELER_REVISION: 'Labeler 修改中',
  HUMAN_RE_REVIEW: 'Reviewer 再次复审中',
  FINAL_COMPLETED: '任务最终完成',
};

const AI_STATUS_LABELS: Record<TaskFlowAiStatus, string> = {
  NOT_STARTED: '未进入 AI 预审',
  QUEUED: 'AI 等待预审',
  RUNNING: 'AI 预审中',
  PASSED: 'AI 建议通过',
  REJECTED: 'AI 建议打回',
  SUCCEEDED: 'AI 预审完成',
  FAILED: 'AI 预审失败',
};

const REVIEWER_STATUS_LABELS: Record<TaskFlowReviewerStatus, string> = {
  NOT_STARTED: '未进入 Reviewer',
  PENDING: '待 Reviewer 复核',
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
  const [selectedItemIndex, setSelectedItemIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isSheetClosing, setIsSheetClosing] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const { dismissToast, messages, showErrorToast } = useToastController();

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
    setSelectedFlow(flow);
    setDetail(null);
    setSelectedItemIndex(0);
    setIsDetailLoading(true);

    try {
      const nextDetail = await getTaskFlow(flow.taskId, flow.round ? { round: flow.round } : {});
      setDetail(nextDetail);
      setSelectedFlow(nextDetail);
    } catch {
      showErrorToast('任务质检流转详情加载失败，请稍后重试。');
    } finally {
      setIsDetailLoading(false);
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
      setSelectedItemIndex(0);
      setIsSheetClosing(false);
      closeTimerRef.current = null;
    }, SHEET_EXIT_ANIMATION_MS);
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
            selectedItemIndex={selectedItemIndex}
            onClose={handleCloseDrawer}
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
                        {flow.aiSummary.completed.toLocaleString()} / {flow.submittedItems.toLocaleString()} AI 预审完成
                        <small>通过 {flow.aiSummary.passed.toLocaleString()} · 打回 {flow.aiSummary.rejected.toLocaleString()}</small>
                      </TableCellInner>
                    </td>
                    <td>
                      <TableCellInner>
                        待复核 {flow.reviewerSummary.pending.toLocaleString()} / {flow.submittedItems.toLocaleString()}
                        <small>已决策 {flow.reviewerSummary.decided.toLocaleString()} · 最终完成 {flow.finalSummary.completed.toLocaleString()}</small>
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
  onClose,
  onSelectItem,
  selectedItemIndex,
}: {
  detail: TaskFlowDetailDto | null;
  flow: TaskFlowSummaryDto | TaskFlowDetailDto;
  isClosing: boolean;
  isLoading: boolean;
  onClose: () => void;
  onSelectItem: (index: number) => void;
  selectedItemIndex: number;
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
                    <h2 id="agent-review-detail-title" className="agent-review-detail-summary-card__title">
                      任务流转详情 · {flow.taskTitle}
                    </h2>
                    <span className="agent-review-detail-summary-title-count">
                      <span aria-hidden="true">•</span>
                      第 {flow.round.toLocaleString()} 轮 · {flow.totalItems.toLocaleString()} 题
                    </span>
                    <SummaryStatusPill stage={flow.currentStage} />
                  </div>
                  <div className="agent-review-detail-summary-subline" aria-label="模板和人员信息">
                    <span className="agent-review-detail-summary-card__subtitle">
                      {templateLabel(flow)}
                    </span>
                    <span className="agent-review-detail-summary-inline-meta">
                      <span className="agent-review-detail-summary-inline-meta__item">
                        <span>任务 Owner</span>
                        <strong>{flow.ownerName ?? flow.ownerId ?? '未记录'}</strong>
                      </span>
                      <span className="agent-review-detail-summary-inline-meta__item">
                        <span>当前阶段</span>
                        <strong>{STAGE_LABELS[flow.currentStage]}</strong>
                      </span>
                    </span>
                  </div>
                </div>
              </div>
              <button className="agent-review-sheet-close" type="button" aria-label="关闭任务流转详情" onClick={onClose}>
                <span aria-hidden="true">×</span>
              </button>
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
                      <ItemStatusPanel item={selectedItem} />
                      <SubmissionContentPanel item={selectedItem} />
                      <AiReviewRecordPanel item={selectedItem} />
                      <ReviewerRecordPanel item={selectedItem} />
                    </>
                  ) : null}
                </div>
                {selectedItem ? <TraceSidebar item={selectedItem} /> : null}
              </div>
            ) : (
              <TableEmptyState title="暂无题目流转详情" illustrationAlt="空任务流转详情插画" />
            )}
          </div>
        )}
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
  const selectedBucket = itemBucket(items[selectedIndex] ?? null);
  const counts = ITEM_STATUS_TABS.reduce<Record<ItemStatusBucket, number>>(
    (nextCounts, tab) => ({
      ...nextCounts,
      [tab.value]: items.filter((item) => itemBucket(item) === tab.value).length,
    }),
    { finalApproved: 0, inProgress: 0, reviewerPending: 0, revision: 0 },
  );

  const handleBucketClick = (bucket: ItemStatusBucket) => {
    const nextIndex = items.findIndex((item) => itemBucket(item) === bucket);
    if (nextIndex >= 0) {
      onSelect(nextIndex);
    }
  };

  return (
    <aside className="agent-review-question-list" aria-label="任务内题目流转列表">
      <div className="agent-review-question-status-tabs" role="tablist" aria-label="题目流转状态统计">
        {ITEM_STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className={`${selectedBucket === tab.value ? 'is-active ' : ''}is-${bucketTone(tab.value)}`}
            role="tab"
            aria-selected={selectedBucket === tab.value}
            onClick={() => handleBucketClick(tab.value)}
          >
            {tab.label}
            <span>{counts[tab.value].toLocaleString()}</span>
          </button>
        ))}
      </div>
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
    AI_STATUS_LABELS[item.aiStatus],
    REVIEWER_STATUS_LABELS[item.reviewerStatus],
    LABELER_STATUS_LABELS[item.labelerStatus],
    FINAL_STATUS_LABELS[item.finalStatus],
  ].join(' · ');

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

const ItemStatusPanel = ({ item }: { item: TaskFlowItemDto }) => (
  <article className="agent-review-card agent-review-card--fields">
    <PanelHeading title="题目流转状态" meta="AI、Reviewer、Labeler、最终状态分层展示" />
    <div className="agent-review-drawer-grid">
      <StatusBlock title="AI 预审状态" label={AI_STATUS_LABELS[item.aiStatus]} tone={aiTone(item.aiStatus)} />
      <StatusBlock title="Reviewer 复核状态" label={REVIEWER_STATUS_LABELS[item.reviewerStatus]} tone={reviewerTone(item.reviewerStatus)} />
      <StatusBlock title="Labeler 修改边界" label={LABELER_STATUS_LABELS[item.labelerStatus]} tone={labelerTone(item.labelerStatus)} />
      <StatusBlock title="任务最终状态" label={FINAL_STATUS_LABELS[item.finalStatus]} tone={item.finalStatus === 'FINAL_APPROVED' ? 'pass' : 'pending'} />
    </div>
  </article>
);

const StatusBlock = ({ label, title, tone }: { label: string; title: string; tone: StatusTone }) => (
  <section className={`agent-review-field-block is-${tone}`}>
    <header className="agent-review-field-block__header">
      <div>
        <strong>{title}</strong>
      </div>
      <DecisionPill tone={tone} label={label} />
    </header>
  </section>
);

const SubmissionContentPanel = ({ item }: { item: TaskFlowItemDto }) => (
  <article className="agent-review-card">
    <PanelHeading title="题目与标注内容" meta={item.submission ? `第 ${item.submission.round} 轮提交` : '尚未提交'} />
    <div className="agent-review-drawer-grid">
      <PreviewBlock title="题目原始数据" value={item.taskItem.rawData} />
      <PreviewBlock title="Labeler 提交答案" value={item.submission?.answers ?? {}} />
    </div>
  </article>
);

const AiReviewRecordPanel = ({ item }: { item: TaskFlowItemDto }) => (
  <article className={`agent-review-card agent-review-card--comment is-${aiTone(item.aiStatus)}`}>
    <PanelHeading title="AI 预审记录" meta={item.latestAiJob ? aiJobMeta(item.latestAiJob) : '无 AI job'} />
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

const TraceSidebar = ({ item }: { item: TaskFlowItemDto }) => (
  <aside className="agent-review-trace-sidebar" aria-label="当前题追溯">
    <section className="agent-review-trace-card agent-review-trace-current" aria-label={`当前题追溯（Q${item.index}）`}>
      <header className="agent-review-trace-current__header">
        <div>
          <span>当前题</span>
          <h3>
            Q{item.index} · {item.taskItem.externalId}
          </h3>
        </div>
        <span className={`agent-review-trace-status is-${itemTone(item)}`}>{shortItemStatusLabel(item)}</span>
      </header>
      <dl className="agent-review-trace-identifiers">
        <TraceSummaryItem label="提交轮次" value={item.submission ? `第${item.submission.round}轮` : '未提交'} />
        <TraceSummaryItem label="标注员" value={item.assignment?.assigneeName ?? '未领取'} />
        <TraceSummaryItem label="提交状态" value={item.submission?.status ?? '未提交'} />
      </dl>
      <ol className="agent-review-trace-timeline" aria-label="当前题流程节点">
        {itemTraceEvents(item).map((event) => (
          <TraceTimelineItem event={event} key={event.key} />
        ))}
      </ol>
    </section>
  </aside>
);

const TaskFlowTimeline = ({ flow }: { flow: TaskFlowSummaryDto | TaskFlowDetailDto }) => {
  const steps = buildTaskFlowTimeline(flow);

  return (
    <ol className="agent-review-task-timeline" aria-label="当前任务时间线">
      {steps.map((step, index) => (
        <li key={step.key} className={step.isComplete ? 'is-complete' : undefined}>
          <span className="agent-review-task-timeline__dot" aria-hidden="true" />
          {index < steps.length - 1 ? <span className="agent-review-task-timeline__track" aria-hidden="true" /> : null}
          <div className="agent-review-task-timeline__content">
            <span>{step.label}</span>
            <strong>{step.value}</strong>
            <small>{step.meta}</small>
          </div>
        </li>
      ))}
    </ol>
  );
};

type StatusTone = 'pass' | 'reject' | 'pending' | 'failed';

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

const PreviewBlock = ({ title, value }: { title: string; value: Record<string, unknown> }) => (
  <section className="agent-review-card">
    <PanelHeading title={title} />
    <div className="agent-review-value-preview">
      <pre className={Object.keys(value).length === 0 ? 'is-empty' : undefined}>{formatJson(value)}</pre>
    </div>
  </section>
);

const ScoreList = ({ scores }: { scores: Record<string, unknown> }) => {
  const entries = Object.entries(scores).filter(([, value]) => typeof value === 'number' || typeof value === 'string');

  if (entries.length === 0) {
    return null;
  }

  return (
    <dl className="agent-review-trace-identifiers">
      {entries.map(([key, value]) => (
        <TraceSummaryItem key={key} label={key} value={String(value)} />
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
  time: string | null;
  tone: StatusTone;
};

const TraceTimelineItem = ({ event }: { event: TraceEvent }) => (
  <li className={`is-${event.tone}`}>
    <span className="agent-review-trace-timeline__dot" aria-hidden="true" />
    <div className="agent-review-trace-timeline__body">
      <time>{event.time ? formatDateTimeSecond(event.time) : '未发生'}</time>
      <strong>{event.title}</strong>
      <p>{event.description}</p>
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

function itemTone(item: TaskFlowItemDto): StatusTone {
  if (item.finalStatus === 'FINAL_APPROVED') {
    return 'pass';
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
  if (item.labelerStatus === 'NEEDS_REVISION') {
    return 'revision';
  }
  if (item.reviewerStatus === 'PENDING') {
    return 'reviewerPending';
  }
  return 'inProgress';
}

function bucketTone(bucket: ItemStatusBucket): StatusTone {
  if (bucket === 'finalApproved') {
    return 'pass';
  }
  if (bucket === 'revision') {
    return 'reject';
  }
  return 'pending';
}

function shortItemStatusLabel(item: TaskFlowItemDto): string {
  if (item.finalStatus === 'FINAL_APPROVED') {
    return '最终完成';
  }
  if (item.labelerStatus === 'NEEDS_REVISION') {
    return '待 Labeler 修改';
  }
  if (item.reviewerStatus === 'PENDING') {
    return '待 Reviewer 复核';
  }
  if (item.reviewerStatus === 'REJECTED') {
    return 'Reviewer 已打回';
  }
  if (item.reviewerStatus === 'PASSED') {
    return 'Reviewer 已通过';
  }
  return AI_STATUS_LABELS[item.aiStatus];
}

function buildTaskFlowTimeline(flow: TaskFlowSummaryDto | TaskFlowDetailDto) {
  const submitted = flow.submittedItems;
  const total = flow.totalItems;
  const aiCompleted = flow.aiSummary.completed;
  const reviewerDecided = flow.reviewerSummary.decided;
  const finalCompleted = flow.finalSummary.completed;

  return [
    {
      key: 'created',
      label: '任务创建',
      value: formatDateTimeSecond(flow.createdAt),
      meta: flow.ownerName ?? 'Owner 未记录',
      isComplete: true,
    },
    {
      key: 'labeling',
      label: 'Labeler 标注',
      value: `${submitted.toLocaleString()} / ${total.toLocaleString()} 已提交`,
      meta: submitted < total ? '仍有题目未提交' : '标注提交已覆盖全部题目',
      isComplete: submitted >= total && total > 0,
    },
    {
      key: 'ai',
      label: 'AI 预审',
      value: `${aiCompleted.toLocaleString()} / ${submitted.toLocaleString()} AI 预审完成`,
      meta: `建议通过 ${flow.aiSummary.passed.toLocaleString()} · 建议打回 ${flow.aiSummary.rejected.toLocaleString()}`,
      isComplete: submitted > 0 && aiCompleted >= submitted,
    },
    {
      key: 'reviewer',
      label: 'Reviewer 复核',
      value: `${reviewerDecided.toLocaleString()} / ${submitted.toLocaleString()} 已决策`,
      meta: `待复核 ${flow.reviewerSummary.pending.toLocaleString()} · 打回 ${flow.reviewerSummary.rejected.toLocaleString()}`,
      isComplete: submitted > 0 && reviewerDecided >= submitted,
    },
    {
      key: 'labeler-revision',
      label: 'Labeler 修改',
      value: `${flow.labelerRevisionSummary.editable.toLocaleString()} 可修改 · ${flow.labelerRevisionSummary.locked.toLocaleString()} 锁定`,
      meta: `已修改 ${flow.labelerRevisionSummary.revised.toLocaleString()}`,
      isComplete: flow.labelerRevisionSummary.editable === 0 && flow.labelerRevisionSummary.revised > 0,
    },
    {
      key: 'rereview',
      label: 'Reviewer 再次复审',
      value: flow.round > 1 ? `第 ${flow.round.toLocaleString()} 轮` : '未进入再次复审',
      meta: flow.round > 1 ? `待复审 ${flow.reviewerSummary.pending.toLocaleString()}` : '首轮复核阶段',
      isComplete: flow.round > 1 && flow.reviewerSummary.pending === 0,
    },
    {
      key: 'final',
      label: '最终完成',
      value: `${finalCompleted.toLocaleString()} / ${total.toLocaleString()} 最终完成`,
      meta: `未最终完成 ${flow.finalSummary.notCompleted.toLocaleString()}`,
      isComplete: total > 0 && finalCompleted >= total,
    },
  ];
}

function itemTraceEvents(item: TaskFlowItemDto): TraceEvent[] {
  return [
    {
      key: 'submitted',
      title: 'Labeler 提交',
      description: item.submission ? `第 ${item.submission.round} 轮提交进入质检流程。` : '当前题尚未提交。',
      time: item.submission?.submittedAt ?? null,
      tone: item.submission ? 'pass' : 'pending',
    },
    {
      key: 'ai',
      title: 'AI 预审',
      description: AI_STATUS_LABELS[item.aiStatus],
      time: item.aiReview?.createdAt ?? item.latestAiJob?.updatedAt ?? null,
      tone: aiTone(item.aiStatus),
    },
    {
      key: 'reviewer',
      title: 'Reviewer 复核',
      description: REVIEWER_STATUS_LABELS[item.reviewerStatus],
      time: item.humanReview?.createdAt ?? null,
      tone: reviewerTone(item.reviewerStatus),
    },
    {
      key: 'labeler',
      title: 'Labeler 修改边界',
      description: LABELER_STATUS_LABELS[item.labelerStatus],
      time: item.submission?.submittedAt ?? null,
      tone: labelerTone(item.labelerStatus),
    },
    {
      key: 'final',
      title: '最终状态',
      description: FINAL_STATUS_LABELS[item.finalStatus],
      time: item.finalStatus === 'FINAL_APPROVED' ? item.humanReview?.createdAt ?? item.submission?.submittedAt ?? null : null,
      tone: item.finalStatus === 'FINAL_APPROVED' ? 'pass' : 'pending',
    },
  ];
}

function aiJobMeta(job: NonNullable<TaskFlowItemDto['latestAiJob']>): string {
  return [
    job.provider ?? 'provider 未记录',
    job.model ?? 'model 未记录',
    `${job.attempts.toLocaleString()} / ${job.maxAttempts.toLocaleString()} 次`,
  ].join(' · ');
}

function formatJson(value: Record<string, unknown>): string {
  if (Object.keys(value).length === 0) {
    return '未记录';
  }

  return JSON.stringify(value, null, 2);
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
