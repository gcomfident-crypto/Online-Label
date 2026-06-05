import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getSchemaFieldKey, type LabelHubSchema, type SchemaField } from '@labelhub/shared';

import { ToastViewport, useToastController } from '../../components/ToastViewport';
import { SchemaRenderer } from '../../features/schema-renderer/SchemaRenderer';
import {
  batchPassReviews,
  batchRejectReviews,
  getReview,
  passReview,
  rejectReview,
  reviseAndPassReview,
  type ReviewDetailDto,
  type ReviewQueueItemDto,
  type ReviewTimelineItemDto,
  listPendingReviews,
} from '../../api/reviews';

const REVIEWER_ID = 'user_reviewer_wang_fang';

type ManualReviewTab = 'manual' | 'pass' | 'reject';
type ManualReviewSuggestion = ManualReviewTab;

type ReviewSubmitSnapshot = Record<string, unknown>;

type ReviewTimelineItem = {
  action: string;
  operatorName: string;
  operatorRole?: string;
  statusType: 'current' | 'danger' | 'muted' | 'success' | 'warning';
  time: string;
};

type ManualReviewItem = {
  aiReviewConclusion: string;
  aiScore: number | null;
  aiSuggestion: ManualReviewSuggestion;
  assignmentId: string;
  currentRoundSubmit: ReviewSubmitSnapshot;
  dimensionScores: {
    accuracy: number | null;
    format: number | null;
    overall: number | null;
    relevance: number | null;
    safety: number | null;
  };
  issueTags: string[];
  labelerName: string;
  questionInfo: ReviewSubmitSnapshot;
  questionId: string;
  reviewComment: string;
  round: number;
  status: string;
  subId: string;
  submissionId: string;
  submittedAt: string;
  timeline: ReviewTimelineItem[];
  title: string;
};

type ManualReviewTask = {
  aiPassCount: number;
  aiRejectCount: number;
  manualCount: number;
  pendingCount: number;
  status: string;
  taskId: string;
  taskName: string;
};

const MANUAL_REVIEW_TABS: Array<{ label: string; value: ManualReviewTab }> = [
  { label: 'AI 已建议通过', value: 'pass' },
  { label: 'AI 已建议打回', value: 'reject' },
  { label: '转人工', value: 'manual' },
];

export const ReviewDetailPage = () => {
  const { taskId } = useParams<{ taskId: string }>();

  return <ReviewTaskDetailContent taskId={taskId} />;
};

