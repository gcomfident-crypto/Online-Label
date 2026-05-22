import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import { ROLE_HOME_METADATA } from '@labelhub/shared';
import { DemoDataBanner } from '../components/DemoDataBanner';
import { sessionStore, useSession } from '../stores/sessionStore';

export const AgentPortalLayout = () => {
  const navigate = useNavigate();
  const session = useSession();

  return (
    <div className="portal-shell agent-shell">
      <aside className="portal-sidebar">
        <div className="portal-brand">
          <span className="brand-mark">LH</span>
          <div>
            <strong>AI Agent 工作区</strong>
            <small>{ROLE_HOME_METADATA.AI_AGENT.routePrefix}</small>
          </div>
        </div>
        <nav className="portal-nav" aria-label="AI Agent 端导航">
          <NavLink to="/agent/ai-review">机审队列</NavLink>
        </nav>
      </aside>
      <main className="portal-main">
        <header className="portal-topbar">
          <div>
            <p className="eyebrow">AI Agent 端</p>
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
