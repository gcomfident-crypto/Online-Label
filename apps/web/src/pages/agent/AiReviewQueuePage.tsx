import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import {
  getAiReviewBatch,
  listAiReviewBatches,
  type AiReviewBatchDecision,
  type AiReviewBatchDetailDto,
  type AiReviewBatchDto,
  type AiReviewBatchItemDto,
  type AiReviewBatchStatus,
  type AiReviewLogDto,
} from '../../api/aiReview';
import { PageLoading } from '../../components/PageLoading';
import { TableEmptyState } from '../../components/TableEmptyState';
import { ToastViewport, useToastController } from '../../components/ToastViewport';

const STATUS_LABELS: Record<AiReviewBatchStatus, string> = {
  PENDING: '待审核',
  PASSED: '已通过',
  REJECTED: '已打回',
  MANUAL: '转人工',
  FAILED: '失败',
};

const DECISION_LABELS: Record<AiReviewBatchDecision, string> = {
  pending: '等待预审',
  pass: '建议通过',
  reject: '建议打回',
  manual: '转人工复核',
  failed: '失败',
};

const QUESTION_DECISION_TABS: Array<{ label: string; value: AiReviewBatchDecision }> = [
  { label: '待审核', value: 'pending' },
  { label: '已通过', value: 'pass' },
  { label: '已打回', value: 'reject' },
  { label: '转人工', value: 'manual' },
  { label: '失败', value: 'failed' },
];

const SCORE_DIMENSIONS = [
  { key: 'relevance', aliases: ['相关性'], label: '相关性' },
  { key: 'accuracy', aliases: ['准确性'], label: '准确性' },
  { key: 'format', aliases: ['格式合规'], label: '格式合规' },
  { key: 'safety', aliases: ['安全性'], label: '安全性' },
  { key: 'overall', aliases: ['综合', 'score', 'total'], label: '综合' },
] as const;

const LOG_LABELS: Record<AiReviewLogDto['type'], string> = {
  audit: 'audit',
  error: 'error',
  llm: 'llm',
  queue: 'queue',
  retry: 'retry',
  run: 'run',
  verdict: 'verdict',
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
        batch.batchId,
        batch.displayId,
        batch.taskId,
        batch.taskTitle,
        batch.labelerName,
        batch.labelerId ?? '',
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

      <div className="agent-review-toolbar">
        <input
          aria-label="搜索任务级 AI 预审批次"
          placeholder="搜索任务名 / 任务ID / 批次ID / 标注员 / 题目ID"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
        <button type="button" aria-label="刷新任务级 AI 预审队列" onClick={() => void loadBatches()}>
          刷新
        </button>
      </div>

      {isLoading && batches.length === 0 ? (
        <PageLoading className="page-loading--compact" title="正在加载 AI 预审队列" />
      ) : (
        <AiReviewBatchTable
          batches={paginatedBatches}
          currentPage={currentPage}
          selectedBatchId={selectedBatch?.batchId ?? null}
          totalPages={totalPages}
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
  onOpenBatch,
  onPageChange,
  selectedBatchId,
  totalPages,
}: {
  batches: AiReviewBatchDto[];
  currentPage: number;
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
    <div className="task-table-panel agent-review-table-panel">
      <div className="task-table-scroll" data-adaptive-table-viewport="true">
        <table className="task-table agent-review-batch-table" aria-label="任务级 AI 预审队列表格">
          <colgroup>
            <col className="agent-review-batch-table__col-batch" />
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
              <th>批次 ID</th>
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
                  <td className="task-table__id">
                    <TableCellInner>
                      <code>{batch.displayId}</code>
                    </TableCellInner>
                  </td>
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
                <td colSpan={9}>
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
              {batch.displayId} · {batch.taskTitle}
            </h2>
            <p>
              提交于 {formatClock(batch.submittedAt)} · 标注员 {batch.labelerName} · 模板版本 {batch.templateVersion ?? '未记录'} · 共{' '}
              {batch.itemCount.toLocaleString()} 题
            </p>
          </div>
          <div className="agent-review-drawer-header__actions">
            <DecisionPill decision={batch.aggregateDecision} label={`AI 建议：${batch.aiSuggestionLabel.replace(/^建议/, '')}`} />
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
                      <section className="agent-review-drawer-grid">
                        <JsonSubmissionPanel item={selectedItem} />
                        <ScorePanel item={selectedItem} />
                      </section>
                      <AiCommentPanel item={selectedItem} />
                      <PromptPanel item={selectedItem} />
                      <LogPanel logs={selectedItem.logs} />
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
      manual: 0,
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
            <em>{DECISION_LABELS[item.decision]}</em>
          </button>
        ))}
      </div>
    </aside>
  );
};

