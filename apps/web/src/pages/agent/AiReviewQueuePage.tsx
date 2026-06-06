import {
  AI_REVIEW_STATUS_LABELS,
  SUBMISSION_STATUS_LABELS,
  type SubmissionStatus,
} from '@labelhub/shared';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import {
  getAiReviewBatch,
  listAiReviewBatches,
  type AiReviewBatchDecision,
  type AiReviewBatchDetailDto,
  type AiReviewBatchDto,
  type AiReviewFieldDto,
  type AiReviewBatchItemDto,
  type AiReviewJobDto,
  type AiReviewLogDto,
} from '../../api/aiReview';
import { listTasks } from '../../api/tasks';
import { AiPromptPreviewPanel, type AiPromptPreviewSection } from '../../components/AiPromptPreviewPanel';
import { PageLoading } from '../../components/PageLoading';
import { TableEmptyState } from '../../components/TableEmptyState';
import { ToastViewport, useToastController } from '../../components/ToastViewport';
import { createTaskDisplayIdMap } from '../owner/taskDisplayId';

const DECISION_LABELS: Record<AiReviewBatchDecision, string> = {
  pending: '等待预审',
  pass: '建议通过',
  reject: '建议打回',
  failed: '失败',
};

const QUESTION_DECISION_TABS: Array<{ label: string; value: AiReviewBatchDecision }> = [
  { label: '待审核', value: 'pending' },
  { label: '已通过', value: 'pass' },
  { label: '已打回', value: 'reject' },
];

const BATCH_STATUS_SUMMARY_FILTERS: Array<{
  label: string;
  summaryKey: keyof BatchStatusSummary;
  value: BatchStatusFilter;
}> = [
  { label: '总任务', summaryKey: 'total', value: 'ALL' },
  { label: '进行中', summaryKey: 'running', value: 'PENDING' },
  { label: '已完成', summaryKey: 'completed', value: 'COMPLETED' },
];

type FieldReviewDecision = 'pass' | 'pending' | 'reject';
type BatchStatusFilter = 'ALL' | 'PENDING' | 'COMPLETED';

type BatchStatusSummary = {
  completed: number;
  running: number;
  total: number;
};

type NormalizedFieldReview = {
  fieldKey: string;
  label: string;
  type: string;
  required: boolean;
  requirement: string;
  score: number | null;
  decision: FieldReviewDecision;
  comment: string;
  suggestions: string[];
};

type ItemReviewSummary = {
  decision: AiReviewBatchDecision;
  counts: Record<FieldReviewDecision, number>;
  rejectedLabels: string[];
  total: number;
};

const BATCH_TABLE_PAGE_SIZE = 10;
const SHEET_EXIT_ANIMATION_MS = 260;
type AiReviewBatchSortField = 'taskId' | 'submittedAt';
type AiReviewBatchSortDirection = 'asc' | 'desc';

