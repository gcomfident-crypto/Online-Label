import { Component, type ErrorInfo, type ReactNode } from 'react';

const DYNAMIC_IMPORT_RELOAD_KEY = 'labelhub.dynamicImportReloadAt';
const DYNAMIC_IMPORT_RELOAD_COOLDOWN_MS = 10_000;

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

    if (isDynamicImportError(error) && shouldReloadForDynamicImportError()) {
      window.location.reload();
    }
  }

  render() {
    if (this.state.error) {
      return <PageError error={this.state.error} onReset={this.handleReset} />;
    }

    return this.props.children;
  }

  private handleReset = () => {
    if (this.state.error && isDynamicImportError(this.state.error)) {
      clearDynamicImportReloadMark();
      window.location.reload();
      return;
    }

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
    <h1 id="app-error-title">{title}</h1>
    <p>{description ?? error?.message ?? '页面遇到异常，请重新加载后继续。'}</p>
    <button type="button" onClick={onReset ?? (() => window.location.reload())}>
      {actionLabel}
    </button>
  </section>
);

function isDynamicImportError(error: Error) {
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(
    error.message,
  );
}

function shouldReloadForDynamicImportError() {
  try {
    const lastReloadAt = Number(window.sessionStorage.getItem(DYNAMIC_IMPORT_RELOAD_KEY) ?? '0');
    const now = Date.now();

    if (Number.isFinite(lastReloadAt) && now - lastReloadAt < DYNAMIC_IMPORT_RELOAD_COOLDOWN_MS) {
      return false;
    }

    window.sessionStorage.setItem(DYNAMIC_IMPORT_RELOAD_KEY, String(now));
    return true;
  } catch {
    return false;
  }
}

function clearDynamicImportReloadMark() {
  try {
    window.sessionStorage.removeItem(DYNAMIC_IMPORT_RELOAD_KEY);
  } catch {
    // Ignore storage access errors. The explicit page reload below is the source of truth.
  }
}