const JsonSubmissionPanel = ({ item }: { item: AiReviewBatchItemDto }) => (
  <article className="agent-review-card agent-review-card--json">
    <PanelHeading title="提交内容" meta="JSON 字段视图" />
    <pre>{formatJson({ rawData: item.taskItem.rawData, answers: item.submission.answers })}</pre>
  </article>
);

const ScorePanel = ({ item }: { item: AiReviewBatchItemDto }) => (
  <article className="agent-review-card agent-review-card--score">
    <PanelHeading title="维度评分（共 100）" meta="function_calling · 结构化" />
    <div className="agent-review-score-list">
      {SCORE_DIMENSIONS.map((dimension) => {
        const score = scoreValue(item.reviewRecord?.scores ?? {}, dimension.key, dimension.aliases);

        return (
          <div key={dimension.key} className="agent-review-score-row">
            <div>
              <span>{dimension.label}</span>
              <strong className={`is-${scoreTone(score)}`}>{score === null ? '—' : score}</strong>
            </div>
            <span className="agent-review-score-track" aria-hidden="true">
              <span className={`is-${scoreTone(score)}`} style={{ width: `${score ?? 0}%` }} />
            </span>
          </div>
        );
      })}
    </div>
  </article>
);

const AiCommentPanel = ({ item }: { item: AiReviewBatchItemDto }) => (
  <article className={`agent-review-card agent-review-card--comment is-${decisionTone(item.decision)}`}>
    <PanelHeading title="AI 评语" />
    <div className="agent-review-comment-box">
      <strong>
        {DECISION_LABELS[item.decision]}
        <span>阈值：综合 &lt; 70 即打回</span>
      </strong>
      <p>{item.reviewRecord?.comment ?? item.job.lastError ?? 'AI 预审尚未输出评语。'}</p>
    </div>
  </article>
);

const PromptPanel = ({ item }: { item: AiReviewBatchItemDto }) => (
  <article className="agent-review-card agent-review-card--prompt">
    <PanelHeading title="审核 Prompt 模板" meta={promptRuleLabel(item.reviewRecord?.ruleId)} />
    <pre>{item.reviewRecord?.rawPrompt ?? fallbackPromptTemplate()}</pre>
  </article>
);

const LogPanel = ({ logs }: { logs: AiReviewLogDto[] }) => (
  <article className="agent-review-card agent-review-card--logs">
    <PanelHeading title="处理日志 / 审计" />
    <ol>
      {logs.length > 0 ? (
        logs.map((log) => (
          <li key={log.id}>
            <time dateTime={log.time}>{formatClock(log.time)}</time>
            <span>{LOG_LABELS[log.type]}</span>
            <p>{log.message}</p>
          </li>
        ))
      ) : (
        <li>
          <time>未记录</time>
          <span>audit</span>
          <p>暂无处理日志。</p>
        </li>
      )}
    </ol>
  </article>
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

function scoreValue(scores: Record<string, unknown>, key: string, aliases: readonly string[]): number | null {
  for (const candidate of [key, ...aliases]) {
    const value = scores[candidate];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.max(0, Math.min(100, Math.round(value)));
    }
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
      return Math.max(0, Math.min(100, Math.round(Number(value))));
    }
  }

  return null;
}

function scoreTone(score: number | null): 'high' | 'low' | 'medium' {
  if (score === null || score < 60) {
    return 'low';
  }
  if (score < 80) {
    return 'medium';
  }

  return 'high';
}

function decisionTone(decision: AiReviewBatchDecision): 'failed' | 'manual' | 'pass' | 'pending' | 'reject' {
  if (decision === 'failed') {
    return 'failed';
  }
  if (decision === 'manual') {
    return 'manual';
  }
  if (decision === 'pass') {
    return 'pass';
  }
  if (decision === 'reject') {
    return 'reject';
  }

  return 'pending';
}

function promptRuleLabel(ruleId?: string | null): string {
  return ruleId ? `规则：${ruleId}` : '规则：电商相关性 v2';
}

function fallbackPromptTemplate(): string {
  return [
    '你是电商商品标题审核员，请基于以下维度为提交内容打分（0-100）：',
    '[相关性] 标注结果与原始数据是否对齐',
    '[准确性] 关键信息与商品事实是否一致',
    '[格式合规] 是否满足模板字段与正则规则',
    '[安全性] 是否包含敏感 / 违规词',
    '',
    '请通过 function_call 返回 JSON:',
    '{ "scores": {...}, "verdict": "pass|reject|manual", "reason": "..." }',
  ].join('\n');
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
