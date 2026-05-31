import { useState } from 'react';

import llmIcon from '../assets/llm.svg';
import { DemoDataBanner } from '../components/DemoDataBanner';
import { PortalPageTransitionOutlet } from './PortalPageTransitionOutlet';
import { PortalSidebar } from './PortalSidebar';
import { PortalTopbar } from './PortalTopbar';

const AGENT_NAV_ITEMS = [
  {
    to: '/agent/ai-review',
    label: '机审队列',
    parts: ['机', '审', '队', '列'],
    icon: 'ai-review',
    iconAsset: llmIcon,
  },
];

export const AgentPortalLayout = () => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

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
