import { Navigate, Route, Routes } from 'react-router-dom';

import { USER_ROLE } from '@labelhub/shared';
import { RequireAuth } from './guards/RequireAuth';
import { RequireRole } from './guards/RequireRole';
import { AgentPortalLayout } from './layouts/AgentPortalLayout';
import { LabelerPortalLayout } from './layouts/LabelerPortalLayout';
import { OwnerPortalLayout } from './layouts/OwnerPortalLayout';
import { ReviewerPortalLayout } from './layouts/ReviewerPortalLayout';
import { ForbiddenPage } from './pages/ForbiddenPage';
import { LoginPage } from './pages/LoginPage';
import { AiReviewQueuePage } from './pages/agent/AiReviewQueuePage';
import { RendererPlaygroundPage } from './pages/dev/RendererPlaygroundPage';
import { LabelerMarketPage } from './pages/labeler/LabelerMarketPage';
import { MyDataPage } from './pages/labeler/MyDataPage';
import { WorkbenchPage } from './pages/labeler/WorkbenchPage';
import { AiRuleConfigPage } from './pages/owner/AiRuleConfigPage';
import { DatasetImportPage } from './pages/owner/DatasetImportPage';
import { TaskDetailPage } from './pages/owner/TaskDetailPage';
import { OwnerTasksPage } from './pages/owner/OwnerTasksPage';
import { TemplateDesignerPage } from './pages/owner/TemplateDesignerPage';
import { ReviewDetailPage } from './pages/reviewer/ReviewDetailPage';
import { ReviewListPage } from './pages/reviewer/ReviewListPage';

export const AppRouter = () => {
  return (
    <Routes>
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
        <Route path="templates" element={<TemplateDesignerPage />} />
        <Route path="ai-rules" element={<AiRuleConfigPage />} />
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
        <Route index element={<Navigate to="/agent/ai-review" replace />} />
        <Route path="ai-review" element={<AiReviewQueuePage />} />
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
        <Route path="reviews/:submissionId" element={<ReviewDetailPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
};
