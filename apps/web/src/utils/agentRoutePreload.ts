import { prefetchTaskFlows } from '../api/taskFlows';

export const loadAgentDashboardPage = () =>
  import('../pages/agent/AgentDashboardPage').then(({ AgentDashboardPage }) => ({ default: AgentDashboardPage }));

export const loadAiReviewQueuePage = () =>
  import('../pages/agent/AiReviewQueuePage').then(({ AiReviewQueuePage }) => ({ default: AiReviewQueuePage }));

export function prefetchAgentPortalRoutes() {
  void loadAgentDashboardPage();
  void loadAiReviewQueuePage();
  prefetchTaskFlows();
}
