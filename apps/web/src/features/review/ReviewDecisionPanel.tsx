import { useEffect, useState } from 'react';

import { SUBMISSION_STATUS_LABELS } from '@labelhub/shared';
import type { ReviewDetailDto } from '../../api/reviews';
import { ToastViewport, useToastController } from '../../components/ToastViewport';

type ReviewDecisionPanelProps = {
  detail: ReviewDetailDto;
  isBusy?: boolean;
  onStart: () => void;
  onPass: (comment: string) => void;
  onReject: (reason: string) => void;
  onReviseAndPass: (input: { comment: string; revisedAnswers: Record<string, unknown> }) => void;
};

export const ReviewDecisionPanel = ({
  detail,
  isBusy,
  onStart,
  onPass,
  onReject,
  onReviseAndPass,
}: ReviewDecisionPanelProps) => {
  const [comment, setComment] = useState('');
  const [reason, setReason] = useState('');
  const [revisedAnswersText, setRevisedAnswersText] = useState(() => stringifyJson(detail.submission.answers));
  const { dismissToast, messages, showErrorToast } = useToastController();
  const isReviewing = detail.submission.status === 'RECHECK_REVIEWING';
  const isReviewable = detail.submission.status === 'HUMAN_PENDING' || detail.submission.status === 'RECHECK_REVIEWING';

  useEffect(() => {
    setComment('');
    setReason('');
    setRevisedAnswersText(stringifyJson(detail.submission.answers));
  }, [detail.submission.id, detail.submission.answers]);

  const handleRevise = () => {
    try {
      const parsed = JSON.parse(revisedAnswersText) as unknown;
      if (!isRecord(parsed)) {
        showErrorToast('修订后的答案必须是 JSON 对象。');
        return;
      }

      onReviseAndPass({ comment: comment.trim(), revisedAnswers: parsed });
    } catch {
      showErrorToast('修订后的答案不是合法 JSON。');
    }
  };

  return (
    <section className="review-panel review-decision-panel" aria-label="人工复审决策">
      <ToastViewport messages={messages} onDismiss={dismissToast} />
      <header className="review-panel__heading">
        <div>
          <span>人工复审</span>
          <h3>人工复审决策</h3>
        </div>
        <small>{statusLabel(detail.submission.status)}</small>
      </header>
      <label>
        复审意见
        <textarea
          rows={3}
          value={comment}
          placeholder="留作复审审计记录"
          onChange={(event) => setComment(event.target.value)}
        />
      </label>
      <label>
        打回理由
        <textarea
          rows={3}
          value={reason}
          placeholder="打回给标注员时必填"
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <label>
        修订后答案 JSON
        <textarea
          rows={6}
          value={revisedAnswersText}
          spellCheck={false}
          onChange={(event) => setRevisedAnswersText(event.target.value)}
        />
      </label>
      <div className="review-decision-panel__actions">
        <button type="button" onClick={onStart} disabled={isBusy || isReviewing || !isReviewable}>
          开始复审
        </button>
        <button type="button" className="danger-action" onClick={() => onReject(reason.trim())} disabled={isBusy || !isReviewable}>
          打回
        </button>
        <button type="button" onClick={handleRevise} disabled={isBusy || !isReviewable}>
          直接修订
        </button>
        <button
          type="button"
          className="primary-action"
          onClick={() => onPass(comment.trim())}
          disabled={isBusy || !isReviewable}
        >
          通过 · 入库
        </button>
      </div>
    </section>
  );
};

function stringifyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function statusLabel(status: string): string {
  return SUBMISSION_STATUS_LABELS[status as keyof typeof SUBMISSION_STATUS_LABELS] ?? status;
}
