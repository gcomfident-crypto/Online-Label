import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import { ROLE_HOME_METADATA } from '@labelhub/shared';
import { sessionStore, useSession } from '../stores/sessionStore';

export const ReviewerPortalLayout = () => {
  const navigate = useNavigate();
  const session = useSession();

  return (
    <div className="portal-shell reviewer-shell">
      <aside className="portal-sidebar">
        <div className="portal-brand">
          <span className="brand-mark">LH</span>
          <div>
            <strong>Reviewer 工作区</strong>
            <small>{ROLE_HOME_METADATA.REVIEWER.routePrefix}</small>
          </div>
        </div>
        <nav className="portal-nav" aria-label="Reviewer 端导航">
          <NavLink to="/reviewer/reviews">验收台</NavLink>
        </nav>
      </aside>
      <main className="portal-main">
        <header className="portal-topbar">
          <div>
            <p className="eyebrow">Reviewer 端</p>
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
        <Outlet />
      </main>
    </div>
  );
};
