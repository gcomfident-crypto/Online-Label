type PageLoadingProps = {
  title?: string;
  description?: string;
  className?: string;
};

export const PageLoading = ({
  title = '正在加载',
  description = '请稍候，正在同步最新数据。',
  className,
}: PageLoadingProps) => (
  <div className={['page-loading', className].filter(Boolean).join(' ')} role="status" aria-live="polite">
    <span className="page-loading__spinner" aria-hidden="true" />
    <div>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  </div>
);
