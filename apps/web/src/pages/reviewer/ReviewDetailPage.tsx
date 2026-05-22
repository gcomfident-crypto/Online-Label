import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { SUBMISSION_STATUS_LABELS } from '@labelhub/shared';
import {
  getReview,
  passReview,
  rejectReview,
  reviseAndPassReview,
  startReview,
  type ReviewDetailDto,
} from '../../api/reviews';
import { AiReviewSummary } from '../../features/review/AiReviewSummary';
import { AuditTimeline } from '../../features/review/AuditTimeline';
import { ReviewDecisionPanel } from '../../features/review/ReviewDecisionPanel';
import { RoundSelector } from '../../features/review/RoundSelector';

const REVIEWER_ID = 'user_reviewer_wang_fang';

export const ReviewDetailPage = () => {
  const { submissionId } = useParams<{ submissionId: string }>();
  const [detail, setDetail] = useState<ReviewDetailDto | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (!submissionId) {
      setErrorMessage('复审提交 ID 缺失。');
      setIsLoading(false);
      return;
    }

    void loadDetail(submissionId);
  }, [submissionId]);

  const loadDetail = async (nextSubmissionId: string) => {
    setIsLoading(true);
    try {
      setDetail(await getReview(nextSubmissionId));
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '复审详情加载失败。');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = async (action: () => Promise<ReviewDetailDto>, message: string) => {
    setIsBusy(true);
    try {
      setDetail(await action());
      setStatusMessage(message);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '人工复审操作失败。');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="human-review-page human-review-detail-page" aria-labelledby="review-detail-title">
      <div className="human-review-header">
        <div>
          <p className="eyebrow">人工复审 / 单条详情</p>
          <h1 id="review-detail-title">复审详情</h1>
          <p>检查题目原文、标注答案、AI 结论与完整审计记录。</p>
        </div>
        <Link className="primary-link" to="/reviewer/reviews">
          返回验收台
        </Link>
      </div>

      {statusMessage || errorMessage ? (
        <div className="task-status-message" role={errorMessage ? 'alert' : undefined} aria-live="polite">
          {statusMessage ? <span>{statusMessage}</span> : null}
          {errorMessage ? <span>{errorMessage}</span> : null}
        </div>
      ) : null}

      {isLoading ? <p>正在加载复审详情。</p> : null}

      {detail ? (
        <div className="human-review-detail-grid">
          <main className="human-review-main">
            <header className="human-review-main__topline">
              <div>
                <span>{DATASET_KIND_LABELS[detail.task.datasetKind]}</span>
                <h2>{detail.task.title}</h2>
                <p>
                  {detail.taskItem.externalId} · {statusLabel(detail.submission.status)} · 第 {detail.submission.round} 轮
                </p>
              </div>
            </header>
            <div className="human-review-compare">
              <JsonPanel title="题目原文" subtitle={detail.taskItem.externalId} value={detail.taskItem.rawData} />
              <JsonPanel title="首次标注" subtitle={detail.submission.schemaVersion} value={detail.submission.answers} />
            </div>
            <RoundSelector assignmentId={detail.submission.assignmentId} />
            <AiReviewSummary record={detail.aiReview} />
            <ReviewDecisionPanel
              detail={detail}
              isBusy={isBusy}
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
          </main>
          <aside className="human-review-side">
            <AuditTimeline items={detail.timeline} />
          </aside>
        </div>
      ) : null}
    </section>
  );
};

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

const DATASET_KIND_LABELS: Record<ReviewDetailDto['task']['datasetKind'], string> = {
  qa_quality: '问答质量',
  preference_compare: '偏好对比',
  generic_json: '通用 JSON',
};
