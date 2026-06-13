import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  type ReviewDetailDto,
  type ReviewFieldCommentInput,
  type ReviewQueueItemDto,
  type ReviewTimelineItemDto,
  listPendingReviews,
} from '../../api/reviews';

const REVIEWER_ID = 'user_reviewer_wang_fang';
const DEFAULT_REJECT_REASON = '请根据字段修改建议调整。';
const FIELD_REVIEW_COMMENT_STORAGE_PREFIX = 'labelhub:review-field-comments:v1';
const FIELD_COMMENT_TEXTAREA_MAX_HEIGHT = 140;

type ManualReviewSideTab = 'timeline' | 'comments';
type ManualReviewSuggestion = 'manual' | 'pass' | 'reject';
type ManualReviewResult = 'pass' | 'reject';

type ReviewSubmitSnapshot = Record<string, unknown>;
type LocalReviewDecision = {
  humanDecision: string;
  status: string;
  updatedAt: string;
};

type ReviewSubmitField = {
  fieldKey: string;
  label: string;
  value: unknown;
};

type FieldReviewComment = ReviewFieldCommentInput;

type ReviewTimelineItem = {
  action: string;
  operatorName: string;
  operatorRole?: string;
  statusType: 'current' | 'danger' | 'muted' | 'success' | 'warning';
  time: string;
};

type ManualReviewItem = {
  aiReviewConclusion: string;
  aiSuggestion: ManualReviewSuggestion;
  assignmentId: string;
  currentRoundSubmit: ReviewSubmitSnapshot;
  deadline: string | null;
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
  deadline: string | null;
  manualCount: number;
  pendingCount: number;
  status: ManualReviewTaskStatus;
  taskId: string;
  taskName: string;
};

type ManualReviewTaskStatus = '复审中' | '待人工复审' | '已完成';

type ManualReviewRoundProgress = {
  totalInRound: number;
  decidedCount: number;
  needsRevisionCount: number;
  pendingCount: number;
};

type ManualReviewStats = {
  pendingReviewCount: number;
  todayPassRateLabel: string;
  todayReviewedCount: number;
};

type DeadlineCountdownStatus = 'normal' | 'warning' | 'danger' | 'expired' | 'unset';

type DeadlineCountdownUnit = {
  key: 'days' | 'hours' | 'minutes' | 'seconds';
  label: '天' | '时' | '分' | '秒';
  value: string;
};

type DeadlineCountdownState = {
  label: string;
  status: DeadlineCountdownStatus;
  units: DeadlineCountdownUnit[];
};

