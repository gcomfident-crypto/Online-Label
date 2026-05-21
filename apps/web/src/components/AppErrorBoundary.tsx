import { Component, type ErrorInfo, type ReactNode } from 'react';

type AppErrorBoundaryProps = {
  children: ReactNode;
  onReset?: () => void;
};

type AppErrorBoundaryState = {
  error: Error | null;
};

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('页面加载异常', error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return <PageError error={this.state.error} onReset={this.handleReset} />;
    }

    return this.props.children;
  }

  private handleReset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };
}

export const PageError = ({
  error,
  title = '页面加载异常',
  description,
  actionLabel = '重新加载',
  onReset,
}: {
  error?: Error | null;
  title?: string;
  description?: string;
  actionLabel?: string;
  onReset?: () => void;
}) => (
  <section className="app-error-boundary" role="alert" aria-labelledby="app-error-title">
    <p className="eyebrow">系统提示</p>
    <h1 id="app-error-title">{title}</h1>
    <p>{description ?? error?.message ?? '页面遇到异常，请重新加载后继续。'}</p>
    <button type="button" onClick={onReset ?? (() => window.location.reload())}>
      {actionLabel}
    </button>
  </section>
);
