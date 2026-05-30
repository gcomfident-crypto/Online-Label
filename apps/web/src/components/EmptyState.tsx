import type { ReactNode } from 'react';

type EmptyStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export const EmptyState = ({ title, action, className }: EmptyStateProps) => (
  <section className={['empty-state', className].filter(Boolean).join(' ')} aria-labelledby={emptyStateTitleId(title)}>
    <span className="empty-state__mark" aria-hidden="true" />
    <div>
      <h2 id={emptyStateTitleId(title)}>{title}</h2>
    </div>
    {action ? <div className="empty-state__actions">{action}</div> : null}
  </section>
);

const emptyStateTitleId = (title: string): string => `empty-state-${title.replace(/\s+/g, '-')}`;
