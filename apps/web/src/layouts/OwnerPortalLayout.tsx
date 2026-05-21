import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import { ROLE_HOME_METADATA } from '@labelhub/shared';
import { DemoDataBanner } from '../components/DemoDataBanner';
import { sessionStore, useSession } from '../stores/sessionStore';

export const OwnerPortalLayout = () => {
  const navigate = useNavigate();
  const session = useSession();

  return (
    <div className="portal-shell owner-shell">
      <aside className="portal-sidebar">
        <div className="portal-brand">
          <span className="brand-mark">LH</span>
          <div>
            <strong>Owner 工作区</strong>
            <small>{ROLE_HOME_METADATA.OWNER.routePrefix}</small>
          </div>
        </div>
        <nav className="portal-nav" aria-label="Owner 端导航">
          <NavLink to="/owner/tasks">任务管理</NavLink>
          <NavLink to="/owner/templates">模板配置</NavLink>
        </nav>
      </aside>
      <main className="portal-main">
        <header className="portal-topbar">
          <div>
            <p className="eyebrow">Owner 端</p>
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
