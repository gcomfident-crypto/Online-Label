import type { ReviewRecordDto } from '../../api/reviews';

type AiReviewSummaryProps = {
  record: ReviewRecordDto | null;
  fallbackComment?: string | null;
  fallbackScores?: Record<string, unknown>;
};

export const AiReviewSummary = ({ record, fallbackComment, fallbackScores }: AiReviewSummaryProps) => {
  const scores = scoreEntries(record?.scores ?? fallbackScores);

  return (
    <section className="review-panel" aria-label="AI 预审摘要">
      <header className="review-panel__heading">
        <div>
          <span>AI 预审</span>
          <h3>{decisionLabel(record?.decision)}</h3>
        </div>
        <small>{record?.modelMetadata?.model?.toString() ?? 'mock-stable-reviewer'}</small>
      </header>
      <p className="review-ai-comment">{record?.comment ?? fallbackComment ?? '暂无 AI 评语。'}</p>
      {scores.length > 0 ? (
        <div className="review-score-grid">
          {scores.map(([key, score]) => (
            <div key={key} className="review-score">
              <span>
                <strong>{key}</strong>
                <em>{score}</em>
              </span>
              <i aria-hidden="true">
                <b style={{ width: `${Math.min(100, Math.max(0, score))}%` }} />
              </i>
            </div>
          ))}
        </div>
      ) : (
        <p>暂无评分。</p>
      )}
    </section>
  );
};

function scoreEntries(scores: Record<string, unknown> | null | undefined): Array<[string, number]> {
  if (!scores) {
    return [];
  }

  return Object.entries(scores).filter((entry): entry is [string, number] => typeof entry[1] === 'number');
}

function decisionLabel(decision: string | null | undefined): string {
  if (decision === 'pass') {
    return '建议通过';
  }
  if (decision === 'manual') {
    return '转人工判断';
  }
  if (decision === 'reject') {
    return '建议打回';
  }

  return '等待结论';
}
