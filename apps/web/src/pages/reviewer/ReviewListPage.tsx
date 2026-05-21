import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { SUBMISSION_STATUS_LABELS } from '@labelhub/shared';
import {
  assignReviews,
  batchPassReviews,
  batchRejectReviews,
  getReview,
  listPendingReviews,
  passReview,
  rejectReview,
  reviseAndPassReview,
  startReview,
  type ReviewDetailDto,
  type ReviewQueueItemDto,
} from '../../api/reviews';
import { AiReviewSummary } from '../../features/review/AiReviewSummary';
import { AuditTimeline } from '../../features/review/AuditTimeline';
import { BatchReviewToolbar } from '../../features/review/BatchReviewToolbar';
import { ReviewDecisionPanel } from '../../features/review/ReviewDecisionPanel';
import { RoundSelector } from '../../features/review/RoundSelector';

const REVIEWER_ID = 'user_reviewer_wang_fang';

const AI_DECISION_OPTIONS = [
  { label: '全部 AI 结论', value: '' },
  { label: '建议通过', value: 'pass' },
  { label: '转人工', value: 'manual' },
  { label: '建议打回', value: 'reject' },
];

export const ReviewListPage = () => {
  const [reviews, setReviews] = useState<ReviewQueueItemDto[]>([]);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<ReviewDetailDto | null>(null);
  const [aiDecision, setAiDecision] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  const selectedReview = useMemo(
    () => reviews.find((review) => review.submissionId === selectedSubmissionId) ?? reviews[0] ?? null,
    [reviews, selectedSubmissionId],
  );
  const selectedIdList = useMemo(() => Array.from(selectedIds), [selectedIds]);
  const summary = useMemo(
    () => ({
      pending: reviews.filter((review) => review.status === 'HUMAN_PENDING').length,
      reviewing: reviews.filter((review) => review.status === 'RECHECK_REVIEWING').length,
      manual: reviews.filter((review) => review.aiDecision === 'manual').length,
      assigned: reviews.filter((review) => review.assignedReviewerId).length,
    }),
    [reviews],
  );

  useEffect(() => {
    void loadReviews();
  }, []);

  useEffect(() => {
    if (!selectedReview) {
      setDetail(null);
      return;
    }

    setSelectedSubmissionId(selectedReview.submissionId);
    void loadDetail(selectedReview.submissionId);
  }, [selectedReview?.submissionId]);

  const loadReviews = async (nextAiDecision = aiDecision) => {
    setIsLoading(true);
    try {
      const nextReviews = await listPendingReviews({
        ...(nextAiDecision ? { aiDecision: nextAiDecision } : {}),
      });
      setReviews(nextReviews);
      setSelectedSubmissionId((current) =>
        current && nextReviews.some((review) => review.submissionId === current)
          ? current
          : nextReviews[0]?.submissionId ?? null,
      );
      setSelectedIds((current) => new Set([...current].filter((id) => nextReviews.some((review) => review.submissionId === id))));
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '人工复审列表加载失败。');
    } finally {
      setIsLoading(false);
    }
  };

  const loadDetail = async (submissionId: string) => {
    setIsDetailLoading(true);
    try {
      setDetail(await getReview(submissionId));
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '人工复审详情加载失败。');
    } finally {
      setIsDetailLoading(false);
    }
  };

  const handleAction = async (action: () => Promise<ReviewDetailDto>, message: string) => {
    setIsBusy(true);
    try {
      const nextDetail = await action();
      setDetail(nextDetail);
      setStatusMessage(message);
      setErrorMessage(null);
      await loadReviews();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '人工复审操作失败。');
    } finally {
      setIsBusy(false);
    }
  };

  const handleBatchPass = async (comment: string) => {
    if (selectedIdList.length === 0) {
      setErrorMessage('请选择需要批量处理的提交。');
      return;
    }

    setIsBusy(true);
    try {
      const result = await batchPassReviews({
        actorId: REVIEWER_ID,
        submissionIds: selectedIdList,
        ...(comment ? { comment } : {}),
      });
      setStatusMessage(`已批量通过 ${result.processedCount.toLocaleString()} 条提交。`);
      setErrorMessage(null);
      setSelectedIds(new Set());
      await loadReviews();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '批量通过失败。');
    } finally {
      setIsBusy(false);
    }
  };

  const handleBatchReject = async (reason: string) => {
    if (!reason) {
      setErrorMessage('批量打回必须填写统一理由。');
      return;
    }
    if (selectedIdList.length === 0) {
      setErrorMessage('请选择需要批量处理的提交。');
      return;
    }

    setIsBusy(true);
    try {
      const result = await batchRejectReviews({
        actorId: REVIEWER_ID,
        submissionIds: selectedIdList,
        reason,
      });
      setStatusMessage(`已批量打回 ${result.processedCount.toLocaleString()} 条提交。`);
      setErrorMessage(null);
      setSelectedIds(new Set());
      await loadReviews();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '批量打回失败。');
    } finally {
      setIsBusy(false);
    }
  };

  const handleAssign = async (reviewerId: string) => {
    if (!reviewerId) {
      setErrorMessage('指派审核员不能为空。');
      return;
    }
    if (selectedIdList.length === 0) {
      setErrorMessage('请选择需要指派的提交。');
      return;
    }

    setIsBusy(true);
    try {
      const result = await assignReviews({
        actorId: REVIEWER_ID,
        reviewerId,
        submissionIds: selectedIdList,
      });
      setStatusMessage(`已指派 ${result.processedCount.toLocaleString()} 条提交。`);
      setErrorMessage(null);
      await loadReviews();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '指派审核员失败。');
    } finally {
      setIsBusy(false);
    }
  };

  const toggleSelection = (submissionId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(submissionId)) {
        next.delete(submissionId);
      } else {
        next.add(submissionId);
      }

      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(reviews.map((review) => review.submissionId)));

  return (
    <section className="human-review-page" aria-labelledby="human-review-title">
      <div className="human-review-header">
        <div>
          <p className="eyebrow">人工复审 / 工作台</p>
          <h1 id="human-review-title">人工复审工作台</h1>
          <p>对 AI 预审后的提交进行复核、打回、直接修订和批量处理。</p>
        </div>
        <dl>
          <SummaryMetric label="待复审" value={summary.pending} />
          <SummaryMetric label="复审中" value={summary.reviewing} />
          <SummaryMetric label="转人工" value={summary.manual} />
          <SummaryMetric label="已指派" value={summary.assigned} />
        </dl>
      </div>

      {statusMessage || errorMessage ? (
        <div className="task-status-message" role={errorMessage ? 'alert' : undefined} aria-live="polite">
          {statusMessage ? <span>{statusMessage}</span> : null}
          {errorMessage ? <span>{errorMessage}</span> : null}
        </div>
      ) : null}

      <div className="human-review-layout">
        <aside className="human-review-queue" aria-label="待复审队列">
          <div className="human-review-filter">
            <select
              aria-label="AI 结论筛选"
              value={aiDecision}
              onChange={(event) => setAiDecision(event.target.value)}
            >
              {AI_DECISION_OPTIONS.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => void loadReviews()}>
              筛选
            </button>
          </div>
          {isLoading && reviews.length === 0 ? <p>正在加载待复审队列。</p> : null}
          <div className="human-review-list">
            {reviews.map((review) => (
              <article key={review.submissionId} className={review.submissionId === selectedReview?.submissionId ? 'is-active' : ''}>
                <input
                  type="checkbox"
                  aria-label={`选择 ${review.externalId}`}
                  checked={selectedIds.has(review.submissionId)}
                  onChange={() => toggleSelection(review.submissionId)}
                />
                <button type="button" onClick={() => setSelectedSubmissionId(review.submissionId)}>
                  <strong>任务：{review.taskTitle}</strong>
                  <span>
                    {review.externalId} · 第 {review.round} 轮 · {statusLabel(review.status)}
                  </span>
                  <em>AI：{review.aiComment ?? decisionLabel(review.aiDecision)}</em>
                </button>
              </article>
            ))}
          </div>
          {!isLoading && reviews.length === 0 ? (
            <div className="review-empty">
              <strong>暂无待复审数据</strong>
              <span>切换 AI 结论筛选或等待 AI 预审入队。</span>
            </div>
          ) : null}
        </aside>

        <main className="human-review-main">
          {detail ? (
            <>
              <header className="human-review-main__topline">
                <div>
                  <span>{DATASET_KIND_LABELS[detail.task.datasetKind]}</span>
                  <h2>{detail.task.title}</h2>
                  <p>
                    {detail.taskItem.externalId} · {statusLabel(detail.submission.status)} · 第 {detail.submission.round} 轮
                  </p>
                </div>
                <Link className="primary-link" to={`/reviewer/reviews/${detail.submission.id}`}>
                  打开详情
                </Link>
              </header>
              <div className="human-review-compare">
                <JsonPanel title="题目原文" subtitle={detail.taskItem.externalId} value={detail.taskItem.rawData} />
                <JsonPanel title="首次标注" subtitle={detail.submission.schemaVersion} value={detail.submission.answers} />
              </div>
              <RoundSelector assignmentId={detail.submission.assignmentId} />
              <AiReviewSummary
                record={detail.aiReview}
                fallbackComment={selectedReview?.aiComment}
                fallbackScores={selectedReview?.aiScores}
              />
              <ReviewDecisionPanel
                detail={detail}
                isBusy={isBusy || isDetailLoading}
                onStart={() =>
                  void handleAction(
                    () => startReview(detail.submission.id, { actorId: REVIEWER_ID }),
                    '已开始人工复审。',
                  )
                }
                onPass={(comment) =>
                  void handleAction(
                    () => passReview(detail.submission.id, { actorId: REVIEWER_ID, ...(comment ? { comment } : {}) }),
                    '已通过复审，进入终审待办。',
                  )
                }
                onReject={(reason) =>
                  void handleAction(
                    () => rejectReview(detail.submission.id, { actorId: REVIEWER_ID, reason }),
                    '已打回给标注员。',
                  )
                }
                onReviseAndPass={(input) =>
                  void handleAction(
                    () =>
                      reviseAndPassReview(detail.submission.id, {
                        actorId: REVIEWER_ID,
                        comment: input.comment,
                        revisedAnswers: input.revisedAnswers,
                      }),
                    '已修订并进入终审待办。',
                  )
                }
              />
            </>
          ) : (
            <div className="review-empty">
              <strong>请选择一条待复审提交</strong>
              <span>左侧队列会按 AI 结论、状态和轮次展示。</span>
            </div>
          )}
        </main>

        <aside className="human-review-side">
          <BatchReviewToolbar
            selectedCount={selectedIds.size}
            selectedIds={selectedIdList}
            totalCount={reviews.length}
            isBusy={isBusy}
            onSelectAll={selectAll}
            onClearSelection={() => setSelectedIds(new Set())}
            onBatchPass={(comment) => void handleBatchPass(comment)}
            onBatchReject={(reason) => void handleBatchReject(reason)}
            onAssign={(reviewerId) => void handleAssign(reviewerId)}
          />
          {detail ? <AuditTimeline items={detail.timeline} /> : null}
        </aside>
      </div>
    </section>
  );
};

const SummaryMetric = ({ label, value }: { label: string; value: number }) => (
  <div>
    <dt>{label}</dt>
    <dd>{value.toLocaleString()}</dd>
  </div>
);

const JsonPanel = ({ title, subtitle, value }: { title: string; subtitle: string; value: unknown }) => (
  <section className="review-panel">
    <header className="review-panel__heading">
      <div>
        <span>{subtitle}</span>
        <h3>{title}</h3>
      </div>
    </header>
    <pre>{JSON.stringify(value, null, 2)}</pre>
  </section>
);

function statusLabel(status: string): string {
  return SUBMISSION_STATUS_LABELS[status as keyof typeof SUBMISSION_STATUS_LABELS] ?? status;
}

function decisionLabel(decision: string | null): string {
  if (decision === 'pass') {
    return '建议通过';
  }
  if (decision === 'manual') {
    return '转人工判断';
  }
  if (decision === 'reject') {
    return '建议打回';
  }

  return '等待 AI 结论';
}

const DATASET_KIND_LABELS: Record<ReviewQueueItemDto['datasetKind'], string> = {
  qa_quality: '问答质量',
  preference_compare: '偏好对比',
  generic_json: '通用 JSON',
};