export const ReviewTaskDetailContent = ({
  onClose,
  taskId,
}: {
  onClose?: () => void;
  taskId: string | undefined;
}) => {
  const [activeTab, setActiveTab] = useState<ManualReviewTab>('reject');
  const [queueItems, setQueueItems] = useState<ReviewQueueItemDto[]>([]);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reviewComment, setReviewComment] = useState('');
  const [reviewDetail, setReviewDetail] = useState<ReviewDetailDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { dismissToast, messages, showErrorToast, showStatusToast } = useToastController();

  useEffect(() => {
    let isMounted = true;

    setIsLoading(true);
    listPendingReviews()
      .then((items) => {
        if (!isMounted) {
          return;
        }

        const nextItems = items.filter((item) => item.taskId === taskId);
        const nextTab = getInitialTab(nextItems);
        setQueueItems(nextItems);
        setActiveTab(nextTab);
        setSelectedSubmissionId(getTabItems(nextItems, nextTab)[0]?.submissionId ?? nextItems[0]?.submissionId ?? null);
        setErrorMessage(null);
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }

        setQueueItems([]);
        setSelectedSubmissionId(null);
        setErrorMessage(error instanceof Error ? error.message : '人工审核详情加载失败。');
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [taskId]);

  useEffect(() => {
    if (!selectedSubmissionId) {
      setReviewDetail(null);
      return;
    }

    let isMounted = true;

    getReview(selectedSubmissionId)
      .then((detail) => {
        if (isMounted) {
          setReviewDetail(detail);
          setErrorMessage(null);
        }
      })
      .catch((error) => {
        if (isMounted) {
          setReviewDetail(null);
          setErrorMessage(error instanceof Error ? error.message : '人工审核详情加载失败。');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedSubmissionId]);

  const task = useMemo(() => buildManualReviewTask(queueItems, reviewDetail, taskId), [queueItems, reviewDetail, taskId]);
  const tabItems = useMemo(() => getTabItems(queueItems, activeTab), [activeTab, queueItems]);
  const schemaFieldLabels = useMemo(
    () => buildSchemaFieldLabelMap(reviewDetail?.task.schema ?? null),
    [reviewDetail?.task.schema],
  );
  const selectedQueueItem = useMemo(
    () =>
      tabItems.find((item) => item.submissionId === selectedSubmissionId) ??
      queueItems.find((item) => item.submissionId === selectedSubmissionId) ??
      tabItems[0] ??
      queueItems[0] ??
      null,
    [queueItems, selectedSubmissionId, tabItems],
  );
  const selectedItem = useMemo(
    () =>
      selectedQueueItem
        ? buildManualReviewItem(
            selectedQueueItem,
            reviewDetail?.submission.id === selectedQueueItem.submissionId ? reviewDetail : null,
          )
        : null,
    [reviewDetail, selectedQueueItem],
  );
  const selectedItemDetail =
    selectedItem && reviewDetail?.submission.id === selectedItem.submissionId ? reviewDetail : null;

  useEffect(() => {
    if (!selectedItem) {
      return;
    }

    setReviewComment('');
  }, [selectedItem?.submissionId]);

  if (!isLoading && !task) {
    return (
      <section className="manual-review-detail-page" aria-labelledby="manual-review-not-found-title">
        <div className="manual-review-empty-card">
          <h1 id="manual-review-not-found-title">未找到人工审核任务</h1>
          {errorMessage ? <p role="alert">{errorMessage}</p> : null}
          <Link className="manual-review-enter-button" to="/reviewer/reviews">
            返回审核任务列表
          </Link>
        </div>
      </section>
    );
  }

  const handleTabClick = (nextTab: ManualReviewTab) => {
    const nextItems = getTabItems(queueItems, nextTab);
    setActiveTab(nextTab);
    setSelectedSubmissionId(nextItems[0]?.submissionId ?? null);
  };

  const toggleSelection = (subId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(subId)) {
        next.delete(subId);
      } else {
        next.add(subId);
      }
      return next;
    });
  };

  const toggleVisibleSelection = (subIds: string[], shouldSelect: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const subId of subIds) {
        if (shouldSelect) {
          next.add(subId);
        } else {
          next.delete(subId);
        }
      }
      return next;
    });
  };

  const handleReviewAction = async (action: 'pass' | 'reject' | 'revise') => {
    if (!selectedItem) {
      return;
    }

    try {
      if (action === 'pass') {
        await passReview(selectedItem.submissionId, { actorId: REVIEWER_ID, comment: reviewComment });
        showStatusToast(`${selectedItem.subId} 已通过入库`);
      } else if (action === 'reject') {
        await rejectReview(selectedItem.submissionId, {
          actorId: REVIEWER_ID,
          reason: reviewComment || '请根据审核意见修改',
        });
        showStatusToast(`${selectedItem.subId} 已打回`);
      } else {
        await reviseAndPassReview(selectedItem.submissionId, {
          actorId: REVIEWER_ID,
          comment: reviewComment,
          revisedAnswers: selectedItem.currentRoundSubmit,
        });
        showStatusToast(`${selectedItem.subId} 已直接修订`);
      }

      setQueueItems((current) => current.filter((item) => item.submissionId !== selectedItem.submissionId));
      setSelectedSubmissionId((current) => {
        if (current !== selectedItem.submissionId) {
          return current;
        }

        const remainingItems = queueItems.filter((item) => item.submissionId !== selectedItem.submissionId);
        return getTabItems(remainingItems, activeTab)[0]?.submissionId ?? remainingItems[0]?.submissionId ?? null;
      });
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : '审核操作失败');
    }
  };

  const handleBatchAction = async (action: 'pass' | 'reject') => {
    const selectedItems = tabItems.filter((item) => selectedIds.has(item.externalId));

    if (selectedItems.length === 0) {
      showErrorToast('请先选择题目');
      return;
    }

    const selectedSubmissionIds = selectedItems.map((item) => item.submissionId);
    const selectedExternalIds = new Set(selectedItems.map((item) => item.externalId));
    const selectedSubmissionIdSet = new Set(selectedSubmissionIds);

    try {
      const result =
        action === 'pass'
          ? await batchPassReviews({
              actorId: REVIEWER_ID,
              comment: reviewComment,
              submissionIds: selectedSubmissionIds,
            })
          : await batchRejectReviews({
              actorId: REVIEWER_ID,
              reason: reviewComment || '请根据审核意见修改',
              submissionIds: selectedSubmissionIds,
            });
      const processedCount = result.processedCount || selectedItems.length;
      const nextQueueItems = queueItems.filter((item) => !selectedSubmissionIdSet.has(item.submissionId));

      setQueueItems(nextQueueItems);
      setSelectedIds((current) => {
        const next = new Set(current);
        selectedExternalIds.forEach((externalId) => next.delete(externalId));
        return next;
      });
      setSelectedSubmissionId((current) => {
        if (current && !selectedSubmissionIdSet.has(current)) {
          return current;
        }

        return getTabItems(nextQueueItems, activeTab)[0]?.submissionId ?? nextQueueItems[0]?.submissionId ?? null;
      });
      showStatusToast(action === 'pass' ? `已批量通过 ${processedCount} 条` : `已批量打回 ${processedCount} 条`);
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : '批量审核操作失败');
    }
  };

  return (
    <section className="manual-review-detail-page" aria-labelledby="manual-review-detail-title">
      <ToastViewport messages={messages} onDismiss={dismissToast} />
      <header className="manual-review-detail-toolbar">
        <div>
          <span>审核与质检 / 人工审核 / {task?.taskName ?? '加载中'}</span>
          <h1 id="manual-review-detail-title">{task?.taskName ?? '人工审核'}</h1>
          <p className="task-management-table-description">
            展示当前人工复审任务的题目内容、标注答案、AI 预审结果和审核决策，支持逐题通过、修订或打回
          </p>
        </div>
        <div className="manual-review-detail-toolbar__actions" aria-label="人工审核视角操作">
          {onClose ? (
            <button className="manual-review-sheet-close" type="button" aria-label="关闭人工审核详情" onClick={onClose}>
              <span aria-hidden="true">×</span>
            </button>
          ) : null}
        </div>
      </header>

      {errorMessage ? <p role="alert">{errorMessage}</p> : null}

      <div className="manual-review-detail-shell">
        <QuestionQueue
          activeTab={activeTab}
          items={tabItems}
          queueItems={queueItems}
          selectedIds={selectedIds}
          selectedSubId={selectedItem?.subId ?? null}
          task={task}
          onBatchAction={handleBatchAction}
          onSelectItem={setSelectedSubmissionId}
          onTabClick={handleTabClick}
          onToggleAllSelection={toggleVisibleSelection}
          onToggleSelection={toggleSelection}
        />

        <main className="manual-review-detail-main">
          {selectedItem ? (
            <>
              <div className="manual-review-detail-content">
                <ItemHeader item={selectedItem} task={task} />
                <section className="manual-review-compare-grid" aria-label="本轮提交内容">
                  <QuestionInfoCard
                    fallbackSnapshot={selectedItem.questionInfo}
                    rawData={selectedItemDetail?.taskItem.rawData ?? selectedItem.questionInfo}
                    schema={selectedItemDetail?.task.schema ?? null}
                  />
                  <SubmitSnapshotCard
                    highlight
                    fieldLabels={schemaFieldLabels}
                    snapshot={selectedItem.currentRoundSubmit}
                    title="本轮提交"
                  />
                </section>
                <AiReviewResult item={selectedItem} />
                <label className="manual-review-comment-field">
                  <span>审核意见（打回时必填）</span>
                  <textarea
                    placeholder={selectedItem.reviewComment || '请输入审核意见，打回时必填'}
                    value={reviewComment}
                    onChange={(event) => setReviewComment(event.target.value)}
                  />
                </label>
              </div>
              <section className="manual-review-actions" aria-label="审核操作">
                <button className="is-reject" type="button" onClick={() => void handleReviewAction('reject')}>
                  <strong>打回</strong>
                  <span>退回标注员修改 · 第 {selectedItem.round + 1} 轮</span>
                </button>
                <button className="is-revise" type="button" onClick={() => void handleReviewAction('revise')}>
                  <strong>直接修订</strong>
                  <span>审核员就地改写并入库</span>
                </button>
                <button className="is-pass" type="button" onClick={() => void handleReviewAction('pass')}>
                  <strong>通过 · 入库</strong>
                  <span>本条进入终审 / 可导出</span>
                </button>
              </section>
            </>
          ) : (
            <div className="manual-review-detail-content">
              <div className="manual-review-empty-card">
                <h2>{isLoading ? '正在加载题目' : '当前分组暂无题目'}</h2>
                <p>请切换左侧 AI 结论分组。</p>
              </div>
            </div>
          )}
        </main>

        <ReviewSidePanel item={selectedItem} task={task} />
      </div>
    </section>
  );
};

