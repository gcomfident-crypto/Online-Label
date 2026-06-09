import { useEffect, useState } from 'react';

import databoardIcon from '../assets/databoard.svg';
import llmIcon from '../assets/llm.svg';
import { DemoDataBanner } from '../components/DemoDataBanner';
import { PortalPageTransitionOutlet } from './PortalPageTransitionOutlet';
import { PortalSidebar } from './PortalSidebar';
import { PortalTopbar } from './PortalTopbar';
import {
  loadAgentDashboardPage,
  loadAiReviewQueuePage,
  prefetchAgentPortalRoutes,
} from '../utils/agentRoutePreload';

const AGENT_NAV_ITEMS = [
  {
    to: '/agent/dashboard',
    label: '数据看板',
    parts: ['数', '据', '看', '板'],
    icon: 'dashboard',
    iconAsset: databoardIcon,
    preload: loadAgentDashboardPage,
  },
  {
    to: '/agent/task-flows',
    label: '质检流转',
    parts: ['质', '检', '流', '转'],
    icon: 'ai-review',
    iconAsset: llmIcon,
    preload: loadAiReviewQueuePage,
  },
];

export const AgentPortalLayout = () => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  useEffect(() => {
    prefetchAgentPortalRoutes();
  }, []);

  return (
    <div className={isSidebarCollapsed ? 'portal-shell agent-shell is-sidebar-collapsed' : 'portal-shell agent-shell'}>
      <PortalTopbar
        navLabel="AI Agent 端导航"
        userRoleLabel="AI Agent"
        links={[]}
      />
      <PortalSidebar
        isCollapsed={isSidebarCollapsed}
        items={AGENT_NAV_ITEMS}
        navLabel="AI Agent 端导航"
        onToggle={() => setIsSidebarCollapsed((current) => !current)}
      />
      <main className="portal-main">
        <DemoDataBanner />
        <PortalPageTransitionOutlet />
      </main>
    </div>
  );
};