export const AiReviewQueuePage = () => {
  const [batches, setBatches] = useState<AiReviewBatchDto[]>([]);
  const [taskDisplayIdByTaskId, setTaskDisplayIdByTaskId] = useState<Map<string, string>>(new Map());
  const [keyword, setKeyword] = useState('');
  const [batchStatusFilter, setBatchStatusFilter] = useState<BatchStatusFilter>('ALL');
  const [batchSortField, setBatchSortField] = useState<AiReviewBatchSortField | null>(null);
  const [batchSortDirection, setBatchSortDirection] = useState<AiReviewBatchSortDirection>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedBatch, setSelectedBatch] = useState<AiReviewBatchDto | null>(null);
  const [detail, setDetail] = useState<AiReviewBatchDetailDto | null>(null);
  const [selectedItemIndex, setSelectedItemIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isSheetClosing, setIsSheetClosing] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const { dismissToast, messages, showErrorToast } = useToastController();

  useEffect(() => {
    void loadBatches();
  }, []);

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    },
    [],
  );

  const batchSummary = useMemo<BatchStatusSummary>(
    () => ({
      completed: batches.filter((batch) => batch.status !== 'PENDING').length,
      running: batches.filter((batch) => batch.status === 'PENDING').length,
      total: batches.length,
    }),
    [batches],
  );

  const filteredBatches = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return batches.filter((batch) => {
      const taskDisplayId = taskDisplayIdByTaskId.get(batch.taskId) ?? batch.taskId;
      const matchesBatchStatus =
        batchStatusFilter === 'ALL' ||
        (batchStatusFilter === 'PENDING' ? batch.status === 'PENDING' : batch.status !== 'PENDING');

      if (!matchesBatchStatus) {
        return false;
      }

      if (!normalizedKeyword) {
        return true;
      }

      return [
        taskDisplayId,
        batch.taskTitle,
        batch.labelerName,
        ...batch.externalIds,
      ].some((value) => value.toLowerCase().includes(normalizedKeyword));
    });
  }, [batchStatusFilter, batches, keyword, taskDisplayIdByTaskId]);
  const sortedBatches = useMemo(() => {
    if (!batchSortField) {
      return filteredBatches;
    }

    return [...filteredBatches].sort((left, right) =>
      compareAiReviewBatchesBySortField(left, right, batchSortField, batchSortDirection, taskDisplayIdByTaskId),
    );
  }, [batchSortDirection, batchSortField, filteredBatches, taskDisplayIdByTaskId]);

  const totalPages = Math.max(1, Math.ceil(sortedBatches.length / BATCH_TABLE_PAGE_SIZE));
  const paginatedBatches = useMemo(() => {
    const startIndex = (currentPage - 1) * BATCH_TABLE_PAGE_SIZE;

    return sortedBatches.slice(startIndex, startIndex + BATCH_TABLE_PAGE_SIZE);
  }, [currentPage, sortedBatches]);

  useEffect(() => {
    setCurrentPage(1);
  }, [batchSortDirection, batchSortField, batchStatusFilter, keyword]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const loadBatches = async () => {
    setIsLoading(true);
    try {
      const [nextBatches, tasks] = await Promise.all([
        listAiReviewBatches(),
        listTasks().catch(() => []),
      ]);
      setBatches(nextBatches);
      setTaskDisplayIdByTaskId(createTaskDisplayIdMap(tasks));
      setSelectedBatch((current) =>
        current ? nextBatches.find((batch) => batch.batchId === current.batchId) ?? current : current,
      );
    } catch {
      setBatches([]);
      showErrorToast('AI 预审队列加载失败，请稍后重试。');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenBatch = async (batch: AiReviewBatchDto) => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setIsSheetClosing(false);
    setSelectedBatch(batch);
    setDetail(null);
    setSelectedItemIndex(0);
    setIsDetailLoading(true);

    try {
      const nextDetail = await getAiReviewBatch(batch.batchId);
      setDetail(nextDetail);
      setSelectedBatch(nextDetail);
    } catch {
      showErrorToast('AI 预审详情加载失败，请稍后重试。');
    } finally {
      setIsDetailLoading(false);
    }
  };

  const handleCloseDrawer = () => {
    if (!selectedBatch || isSheetClosing || closeTimerRef.current !== null) {
      return;
    }

    setIsSheetClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      setSelectedBatch(null);
      setDetail(null);
      setSelectedItemIndex(0);
      setIsSheetClosing(false);
      closeTimerRef.current = null;
    }, SHEET_EXIT_ANIMATION_MS);
  };

  const handleSort = (field: AiReviewBatchSortField) => {
    if (batchSortField === field) {
      setBatchSortDirection((direction) => (direction === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setBatchSortField(field);
    setBatchSortDirection('asc');
  };

  return (
    <section className="ai-review-page agent-review-page" aria-labelledby="ai-review-title">
      <ToastViewport messages={messages} onDismiss={dismissToast} />

      <header className="agent-review-page__header">
        <div>
          <h1 id="ai-review-title">AI 自动预审队列</h1>
          <p className="task-management-table-description">
            集中查看待 AI 预审的任务提交批次、标注员、题目数量和审核结论，支持快速定位预审结果
          </p>
        </div>
      </header>

      {isLoading && batches.length === 0 ? (
        <PageLoading className="page-loading--compact" title="正在加载 AI 预审队列" />
      ) : (
        <AiReviewBatchTable
          batches={paginatedBatches}
          batchStatusFilter={batchStatusFilter}
          batchSummary={batchSummary}
          currentPage={currentPage}
          keyword={keyword}
          sortDirection={batchSortDirection}
          sortField={batchSortField}
          selectedBatchId={selectedBatch?.batchId ?? null}
          taskDisplayIdByTaskId={taskDisplayIdByTaskId}
          totalPages={totalPages}
          onBatchStatusFilterChange={setBatchStatusFilter}
          onKeywordChange={setKeyword}
          onSort={handleSort}
          onOpenBatch={(batch) => void handleOpenBatch(batch)}
          onPageChange={setCurrentPage}
        />
      )}

      <AiReviewSheetPortal>
        {selectedBatch ? (
          <AiReviewBatchSheet
            batch={detail ?? selectedBatch}
            detail={detail}
            isClosing={isSheetClosing}
            isLoading={isDetailLoading}
            selectedItemIndex={selectedItemIndex}
            onClose={handleCloseDrawer}
            onSelectItem={setSelectedItemIndex}
          />
        ) : null}
      </AiReviewSheetPortal>
    </section>
  );
};

const AiReviewSheetPortal = ({ children }: { children: ReactNode }) => {
  if (!children) {
    return null;
  }
  if (typeof document === 'undefined') {
    return <>{children}</>;
  }

  return createPortal(children, document.body);
};

const AiReviewBatchTable = ({
  batches,
  batchStatusFilter,
  batchSummary,
  currentPage,
  keyword,
  onBatchStatusFilterChange,
  onKeywordChange,
  onSort,
  onOpenBatch,
  onPageChange,
  selectedBatchId,
  taskDisplayIdByTaskId,
  sortDirection,
  sortField,
  totalPages,
}: {
  batches: AiReviewBatchDto[];
  batchStatusFilter: BatchStatusFilter;
  batchSummary: BatchStatusSummary;
  currentPage: number;
  keyword: string;
  onBatchStatusFilterChange: (status: BatchStatusFilter) => void;
  onKeywordChange: (keyword: string) => void;
  onSort: (field: AiReviewBatchSortField) => void;
  onOpenBatch: (batch: AiReviewBatchDto) => void;
  onPageChange: (page: number) => void;
  selectedBatchId: string | null;
  taskDisplayIdByTaskId: ReadonlyMap<string, string>;
  sortDirection: AiReviewBatchSortDirection;
  sortField: AiReviewBatchSortField | null;
  totalPages: number;
}) => {
  const handleRowClick = (event: MouseEvent<HTMLTableRowElement>, batch: AiReviewBatchDto) => {
    if (shouldIgnoreRowOpen(event.target) || hasActiveTextSelection()) {
      return;
    }

    onOpenBatch(batch);
  };

  const handleRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, batch: AiReviewBatchDto) => {
    if (shouldIgnoreRowOpen(event.target)) {
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpenBatch(batch);
    }
  };

  return (
    <div className="task-management-table-card agent-review-table-panel">
      <div className="task-management-table-toolbar agent-review-table-toolbar">
        <section className="task-summary-grid template-summary-grid" role="region" aria-label="AI 预审状态筛选">
          {BATCH_STATUS_SUMMARY_FILTERS.map((item) => (
            <BatchSummaryCard
              key={item.value}
              isActive={batchStatusFilter === item.value}
              label={item.label}
              status={item.value}
              value={batchSummary[item.summaryKey].toString()}
              onClick={() => onBatchStatusFilterChange(item.value)}
            />
          ))}
        </section>
        <div className="task-filter-bar agent-review-filter">
          <input
            aria-label="搜索任务级 AI 预审批次"
            placeholder="搜索任务名 / 标注员 / 题目ID"
            value={keyword}
            onChange={(event) => onKeywordChange(event.target.value)}
          />
        </div>
      </div>

      <div className="task-table-scroll" data-adaptive-table-viewport="true">
        <table className="task-table agent-review-batch-table" aria-label="任务级 AI 预审队列表格">
          <colgroup>
            <col className="task-table__col-id" />
            <col className="agent-review-batch-table__col-title" />
            <col className="agent-review-batch-table__col-labeler" />
            <col className="agent-review-batch-table__col-submitted" />
            <col className="agent-review-batch-table__col-count" />
            <col className="agent-review-batch-table__col-decision" />
          </colgroup>
          <thead>
            <tr>
              <th>
                <SortableAiReviewHeader
                  field="taskId"
                  label="任务ID"
                  sortDirection={sortDirection}
                  sortField={sortField}
                  onSort={onSort}
                />
              </th>
              <th>任务名称</th>
              <th>标注员</th>
              <th>
                <SortableAiReviewHeader
                  field="submittedAt"
                  label="提交时间"
                  sortDirection={sortDirection}
                  sortField={sortField}
                  onSort={onSort}
                />
              </th>
              <th>题目数</th>
              <th>AI 建议</th>
            </tr>
          </thead>
          <tbody key={currentPage} className="task-table__body">
            {batches.length > 0 ? (
              batches.map((batch) => {
                const taskDisplayId = taskDisplayIdByTaskId.get(batch.taskId) ?? batch.taskId;

                return (
                  <tr
                    key={batch.batchId}
                    className={[
                      'task-table__row',
                      'agent-review-batch-table__row',
                      selectedBatchId === batch.batchId ? 'is-active' : '',
                    ].filter(Boolean).join(' ')}
                    aria-label={`查看 ${taskDisplayId} ${batch.taskTitle} AI 预审详情`}
                    tabIndex={0}
                    onClick={(event) => handleRowClick(event, batch)}
                    onKeyDown={(event) => handleRowKeyDown(event, batch)}
                  >
                    <td className="task-table__id">
                      <TableCellInner>
                        <code>{taskDisplayId}</code>
                      </TableCellInner>
                    </td>
                    <td>
                      <TableCellInner>
                        <span className="task-title-link">{batch.taskTitle}</span>
                      </TableCellInner>
                    </td>
                    <td>
                      <TableCellInner>{batch.labelerName}</TableCellInner>
                    </td>
                    <td className="task-table__date-column">
                      <TableCellInner>
                        <DateTimeCell value={batch.submittedAt} />
                      </TableCellInner>
                    </td>
                    <td>
                      <TableCellInner>{batch.itemCount.toLocaleString()} 题</TableCellInner>
                    </td>
                    <td>
                      <TableCellInner>
                        <DecisionPill decision={batch.aggregateDecision} label={batch.aiSuggestionLabel} />
                      </TableCellInner>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr className="task-table__empty-row">
                <td colSpan={6}>
                  <TableEmptyState title="暂无任务级 AI 预审记录" illustrationAlt="空预审队列插画" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="task-table-pagination" aria-label="任务级 AI 预审队列分页">
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

const BatchSummaryCard = ({
  isActive,
  label,
  onClick,
  status,
  value,
}: {
  isActive: boolean;
  label: string;
  onClick: () => void;
  status: BatchStatusFilter;
  value: string;
}) => (
  <button
    className={[
      'task-summary-card',
      status === 'ALL' ? 'task-summary-card--total' : '',
      status === 'PENDING' ? 'task-summary-card--running' : '',
      status === 'COMPLETED' ? 'task-summary-card--done' : '',
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

const TableCellInner = ({ children }: { children: ReactNode }) => (
  <div className="task-table__cell-inner">{children}</div>
);

const SortableAiReviewHeader = ({
  field,
  label,
  sortDirection,
  sortField,
  onSort,
}: {
  field: AiReviewBatchSortField;
  label: string;
  sortDirection: AiReviewBatchSortDirection;
  sortField: AiReviewBatchSortField | null;
  onSort: (field: AiReviewBatchSortField) => void;
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

const parseAiReviewBatchDisplayId = (value: string): number | null => {
  const match = /^T-(\d+)$/i.exec(value);
  if (!match || !match[1]) {
    return null;
  }

  const parsed = Number.parseInt(match[1], 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const parseAiReviewBatchTimestamp = (value?: string | null): number | null => {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const compareAiReviewBatchesBySortField = (
  left: AiReviewBatchDto,
  right: AiReviewBatchDto,
  sortField: AiReviewBatchSortField,
  sortDirection: AiReviewBatchSortDirection,
  taskDisplayIdByTaskId: ReadonlyMap<string, string>,
): number => {
  const multiplier = sortDirection === 'asc' ? 1 : -1;

  if (sortField === 'submittedAt') {
    const leftSubmittedAt = parseAiReviewBatchTimestamp(left.submittedAt);
    const rightSubmittedAt = parseAiReviewBatchTimestamp(right.submittedAt);

    if (leftSubmittedAt === null && rightSubmittedAt === null) {
      return left.batchId.localeCompare(right.batchId);
    }

    if (leftSubmittedAt === null) {
      return 1;
    }

    if (rightSubmittedAt === null) {
      return -1;
    }

    if (leftSubmittedAt !== rightSubmittedAt) {
      return (leftSubmittedAt - rightSubmittedAt) * multiplier;
    }

    return left.batchId.localeCompare(right.batchId);
  }

  const leftDisplayId = taskDisplayIdByTaskId.get(left.taskId) ?? left.taskId;
  const rightDisplayId = taskDisplayIdByTaskId.get(right.taskId) ?? right.taskId;
  const leftNumber = parseAiReviewBatchDisplayId(leftDisplayId);
  const rightNumber = parseAiReviewBatchDisplayId(rightDisplayId);

  if (leftNumber !== null && rightNumber !== null && leftNumber !== rightNumber) {
    return (leftNumber - rightNumber) * multiplier;
  }

  const displayIdDiff = leftDisplayId.localeCompare(rightDisplayId);
  return displayIdDiff === 0 ? left.taskId.localeCompare(right.taskId) : displayIdDiff * multiplier;
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

const AiReviewBatchSheet = ({
  batch,
  detail,
  isClosing,
  isLoading,
  onClose,
  onSelectItem,
  selectedItemIndex,
}: {
  batch: AiReviewBatchDto | AiReviewBatchDetailDto;
  detail: AiReviewBatchDetailDto | null;
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
          <section className="agent-review-detail-summary-card" aria-label="AI 预审详情摘要">
            <div className="agent-review-detail-summary-card__top">
              <div className="agent-review-detail-summary-heading">
                <div className="agent-review-detail-summary-title-group">
                  <div className="agent-review-detail-summary-title-row">
                    <h2 id="agent-review-detail-title" className="agent-review-detail-summary-card__title">
                      AI 预审详情 · {batch.taskTitle}
                    </h2>
                    <span className="agent-review-detail-summary-title-count">
                      <span aria-hidden="true">•</span>
                      {batch.itemCount.toLocaleString()} 题
                    </span>
                    <SummaryDecisionPill decision={batch.aggregateDecision} label={batch.aiSuggestionLabel} />
                  </div>
                  <div className="agent-review-detail-summary-subline" aria-label="模板和人员信息">
                    <span className="agent-review-detail-summary-card__subtitle">
                      {templateNameLabel(batch)} · {templateVersionLabel(batch)}
                    </span>
                    <span className="agent-review-detail-summary-inline-meta">
                      <span className="agent-review-detail-summary-inline-meta__item">
                        <span>任务 Owner</span>
                        <strong>{ownerNameLabel(batch)}</strong>
                      </span>
                      <span className="agent-review-detail-summary-inline-meta__item">
                        <span>标注员</span>
                        <strong>{batch.labelerName}</strong>
                      </span>
                    </span>
                  </div>
                </div>
              </div>
              <button className="agent-review-sheet-close" type="button" aria-label="关闭 AI 预审详情" onClick={onClose}>
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <TaskTimeline batch={batch} items={items} />
          </section>
        </header>

        {isLoading ? (
          <PageLoading className="page-loading--compact" title="正在加载批次详情" />
        ) : (
          <div className="agent-review-drawer-body">
            {items.length > 0 ? (
              <div className="agent-review-sheet-layout">
                <QuestionList items={items} selectedIndex={selectedItemIndex} onSelect={onSelectItem} />
                <div className="agent-review-sheet-main">
                  {selectedItem ? (
                    <>
                      <ItemReviewResultStrip item={selectedItem} />
                      <FieldReviewPanel item={selectedItem} />
                      <AiOverallCommentPanel item={selectedItem} />
                      <TechnicalDetailsPanel item={selectedItem} />
                    </>
                  ) : null}
                </div>
                {selectedItem ? <TraceSidebar batch={batch} item={selectedItem} /> : null}
              </div>
            ) : (
              <TableEmptyState title="暂无批次详情" illustrationAlt="空批次详情插画" />
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
  items: AiReviewBatchItemDto[];
  onSelect: (index: number) => void;
  selectedIndex: number;
}) => {
  const selectedDecision = items[selectedIndex]?.decision ?? 'pending';
  const [activeDecision, setActiveDecision] = useState<AiReviewBatchDecision>(selectedDecision);
  const decisionCounts = QUESTION_DECISION_TABS.reduce<Record<AiReviewBatchDecision, number>>(
    (counts, tab) => ({
      ...counts,
      [tab.value]: items.filter((item) => item.decision === tab.value).length,
    }),
    {
      failed: 0,
      pass: 0,
      pending: 0,
      reject: 0,
    },
  );
  const activeDecisionLabel = QUESTION_DECISION_TABS.find((tab) => tab.value === activeDecision)?.label ?? DECISION_LABELS[activeDecision];
  const filteredItems = items
    .map((item, index) => ({ index, item }))
    .filter(({ item }) => item.decision === activeDecision);

  const handleDecisionClick = (decision: AiReviewBatchDecision) => {
    setActiveDecision(decision);
    const nextIndex = items.findIndex((item) => item.decision === decision);
    if (nextIndex >= 0) {
      onSelect(nextIndex);
    }
  };

  return (
    <aside className="agent-review-question-list" aria-label="批次内题目列表">
      <div className="agent-review-question-status-tabs" role="tablist" aria-label="题目审核状态统计">
        {QUESTION_DECISION_TABS.map((tab) => {
          const count = decisionCounts[tab.value];

          return (
            <button
              key={tab.value}
              type="button"
              className={`${activeDecision === tab.value ? 'is-active ' : ''}is-${decisionTone(tab.value)}`}
              role="tab"
              aria-selected={activeDecision === tab.value}
              onClick={() => handleDecisionClick(tab.value)}
            >
              {tab.label}
              <span>{count.toLocaleString()}</span>
            </button>
          );
        })}
      </div>
      <div className="agent-review-question-list__header">
        <strong>{activeDecisionLabel}题目</strong>
        <span>{filteredItems.length.toLocaleString()} / {items.length.toLocaleString()} 题</span>
      </div>
      <div className="agent-review-question-list__items" role="tablist" aria-label="批次内题目切换">
        {filteredItems.length > 0 ? filteredItems.map(({ item, index }) => (
          <button
            key={item.submission.id}
            type="button"
            className={selectedIndex === index ? 'is-active' : ''}
            role="tab"
            aria-selected={selectedIndex === index}
            onClick={() => onSelect(index)}
          >
            <span className={`agent-review-question-list__dot is-${decisionTone(item.decision)}`} aria-hidden="true" />
            <span className="agent-review-question-list__text">
              <strong>Q{item.index}</strong>
              <small>{item.taskItem.externalId}</small>
            </span>
            <em className={questionDecisionLabelClass(item.decision)}>{DECISION_LABELS[item.decision]}</em>
          </button>
        )) : <EmptyPanelText>暂无{activeDecisionLabel}题目。</EmptyPanelText>}
      </div>
    </aside>
  );
};

const ItemReviewResultStrip = ({ item }: { item: AiReviewBatchItemDto }) => {
  const summary = itemReviewSummary(item);
  const meta = [
    `AI 预审字段 ${summary.total.toLocaleString()} 个`,
    `通过 ${summary.counts.pass.toLocaleString()}`,
    `打回 ${summary.counts.reject.toLocaleString()}`,
    summary.counts.pending > 0 ? `待预审 ${summary.counts.pending.toLocaleString()}` : '',
  ].filter(Boolean).join(' · ');

  return (
    <section className={`agent-review-result-strip is-${decisionTone(summary.decision)}`} aria-label="当前题结果">
      <div>
        <strong>{itemResultTitle(summary.decision)}</strong>
        <span>{meta}</span>
      </div>
      {summary.rejectedLabels.length > 0 ? (
        <p>
          打回字段：
          <span>{summary.rejectedLabels.join('、')}</span>
        </p>
      ) : null}
    </section>
  );
};

const FieldReviewPanel = ({ item }: { item: AiReviewBatchItemDto }) => {
  const rows = fieldReviewRows(item);

  return (
    <article className="agent-review-card agent-review-card--fields">
      <PanelHeading title="字段预审结果" meta={`含 Labeler 提交内容 · ${rows.length.toLocaleString()} 个字段`} />
      {rows.length > 0 ? (
        <div className="agent-review-field-list" role="list" aria-label="字段预审结果列表">
          {rows.map((row) => {
            const title = formatFieldReviewTitle(row.label, row.fieldKey);

            return (
              <section
                key={row.fieldKey}
                className={`agent-review-field-block is-${row.decision}`}
                role="listitem"
                aria-label={`${title} AI 预审结果`}
              >
                <header className="agent-review-field-block__header">
                  <div>
                    <strong>{title}</strong>
                  </div>
                  <FieldDecisionPill decision={row.decision} />
                </header>

                <div className="agent-review-field-block__rule">
                  <span>预审规则</span>
                  <RulePreview requirement={row.requirement} />
                </div>

                <section className="agent-review-field-block__submission" aria-label={`${row.label} Labeler 提交内容`}>
                  <span>Labeler 提交内容</span>
                  <ValuePreview type={row.type} value={item.submission.answers[row.fieldKey]} />
                </section>

                <div className="agent-review-field-block__ai">
                  <div>
                    <span>AI 说明</span>
                    <p>{row.comment || '暂无 AI 评价。'}</p>
                  </div>
                  <div>
                    <span>修改建议</span>
                    <p>{row.suggestions.length > 0 ? row.suggestions.join('；') : '-'}</p>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <EmptyPanelText>{fieldReviewEmptyText(item)}</EmptyPanelText>
      )}
    </article>
  );
};

const AiOverallCommentPanel = ({ item }: { item: AiReviewBatchItemDto }) => (
  <article className={`agent-review-card agent-review-card--comment is-${decisionTone(item.decision)}`}>
    <PanelHeading title="AI 总评" />
    <div className="agent-review-comment-box">
      <strong>{DECISION_LABELS[item.decision]}</strong>
      <p>{overallComment(item)}</p>
    </div>
  </article>
);

const TechnicalDetailsPanel = ({ item }: { item: AiReviewBatchItemDto }) => {
  const promptPreview = useMemo(
    () => buildReviewPromptPreview(item.reviewRecord?.rawPrompt),
    [item.reviewRecord?.rawPrompt],
  );

  return (
    <section className="agent-review-technical-sections" aria-label="技术信息">
      <TechnicalDetails title="查看审核 Prompt">
        <PanelHeading title="审核 Prompt" meta={promptRuleLabel(item.reviewRecord?.ruleId)} />
        {promptPreview ? (
          <AiPromptPreviewPanel
            fullPrompt={promptPreview.fullPrompt}
            fullPromptMeta="本题真实运行 Prompt"
            readOnly
            sectionAriaLabel={(section) => `查看${section.title}`}
            sections={promptPreview.sections}
          />
        ) : (
          <pre>本题暂未记录真实审核 Prompt。</pre>
        )}
      </TechnicalDetails>
    </section>
  );
};

const TechnicalDetails = ({ children, title }: { children: ReactNode; title: string }) => (
  <details className="agent-review-technical-section">
    <summary>{title}</summary>
    <div>{children}</div>
  </details>
);

const TraceSidebar = ({
  batch,
  item,
}: {
  batch: AiReviewBatchDto | AiReviewBatchDetailDto;
  item: AiReviewBatchItemDto;
}) => {
  const traceEvents = buildTraceEvents(batch, item);

  return (
    <aside className="agent-review-trace-sidebar" aria-label="当前题追溯">
      <div className="agent-review-trace-tabs" role="tablist" aria-label="追溯视图">
        <button className="is-active" type="button" role="tab" aria-selected="true">
          当前题
        </button>
      </div>
      <section className="agent-review-trace-card agent-review-trace-current" aria-label={`当前题追溯（Q${item.index}）`}>
        <header className="agent-review-trace-current__header">
          <div>
            <span>当前题</span>
            <h3>
              Q{item.index} · {item.taskItem.externalId}
            </h3>
          </div>
          <span className={`agent-review-trace-status is-${decisionTone(item.decision)}`}>
            {DECISION_LABELS[item.decision]}
          </span>
        </header>
        <dl className="agent-review-trace-identifiers">
          <TraceSummaryItem label="轮次" value={`第${item.submission.round}轮`} />
          <TraceSummaryItem label="状态" value={submissionStatusLabel(item.submission.status)} />
          <TraceSummaryItem label="AI 状态" value={aiReviewStatusLabel(item.job.status)} />
        </dl>
        <ol className="agent-review-trace-timeline" aria-label="当前题流程节点">
          {traceEvents.map((event) => (
            <TraceTimelineItem event={event} key={event.key} />
          ))}
        </ol>
      </section>
    </aside>
  );
};

const TraceSummaryItem = ({ label, value }: { label: string; value: ReactNode }) => (
  <div>
    <dt>{label}</dt>
    <dd>{value || '未记录'}</dd>
  </div>
);

const TraceTimelineItem = ({ event }: { event: TraceEvent }) => (
  <li className={`is-${event.tone}`}>
    <span className="agent-review-trace-timeline__dot" aria-hidden="true" />
    <div className="agent-review-trace-timeline__body">
      <time>{formatDateTimeSecond(event.time)}</time>
      <strong>{event.title}</strong>
      <p>{event.description}</p>
      {event.meta.length > 0 ? (
        <dl>
          {event.meta.map((meta) => (
            <div key={`${event.key}-${meta.label}`}>
              <dt>{meta.label}</dt>
              <dd>{meta.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  </li>
);

const RulePreview = ({ requirement }: { requirement: string }) => (
  <p className={requirement ? 'agent-review-rule-preview' : 'agent-review-rule-preview is-empty'}>
    {requirement || '未记录字段预审规则。'}
  </p>
);

const ValuePreview = ({ type, value }: { type?: string; value: unknown }) => {
  const chips = fieldValueChips(value, type);

  if (chips.length > 0) {
    return (
      <div className="agent-review-value-chips">
        {chips.map((chip) => (
          <span key={chip}>{chip}</span>
        ))}
      </div>
    );
  }

  const displayValue = formatFieldValue(value);
  const isEmpty = displayValue === '未选择';

  return (
    <div className="agent-review-value-preview">
      <pre className={isEmpty ? 'is-empty' : undefined}>{displayValue}</pre>
    </div>
  );
};

const EmptyPanelText = ({ children }: { children: ReactNode }) => (
  <p className="agent-review-empty-text">{children}</p>
);

const PanelHeading = ({ meta, title }: { meta?: ReactNode; title: string }) => (
  <div className="agent-review-card__heading">
    <h3>{title}</h3>
    {meta ? <span>{meta}</span> : null}
  </div>
);

const DecisionPill = ({ decision, label }: { decision: AiReviewBatchDecision; label: string }) => {
  const tone = decisionTone(decision);

  return (
    <span className={`agent-review-decision-pill is-${tone}`}>
      {tone === 'pass' ? <span className="status-tag__dot" aria-hidden="true" /> : null}
      {label}
    </span>
  );
};

const SummaryDecisionPill = ({ decision, label }: { decision: AiReviewBatchDecision; label: string }) => (
  <span className={`agent-review-detail-summary-status is-${decisionTone(decision)}`}>
    <SummaryStatusIcon decision={decision} />
    {label}
  </span>
);

const SummaryStatusIcon = ({ decision }: { decision: AiReviewBatchDecision }) => {
  const tone = decisionTone(decision);

  if (tone === 'pass') {
    return (
      <svg aria-hidden="true" viewBox="0 0 16 16" focusable="false">
        <path d="M13.2 4.5 6.6 11.1 3.2 7.7" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" focusable="false">
      <circle cx="8" cy="8" r="6.2" />
      <path d={tone === 'pending' ? 'M8 4.5v4l2.6 1.5' : 'M8 4.4v4.5'} />
      {tone === 'pending' ? null : <path d="M8 11.4h.1" />}
    </svg>
  );
};

const TaskTimeline = ({
  batch,
  items,
}: {
  batch: AiReviewBatchDto | AiReviewBatchDetailDto;
  items: readonly AiReviewBatchItemDto[];
}) => {
  const events = buildTaskTimelineEvents(batch, items);

  return (
    <ol className="agent-review-task-timeline" aria-label="当前任务时间线">
      {events.map((event, index) => (
        <li key={event.key} className={event.isComplete ? 'is-complete' : undefined}>
          <span className="agent-review-task-timeline__dot" aria-hidden="true" />
          {index < events.length - 1 ? <span className="agent-review-task-timeline__track" aria-hidden="true" /> : null}
          <div className="agent-review-task-timeline__content">
            <span>{event.label}</span>
            <strong>{event.actor}</strong>
            <time dateTime={event.time}>{formatDateTimeSecond(event.time)}</time>
          </div>
        </li>
      ))}
    </ol>
  );
};

const FieldDecisionPill = ({ decision }: { decision: FieldReviewDecision }) => (
  <span className={`agent-review-field-decision is-${decision}`}>{FIELD_DECISION_LABELS[decision]}</span>
);

const FIELD_DECISION_LABELS: Record<FieldReviewDecision, string> = {
  pass: '通过',
  pending: '待预审',
  reject: '打回',
};

function formatFieldReviewTitle(label: string, fieldKey: string): string {
  const normalizedLabel = label.trim();
  const normalizedFieldKey = fieldKey.trim();

  if (!normalizedLabel || normalizedLabel === normalizedFieldKey) {
    return normalizedFieldKey || normalizedLabel;
  }

  return `${normalizedLabel} · ${normalizedFieldKey}`;
}

function fieldReviewRows(item: AiReviewBatchItemDto): NormalizedFieldReview[] {
  const outputReviews = fieldReviewsFromStructuredOutput(item.reviewRecord?.structuredOutput);
  const reviewFields = reviewFieldsForItem(item);
  const rows = reviewFields.map((field) => {
    const review = outputReviews.find((candidate) => candidate.fieldKey === field.fieldKey);
    const fallbackDecision: FieldReviewDecision = 'pending';

    return review ? {
      ...review,
      label: review.label || field.label,
      type: field.type,
      required: field.required,
      requirement: field.requirement,
    } : {
      fieldKey: field.fieldKey,
      label: field.label,
      type: field.type,
      required: field.required,
      requirement: field.requirement,
      score: null,
      decision: fallbackDecision,
      comment: item.reviewRecord ? '该字段暂无字段级 AI 评价。' : 'AI 预审尚未输出字段结果。',
      suggestions: [],
    };
  });
  return reviewFields.length > 0 ? rows : outputReviews;
}

function reviewFieldsForItem(item: AiReviewBatchItemDto): AiReviewFieldDto[] {
  if ((item.reviewFields ?? []).length > 0) {
    return item.reviewFields;
  }

  return fieldReviewsFromStructuredOutput(item.reviewRecord?.structuredOutput).map((review) => ({
    fieldKey: review.fieldKey,
    label: review.label,
    type: 'unknown',
    required: false,
    requirement: review.requirement,
  }));
}

function fieldReviewsFromStructuredOutput(value: Record<string, unknown> | null | undefined): NormalizedFieldReview[] {
  const fieldReviews = value?.fieldReviews;

  if (!Array.isArray(fieldReviews)) {
    return [];
  }

  return fieldReviews
    .map((item) => normalizeFieldReview(item))
    .filter((item): item is NormalizedFieldReview => item !== null);
}

function normalizeFieldReview(value: unknown): NormalizedFieldReview | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const fieldKey = stringValue(record.fieldKey);

  if (!fieldKey) {
    return null;
  }

  return {
    fieldKey,
    label: stringValue(record.label) || fieldKey,
    type: stringValue(record.type) || 'unknown',
    required: Boolean(record.required),
    requirement: stringValue(record.requirement || record.rule || record.criteria),
    score: numericFieldScore(record.score),
    decision: normalizeFieldDecision(record.decision),
    comment: stringValue(record.comment || record.reason),
    suggestions: normalizeSuggestions(record.suggestions),
  };
}

function itemReviewSummary(item: AiReviewBatchItemDto): ItemReviewSummary {
  const rows = fieldReviewRows(item);
  const counts = fieldReviewCounts(rows);
  const rejectedLabels = rows.filter((row) => row.decision === 'reject').map((row) => row.label || row.fieldKey);

  return {
    counts,
    decision: itemDecisionFromFieldRows(item, rows),
    rejectedLabels,
    total: rows.length,
  };
}

function itemDecisionFromFieldRows(
  item: AiReviewBatchItemDto,
  rows: readonly NormalizedFieldReview[],
): AiReviewBatchDecision {
  if (item.decision === 'failed') {
    return 'failed';
  }
  if (rows.some((row) => row.decision === 'reject')) {
    return 'reject';
  }
  if (rows.length > 0 && rows.every((row) => row.decision === 'pass')) {
    return 'pass';
  }
  if (rows.some((row) => row.decision === 'pending')) {
    return 'pending';
  }

  return item.decision;
}

function itemResultTitle(decision: AiReviewBatchDecision): string {
  if (decision === 'pass') {
    return '本题建议通过';
  }
  if (decision === 'reject') {
    return '本题建议打回';
  }
  if (decision === 'failed') {
    return '本题预审失败';
  }

  return '本题等待预审';
}

function fieldReviewCounts(rows: readonly NormalizedFieldReview[]): Record<FieldReviewDecision, number> {
  return rows.reduce<Record<FieldReviewDecision, number>>(
    (counts, row) => ({
      ...counts,
      [row.decision]: counts[row.decision] + 1,
    }),
    {
      pass: 0,
      pending: 0,
      reject: 0,
    },
  );
}

function normalizeFieldDecision(value: unknown): FieldReviewDecision {
  if (value === 'pass' || value === true) {
    return 'pass';
  }
  if (value === 'reject' || value === false) {
    return 'reject';
  }
  if (value === 'manual') {
    return 'reject';
  }

  return 'pending';
}

function normalizeSuggestions(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(stringValue).filter(Boolean);
  }

  const suggestion = stringValue(value);

  return suggestion ? [suggestion] : [];
}

function numericFieldScore(value: unknown): number | null {
  const numericValue = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;

  return Number.isFinite(numericValue) ? Math.max(0, Math.min(100, Math.round(numericValue))) : null;
}

function overallComment(item: AiReviewBatchItemDto): string {
  const structuredOutput = item.reviewRecord?.structuredOutput;
  const comment = structuredOutput ? stringValue(structuredOutput.overallComment || structuredOutput.reason) : '';

  return comment || item.reviewRecord?.comment || item.job.lastError || '暂无 AI 总评。';
}

function fieldReviewEmptyText(item: AiReviewBatchItemDto): string {
  if (item.reviewFields.length === 0 && !item.reviewRecord) {
    return '当前模板没有开启 AI 预审字段，或 AI 预审尚未开始。';
  }
  if (item.reviewRecord) {
    return '该历史记录未保存字段级预审结果。';
  }

  return 'AI 预审尚未输出字段结果。';
}

function fieldValueChips(value: unknown, type?: string): string[] {
  const isChoiceField = type === 'radio' || type === 'checkbox' || type === 'tag_select';

  if (Array.isArray(value) && value.length > 0 && value.every(isPrimitiveFieldValue)) {
    return value.map((item) => String(item));
  }
  if (isChoiceField && isPrimitiveFieldValue(value) && String(value).trim()) {
    return [String(value)];
  }

  return [];
}

function isPrimitiveFieldValue(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '未选择';
  }
  if (Array.isArray(value) && value.length === 0) {
    return '未选择';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return formatJson(value);
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function decisionTone(decision: AiReviewBatchDecision): 'failed' | 'pass' | 'pending' | 'reject' {
  if (decision === 'failed') {
    return 'failed';
  }
  if (decision === 'pass') {
    return 'pass';
  }
  if (decision === 'reject') {
    return 'reject';
  }

  return 'pending';
}

function questionDecisionLabelClass(decision: AiReviewBatchDecision): 'is-pass' | 'is-reject' {
  return decision === 'pass' ? 'is-pass' : 'is-reject';
}

function promptRuleLabel(ruleId?: string | null): string {
  return ruleId ? `规则：${ruleId}` : '规则：未记录';
}

type TraceEventTone = 'danger' | 'info' | 'neutral' | 'success' | 'warning';

type TaskTimelineEvent = {
  actor: string;
  isComplete: boolean;
  key: string;
  label: string;
  time: string;
};

type TraceEvent = {
  key: string;
  title: string;
  description: string;
  time: string | null;
  tone: TraceEventTone;
  meta: Array<{ label: string; value: string }>;
};

function buildTaskTimelineEvents(
  batch: AiReviewBatchDto | AiReviewBatchDetailDto,
  items: readonly AiReviewBatchItemDto[],
): TaskTimelineEvent[] {
  const candidates: Array<{ actor: string; key: string; label: string; time?: string | null }> = [
    {
      actor: ownerNameLabel(batch),
      key: 'owner-created',
      label: 'Owner 发起任务',
      time: batch.taskCreatedAt ?? batch.submittedAt,
    },
    {
      actor: batch.labelerName,
      key: 'submission',
      label: 'Labeler 提交',
      time: earliestTimelineTime([batch.submittedAt, ...items.map((item) => item.submission.submittedAt)]),
    },
    {
      actor: 'AI Agent',
      key: 'queue',
      label: 'AI 预审入队',
      time: earliestTimelineTime(items.map((item) => item.job.queuedAt)),
    },
    {
      actor: 'AI Agent',
      key: 'start',
      label: '开始预审',
      time: earliestTimelineTime(items.map((item) => item.job.startedAt)),
    },
    {
      actor: 'AI Agent',
      key: 'review',
      label: '生成结论',
      time: latestTimelineTime(items.map((item) => item.reviewRecord?.createdAt)),
    },
    {
      actor: 'AI Agent',
      key: 'finish',
      label: '预审完成',
      time: latestTimelineTime(items.map((item) => item.job.finishedAt)),
    },
    {
      actor: batch.aiSuggestionLabel,
      key: 'update',
      label: '当前状态',
      time: latestTimelineTime([
        batch.updatedAt,
        ...items.map((item) => item.job.updatedAt),
        ...items.map((item) => item.job.finishedAt),
        ...items.map((item) => item.reviewRecord?.createdAt),
      ]),
    },
  ];

  return candidates
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => isValidTimelineTime(event.time))
    .sort(({ event: first, index: firstIndex }, { event: second, index: secondIndex }) => (
      compareTraceTime(first.time, second.time) || firstIndex - secondIndex
    ))
    .map(({ event }) => ({
      actor: event.actor,
      isComplete: true,
      key: event.key,
      label: event.label,
      time: event.time as string,
    }));
}

function buildTraceEvents(
  batch: AiReviewBatchDto | AiReviewBatchDetailDto,
  item: AiReviewBatchItemDto,
): TraceEvent[] {
  const events: TraceEvent[] = [
    {
      key: 'submission',
      title: 'Labeler 提交',
      description: `${batch.labelerName} 提交第 ${item.submission.round.toLocaleString()} 轮标注，进入${submissionStatusLabel(item.submission.status)}。`,
      time: item.submission.submittedAt,
      tone: 'success',
      meta: [
        { label: '轮次', value: `第${item.submission.round.toLocaleString()}轮` },
        { label: '状态', value: submissionStatusLabel(item.submission.status) },
      ],
    },
    {
      key: 'queue',
      title: 'AI 预审入队',
      description: `系统创建 AI 预审任务，等待处理。`,
      time: item.job.queuedAt,
      tone: 'info',
      meta: [{ label: 'AI 状态', value: aiReviewStatusLabel(item.job.status) }],
    },
    {
      key: 'start',
      title: 'AI 开始处理',
      description: 'AI 预审开始执行。',
      time: item.job.startedAt,
      tone: 'info',
      meta: [{ label: 'AI 状态', value: aiReviewStatusLabel(item.job.status) }],
    },
    ...item.logs.map((log): TraceEvent => ({
      key: `log-${log.id}`,
      title: `处理日志：${humanizeTraceMessage(log.message)}`,
      description: aiReviewLogTypeLabel(log.type),
      time: log.time,
      tone: traceToneForLogType(log.type),
      meta: [{ label: '记录类型', value: aiReviewLogTypeLabel(log.type) }],
    })),
  ];

  if (item.reviewRecord) {
    events.push({
      key: 'review-record',
      title: 'AI 预审结论',
      description: `${DECISION_LABELS[item.decision]}${item.reviewRecord.comment ? `：${item.reviewRecord.comment}` : ''}`,
      time: item.reviewRecord.createdAt,
      tone: traceToneForDecision(item.decision),
      meta: item.reviewRecord.ruleId ? [{ label: '规则', value: item.reviewRecord.ruleId }] : [],
    });
  }

  if (item.job.finishedAt || item.job.status) {
    events.push({
      key: 'finish',
      title: 'AI 预审完成',
      description: `${aiReviewStatusLabel(item.job.status)}${item.job.lastError ? `：${item.job.lastError}` : ''}`,
      time: item.job.finishedAt ?? item.job.updatedAt,
      tone: item.job.lastError ? 'danger' : traceToneForDecision(item.decision),
      meta: [
        { label: '提交状态', value: submissionStatusLabel(item.job.submissionStatus) },
        { label: '更新时间', value: formatDateTimeSecond(item.job.updatedAt) },
      ],
    });
  }

  return events
    .map((event, index) => ({ event, index }))
    .sort((first, second) => compareTraceTime(first.event.time, second.event.time) || first.index - second.index)
    .map(({ event }) => event);
}

function compareTraceTime(first?: string | null, second?: string | null): number {
  const firstTime = first ? new Date(first).getTime() : Number.POSITIVE_INFINITY;
  const secondTime = second ? new Date(second).getTime() : Number.POSITIVE_INFINITY;
  const safeFirstTime = Number.isNaN(firstTime) ? Number.POSITIVE_INFINITY : firstTime;
  const safeSecondTime = Number.isNaN(secondTime) ? Number.POSITIVE_INFINITY : secondTime;

  return safeFirstTime - safeSecondTime;
}

function earliestTimelineTime(values: Array<string | null | undefined>): string | null {
  return values
    .filter(isValidTimelineTime)
    .sort(compareTraceTime)[0] ?? null;
}

function latestTimelineTime(values: Array<string | null | undefined>): string | null {
  return values
    .filter(isValidTimelineTime)
    .sort((first, second) => compareTraceTime(second, first))[0] ?? null;
}

function isValidTimelineTime(value?: string | null): value is string {
  if (!value) {
    return false;
  }

  return !Number.isNaN(new Date(value).getTime());
}

const BATCH_STATUS_LABELS: Record<AiReviewBatchDto['status'], string> = {
  FAILED: '预审失败',
  PASSED: '预审通过',
  PENDING: '等待预审',
  REJECTED: '建议打回',
};

const READABLE_STATUS_LABELS: Record<string, string> = {
  ...SUBMISSION_STATUS_LABELS,
  ...AI_REVIEW_STATUS_LABELS,
  ...BATCH_STATUS_LABELS,
};

function ownerNameLabel(batch: Pick<AiReviewBatchDto, 'ownerId' | 'ownerName'>): string {
  return batch.ownerName?.trim() || readableUserName(batch.ownerId) || '未记录';
}

function templateNameLabel(batch: Pick<AiReviewBatchDto, 'templateName'>): string {
  return batch.templateName?.trim() || '模板未记录';
}

function templateVersionLabel(batch: Pick<AiReviewBatchDto, 'templateVersion'>): string {
  return batch.templateVersion?.trim() || '版本未记录';
}

function readableUserName(userId?: string | null): string {
  if (!userId) {
    return '';
  }
  if (userId.includes('zhang_man')) {
    return '张满';
  }
  if (userId.includes('li_lei')) {
    return '李雷';
  }
  if (userId.includes('wang_fang')) {
    return '王芳';
  }

  return '';
}

function submissionStatusLabel(status?: string | null): string {
  if (!status) {
    return '未记录';
  }

  return SUBMISSION_STATUS_LABELS[status as SubmissionStatus] ?? humanizeStatusCode(status);
}

function aiReviewStatusLabel(status?: AiReviewJobDto['status'] | null): string {
  if (!status) {
    return '未记录';
  }

  return AI_REVIEW_STATUS_LABELS[status] ?? humanizeStatusCode(status);
}

function humanizeTraceMessage(message: string): string {
  const readableMessage = message.replace(/\b[A-Z][A-Z_]+\b/g, (status) => READABLE_STATUS_LABELS[status] ?? status);

  if (/^[A-Za-z0-9_-]+\s*开始处理[。.]?$/.test(readableMessage.trim())) {
    return 'AI 预审开始处理';
  }
  if (readableMessage.trim() === '调用模型') {
    return '执行预审';
  }

  return readableMessage;
}

function humanizeStatusCode(status: string): string {
  return status
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function aiReviewLogTypeLabel(type: AiReviewLogDto['type']): string {
  const labels: Record<AiReviewLogDto['type'], string> = {
    audit: '状态流转 / 审计记录',
    error: '错误记录',
    llm: '预审处理',
    queue: '队列事件',
    retry: '重试记录',
    run: '执行记录',
    verdict: '结论解析',
  };

  return labels[type];
}

function traceToneForLogType(type: AiReviewLogDto['type']): TraceEventTone {
  if (type === 'error') {
    return 'danger';
  }
  if (type === 'retry') {
    return 'warning';
  }
  if (type === 'verdict' || type === 'audit') {
    return 'success';
  }

  return 'info';
}

function traceToneForDecision(decision: AiReviewBatchDecision): TraceEventTone {
  if (decision === 'reject' || decision === 'failed') {
    return 'danger';
  }
  if (decision === 'pending') {
    return 'neutral';
  }

  return 'success';
}

type ReviewPromptPreview = {
  fullPrompt: string;
  sections: AiPromptPreviewSection[];
};

function buildReviewPromptPreview(rawPrompt?: string | null): ReviewPromptPreview | null {
  const fullPrompt = rawPrompt?.trim();

  if (!fullPrompt) {
    return null;
  }

  return {
    fullPrompt,
    sections: parseReviewPromptSections(fullPrompt),
  };
}

function parseReviewPromptSections(prompt: string): AiPromptPreviewSection[] {
  const sections: AiPromptPreviewSection[] = [];
  const leadingLines: string[] = [];
  let currentSection: { key: string; title: string; contentLines: string[] } | null = null;

  const commitCurrentSection = () => {
    if (!currentSection) {
      return;
    }

    sections.push({
      key: currentSection.key,
      title: currentSection.title,
      content: trimPromptSectionContent(currentSection.contentLines),
    });
  };

  prompt.split(/\r?\n/).forEach((line) => {
    const headingMatch = line.match(/^#\s*(\d+)\.\s*(.+?)\s*$/);

    if (headingMatch) {
      commitCurrentSection();
      currentSection = {
        key: `section_${sections.length + 1}_${headingMatch[1]}`,
        title: headingMatch[2],
        contentLines: [],
      };
      return;
    }

    if (currentSection) {
      currentSection.contentLines.push(line);
    } else {
      leadingLines.push(line);
    }
  });
  commitCurrentSection();

  const leadingContent = trimPromptSectionContent(leadingLines);
  if (leadingContent) {
    sections.unshift({
      key: 'section_intro',
      title: 'Prompt 内容',
      content: leadingContent,
    });
  }

  return sections.length > 0
    ? sections
    : [{ key: 'section_full', title: 'Prompt 内容', content: prompt }];
}

function trimPromptSectionContent(lines: string[]): string {
  return lines.join('\n').replace(/^\n+|\n+$/g, '');
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function formatDateTimeSecond(value?: string | null): string {
  if (!value) {
    return '未记录';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 19).replace('T', ' ');
  }

  return date
    .toLocaleString('zh-CN', {
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
      minute: '2-digit',
      month: '2-digit',
      second: '2-digit',
      year: 'numeric',
    })
    .replace(/\//g, '-');
}

function splitDateTimeMinute(value?: string | null): { date: string; time: string } {
  if (!value) {
    return { date: '—', time: '' };
  }

  const [date, time = ''] = value.slice(0, 16).replace('T', ' ').split(' ');

  return { date, time };
}

function shouldIgnoreRowOpen(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest('button, a, input, label, select, textarea'));
}

function hasActiveTextSelection(): boolean {
  const selection = window.getSelection?.();

  return Boolean(selection && selection.type === 'Range' && selection.toString().trim());
}