const QuestionQueue = ({
  activeTab,
  items,
  onBatchAction,
  onSelectItem,
  onTabClick,
  onToggleAllSelection,
  onToggleSelection,
  queueItems,
  selectedIds,
  selectedSubId,
  task,
}: {
  activeTab: ManualReviewTab;
  items: ReviewQueueItemDto[];
  onBatchAction: (action: 'pass' | 'reject') => void;
  onSelectItem: (submissionId: string) => void;
  onTabClick: (tab: ManualReviewTab) => void;
  onToggleAllSelection: (subIds: string[], shouldSelect: boolean) => void;
  onToggleSelection: (subId: string) => void;
  queueItems: ReviewQueueItemDto[];
  selectedIds: Set<string>;
  selectedSubId: string | null;
  task: ManualReviewTask | null;
}) => {
  const visibleSubIds = items.map((item) => item.externalId);
  const visibleSelectedCount = visibleSubIds.filter((subId) => selectedIds.has(subId)).length;
  const isAllVisibleSelected = visibleSubIds.length > 0 && visibleSelectedCount === visibleSubIds.length;
  const isPartiallyVisibleSelected = visibleSelectedCount > 0 && visibleSelectedCount < visibleSubIds.length;

  return (
    <aside className="manual-review-queue-panel" aria-label="当前任务题目列表">
      <div className="manual-review-tabs" role="tablist" aria-label="AI 结论分组">
        {MANUAL_REVIEW_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.value}
            onClick={() => onTabClick(tab.value)}
          >
            <span>{tab.label}</span>
            <strong>{countByTab(queueItems, tab.value).toLocaleString()}</strong>
          </button>
        ))}
      </div>

      <div className="manual-review-batch-toolbar" aria-label="批量操作区">
        <BatchSelectionControl
          isAllSelected={isAllVisibleSelected}
          isPartiallySelected={isPartiallyVisibleSelected}
          selectedCount={visibleSelectedCount}
          totalCount={visibleSubIds.length}
          onToggle={(shouldSelect) => onToggleAllSelection(visibleSubIds, shouldSelect)}
        />
        <button type="button" disabled={visibleSelectedCount === 0} onClick={() => onBatchAction('pass')}>
          批量通过
        </button>
        <button type="button" disabled={visibleSelectedCount === 0} onClick={() => onBatchAction('reject')}>
          批量打回
        </button>
      </div>

      <div className="manual-review-question-list">
        {items.length > 0 ? (
          items.map((item) => {
            const viewItem = buildManualReviewItem(item, null);

            return (
              <article key={item.submissionId} className={selectedSubId === viewItem.subId ? 'is-active' : undefined}>
                <input
                  type="checkbox"
                  aria-label={`选择 ${viewItem.subId}`}
                  checked={selectedIds.has(viewItem.subId)}
                  onChange={() => onToggleSelection(viewItem.subId)}
                />
                <button
                  type="button"
                  aria-label={`${viewItem.subId} ${viewItem.submittedAt} ${suggestionLabel(viewItem.aiSuggestion)} 第 ${viewItem.round} 轮`}
                  onClick={() => onSelectItem(item.submissionId)}
                >
                  <span className="manual-review-question-list__summary">
                    <strong>{viewItem.subId}</strong>
                    <time>{viewItem.submittedAt}</time>
                  </span>
                  <span className="manual-review-question-list__badges">
                    <SuggestionBadge suggestion={viewItem.aiSuggestion} />
                    <em>第 {viewItem.round} 轮</em>
                  </span>
                </button>
              </article>
            );
          })
        ) : (
          <div className="manual-review-empty-card">
            <p>{task ? '当前分组暂无题目。' : '正在加载题目。'}</p>
          </div>
        )}
      </div>
    </aside>
  );
};

