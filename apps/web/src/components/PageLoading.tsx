type PageLoadingProps = {
  title?: string;
  description?: string;
  className?: string;
};

export const PageLoading = ({
  title = '正在加载',
  className,
}: PageLoadingProps) => (
  <div className={['page-loading', className].filter(Boolean).join(' ')} role="status" aria-live="polite">
    <span className="page-loading__spinner" aria-hidden="true" />
    <div>
      <strong>{title}</strong>
    </div>
  </div>
);
