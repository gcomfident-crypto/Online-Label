import { useState } from 'react';

import personIcon from '../assets/person.svg';
import { DemoDataBanner } from '../components/DemoDataBanner';
import { PortalPageTransitionOutlet } from './PortalPageTransitionOutlet';
import { PortalSidebar } from './PortalSidebar';
import { PortalTopbar } from './PortalTopbar';

const REVIEWER_NAV_ITEMS = [
  {
    to: '/reviewer/reviews',
    label: '人工审核',
    parts: ['人', '工', '审', '核'],
    icon: 'review',
    iconAsset: personIcon,
  },
];

export const ReviewerPortalLayout = () => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <div className={isSidebarCollapsed ? 'portal-shell reviewer-shell is-sidebar-collapsed' : 'portal-shell reviewer-shell'}>
      <PortalTopbar
        navLabel="Reviewer 端导航"
        userRoleLabel="Reviewer"
        links={[]}
      />
      <PortalSidebar
        isCollapsed={isSidebarCollapsed}
        items={REVIEWER_NAV_ITEMS}
        navLabel="Reviewer 端导航"
        onToggle={() => setIsSidebarCollapsed((current) => !current)}
      />
      <main className="portal-main">
        <DemoDataBanner />
        <PortalPageTransitionOutlet />
      </main>
    </div>
  );
};