const BatchSelectionControl = ({
  isAllSelected,
  isPartiallySelected,
  onToggle,
  selectedCount,
  totalCount,
}: {
  isAllSelected: boolean;
  isPartiallySelected: boolean;
  onToggle: (shouldSelect: boolean) => void;
  selectedCount: number;
  totalCount: number;
}) => {
  const checkboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = isPartiallySelected;
    }
  }, [isPartiallySelected]);

  return (
    <label className="manual-review-batch-toolbar__selection">
      <input
        ref={checkboxRef}
        type="checkbox"
        aria-label="全选当前分组题目"
        checked={isAllSelected}
        disabled={totalCount === 0}
        onChange={(event) => onToggle(event.currentTarget.checked)}
      />
      <span>已选 {selectedCount.toLocaleString()} 条</span>
    </label>
  );
};

const ItemHeader = ({ item, task }: { item: ManualReviewItem; task: ManualReviewTask | null }) => (
  <header className="manual-review-item-header">
    <div>
      <h2>
        {item.subId} · {item.title}
      </h2>
      <p>
        题目 {item.questionId} · 第 {item.round} 轮审核
      </p>
    </div>
    <span>{task?.status ?? item.status}</span>
  </header>
);

const noopSchemaChange = () => undefined;

const QuestionInfoCard = ({
  fallbackSnapshot,
  rawData,
  schema,
}: {
  fallbackSnapshot: ReviewSubmitSnapshot;
  rawData: ReviewSubmitSnapshot;
  schema: LabelHubSchema | null;
}) => {
  const showItemSchema = useMemo(
    () => buildQuestionInfoShowItemSchema(schema, fallbackSnapshot),
    [fallbackSnapshot, schema],
  );

  if (showItemSchema && showItemSchema.fields.length > 0) {
    return (
      <article className="manual-review-question-info-card" aria-label="题目信息">
        <SchemaRenderer
          schema={showItemSchema}
          rawData={rawData}
          value={{}}
          mode="review"
          onChange={noopSchemaChange}
        />
      </article>
    );
  }

  return <SubmitSnapshotCard snapshot={fallbackSnapshot} title="题目信息" />;
};

