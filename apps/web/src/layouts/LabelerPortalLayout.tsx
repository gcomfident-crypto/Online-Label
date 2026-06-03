import { useState } from 'react';

import missionSquareIcon from '../assets/mission_square.svg';
import workbenchIcon from '../assets/workbench.svg';
import { DemoDataBanner } from '../components/DemoDataBanner';
import { PortalPageTransitionOutlet } from './PortalPageTransitionOutlet';
import { PortalSidebar } from './PortalSidebar';
import { PortalTopbar } from './PortalTopbar';

const LABELER_NAV_ITEMS = [
  {
    to: '/labeler/market',
    label: '任务广场',
    parts: ['任', '务', '广', '场'],
    icon: 'market',
    iconAsset: missionSquareIcon,
  },
  {
    to: '/labeler/my-data',
    label: '工作台',
    parts: ['工', '作', '台'],
    icon: 'my-data',
    iconAsset: workbenchIcon,
    isActive: (pathname: string) => pathname.startsWith('/labeler/tasks/'),
  },
];

export const LabelerPortalLayout = () => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <div
      className={
        isSidebarCollapsed ? 'portal-shell labeler-shell is-sidebar-collapsed' : 'portal-shell labeler-shell'
      }
    >
      <PortalTopbar
        navLabel="Labeler 端导航"
        userRoleLabel="Labeler"
        links={[]}
      />
      <PortalSidebar
        isCollapsed={isSidebarCollapsed}
        items={LABELER_NAV_ITEMS}
        navLabel="Labeler 端导航"
        onToggle={() => setIsSidebarCollapsed((current) => !current)}
      />
      <main className="portal-main">
        <DemoDataBanner />
        <PortalPageTransitionOutlet />
      </main>
    </div>
  );
};