const REVIEW_DECISIONS = new Set(['recheck_pass', 'reject', 'revise_pass']);
const REVIEW_PASS_DECISIONS = new Set(['recheck_pass', 'revise_pass']);
const REVIEW_ITEM_REVIEWABLE_STATUSES = new Set<ReviewQueueItemDto['status']>(['HUMAN_PENDING', 'RECHECK_REVIEWING']);

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
  const [queueItems, setQueueItems] = useState<ReviewQueueItemDto[]>([]);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reviewComment, setReviewComment] = useState('');
  const [sidePanelTab, setSidePanelTab] = useState<ManualReviewSideTab>('timeline');
  const [selectedCommentFieldKey, setSelectedCommentFieldKey] = useState<string | null>(null);
  const [highlightedCommentFieldKey, setHighlightedCommentFieldKey] = useState<string | null>(null);
  const [fieldCommentDraft, setFieldCommentDraft] = useState('');
  const [fieldCommentsBySubmissionId, setFieldCommentsBySubmissionId] = useState<
    Record<string, Record<string, FieldReviewComment>>
  >({});
  const [reviewDetail, setReviewDetail] = useState<ReviewDetailDto | null>(null);
  const [reviewDetailsBySubmissionId, setReviewDetailsBySubmissionId] = useState<Record<string, ReviewDetailDto>>({});
  const [currentTimeMs, setCurrentTimeMs] = useState(() => Date.now());
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const reviewDetailCacheRef = useRef<Map<string, ReviewDetailDto>>(new Map());
  const reviewDetailRequestsRef = useRef<Map<string, Promise<ReviewDetailDto>>>(new Map());
  const reviewDetailPreloadErrorNotifiedRef = useRef(false);
  const localReviewDecisionsRef = useRef<Map<string, LocalReviewDecision>>(new Map());
  const { dismissToast, messages, showErrorToast, showStatusToast } = useToastController();

  const storeReviewDetail = useCallback((submissionId: string, detail: ReviewDetailDto) => {
    reviewDetailCacheRef.current.set(submissionId, detail);
    setReviewDetailsBySubmissionId((current) =>
      current[submissionId] === detail
        ? current
        : {
            ...current,
            [submissionId]: detail,
          },
    );
  }, []);

  const fetchAndCacheReviewDetail = useCallback((submissionId: string): Promise<ReviewDetailDto> => {
    const cachedDetail = reviewDetailCacheRef.current.get(submissionId);
    if (cachedDetail) {
      return Promise.resolve(cachedDetail);
    }

    const inflightRequest = reviewDetailRequestsRef.current.get(submissionId);
    if (inflightRequest) {
      return inflightRequest;
    }

    const request = getReview(submissionId)
      .then((detail) => {
        storeReviewDetail(submissionId, detail);
        return detail;
      })
      .finally(() => {
        reviewDetailRequestsRef.current.delete(submissionId);
      });

    reviewDetailRequestsRef.current.set(submissionId, request);
    return request;
  }, [storeReviewDetail]);

  const preloadReviewDetails = useCallback(
    (items: readonly ReviewQueueItemDto[], selectedId: string | null) => {
      const selectedIndex = selectedId
        ? items.findIndex((item) => item.submissionId === selectedId)
        : -1;
      const preloadQueue = [...items]
        .map((item, index) => ({
          item,
          distance: selectedIndex >= 0 ? Math.abs(index - selectedIndex) : index,
        }))
        .sort((first, second) => first.distance - second.distance);

      for (const { item } of preloadQueue) {
        if (
          reviewDetailCacheRef.current.has(item.submissionId) ||
          reviewDetailRequestsRef.current.has(item.submissionId)
        ) {
          continue;
        }

        void fetchAndCacheReviewDetail(item.submissionId).catch((error) => {
          if (reviewDetailPreloadErrorNotifiedRef.current) {
            return;
          }

          reviewDetailPreloadErrorNotifiedRef.current = true;
          showErrorToast(error instanceof Error
            ? `Reviewer 题目预加载失败：${error.message}`
            : 'Reviewer 题目预加载失败。');
        });
      }
    },
    [fetchAndCacheReviewDetail, showErrorToast],
  );

  const applyCurrentTaskQueueItems = (items: ReviewQueueItemDto[], preserveSubmissionId?: string | null) => {
    if (!taskId) {
      setQueueItems([]);
      setSelectedSubmissionId(null);
      return;
    }

    const scopedItems = mergeLocalReviewDecisions(items.filter((item) => item.taskId === taskId), localReviewDecisionsRef.current);
    const orderedItems = sortReviewQueueItems(scopedItems);
    const nextSelectedSubmissionId = preserveSubmissionId && orderedItems.some((item) => item.submissionId === preserveSubmissionId)
      ? preserveSubmissionId
      : orderedItems[0]?.submissionId ?? null;

    setQueueItems(orderedItems);
    setSelectedSubmissionId(nextSelectedSubmissionId);
    preloadReviewDetails(orderedItems, nextSelectedSubmissionId);
  };

  useEffect(() => {
    const timerId = window.setInterval(() => setCurrentTimeMs(Date.now()), 1000);

    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    let isMounted = true;

    setIsLoading(true);
    setReviewDetail(null);
    setReviewDetailsBySubmissionId({});
    reviewDetailCacheRef.current.clear();
    reviewDetailRequestsRef.current.clear();
    reviewDetailPreloadErrorNotifiedRef.current = false;
    localReviewDecisionsRef.current.clear();
    listPendingReviews({ taskId })
      .then((items) => {
        if (!isMounted) {
          return;
        }

        applyCurrentTaskQueueItems(items);
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

    const cachedDetail = reviewDetailCacheRef.current.get(selectedSubmissionId);
    if (cachedDetail) {
      setReviewDetail(cachedDetail);
      setErrorMessage(null);
      return;
    }

    let isMounted = true;

    setReviewDetail(null);
    fetchAndCacheReviewDetail(selectedSubmissionId)
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
  }, [fetchAndCacheReviewDetail, selectedSubmissionId]);

  const roundProgressByScope = useMemo(() => buildManualReviewRoundProgress(queueItems), [queueItems]);
  const task = useMemo(
    () => buildManualReviewTask(queueItems, reviewDetail, taskId, roundProgressByScope),
    [queueItems, reviewDetail, taskId, roundProgressByScope],
  );
  const visibleItems = useMemo(() => sortReviewQueueItems(queueItems), [queueItems]);
  const selectedQueueItem = useMemo(
    () =>
      queueItems.find((item) => item.submissionId === selectedSubmissionId) ??
      visibleItems[0] ??
      queueItems[0] ??
      null,
    [queueItems, selectedSubmissionId, visibleItems],
  );
  const selectedItemDetail = selectedQueueItem
    ? reviewDetailsBySubmissionId[selectedQueueItem.submissionId] ??
      (reviewDetail?.submission.id === selectedQueueItem.submissionId
        ? reviewDetail
        : reviewDetailCacheRef.current.get(selectedQueueItem.submissionId) ?? null)
    : null;
  const schemaFieldLabels = useMemo(
    () => buildSchemaFieldLabelMap(selectedItemDetail?.task?.schema ?? null),
    [selectedItemDetail?.task?.schema],
  );
  const selectedItem = useMemo(
    () =>
      selectedQueueItem && selectedItemDetail
        ? buildManualReviewItem(
            selectedQueueItem,
            selectedItemDetail,
          )
        : null,
    [selectedItemDetail, selectedQueueItem],
  );
  const selectedFieldComments = selectedItem ? fieldCommentsBySubmissionId[selectedItem.submissionId] ?? {} : {};
  const orderedSubmitFields = useMemo(
    () => buildReviewSubmitFields(selectedItem?.currentRoundSubmit ?? {}, schemaFieldLabels),
    [schemaFieldLabels, selectedItem?.currentRoundSubmit],
  );
  const selectedCommentField = useMemo(
    () => orderedSubmitFields.find((field) => field.fieldKey === selectedCommentFieldKey) ?? null,
    [orderedSubmitFields, selectedCommentFieldKey],
  );
  const deadlineCountdown = buildDeadlineCountdown(selectedItem?.deadline ?? task?.deadline ?? null, currentTimeMs);
  const reviewStats = useMemo(() => buildManualReviewStats(queueItems, currentTimeMs), [currentTimeMs, queueItems]);
  const isCurrentItemReviewable = selectedQueueItem ? isReviewableQueueItem(selectedQueueItem) : false;

  useEffect(() => {
    if (!selectedItem) {
      return;
    }

    setReviewComment('');
    setSelectedCommentFieldKey(null);
    setHighlightedCommentFieldKey(null);
    setFieldCommentDraft('');
    setSidePanelTab('timeline');
    const storedComments = loadStoredFieldReviewComments(selectedItem.submissionId);

    if (Object.keys(storedComments).length > 0) {
      setFieldCommentsBySubmissionId((current) => ({
        ...current,
        [selectedItem.submissionId]: {
          ...storedComments,
          ...(current[selectedItem.submissionId] ?? {}),
        },
      }));
    }
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

  const handleSelectSubmitField = (field: ReviewSubmitField) => {
    if (!selectedItem) {
      return;
    }

    setSidePanelTab('comments');
    if (selectedFieldComments[field.fieldKey]?.comment.trim()) {
      setSelectedCommentFieldKey(field.fieldKey);
      setFieldCommentDraft(selectedFieldComments[field.fieldKey].comment);
      setHighlightedCommentFieldKey(field.fieldKey);
      return;
    }

    setHighlightedCommentFieldKey(field.fieldKey);
    setFieldCommentDraft('');
    setSelectedCommentFieldKey(field.fieldKey);
  };

  const handleCancelFieldComment = () => {
    setSelectedCommentFieldKey(null);
    setHighlightedCommentFieldKey(null);
    setFieldCommentDraft('');
  };

  const handleSendFieldComment = () => {
    if (!selectedItem || !selectedCommentField) {
      return;
    }

    const trimmedComment = fieldCommentDraft.trim();
    if (!trimmedComment) {
      return;
    }

    const nextFieldComment: FieldReviewComment = {
      fieldKey: selectedCommentField.fieldKey,
      label: selectedCommentField.label,
      comment: trimmedComment,
      value: selectedCommentField.value,
    };
    const nextSelectedSubmissionComments = {
      ...selectedFieldComments,
      [selectedCommentField.fieldKey]: nextFieldComment,
    };

    saveStoredFieldReviewComments(selectedItem.submissionId, nextSelectedSubmissionComments);

    setFieldCommentsBySubmissionId((current) => {
      const submissionComments = current[selectedItem.submissionId] ?? {};

      return {
        ...current,
        [selectedItem.submissionId]: {
          ...submissionComments,
          [selectedCommentField.fieldKey]: nextFieldComment,
        },
      };
    });
    setSelectedCommentFieldKey(null);
    setHighlightedCommentFieldKey(selectedCommentField.fieldKey);
    setFieldCommentDraft('');
  };

  const handleReviewAction = async (action: ManualReviewResult) => {
    if (!selectedItem || !selectedQueueItem || !isReviewableQueueItem(selectedQueueItem)) {
      showErrorToast('当前题目不在复核可操作状态。');
      return;
    }

    try {
      let nextReviewDetail: ReviewDetailDto | null = null;
      if (action === 'pass') {
        nextReviewDetail = await passReview(selectedItem.submissionId, { actorId: REVIEWER_ID, comment: reviewComment });
        showStatusToast(`${selectedItem.subId} 已通过入库`);
      } else if (action === 'reject') {
        const fieldReviews = fieldReviewsFromComments(selectedFieldComments, orderedSubmitFields);
        const rejectReason = reviewComment.trim() || DEFAULT_REJECT_REASON;
        nextReviewDetail = await rejectReview(selectedItem.submissionId, {
          actorId: REVIEWER_ID,
          reason: rejectReason,
          ...(fieldReviews.length > 0 ? { fieldReviews } : {}),
        });
        showStatusToast(`${selectedItem.subId} 已打回`);
      }

      if (nextReviewDetail) {
        storeReviewDetail(selectedItem.submissionId, nextReviewDetail);
      }

      const localDecision = action === 'pass' ? 'recheck_pass' : 'reject';
      localReviewDecisionsRef.current.set(selectedItem.submissionId, {
        humanDecision: localDecision,
        status: nextReviewDetail?.submission.status ?? (action === 'reject' ? 'NEEDS_REVISION' : selectedQueueItem.status),
        updatedAt: new Date().toISOString(),
      });

      const locallyUpdatedItems = markQueueItemsReviewed(queueItems, localReviewDecisionsRef.current);
      const nextSelectedSubmissionId =
        findNextReviewableSubmissionId(locallyUpdatedItems, selectedItem.submissionId) ?? selectedItem.submissionId;
      setQueueItems(locallyUpdatedItems);
      setSelectedSubmissionId(nextSelectedSubmissionId);
      clearStoredFieldReviewComments(selectedItem.submissionId);
      setFieldCommentsBySubmissionId((current) => {
        if (!current[selectedItem.submissionId]) {
          return current;
        }

        const next = { ...current };
        delete next[selectedItem.submissionId];
        return next;
      });

      const latestItems = await listPendingReviews({ taskId });
      applyCurrentTaskQueueItems(latestItems, nextSelectedSubmissionId);
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(selectedItem.submissionId);
        return next;
      });
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : '审核操作失败');
    }
  };

  const handleBatchAction = async (action: 'pass' | 'reject') => {
    const selectedItems = visibleItems.filter((item) => selectedIds.has(item.submissionId) && isReviewableQueueItem(item));

    if (selectedItems.length === 0) {
      showErrorToast('请先选择可复核题目');
      return;
    }

    const selectedSubmissionIds = selectedItems.map((item) => item.submissionId);

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
              reason: reviewComment || DEFAULT_REJECT_REASON,
              submissionIds: selectedSubmissionIds,
            });
      const processedCount = result.processedCount || selectedItems.length;
      const latestItems = await listPendingReviews({ taskId });
      applyCurrentTaskQueueItems(latestItems, selectedItem?.submissionId ?? null);
      for (const submissionId of selectedSubmissionIds) {
        clearStoredFieldReviewComments(submissionId);
      }
      setFieldCommentsBySubmissionId((current) => {
        const next = { ...current };
        for (const submissionId of selectedSubmissionIds) {
          delete next[submissionId];
        }
        return next;
      });
      setSelectedIds((current) => {
        const next = new Set(current);
        for (const submissionId of selectedSubmissionIds) {
          next.delete(submissionId);
        }
        return next;
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
        </div>
        {onClose ? (
          <button
            className="workbench-close-button"
            type="button"
            aria-label="关闭人工审核详情"
            onClick={onClose}
            title="关闭人工审核详情"
          >
            <span aria-hidden="true">×</span>
          </button>
        ) : null}
      </header>

      {errorMessage ? <p role="alert">{errorMessage}</p> : null}

      <div className="manual-review-detail-shell">
        <QuestionQueue
          items={visibleItems}
          roundProgressByScope={roundProgressByScope}
          isItemReviewable={isReviewableQueueItem}
          selectedIds={selectedIds}
          selectedSubId={selectedQueueItem?.submissionId ?? null}
          task={task}
          onBatchAction={handleBatchAction}
          onSelectItem={setSelectedSubmissionId}
          onToggleAllSelection={toggleVisibleSelection}
          onToggleSelection={toggleSelection}
        />

        <main
          className="manual-review-detail-main"
          aria-busy={selectedQueueItem && !selectedItem ? true : undefined}
        >
          {selectedItem ? (
            <>
              <div className="manual-review-detail-content">
                <ItemHeader item={selectedItem} task={task} />
                <section className="manual-review-compare-grid" aria-label="本轮提交内容">
                  <QuestionInfoCard
                    aiReviewConclusion={selectedItem.aiReviewConclusion}
                    aiSuggestion={selectedItem.aiSuggestion}
                    fallbackSnapshot={selectedItem.questionInfo}
                    rawData={selectedItemDetail?.taskItem.rawData ?? selectedItem.questionInfo}
                    schema={selectedItemDetail?.task.schema ?? null}
                  />
                  <SubmitSnapshotCard
                    highlight
                    fieldComments={selectedFieldComments}
                    fieldLabels={schemaFieldLabels}
                    onSelectField={handleSelectSubmitField}
                    snapshot={selectedItem.currentRoundSubmit}
                    title="本轮提交"
                  />
                </section>
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
                <button
                  className="is-reject"
                  type="button"
                  disabled={!isCurrentItemReviewable}
                  onClick={() => void handleReviewAction('reject')}
                >
                  <strong>打回</strong>
                  <span>退回标注员修改 · 第 {selectedItem.round + 1} 轮</span>
                </button>
                <button
                  className="is-pass"
                  type="button"
                  disabled={!isCurrentItemReviewable}
                  onClick={() => void handleReviewAction('pass')}
                >
                  <strong>通过 · 入库</strong>
                  <span>本条进入终审 / 可导出</span>
                </button>
              </section>
            </>
          ) : selectedQueueItem ? (
            <div className="manual-review-detail-content">
              <div className="manual-review-empty-card" role="status">
                <h2>正在加载 {selectedQueueItem.externalId}</h2>
                <p>正在读取题目材料、本轮提交内容和审核记录。</p>
              </div>
            </div>
          ) : (
            <div className="manual-review-detail-content">
              <div className="manual-review-empty-card">
                <h2>{isLoading ? '正在加载题目' : '当前暂无题目'}</h2>
                <p>请从左侧选择题目继续操作。</p>
              </div>
            </div>
          )}
        </main>

        <ReviewSidePanel
          activeTab={sidePanelTab}
          deadlineCountdown={deadlineCountdown}
          fieldCommentDraft={fieldCommentDraft}
          fieldComments={selectedFieldComments}
          highlightedFieldKey={highlightedCommentFieldKey}
          item={selectedItem}
          orderedFields={orderedSubmitFields}
          selectedField={selectedCommentField}
          stats={reviewStats}
          task={task}
          onCancelFieldComment={handleCancelFieldComment}
          onFieldCommentDraftChange={setFieldCommentDraft}
          onSendFieldComment={handleSendFieldComment}
          onTabChange={setSidePanelTab}
        />
      </div>
    </section>
  );
};