const SubmitSnapshotCard = ({
  fieldLabels,
  highlight = false,
  snapshot,
  title,
}: {
  fieldLabels?: ReadonlyMap<string, string>;
  highlight?: boolean;
  snapshot: ReviewSubmitSnapshot;
  title: string;
}) => (
  <article className={highlight ? 'manual-review-submit-card is-highlight' : 'manual-review-submit-card'}>
    <h3>{title}</h3>
    <dl>
      {Object.entries(snapshot).map(([key, value]) => {
        const label = fieldLabels?.get(key) ?? key;

        return (
          <div key={key}>
            <dt>
              <span>{label}</span>
              {label !== key ? <small>{key}</small> : null}
            </dt>
            <dd>{formatSnapshotValue(value)}</dd>
          </div>
        );
      })}
    </dl>
  </article>
);

const AiReviewResult = ({ item }: { item: ManualReviewItem }) => (
  <section className="manual-review-ai-result" aria-label="AI 预审 · 本轮重跑结果">
    <header>
      <div>
        <span>AI 预审 · 本轮重跑结果</span>
        <h3>labeler 达标结果</h3>
      </div>
      <strong>{formatScore(item.dimensionScores.overall)}</strong>
    </header>
    <div className="manual-review-score-grid">
      <ScoreMetric label="综合分" value={item.dimensionScores.overall} />
      <ScoreMetric label="相关性" value={item.dimensionScores.relevance} />
      <ScoreMetric label="准确性" value={item.dimensionScores.accuracy} />
      <ScoreMetric label="格式合规" value={item.dimensionScores.format} />
      <ScoreMetric label="安全" value={item.dimensionScores.safety} />
    </div>
    <p>{item.aiReviewConclusion}</p>
  </section>
);

const ScoreMetric = ({ label, value }: { label: string; value: number | null }) => (
  <div className="manual-review-score-metric">
    <span>{label}</span>
    <strong>{formatScore(value)}</strong>
  </div>
);

