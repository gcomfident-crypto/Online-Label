import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

import { USER_ROLE } from '@labelhub/shared';
import { RequireAuth } from './guards/RequireAuth';
import { RequireRole } from './guards/RequireRole';
import { AgentPortalLayout } from './layouts/AgentPortalLayout';
import { LabelerPortalLayout } from './layouts/LabelerPortalLayout';
import { OwnerPortalLayout } from './layouts/OwnerPortalLayout';
import { ReviewerPortalLayout } from './layouts/ReviewerPortalLayout';
import { ForbiddenPage } from './pages/ForbiddenPage';
import { LoginPage } from './pages/LoginPage';
import { AgentDashboardPage } from './pages/agent/AgentDashboardPage';
import { AiReviewQueuePage } from './pages/agent/AiReviewQueuePage';
import { RendererPlaygroundPage } from './pages/dev/RendererPlaygroundPage';
import { LabelerMarketPage } from './pages/labeler/LabelerMarketPage';
import { MyDataPage } from './pages/labeler/MyDataPage';
import { WorkbenchPage } from './pages/labeler/WorkbenchPage';
import { AiRuleConfigPage } from './pages/owner/AiRuleConfigPage';
import { DatasetImportPage } from './pages/owner/DatasetImportPage';
import { ExportCenterPage } from './pages/owner/ExportCenterPage';
import { TaskDetailPage } from './pages/owner/TaskDetailPage';
import { OwnerTasksPage } from './pages/owner/OwnerTasksPage';
import { TemplateDesignerPage } from './pages/owner/TemplateDesignerPage';
import { ReviewDetailPage } from './pages/reviewer/ReviewDetailPage';
import { ReviewListPage } from './pages/reviewer/ReviewListPage';
import { resolvePagePathTitle } from './utils/routePathTitle';

export const AppRouter = () => {
  return (
    <>
      <PageTitleSync />
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
    </>
  );
};

const PageTitleSync = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    document.title = `${resolvePagePathTitle(pathname)} - LabelHub`;
  }, [pathname]);

  return null;
};

const OwnerTemplatesRoutePage = () => {
  const navigate = useNavigate();

  return <TemplateDesignerPage onReturnTo={(path) => navigate(path)} />;
};
