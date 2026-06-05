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
  type AiReviewBatchStatus,
} from '../../api/aiReview';
import { PageLoading } from '../../components/PageLoading';
import { TableEmptyState } from '../../components/TableEmptyState';
import { ToastViewport, useToastController } from '../../components/ToastViewport';

const STATUS_LABELS: Record<AiReviewBatchStatus, string> = {
  PENDING: '待审核',
  PASSED: '已通过',
  REJECTED: '已打回',
  FAILED: '失败',
};

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

type FieldReviewDecision = 'pass' | 'pending' | 'reject';

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

export const AiReviewQueuePage = () => {
  const [batches, setBatches] = useState<AiReviewBatchDto[]>([]);
  const [keyword, setKeyword] = useState('');
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

  const filteredBatches = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return batches.filter((batch) => {
      if (!normalizedKeyword) {
        return true;
      }

      return [
        batch.taskTitle,
        batch.labelerName,
        ...batch.externalIds,
      ].some((value) => value.toLowerCase().includes(normalizedKeyword));
    });
  }, [batches, keyword]);

  const totalPages = Math.max(1, Math.ceil(filteredBatches.length / BATCH_TABLE_PAGE_SIZE));
  const paginatedBatches = useMemo(() => {
    const startIndex = (currentPage - 1) * BATCH_TABLE_PAGE_SIZE;

    return filteredBatches.slice(startIndex, startIndex + BATCH_TABLE_PAGE_SIZE);
  }, [currentPage, filteredBatches]);

  useEffect(() => {
    setCurrentPage(1);
  }, [keyword]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const loadBatches = async () => {
    setIsLoading(true);
    try {
      const nextBatches = await listAiReviewBatches();
      setBatches(nextBatches);
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

  return (
    <section className="ai-review-page agent-review-page" aria-labelledby="ai-review-title">
      <ToastViewport messages={messages} onDismiss={dismissToast} />

      <header className="agent-review-page__header">
        <div>
          <h1 id="ai-review-title">AI 自动预审队列</h1>
        </div>
      </header>

      {isLoading && batches.length === 0 ? (
        <PageLoading className="page-loading--compact" title="正在加载 AI 预审队列" />
      ) : (
        <AiReviewBatchTable
          batches={paginatedBatches}
          currentPage={currentPage}
          keyword={keyword}
          selectedBatchId={selectedBatch?.batchId ?? null}
          totalPages={totalPages}
          onKeywordChange={setKeyword}
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
  currentPage,
  keyword,
  onKeywordChange,
  onOpenBatch,
  onPageChange,
  selectedBatchId,
  totalPages,
}: {
  batches: AiReviewBatchDto[];
  currentPage: number;
  keyword: string;
  onKeywordChange: (keyword: string) => void;
  onOpenBatch: (batch: AiReviewBatchDto) => void;
  onPageChange: (page: number) => void;
  selectedBatchId: string | null;
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
        <div className="agent-review-table-toolbar__spacer" aria-hidden="true" />
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
            <col className="agent-review-batch-table__col-title" />
            <col className="agent-review-batch-table__col-labeler" />
            <col className="agent-review-batch-table__col-submitted" />
            <col className="agent-review-batch-table__col-count" />
            <col className="agent-review-batch-table__col-status" />
            <col className="agent-review-batch-table__col-decision" />
            <col className="agent-review-batch-table__col-score" />
            <col className="agent-review-batch-table__col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th>任务名称</th>
              <th>标注员</th>
              <th>提交时间</th>
              <th>题目数</th>
              <th>当前状态</th>
              <th>AI 建议</th>
              <th>综合分 / 失败原因</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody key={currentPage} className="task-table__body">
            {batches.length > 0 ? (
              batches.map((batch) => (
                <tr
                  key={batch.batchId}
                  className={[
                    'task-table__row',
                    'agent-review-batch-table__row',
                    selectedBatchId === batch.batchId ? 'is-active' : '',
                  ].filter(Boolean).join(' ')}
                  tabIndex={0}
                  onClick={(event) => handleRowClick(event, batch)}
                  onKeyDown={(event) => handleRowKeyDown(event, batch)}
                >
                  <td>
                    <TableCellInner>
                      <button
                        className="task-title-link"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenBatch(batch);
                        }}
                      >
                        {batch.taskTitle}
                      </button>
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
                      <BatchStatusPill status={batch.status} />
                    </TableCellInner>
                  </td>
                  <td>
                    <TableCellInner>
                      <DecisionPill decision={batch.aggregateDecision} label={batch.aiSuggestionLabel} />
                    </TableCellInner>
                  </td>
                  <td>
                    <TableCellInner>
                      <span className="agent-review-score-summary">
                        {batch.failureReason ?? (batch.aggregateScore === null ? '—' : `综合 ${batch.aggregateScore}`)}
                      </span>
                    </TableCellInner>
                  </td>
                  <td>
                    <TableCellInner>
                      <div className="task-table__actions agent-review-batch-table__actions">
                        <button
                          className="task-table-action task-table-action--primary"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpenBatch(batch);
                          }}
                        >
                          查看详情
                        </button>
                      </div>
                    </TableCellInner>
                  </td>
                </tr>
              ))
            ) : (
              <tr className="task-table__empty-row">
                <td colSpan={8}>
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

const TableCellInner = ({ children }: { children: ReactNode }) => (
  <div className="task-table__cell-inner">{children}</div>
);

const DateTimeCell = ({ value }: { value?: string | null }) => {
  const { date, time } = splitDateTimeMinute(value);

  return (
    <span className="task-date-cell">
      <span className="task-date-cell__date">{date}</span>
      <small className="task-date-cell__time">{time}</small>
    </span>
  );
};

const BatchStatusPill = ({ status }: { status: AiReviewBatchStatus }) => (
  <span className={`agent-review-status-pill is-${status.toLowerCase()}`}>{STATUS_LABELS[status]}</span>
);

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
          <div>
            <h2 id="agent-review-detail-title">
              AI 预审详情 · {batch.taskTitle}
            </h2>
            <p>
              提交于 {formatClock(batch.submittedAt)} · 标注员 {batch.labelerName} · 模板版本 {batch.templateVersion ?? '未记录'} · 共{' '}
              {batch.itemCount.toLocaleString()} 题
            </p>
          </div>
          <div className="agent-review-drawer-header__actions">
            <button className="agent-review-sheet-close" type="button" aria-label="关闭 AI 预审详情" onClick={onClose}>
              <span aria-hidden="true">×</span>
            </button>
          </div>
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

  const handleDecisionClick = (decision: AiReviewBatchDecision) => {
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
              className={selectedDecision === tab.value ? 'is-active' : ''}
              disabled={count === 0}
              role="tab"
              aria-selected={selectedDecision === tab.value}
              onClick={() => handleDecisionClick(tab.value)}
            >
              {tab.label}
              <span>{count.toLocaleString()}</span>
            </button>
          );
        })}
      </div>
      <div className="agent-review-question-list__header">
        <strong>题目列表</strong>
        <span>{items.length.toLocaleString()} 题</span>
      </div>
      <div className="agent-review-question-list__items" role="tablist" aria-label="批次内题目切换">
        {items.map((item, index) => (
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
        ))}
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

const TechnicalDetailsPanel = ({ item }: { item: AiReviewBatchItemDto }) => (
  <section className="agent-review-technical-sections" aria-label="技术信息">
    <TechnicalDetails title="查看审核 Prompt">
      <PanelHeading title="审核 Prompt" meta={promptRuleLabel(item.reviewRecord?.ruleId)} />
      <pre>{item.reviewRecord?.rawPrompt?.trim() || '本题暂未记录真实审核 Prompt。'}</pre>
    </TechnicalDetails>
  </section>
);

const TechnicalDetails = ({ children, title }: { children: ReactNode; title: string }) => (
  <details className="agent-review-technical-section">
    <summary>{title}</summary>
    <div>{children}</div>
  </details>
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

const DecisionPill = ({ decision, label }: { decision: AiReviewBatchDecision; label: string }) => (
  <span className={`agent-review-decision-pill is-${decisionTone(decision)}`}>{label}</span>
);

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

function structuredOutputModeLabel(value?: string | null): string {
  if (value === 'function_calling') {
    return 'function_calling · 结构化';
  }
  if (value === 'json_schema') {
    return 'json_schema · 结构化';
  }

  return '结构化输出未记录';
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

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function formatClock(value?: string | null): string {
  if (!value) {
    return '未记录';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 19).replace('T', ' ');
  }

  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
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