const ReviewSidePanel = ({ item, task }: { item: ManualReviewItem | null; task: ManualReviewTask | null }) => (
  <aside className="manual-review-side-panel">
    <section className="manual-review-stats" aria-label="审核统计">
      <div>
        <span>今日已审</span>
        <strong className="is-blue">0</strong>
      </div>
      <div>
        <span>今日通过率</span>
        <strong className="is-green">--</strong>
      </div>
      <div>
        <span>待我审核</span>
        <strong className="is-orange">{(task?.pendingCount ?? 0).toLocaleString()}</strong>
      </div>
      <div>
        <span>剩余处理时限</span>
        <strong>--</strong>
      </div>
    </section>

    {item ? <TimelinePanel item={item} /> : null}
  </aside>
);

const TimelinePanel = ({ item }: { item: ManualReviewItem }) => (
  <section className="manual-review-timeline-panel" aria-label={`审计时间线（${item.subId}）`}>
    <h3>审计时间线（{item.subId}）</h3>
    <ol>
      {item.timeline.map((entry, index) => (
        <TimelineEntry entry={entry} key={`${entry.operatorName}-${entry.time}-${index}`} />
      ))}
    </ol>
  </section>
);

const TimelineEntry = ({ entry }: { entry: ReviewTimelineItem }) => (
  <li className={`is-${entry.statusType}`}>
    <span aria-hidden="true" />
    <div>
      <strong>
        {entry.operatorName}
        {entry.operatorRole ? ` · ${entry.operatorRole}` : ''} · {entry.time}
      </strong>
      <p>{entry.action}</p>
    </div>
  </li>
);

const SuggestionBadge = ({ suggestion }: { suggestion: ManualReviewSuggestion }) => (
  <span className={`manual-review-suggestion is-${suggestion}`}>{suggestionLabel(suggestion)}</span>
);

function buildManualReviewTask(
  queueItems: ReviewQueueItemDto[],
  detail: ReviewDetailDto | null,
  taskId: string | undefined,
): ManualReviewTask | null {
  const firstItem = queueItems[0];

  if (!firstItem && !detail && !taskId) {
    return null;
  }

  return {
    taskId: firstItem?.taskId ?? detail?.task.id ?? taskId ?? '',
    taskName: detail?.task.title ?? firstItem?.taskTitle ?? '人工审核任务',
    pendingCount: queueItems.length,
    aiPassCount: countByTab(queueItems, 'pass'),
    aiRejectCount: countByTab(queueItems, 'reject'),
    manualCount: countByTab(queueItems, 'manual'),
    status: '复审中',
  };
}

function buildManualReviewItem(queueItem: ReviewQueueItemDto, detail: ReviewDetailDto | null): ManualReviewItem {
  const scores = detail?.aiReview?.scores ?? queueItem.aiScores ?? {};
  const answers = detail?.submission.answers ?? {};
  const rawData = detail?.taskItem.rawData ?? {};
  const aiSuggestion = normalizeSuggestion(queueItem.aiDecision ?? detail?.aiReview?.decision ?? null);
  const subId = detail?.taskItem.externalId ?? queueItem.externalId;

  return {
    aiReviewConclusion: detail?.aiReview?.comment ?? queueItem.aiComment ?? '暂无 AI 预审结论。',
    aiScore: scoreValue(scores.overall ?? scores.ai_overall ?? scores.score),
    aiSuggestion,
    assignmentId: queueItem.assignmentId,
    currentRoundSubmit: Object.keys(answers).length > 0 ? answers : { externalId: subId },
    dimensionScores: {
      accuracy: scoreValue(scores.accuracy),
      format: scoreValue(scores.format ?? scores.formatCompliance),
      overall: scoreValue(scores.overall ?? scores.ai_overall ?? scores.score),
      relevance: scoreValue(scores.relevance),
      safety: scoreValue(scores.safety),
    },
    issueTags: issueTagsFromScores(scores, aiSuggestion),
    labelerName: formatUserName(detail?.assignment.assigneeId),
    questionInfo: questionInfoFromData(rawData, answers, queueItem),
    questionId: subId,
    reviewComment: detail?.humanReview?.comment ?? detail?.aiReview?.comment ?? queueItem.aiComment ?? '',
    round: detail?.submission.round ?? queueItem.round,
    status: detail?.submission.status ?? queueItem.status,
    subId,
    submissionId: queueItem.submissionId,
    submittedAt: formatTime(queueItem.submittedAt),
    timeline: buildTimeline(detail, queueItem),
    title: titleFromData(rawData, queueItem),
  };
}

