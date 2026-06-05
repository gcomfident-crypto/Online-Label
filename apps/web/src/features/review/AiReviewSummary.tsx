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
        <small>{record?.modelMetadata?.model?.toString() ?? '未记录模型'}</small>
      </header>
      <p className="review-ai-comment">{record?.comment ?? fallbackComment ?? '暂无 AI 评语。'}</p>
      {scores.length > 0 ? (
        <div className="review-score-grid">
          {scores.map((scoreItem) => (
            <div key={scoreItem.key} className="review-score">
              <span>
                <strong>{scoreItem.label}</strong>
                <em>{scoreItem.score}</em>
              </span>
              <i aria-hidden="true">
                <b style={{ width: `${Math.min(100, Math.max(0, scoreItem.score))}%` }} />
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

type ScoreEntry = {
  key: string;
  label: string;
  score: number;
};

const SCORE_DIMENSIONS: Array<{ key: string; label: string }> = [
  { key: 'relevance', label: '相关性' },
  { key: 'accuracy', label: '准确性' },
  { key: 'format', label: '格式合规' },
  { key: 'safety', label: '安全性' },
  { key: 'overall', label: '综合' },
];

function scoreEntries(scores: Record<string, unknown> | null | undefined): ScoreEntry[] {
  if (!scores) {
    return [];
  }

  const numericScores = Object.entries(scores)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
    .map(([key, score]) => ({
      key,
      label: SCORE_DIMENSIONS.find((dimension) => dimension.key === key)?.label ?? key,
      score,
    }));

  return numericScores.sort((first, second) => scoreOrder(first.key) - scoreOrder(second.key));
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

function scoreOrder(key: string): number {
  const index = SCORE_DIMENSIONS.findIndex((dimension) => dimension.key === key);
  return index >= 0 ? index : SCORE_DIMENSIONS.length;
}
