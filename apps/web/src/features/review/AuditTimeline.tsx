import type { ReviewTimelineItemDto } from '../../api/reviews';

type AuditTimelineProps = {
  items: ReviewTimelineItemDto[];
};

export const AuditTimeline = ({ items }: AuditTimelineProps) => (
  <section className="review-panel review-timeline-panel" aria-label="审计时间线">
    <header className="review-panel__heading">
      <div>
        <span>审计</span>
        <h3>审计时间线</h3>
      </div>
      <small>{items.length.toLocaleString()} 条</small>
    </header>
    {items.length > 0 ? (
      <ol className="review-timeline">
        {items.map((item) => (
          <li key={item.id}>
            <time>{formatDateTime(item.createdAt)}</time>
            <strong>{item.label}</strong>
            {item.reason ? <p>{item.reason}</p> : null}
            <span>
              {item.actorId ?? '系统'} · {item.fromStatus ?? '起始'} → {item.toStatus ?? '记录'}
            </span>
          </li>
        ))}
      </ol>
    ) : (
      <p>暂无审计记录。</p>
    )}
  </section>
);

function formatDateTime(value: string): string {
  return value.slice(0, 16).replace('T', ' ');
}