function questionInfoFromData(
  rawData: Record<string, unknown>,
  answers: Record<string, unknown>,
  queueItem: ReviewQueueItemDto,
): ReviewSubmitSnapshot {
  const answerKeys = new Set(Object.keys(answers));
  const entries = Object.entries(rawData).filter(([key, value]) => {
    if (answerKeys.has(key) || isHiddenQuestionInfoKey(key)) {
      return false;
    }

    return !isEmptySnapshotValue(value);
  });

  if (entries.length === 0) {
    return { externalId: queueItem.externalId };
  }

  return Object.fromEntries(entries);
}

function isHiddenQuestionInfoKey(key: string): boolean {
  return ['fileName', 'filename', 'sourceFileName', 'source_file_name', 'sourceFile'].includes(key);
}

function buildTimeline(detail: ReviewDetailDto | null, queueItem: ReviewQueueItemDto): ReviewTimelineItem[] {
  if (!detail) {
    return [
      {
        action: `第 ${queueItem.round} 轮提交`,
        operatorName: 'Labeler',
        statusType: 'current',
        time: formatTimelineTime(queueItem.submittedAt),
      },
    ];
  }

  const timelineItems = detail.timeline.map((entry) => timelineItemFromDto(entry));
  if (timelineItems.length > 0) {
    return timelineItems;
  }

  return [
    {
      action: `第 ${detail.submission.round} 轮提交`,
      operatorName: formatUserName(detail.assignment.assigneeId),
      statusType: 'success',
      time: formatTimelineTime(detail.submission.submittedAt),
    },
  ];
}

function timelineItemFromDto(entry: ReviewTimelineItemDto): ReviewTimelineItem {
  return {
    action: entry.reason ?? entry.label,
    operatorName: formatUserName(entry.actorId),
    operatorRole: entry.kind === 'review' ? '审核' : undefined,
    statusType: entry.toStatus === 'NEEDS_REVISION' ? 'danger' : entry.kind === 'review' ? 'warning' : 'success',
    time: formatTimelineTime(entry.createdAt),
  };
}

function getInitialTab(queueItems: ReviewQueueItemDto[]): ManualReviewTab {
  if (countByTab(queueItems, 'reject') > 0) {
    return 'reject';
  }
  if (countByTab(queueItems, 'pass') > 0) {
    return 'pass';
  }

  return 'manual';
}

function getTabItems(queueItems: ReviewQueueItemDto[], tab: ManualReviewTab): ReviewQueueItemDto[] {
  return sortReviewQueueItems(queueItems.filter((item) => normalizeSuggestion(item.aiDecision) === tab));
}

function countByTab(queueItems: ReviewQueueItemDto[], tab: ManualReviewTab): number {
  return getTabItems(queueItems, tab).length;
}

function normalizeSuggestion(decision: string | null | undefined): ManualReviewSuggestion {
  if (decision === 'pass') {
    return 'pass';
  }
  if (decision === 'reject') {
    return 'reject';
  }

  return 'manual';
}

function suggestionLabel(suggestion: ManualReviewSuggestion): string {
  if (suggestion === 'pass') {
    return '建议通过';
  }
  if (suggestion === 'reject') {
    return '建议打回';
  }

  return '需人工';
}

const reviewQueueItemSorter = new Intl.Collator('zh-Hans-CN', {
  numeric: true,
  sensitivity: 'base',
});

function sortReviewQueueItems(items: ReviewQueueItemDto[]): ReviewQueueItemDto[] {
  return [...items].sort((first, second) => {
    const externalIdOrder = reviewQueueItemSorter.compare(first.externalId, second.externalId);
    if (externalIdOrder !== 0) {
      return externalIdOrder;
    }

    const submittedAtOrder = first.submittedAt.localeCompare(second.submittedAt);
    if (submittedAtOrder !== 0) {
      return submittedAtOrder;
    }

    return first.submissionId.localeCompare(second.submissionId);
  });
}

