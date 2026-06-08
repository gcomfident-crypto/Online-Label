import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

import { USER_ROLE } from '@labelhub/shared';
import { RequireAuth } from './guards/RequireAuth';
import { RequireRole } from './guards/RequireRole';
import { PageLoading } from './components/PageLoading';
import { AgentPortalLayout } from './layouts/AgentPortalLayout';
import { LabelerPortalLayout } from './layouts/LabelerPortalLayout';
import { OwnerPortalLayout } from './layouts/OwnerPortalLayout';
import { ReviewerPortalLayout } from './layouts/ReviewerPortalLayout';
import {
  loadExportCenterPage,
  loadOwnerTasksPage,
  loadTemplateDesignerPage,
} from './utils/ownerRoutePreload';
import { resolvePagePathTitle, resolvePageTabTitle } from './utils/routePathTitle';

const LoginPage = lazy(() => import('./pages/LoginPage').then(({ LoginPage }) => ({ default: LoginPage })));
const ForbiddenPage = lazy(() =>
  import('./pages/ForbiddenPage').then(({ ForbiddenPage }) => ({ default: ForbiddenPage })),
);
const RendererPlaygroundPage = lazy(() =>
  import('./pages/dev/RendererPlaygroundPage').then(({ RendererPlaygroundPage }) => ({
    default: RendererPlaygroundPage,
  })),
);
const OwnerTasksPage = lazy(loadOwnerTasksPage);
const TaskDetailPage = lazy(() =>
  import('./pages/owner/TaskDetailPage').then(({ TaskDetailPage }) => ({ default: TaskDetailPage })),
);
const DatasetImportPage = lazy(() =>
  import('./pages/owner/DatasetImportPage').then(({ DatasetImportPage }) => ({ default: DatasetImportPage })),
);
const TemplateDesignerPage = lazy(loadTemplateDesignerPage);
const AiRuleConfigPage = lazy(() =>
  import('./pages/owner/AiRuleConfigPage').then(({ AiRuleConfigPage }) => ({ default: AiRuleConfigPage })),
);
const ExportCenterPage = lazy(loadExportCenterPage);
const LabelerMarketPage = lazy(() =>
  import('./pages/labeler/LabelerMarketPage').then(({ LabelerMarketPage }) => ({ default: LabelerMarketPage })),
);
const WorkbenchPage = lazy(() =>
  import('./pages/labeler/WorkbenchPage').then(({ WorkbenchPage }) => ({ default: WorkbenchPage })),
);
const MyDataPage = lazy(() => import('./pages/labeler/MyDataPage').then(({ MyDataPage }) => ({ default: MyDataPage })));
const AgentDashboardPage = lazy(() =>
  import('./pages/agent/AgentDashboardPage').then(({ AgentDashboardPage }) => ({ default: AgentDashboardPage })),
);
const AiReviewQueuePage = lazy(() =>
  import('./pages/agent/AiReviewQueuePage').then(({ AiReviewQueuePage }) => ({ default: AiReviewQueuePage })),
);
const ReviewListPage = lazy(() =>
  import('./pages/reviewer/ReviewListPage').then(({ ReviewListPage }) => ({ default: ReviewListPage })),
);
const ReviewDetailPage = lazy(() =>
  import('./pages/reviewer/ReviewDetailPage').then(({ ReviewDetailPage }) => ({ default: ReviewDetailPage })),
);

export const AppRouter = () => {
  return (
    <>
      <PageTitleSync />
      <Suspense fallback={<DelayedRouteFallback />}>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forbidden" element={<ForbiddenPage />} />
          <Route path="/dev/renderer" element={<RendererPlaygroundPage />} />
          <Route
            path="/owner"
            element={
              <RequireAuth>
                <RequireRole role={USER_ROLE.OWNER}>
                  <OwnerPortalLayout />
                </RequireRole>
              </RequireAuth>
            }
          >
            <Route index element={<Navigate to="/owner/tasks" replace />} />
            <Route path="tasks" element={<OwnerTasksPage />} />
            <Route path="tasks/:taskId" element={<TaskDetailPage />} />
            <Route path="tasks/:taskId/dataset" element={<DatasetImportPage />} />
            <Route path="templates" element={<OwnerTemplatesRoutePage />} />
            <Route path="ai-rules" element={<AiRuleConfigPage />} />
            <Route path="exports" element={<ExportCenterPage />} />
          </Route>
          <Route
            path="/labeler"
            element={
              <RequireAuth>
                <RequireRole role={USER_ROLE.LABELER}>
                  <LabelerPortalLayout />
                </RequireRole>
              </RequireAuth>
            }
          >
            <Route index element={<Navigate to="/labeler/market" replace />} />
            <Route path="market" element={<LabelerMarketPage />} />
            <Route path="tasks/:taskId/items/:itemId" element={<WorkbenchPage />} />
            <Route path="my-data" element={<MyDataPage />} />
          </Route>
          <Route
            path="/agent"
            element={
              <RequireAuth>
                <RequireRole role={USER_ROLE.AI_AGENT}>
                  <AgentPortalLayout />
                </RequireRole>
              </RequireAuth>
            }
          >
            <Route index element={<Navigate to="/agent/dashboard" replace />} />
            <Route path="dashboard" element={<AgentDashboardPage />} />
            <Route path="task-flows" element={<AiReviewQueuePage />} />
            <Route path="ai-review" element={<Navigate to="/agent/task-flows" replace />} />
          </Route>
          <Route
            path="/reviewer"
            element={
              <RequireAuth>
                <RequireRole role={USER_ROLE.REVIEWER}>
                  <ReviewerPortalLayout />
                </RequireRole>
              </RequireAuth>
            }
          >
            <Route index element={<Navigate to="/reviewer/reviews" replace />} />
            <Route path="reviews" element={<ReviewListPage />} />
            <Route path="reviews/:taskId" element={<ReviewDetailPage />} />
            <Route path="*" element={<Navigate to="/reviewer/reviews" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </>
  );
};

const PageTitleSync = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    document.title = `${resolvePageTabTitle(pathname)} · LabelHub`;
  }, [pathname]);

  return null;
};

const OwnerTemplatesRoutePage = () => {
  const navigate = useNavigate();

  return <TemplateDesignerPage onReturnTo={(path) => navigate(path)} />;
};

const DelayedRouteFallback = () => (
  <DelayedFallback delay={450}>
    <PageLoading title="正在加载页面" description="正在准备当前页面资源。" />
  </DelayedFallback>
);

function DelayedFallback({ children, delay }: { children: ReactNode; delay: number }) {
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setShouldShow(true), delay);

    return () => window.clearTimeout(timer);
  }, [delay]);

  return shouldShow ? children : null;
}
