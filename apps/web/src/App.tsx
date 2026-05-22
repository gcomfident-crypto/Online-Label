import { AppErrorBoundary } from './components/AppErrorBoundary';
import { AppRouter } from './router';

export const App = () => {
  return (
    <AppErrorBoundary>
      <AppRouter />
    </AppErrorBoundary>
  );
};