function buildSchemaFieldLabelMap(schema: LabelHubSchema | null): Map<string, string> {
  const labels = new Map<string, string>();

  for (const field of getFlattenedSchemaFields(schema?.fields ?? [])) {
    const label = field.label?.trim();
    if (label) {
      labels.set(getSchemaFieldKey(field), label);
    }

    for (const displayField of field.displayConfig?.fields ?? []) {
      const displayLabel = displayField.label?.trim();
      if (displayLabel) {
        labels.set(displayField.sourceKey, displayLabel);
      }
    }
  }

  return labels;
}

function buildQuestionInfoShowItemSchema(
  schema: LabelHubSchema | null,
  fallbackSnapshot: ReviewSubmitSnapshot,
): LabelHubSchema | null {
  const schemaShowItemFields = schema
    ? getFlattenedSchemaFields(schema.fields).filter((field) => field.type === 'show_item')
    : [];

  if (schema && schemaShowItemFields.length > 0) {
    return {
      ...schema,
      fields: schemaShowItemFields,
    };
  }

  const fallbackFields = Object.entries(fallbackSnapshot)
    .filter(([sourceKey, value]) => sourceKey.trim() && !isEmptySnapshotValue(value))
    .map(([sourceKey, value]) => ({
      sourceKey,
      label: fallbackQuestionInfoLabel(sourceKey),
      format: typeof value === 'object' && value !== null ? ('json' as const) : ('text' as const),
    }));

  if (fallbackFields.length === 0) {
    return null;
  }

  return {
    schemaVersion: schema?.schemaVersion ?? 'review-question-info',
    datasetKind: schema?.datasetKind ?? 'generic_json',
    fields: [
      {
        key: '__review_question_info',
        type: 'show_item',
        label: '题目信息',
        sourceKeys: fallbackFields.map((field) => field.sourceKey),
        displayConfig: {
          layout: 'table',
          fields: fallbackFields,
        },
      },
    ],
  };
}

function fallbackQuestionInfoLabel(sourceKey: string): string {
  const labels: Record<string, string> = {
    id: 'ID',
    prompt: 'Prompt',
    question: '题目',
    source: '来源',
  };

  return labels[sourceKey] ?? sourceKey;
}

function getFlattenedSchemaFields(fields: readonly SchemaField[]): SchemaField[] {
  return fields.flatMap((field) => {
    if (field.type === 'group') {
      return [field, ...getFlattenedSchemaFields(field.fields ?? [])];
    }

    if (field.type === 'tabs') {
      return [
        field,
        ...(field.tabs ?? []).flatMap((tab) => getFlattenedSchemaFields(tab.fields)),
      ];
    }

    return [field];
  });
}

function titleFromData(rawData: Record<string, unknown>, queueItem: ReviewQueueItemDto): string {
  const candidate =
    rawData.cleaned_title ??
    rawData.title ??
    rawData.prompt ??
    rawData.question ??
    rawData.content;

  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : queueItem.externalId;
}

function issueTagsFromScores(scores: Record<string, unknown>, suggestion: ManualReviewSuggestion): string[] {
  const tags = Object.entries(scores)
    .filter(([key, value]) => typeof value === 'number' && Number(value) < 70 && key !== 'overall')
    .map(([key]) => scoreLabel(key));

  if (tags.length > 0) {
    return tags;
  }

  return suggestion === 'reject' ? ['需要修改'] : ['人工复核'];
}

function scoreLabel(key: string): string {
  const labels: Record<string, string> = {
    accuracy: '准确性',
    format: '格式合规',
    relevance: '相关性',
    safety: '安全性',
  };

  return labels[key] ?? key;
}

function scoreValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : null;
  }

  return null;
}

function formatScore(value: number | null): string {
  return value === null ? '--' : value.toLocaleString();
}

function formatSnapshotValue(value: unknown): string {
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

function isEmptySnapshotValue(value: unknown): boolean {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

function formatTime(value: string): string {
  return value.slice(11, 19) || value;
}

function formatTimelineTime(value: string): string {
  return value.slice(5, 16).replace('T', ' ');
}

function formatUserName(userId: string | null | undefined): string {
  if (userId === 'user_labeler_li_lei') {
    return '李雷';
  }
  if (userId === 'user_reviewer_wang_fang' || userId === 'reviewer_1') {
    return '王芳';
  }
  if (!userId) {
    return '系统';
  }

  return userId;
}