const QuestionQueue = ({
  items,
  roundProgressByScope,
  isItemReviewable,
  onBatchAction,
  onSelectItem,
  onToggleAllSelection,
  onToggleSelection,
  selectedIds,
  selectedSubId,
  task,
}: {
  items: ReviewQueueItemDto[];
  onBatchAction: (action: 'pass' | 'reject') => void;
  isItemReviewable: (item: ReviewQueueItemDto) => boolean;
  onSelectItem: (submissionId: string) => void;
  onToggleAllSelection: (subIds: string[], shouldSelect: boolean) => void;
  onToggleSelection: (subId: string) => void;
  selectedIds: Set<string>;
  selectedSubId: string | null;
  roundProgressByScope: ReadonlyMap<string, ManualReviewRoundProgress>;
  task: ManualReviewTask | null;
}) => {
  const reviewableSubIds = items.filter((item) => isItemReviewable(item)).map((item) => item.submissionId);
  const reviewableSelectedCount = reviewableSubIds.filter((subId) => selectedIds.has(subId)).length;
  const isAllVisibleSelected = reviewableSubIds.length > 0 && reviewableSelectedCount === reviewableSubIds.length;
  const isPartiallyVisibleSelected =
    reviewableSelectedCount > 0 && reviewableSelectedCount < reviewableSubIds.length;

  return (
    <aside className="manual-review-queue-panel" aria-label="当前任务题目列表">
      <div className="manual-review-batch-toolbar" aria-label="批量操作区">
        <BatchSelectionControl
          isAllSelected={isAllVisibleSelected}
          isPartiallySelected={isPartiallyVisibleSelected}
          selectedCount={reviewableSelectedCount}
          totalCount={reviewableSubIds.length}
          onToggle={(shouldSelect) => onToggleAllSelection(reviewableSubIds, shouldSelect)}
        />
        <button type="button" disabled={reviewableSelectedCount === 0} onClick={() => onBatchAction('pass')}>
          批量通过
        </button>
        <button type="button" disabled={reviewableSelectedCount === 0} onClick={() => onBatchAction('reject')}>
          批量打回
        </button>
      </div>

      <div className="manual-review-question-list">
        {items.length > 0 ? (
          items.map((item) => {
            const viewItem = buildManualReviewItem(item, null);
            const decisionDisplay = resolveManualReviewDecisionLabelByRound(item, roundProgressByScope);

            return (
              <article key={item.submissionId} className={selectedSubId === item.submissionId ? 'is-active' : undefined}>
                <input
                  type="checkbox"
                  aria-label={`选择 ${viewItem.subId}`}
                  checked={isItemReviewable(item) && selectedIds.has(item.submissionId)}
                  disabled={!isItemReviewable(item)}
                  onChange={() => onToggleSelection(item.submissionId)}
                />
                <button
                  type="button"
                  aria-label={viewItem.subId}
                  onClick={() => onSelectItem(item.submissionId)}
                >
                  <span className="manual-review-question-list__summary">
                    <strong>{viewItem.subId}</strong>
                    {decisionDisplay ? (
                      <span className={`manual-review-question-status is-${decisionDisplay.type}`}>{decisionDisplay.text}</span>
                    ) : null}
                  </span>
                </button>
              </article>
            );
          })
        ) : (
          <div className="manual-review-empty-card">
            <p>{task ? '当前暂无题目。' : '正在加载题目。'}</p>
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
        aria-label="全选题目"
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
  aiReviewConclusion,
  aiSuggestion,
  fallbackSnapshot,
  rawData,
  schema,
}: {
  aiReviewConclusion: string;
  aiSuggestion: ManualReviewSuggestion;
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
        <AiReviewInlineStatus conclusion={aiReviewConclusion} suggestion={aiSuggestion} />
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

const AiReviewInlineStatus = ({
  conclusion,
  suggestion,
}: {
  conclusion: string;
  suggestion: ManualReviewSuggestion;
}) => (
  <div className={`manual-review-ai-inline-status is-${suggestion}`} aria-label="AI 预审结果">
    <strong>AI 预审</strong>
    <span>{aiReviewStatusText(conclusion, suggestion)}</span>
  </div>
);

const SubmitSnapshotCard = ({
  fieldComments,
  fieldLabels,
  highlight = false,
  onSelectField,
  snapshot,
  title,
}: {
  fieldComments?: Record<string, FieldReviewComment>;
  fieldLabels?: ReadonlyMap<string, string>;
  highlight?: boolean;
  onSelectField?: (field: ReviewSubmitField) => void;
  snapshot: ReviewSubmitSnapshot;
  title: string;
}) => (
  <article className={highlight ? 'manual-review-submit-card is-highlight' : 'manual-review-submit-card'}>
    <h3>{title}</h3>
    <dl>
      {Object.entries(snapshot).map(([key, value]) => {
        const label = fieldLabels?.get(key) ?? key;
        const hasComment = Boolean(fieldComments?.[key]?.comment.trim());
        const handleFieldSelect = () => onSelectField?.({ fieldKey: key, label, value });
        const handleFieldKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
          if (!onSelectField || (event.key !== 'Enter' && event.key !== ' ')) {
            return;
          }

          event.preventDefault();
          handleFieldSelect();
        };

        return (
          <div
            key={key}
            aria-label={onSelectField ? `评论字段 ${label}` : undefined}
            className={hasComment ? 'has-review-comment' : undefined}
            role={onSelectField ? 'button' : undefined}
            tabIndex={onSelectField ? 0 : undefined}
            onClick={onSelectField ? handleFieldSelect : undefined}
            onKeyDown={onSelectField ? handleFieldKeyDown : undefined}
          >
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

const ReviewSidePanel = ({
  activeTab,
  deadlineCountdown,
  fieldCommentDraft,
  fieldComments,
  highlightedFieldKey,
  item,
  onCancelFieldComment,
  onFieldCommentDraftChange,
  onSendFieldComment,
  onTabChange,
  orderedFields,
  selectedField,
  stats,
  task,
}: {
  activeTab: ManualReviewSideTab;
  deadlineCountdown: DeadlineCountdownState;
  fieldCommentDraft: string;
  fieldComments: Record<string, FieldReviewComment>;
  highlightedFieldKey: string | null;
  item: ManualReviewItem | null;
  orderedFields: ReviewSubmitField[];
  selectedField: ReviewSubmitField | null;
  stats: ManualReviewStats;
  task: ManualReviewTask | null;
  onCancelFieldComment: () => void;
  onFieldCommentDraftChange: (comment: string) => void;
  onSendFieldComment: () => void;
  onTabChange: (tab: ManualReviewSideTab) => void;
}) => (
  <aside className="manual-review-side-panel" aria-label="人工审核侧栏">
    <section className="manual-review-stats" aria-label="审核统计">
      <div>
        <span>今日已审</span>
        <strong className="is-blue">{stats.todayReviewedCount.toLocaleString()}</strong>
      </div>
      <div>
        <span>今日通过率</span>
        <strong className="is-green">{stats.todayPassRateLabel}</strong>
      </div>
      <div>
        <span>待我审核</span>
        <strong className="is-orange">{stats.pendingReviewCount.toLocaleString()}</strong>
      </div>
      <DeadlineCountdownCard countdown={deadlineCountdown} />
    </section>

    <div className="manual-review-side-tabs" role="tablist" aria-label="人工审核侧栏视图">
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'timeline'}
        onClick={() => onTabChange('timeline')}
      >
        时间线
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'comments'}
        onClick={() => onTabChange('comments')}
      >
        评论
      </button>
    </div>

    {activeTab === 'comments' ? (
      <FieldCommentPanel
        draft={fieldCommentDraft}
        field={selectedField}
        fieldComments={fieldComments}
        highlightedFieldKey={highlightedFieldKey}
        orderedFields={orderedFields}
        onCancel={onCancelFieldComment}
        onChangeDraft={onFieldCommentDraftChange}
        onSend={onSendFieldComment}
      />
    ) : item ? (
      <TimelinePanel item={item} />
    ) : null}
  </aside>
);

const DeadlineCountdownCard = ({ countdown }: { countdown: DeadlineCountdownState }) => (
  <div className={`manual-review-deadline-card is-${countdown.status}`} aria-label="剩余处理时限">
    <span>剩余处理时限</span>
    {countdown.status === 'expired' || countdown.status === 'unset' ? (
      <strong className="manual-review-deadline-card__message">{countdown.label}</strong>
    ) : (
      <div className="manual-review-countdown" aria-label={countdown.label}>
        {countdown.units.map((unit) => (
          <span className="manual-review-countdown__unit" key={unit.key}>
            <strong className="manual-review-countdown__number" key={`${unit.key}-${unit.value}`}>
              {unit.value}
            </strong>
            <small>{unit.label}</small>
          </span>
        ))}
      </div>
    )}
  </div>
);

const FieldCommentPanel = ({
  draft,
  field,
  fieldComments,
  highlightedFieldKey,
  onCancel,
  onChangeDraft,
  onSend,
  orderedFields,
}: {
  draft: string;
  field: ReviewSubmitField | null;
  fieldComments: Record<string, FieldReviewComment>;
  highlightedFieldKey: string | null;
  orderedFields: ReviewSubmitField[];
  onCancel: () => void;
  onChangeDraft: (comment: string) => void;
  onSend: () => void;
}) => {
  const sentComments = orderedFieldComments(fieldComments, orderedFields);
  const highlightedCommentRef = useRef<HTMLElement | null>(null);
  const commentTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    highlightedCommentRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [highlightedFieldKey, sentComments.length]);

  useEffect(() => {
    const textarea = commentTextareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = 'auto';
    const nextHeight = Math.min(textarea.scrollHeight, FIELD_COMMENT_TEXTAREA_MAX_HEIGHT);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > FIELD_COMMENT_TEXTAREA_MAX_HEIGHT ? 'auto' : 'hidden';
  }, [draft, field?.fieldKey]);

  return (
    <section className="manual-review-field-comment-panel" aria-label="字段评论">
      {field ? (
        <section
          aria-current={field.fieldKey === highlightedFieldKey ? 'true' : undefined}
          className={
            field.fieldKey === highlightedFieldKey
              ? 'manual-review-field-comment-editor is-highlighted'
              : 'manual-review-field-comment-editor'
          }
          aria-label={`编辑字段评论：${field.label}`}
        >
          <header className="manual-review-field-comment-editor__topline">
            <span>{fieldCommentTitle(field.label)}</span>
          </header>
          <textarea
            ref={commentTextareaRef}
            aria-label={`字段评论：${field.label}`}
            placeholder="写下这一个字段需要修改的原因"
            rows={1}
            value={draft}
            onChange={(event) => onChangeDraft(event.target.value)}
          />
          <div className="manual-review-field-comment-editor__actions">
            <button type="button" onClick={onCancel}>
              取消
            </button>
            <button type="button" disabled={!draft.trim()} onClick={onSend}>
              发送
            </button>
          </div>
        </section>
      ) : null}

      {sentComments.length > 0 ? (
        <div className="manual-review-field-comment-list" aria-label="已发送字段评论">
          {sentComments.map((comment) => {
            const isHighlighted = comment.fieldKey === highlightedFieldKey;

            return (
              <article
                ref={isHighlighted ? highlightedCommentRef : undefined}
                aria-current={isHighlighted ? 'true' : undefined}
                className={isHighlighted ? 'manual-review-field-comment-card is-highlighted' : 'manual-review-field-comment-card'}
                key={comment.fieldKey}
              >
                <h3>{fieldCommentTitle(comment.label)}</h3>
                <p>{comment.comment}</p>
              </article>
            );
          })}
        </div>
      ) : null}

      {!field && sentComments.length === 0 ? (
        <p className="manual-review-field-comment-panel__empty">点击本轮提交字段添加评论。</p>
      ) : null}
    </section>
  );
};

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

function buildManualReviewTask(
  queueItems: ReviewQueueItemDto[],
  detail: ReviewDetailDto | null,
  taskId: string | undefined,
  roundProgressByScope: ReadonlyMap<string, ManualReviewRoundProgress>,
): ManualReviewTask | null {
  const taskRoundProgress = getCurrentRoundProgress(queueItems, taskId, roundProgressByScope);
  const firstItem = queueItems[0];

  if (!firstItem && !detail && !taskId) {
    return null;
  }

  return {
    taskId: firstItem?.taskId ?? detail?.task.id ?? taskId ?? '',
    taskName: detail?.task.title ?? firstItem?.taskTitle ?? '人工审核任务',
    deadline: firstItem?.deadline ?? null,
    pendingCount: taskRoundProgress.pendingCount,
    aiPassCount: countByTab(queueItems, 'pass'),
    aiRejectCount: countByTab(queueItems, 'reject'),
    manualCount: countByTab(queueItems, 'manual'),
    status: resolveManualReviewTaskStatus(taskRoundProgress),
  };
}

function buildManualReviewStats(queueItems: ReviewQueueItemDto[], currentTimeMs: number): ManualReviewStats {
  const todayReviewedItems = queueItems.filter((item) => {
    if (!REVIEW_DECISIONS.has(item.humanDecision ?? '')) {
      return false;
    }

    return isSameLocalDate(item.updatedAt, currentTimeMs);
  });
  const todayPassCount = todayReviewedItems.filter((item) => REVIEW_PASS_DECISIONS.has(item.humanDecision ?? '')).length;

  return {
    pendingReviewCount: queueItems.filter(isReviewableQueueItem).length,
    todayPassRateLabel: formatPassRate(todayPassCount, todayReviewedItems.length),
    todayReviewedCount: todayReviewedItems.length,
  };
}

function buildReviewSubmitFields(
  snapshot: ReviewSubmitSnapshot,
  fieldLabels: ReadonlyMap<string, string>,
): ReviewSubmitField[] {
  return Object.entries(snapshot).map(([fieldKey, value]) => ({
    fieldKey,
    label: fieldLabels.get(fieldKey) ?? fieldKey,
    value,
  }));
}

function buildManualReviewItem(queueItem: ReviewQueueItemDto, detail: ReviewDetailDto | null): ManualReviewItem {
  const scores = detail?.aiReview?.scores ?? queueItem.aiScores ?? {};
  const answers = detail?.submission.answers ?? {};
  const rawData = detail?.taskItem.rawData ?? {};
  const aiSuggestion = normalizeSuggestion(queueItem.aiDecision ?? detail?.aiReview?.decision ?? null);
  const subId = detail?.taskItem.externalId ?? queueItem.externalId;

  return {
    aiReviewConclusion: detail?.aiReview?.comment ?? queueItem.aiComment ?? '暂无 AI 预审结论。',
    aiSuggestion,
    assignmentId: queueItem.assignmentId,
    currentRoundSubmit: Object.keys(answers).length > 0 ? answers : { externalId: subId },
    deadline: queueItem.deadline,
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

function isSameLocalDate(value: string, currentTimeMs: number): boolean {
  const date = new Date(value);
  const current = new Date(currentTimeMs);

  return (
    date.getFullYear() === current.getFullYear() &&
    date.getMonth() === current.getMonth() &&
    date.getDate() === current.getDate()
  );
}

function formatPassRate(passCount: number, totalCount: number): string {
  if (totalCount === 0) {
    return '--';
  }

  return `${Math.round((passCount / totalCount) * 100)}%`;
}

function countByTab(queueItems: ReviewQueueItemDto[], tab: ManualReviewSuggestion): number {
  return queueItems.filter((item) => normalizeSuggestion(item.aiDecision) === tab).length;
}

function mergeLocalReviewDecisions(
  items: ReviewQueueItemDto[],
  localDecisions: ReadonlyMap<string, LocalReviewDecision>,
): ReviewQueueItemDto[] {
  return items.map((item) => {
    if (REVIEW_DECISIONS.has(item.humanDecision ?? '')) {
      return item;
    }

    const localDecision = localDecisions.get(item.submissionId);
    if (!localDecision) {
      return item;
    }

    return {
      ...item,
      humanDecision: localDecision.humanDecision,
      status: localDecision.status,
      updatedAt: localDecision.updatedAt,
    };
  });
}

function markQueueItemsReviewed(
  items: ReviewQueueItemDto[],
  localDecisions: ReadonlyMap<string, LocalReviewDecision>,
): ReviewQueueItemDto[] {
  return sortReviewQueueItems(mergeLocalReviewDecisions(items, localDecisions));
}

function findNextReviewableSubmissionId(items: ReviewQueueItemDto[], currentSubmissionId: string): string | null {
  const orderedItems = sortReviewQueueItems(items);
  const currentIndex = orderedItems.findIndex((item) => item.submissionId === currentSubmissionId);
  const afterCurrent = currentIndex >= 0 ? orderedItems.slice(currentIndex + 1) : orderedItems;
  const beforeCurrent = currentIndex >= 0 ? orderedItems.slice(0, currentIndex) : [];
  const nextItem = [...afterCurrent, ...beforeCurrent].find(isReviewableQueueItem);

  return nextItem?.submissionId ?? null;
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

function isReviewableQueueItem(item: ReviewQueueItemDto): boolean {
  return REVIEW_ITEM_REVIEWABLE_STATUSES.has(item.status) && !item.humanDecision;
}

function resolveManualReviewDecisionLabel(
  humanDecision: string | null,
): { text: string; type: 'pass' | 'reject' } | null {
  if (humanDecision === 'recheck_pass' || humanDecision === 'revise_pass') {
    return { text: '通过', type: 'pass' };
  }

  if (humanDecision === 'reject') {
    return { text: '打回', type: 'reject' };
  }

  return null;
}

const reviewQueueItemSorter = new Intl.Collator('zh-Hans-CN', {
  numeric: true,
  sensitivity: 'base',
});

function buildManualReviewRoundProgress(queueItems: ReviewQueueItemDto[]): ReadonlyMap<string, ManualReviewRoundProgress> {
  const byScope = new Map<string, ManualReviewRoundProgress>();

  for (const item of queueItems) {
    const scope = reviewQueueItemScope(item.taskId, item.round);
    if (item.totalInRound > 0) {
      byScope.set(scope, {
        totalInRound: item.totalInRound,
        decidedCount: item.decidedCount,
        needsRevisionCount: item.needsRevisionCount,
        pendingCount: item.pendingCount,
      });
      continue;
    }

    const current = byScope.get(scope) ?? {
      totalInRound: 0,
      decidedCount: 0,
      needsRevisionCount: 0,
      pendingCount: 0,
    };
    const isDecisionMade = isReviewDecisionMade(item);

    byScope.set(scope, {
      totalInRound: current.totalInRound + 1,
      decidedCount: current.decidedCount + (isDecisionMade ? 1 : 0),
      needsRevisionCount: current.needsRevisionCount + (isReviewRejectedItem(item) ? 1 : 0),
      pendingCount: current.pendingCount + (isDecisionMade ? 0 : 1),
    });
  }

  return byScope;
}

function getCurrentRoundProgress(
  queueItems: ReviewQueueItemDto[],
  taskId: string | undefined,
  roundProgressByScope: ReadonlyMap<string, ManualReviewRoundProgress>,
): ManualReviewRoundProgress {
  let latestRound = -1;
  let result: ManualReviewRoundProgress = {
    totalInRound: 0,
    decidedCount: 0,
    needsRevisionCount: 0,
    pendingCount: 0,
  };

  for (const item of queueItems) {
    if (!taskId || item.taskId !== taskId) {
      continue;
    }

    if (item.round < latestRound) {
      continue;
    }

    if (item.round > latestRound) {
      latestRound = item.round;
      result = roundProgressByScope.get(reviewQueueItemScope(item.taskId, item.round)) ?? result;
    }
  }

  return result;
}

function resolveManualReviewTaskStatus(progress: ManualReviewRoundProgress): ManualReviewTaskStatus {
  if (progress.pendingCount > 0) {
    return '复审中';
  }

  if (progress.needsRevisionCount > 0) {
    return '待人工复审';
  }

  return '已完成';
}

function resolveManualReviewDecisionLabelByRound(
  queueItem: ReviewQueueItemDto,
  roundProgressByScope: ReadonlyMap<string, ManualReviewRoundProgress>,
): { text: string; type: 'pass' | 'reject' } | null {
  const scopeProgress = roundProgressByScope.get(reviewQueueItemScope(queueItem.taskId, queueItem.round));
  if (!scopeProgress) {
    return null;
  }

  if (scopeProgress.pendingCount > 0) {
    if (queueItem.humanDecision === 'reject') {
      return { text: '已标记待改', type: 'reject' };
    }

    if (queueItem.humanDecision && REVIEW_PASS_DECISIONS.has(queueItem.humanDecision)) {
      return { text: '已通过', type: 'pass' };
    }

    if (queueItem.humanDecision && REVIEW_DECISIONS.has(queueItem.humanDecision)) {
      return null;
    }

    return { text: queueItem.round > 1 ? '待人工复审' : '待决策', type: 'reject' };
  }

  if (queueItem.humanDecision === 'reject' || queueItem.status === 'NEEDS_REVISION') {
    return { text: '待人工复审', type: 'reject' };
  }

  if (queueItem.humanDecision || queueItem.status === 'FINAL_APPROVED') {
    return { text: '已通过', type: 'pass' };
  }

  return null;
}

function isReviewDecisionMade(item: ReviewQueueItemDto): boolean {
  return REVIEW_DECISIONS.has(item.humanDecision ?? '') || item.status === 'FINAL_APPROVED' || item.status === 'NEEDS_REVISION';
}

function isReviewRejectedItem(item: ReviewQueueItemDto): boolean {
  return item.humanDecision === 'reject' || item.status === 'NEEDS_REVISION';
}

function reviewQueueItemScope(taskId: string, round: number): string {
  return `${taskId}::${round}`;
}

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

function orderedFieldComments(
  fieldComments: Record<string, FieldReviewComment>,
  orderedFields: readonly ReviewSubmitField[],
): FieldReviewComment[] {
  const orderedFieldKeys = new Set(orderedFields.map((field) => field.fieldKey));
  const orderedComments = orderedFields
    .map((field) => fieldComments[field.fieldKey])
    .filter((fieldComment): fieldComment is FieldReviewComment => Boolean(fieldComment?.comment.trim()));
  const extraComments = Object.values(fieldComments).filter(
    (fieldComment) => !orderedFieldKeys.has(fieldComment.fieldKey) && fieldComment.comment.trim(),
  );

  return [...orderedComments, ...extraComments];
}

function fieldReviewCommentStorageKey(submissionId: string): string {
  return `${FIELD_REVIEW_COMMENT_STORAGE_PREFIX}:${REVIEWER_ID}:${submissionId}`;
}

function loadStoredFieldReviewComments(submissionId: string): Record<string, FieldReviewComment> {
  if (typeof window === 'undefined') {
    return {};
  }

  const storedValue = window.localStorage.getItem(fieldReviewCommentStorageKey(submissionId));
  if (!storedValue) {
    return {};
  }

  const parsedValue: unknown = JSON.parse(storedValue);
  if (!isFieldReviewCommentMap(parsedValue)) {
    throw new Error(`字段评论草稿格式错误：${fieldReviewCommentStorageKey(submissionId)}`);
  }

  return parsedValue;
}

function saveStoredFieldReviewComments(
  submissionId: string,
  fieldComments: Record<string, FieldReviewComment>,
): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(fieldReviewCommentStorageKey(submissionId), JSON.stringify(fieldComments));
}

function clearStoredFieldReviewComments(submissionId: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(fieldReviewCommentStorageKey(submissionId));
}

function isFieldReviewCommentMap(value: unknown): value is Record<string, FieldReviewComment> {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.entries(value).every(([fieldKey, fieldComment]) =>
        isFieldReviewComment(fieldKey, fieldComment),
      ),
  );
}

function isFieldReviewComment(fieldKey: string, value: unknown): value is FieldReviewComment {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      (value as FieldReviewComment).fieldKey === fieldKey &&
      typeof (value as FieldReviewComment).label === 'string' &&
      typeof (value as FieldReviewComment).comment === 'string',
  );
}

function fieldCommentTitle(label: string): string {
  return `针对「${label}」的修改建议`;
}

function fieldReviewsFromComments(
  fieldComments: Record<string, FieldReviewComment>,
  orderedFields: readonly ReviewSubmitField[],
): ReviewFieldCommentInput[] {
  return orderedFieldComments(fieldComments, orderedFields)
    .map((fieldComment) => ({
      fieldKey: fieldComment.fieldKey,
      label: fieldComment.label,
      comment: fieldComment.comment.trim(),
      value: fieldComment.value,
    }))
    .filter((fieldComment) => fieldComment.comment.length > 0);
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

function scoreLabel(key: string): string {
  const labels: Record<string, string> = {
    accuracy: '准确性',
    format: '格式合规',
    relevance: '相关性',
    safety: '安全性',
  };

  return labels[key] ?? key;
}

function aiReviewStatusText(conclusion: string, suggestion: ManualReviewSuggestion): string {
  if (suggestion === 'pass') {
    return '所有开启 AI 预审的字段均通过。';
  }

  return conclusion;
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

function buildDeadlineCountdown(value: string | null, nowMs: number): DeadlineCountdownState {
  if (!value) {
    return { label: '未设置', status: 'unset', units: [] };
  }

  const deadlineMs = new Date(value).getTime();
  if (!Number.isFinite(deadlineMs)) {
    return { label: '未设置', status: 'unset', units: [] };
  }

  const remainingMs = deadlineMs - nowMs;
  if (remainingMs <= 0) {
    return { label: '已超时', status: 'expired', units: [] };
  }

  const totalSeconds = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const status =
    remainingMs < 2 * 60 * 60 * 1000
      ? 'danger'
      : remainingMs < 24 * 60 * 60 * 1000
        ? 'warning'
        : 'normal';

  const units: DeadlineCountdownUnit[] = [
    { key: 'days', label: '天', value: formatCountdownUnit(days) },
    { key: 'hours', label: '时', value: formatCountdownUnit(hours) },
    { key: 'minutes', label: '分', value: formatCountdownUnit(minutes) },
    { key: 'seconds', label: '秒', value: formatCountdownUnit(seconds) },
  ];

  return {
    label: `剩余 ${units.map((unit) => `${unit.value}${unit.label}`).join(' ')}`,
    status,
    units,
  };
}

function formatCountdownUnit(value: number): string {
  return String(Math.max(0, value)).padStart(2, '0');
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
    return '王昱阳';
  }
  if (userId === 'user_reviewer_wang_fang' || userId === 'reviewer_1') {
    return '鑫泽张';
  }
  if (!userId) {
    return '系统';
  }

  return userId;
}
