import { useState } from 'react';

import exportIcon from '../assets/export.svg';
import modelIcon from '../assets/model.svg';
import taskIcon from '../assets/task.svg';
import { DemoDataBanner } from '../components/DemoDataBanner';
import { PortalPageTransitionOutlet } from './PortalPageTransitionOutlet';
import { PortalSidebar } from './PortalSidebar';
import { PortalTopbar } from './PortalTopbar';

const OWNER_NAV_ITEMS = [
  {
    to: '/owner/tasks',
    label: '任务管理',
    parts: ['任', '务', '管', '理'],
    icon: 'tasks',
    iconAsset: taskIcon,
  },
  {
    to: '/owner/templates',
    label: '评测模板',
    parts: ['评', '测', '模', '板'],
    icon: 'templates',
    iconAsset: modelIcon,
  },
  {
    to: '/owner/exports',
    label: '导出中心',
    parts: ['导', '出', '中', '心'],
    icon: 'exports',
    iconAsset: exportIcon,
  },
];

export const OwnerPortalLayout = () => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <div
      className={
        isSidebarCollapsed ? 'portal-shell owner-shell is-sidebar-collapsed' : 'portal-shell owner-shell'
      }
    >
      <PortalTopbar
        navLabel="Owner 端导航"
        userRoleLabel="Owner"
        links={[]}
      />
      <PortalSidebar
        isCollapsed={isSidebarCollapsed}
        items={OWNER_NAV_ITEMS}
        navLabel="Owner 端导航"
        onToggle={() => setIsSidebarCollapsed((current) => !current)}
      />
      <main className="portal-main">
        <DemoDataBanner />
        <PortalPageTransitionOutlet />
      </main>
    </div>
  );
};
