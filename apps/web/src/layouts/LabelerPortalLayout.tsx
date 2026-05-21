import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import { ROLE_HOME_METADATA } from '@labelhub/shared';
import { DemoDataBanner } from '../components/DemoDataBanner';
import { sessionStore, useSession } from '../stores/sessionStore';

export const LabelerPortalLayout = () => {
  const navigate = useNavigate();
  const session = useSession();

  return (
    <div className="portal-shell labeler-shell">
      <aside className="portal-sidebar">
        <div className="portal-brand">
          <span className="brand-mark">LH</span>
          <div>
            <strong>Labeler 工作区</strong>
            <small>{ROLE_HOME_METADATA.LABELER.routePrefix}</small>
          </div>
        </div>
        <nav className="portal-nav" aria-label="Labeler 端导航">
          <NavLink to="/labeler/market">任务广场</NavLink>
        </nav>
      </aside>
      <main className="portal-main">
        <header className="portal-topbar">
          <div>
            <p className="eyebrow">Labeler 端</p>
            <strong>{session?.user.name}</strong>
          </div>
          <button
            className="ghost-button"
            type="button"
            onClick={() => {
              sessionStore.clear();
              navigate('/login', { replace: true });
            }}
          >
            退出登录
          </button>
        </header>
        <DemoDataBanner />
        <Outlet />
      </main>
    </div>
  );
};
