import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { SUBMISSION_STATUS_LABELS } from '@labelhub/shared';
import {
  finalPassReview,
  finalRejectReview,
  getReview,
  listFinalPendingReviews,
  type ReviewDetailDto,
  type ReviewQueueItemDto,
} from '../../api/reviews';
import { AiReviewSummary } from '../../features/review/AiReviewSummary';
import { AuditTimeline } from '../../features/review/AuditTimeline';
import { RoundSelector } from '../../features/review/RoundSelector';

const REVIEWER_ID = 'user_reviewer_wang_fang';

export const FinalReviewPage = () => {
  const [reviews, setReviews] = useState<ReviewQueueItemDto[]>([]);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReviewDetailDto | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  const selectedReview = useMemo(
    () => reviews.find((review) => review.submissionId === selectedSubmissionId) ?? reviews[0] ?? null,
    [reviews, selectedSubmissionId],
  );
  const summary = useMemo(
    () => ({
      pending: reviews.length,
      secondRound: reviews.filter((review) => review.round > 1).length,
      aiPass: reviews.filter((review) => review.aiDecision === 'pass').length,
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

  const loadReviews = async () => {
    setIsLoading(true);
    try {
      const nextReviews = await listFinalPendingReviews();
      setReviews(nextReviews);
      setSelectedSubmissionId((current) =>
        current && nextReviews.some((review) => review.submissionId === current)
          ? current
          : nextReviews[0]?.submissionId ?? null,
      );
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '终审待办加载失败。');
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
      setErrorMessage(error instanceof Error ? error.message : '终审详情加载失败。');
    } finally {
      setIsDetailLoading(false);
    }
  };

  const handleAction = async (action: () => Promise<ReviewDetailDto>, message: string) => {
    setIsBusy(true);
    try {
      setDetail(await action());
      setStatusMessage(message);
      setErrorMessage(null);
      await loadReviews();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '终审操作失败。');
    } finally {
      setIsBusy(false);
    }
  };

  const handleReject = (reason: string) => {
    if (!reason) {
      setErrorMessage('终审打回必须填写理由。');
      return;
    }
    if (!detail) {
      return;
    }

    void handleAction(
      () => finalRejectReview(detail.submission.id, { actorId: REVIEWER_ID, reason }),
      '已终审打回，标注员可再次修改。',
    );
  };

  return (
    <section className="human-review-page final-review-page" aria-labelledby="final-review-title">
      <div className="human-review-header">
        <div>
          <p className="eyebrow">人工审核 / 终审台</p>
          <h1 id="final-review-title">终审工作台</h1>
          <p>只处理复审通过后的待终审提交，确认后进入可导出状态。</p>
        </div>
        <dl>
          <SummaryMetric label="待终审" value={summary.pending} />
          <SummaryMetric label="多轮提交" value={summary.secondRound} />
          <SummaryMetric label="AI 通过" value={summary.aiPass} />
          <SummaryMetric label="已指派" value={summary.assigned} />
        </dl>
      </div>

      {statusMessage || errorMessage ? (
        <div className="task-status-message" role={errorMessage ? 'alert' : undefined} aria-live="polite">
          {statusMessage ? <span>{statusMessage}</span> : null}
          {errorMessage ? <span>{errorMessage}</span> : null}
        </div>
      ) : null}

      <div className="human-review-layout final-review-layout">
        <aside className="human-review-queue" aria-label="待终审队列">
          {isLoading && reviews.length === 0 ? <p>正在加载待终审队列。</p> : null}
          <div className="human-review-list">
            {reviews.map((review) => (
              <article key={review.submissionId} className={review.submissionId === selectedReview?.submissionId ? 'is-active' : ''}>
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
              <strong>暂无待终审数据</strong>
              <span>复审通过后会进入这里。</span>
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
                  查看复审详情
                </Link>
              </header>

              <div className="human-review-compare">
                <JsonPanel title="题目原文" subtitle={detail.taskItem.externalId} value={detail.taskItem.rawData} />
                <JsonPanel title="当前答案" subtitle={detail.submission.schemaVersion} value={detail.submission.answers} />
              </div>

              <RoundSelector assignmentId={detail.submission.assignmentId} />
              <AiReviewSummary
                record={detail.aiReview}
                fallbackComment={selectedReview?.aiComment}
                fallbackScores={selectedReview?.aiScores}
              />
              <FinalDecisionPanel
                detail={detail}
                isBusy={isBusy || isDetailLoading}
                onPass={(comment) =>
                  void handleAction(
                    () => finalPassReview(detail.submission.id, { actorId: REVIEWER_ID, ...(comment ? { comment } : {}) }),
                    '已终审通过，可进入导出。',
                  )
                }
                onReject={handleReject}
              />
            </>
          ) : (
            <div className="review-empty">
              <strong>请选择一条待终审提交</strong>
              <span>终审台会展示二次提交 Diff、AI 评语和完整时间线。</span>
            </div>
          )}
        </main>

        <aside className="human-review-side">
          {detail ? <AuditTimeline items={detail.timeline} /> : null}
        </aside>
      </div>
    </section>
  );
};

const FinalDecisionPanel = ({
  detail,
  isBusy,
  onPass,
  onReject,
}: {
  detail: ReviewDetailDto;
  isBusy?: boolean;
  onPass: (comment: string) => void;
  onReject: (reason: string) => void;
}) => {
  const [comment, setComment] = useState('');
  const [reason, setReason] = useState('');
  const isFinalPending = detail.submission.status === 'FINAL_PENDING';

  useEffect(() => {
    setComment('');
    setReason('');
  }, [detail.submission.id]);

  return (
    <section className="review-panel final-decision-panel" aria-label="终审决策">
      <header className="review-panel__heading">
        <div>
          <span>终审</span>
          <h3>终审决策</h3>
        </div>
        <small>{statusLabel(detail.submission.status)}</small>
      </header>
      <label>
        终审意见
        <textarea
          rows={3}
          value={comment}
          placeholder="写入终审记录"
          onChange={(event) => setComment(event.target.value)}
        />
      </label>
      <label>
        终审打回理由
        <textarea
          rows={3}
          value={reason}
          placeholder="打回给标注员时必填"
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <div className="review-decision-panel__actions">
        <button
          type="button"
          className="danger-action"
          disabled={isBusy || !isFinalPending}
          onClick={() => onReject(reason.trim())}
        >
          终审打回
        </button>
        <button
          type="button"
          className="primary-action"
          disabled={isBusy || !isFinalPending}
          onClick={() => onPass(comment.trim())}
        >
          终审通过
        </button>
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
