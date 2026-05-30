import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';

import { sessionStore, useSession } from '../stores/sessionStore';
import { resolvePagePathTitle } from '../utils/routePathTitle';

type PortalTopbarLink = {
  label: string;
  to: string;
};

type PortalTopbarProps = {
  navLabel: string;
  links: PortalTopbarLink[];
  userRoleLabel: string;
};

export const PortalTopbar = ({
  navLabel,
  links,
  userRoleLabel,
}: PortalTopbarProps) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const session = useSession();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const currentPathTitle = resolvePagePathTitle(pathname);
  const currentPathParts = splitPathTitle(currentPathTitle);

  useEffect(() => {
    if (!isUserMenuOpen) {
      return;
    }

    const handleDocumentMouseDown = (event: MouseEvent) => {
      if (event.target instanceof Node && !userMenuRef.current?.contains(event.target)) {
        setIsUserMenuOpen(false);
      }
    };

    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsUserMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleDocumentMouseDown);
    document.addEventListener('keydown', handleDocumentKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown);
      document.removeEventListener('keydown', handleDocumentKeyDown);
    };
  }, [isUserMenuOpen]);

  const handleLogout = () => {
    sessionStore.clear();
    navigate('/login', { replace: true });
  };

  return (
    <header className="platform-topbar" aria-label="平台顶栏">
      <div className="platform-topbar__left">
        <div className="platform-brand" aria-label="LabelHub">
          <span className="platform-brand__mark">LH</span>
          <strong>LabelHub</strong>
        </div>
        <span className="platform-current-path" aria-label="当前路径">
          {currentPathParts.prefix ? (
            <>
              <span className="platform-current-path__prefix">{currentPathParts.prefix}</span>
              <span className="platform-current-path__separator"> / </span>
              <span key={`${pathname}-${currentPathParts.leaf}`} className="platform-current-path__leaf">
                {currentPathParts.leaf}
              </span>
            </>
          ) : (
            <span key={`${pathname}-${currentPathParts.leaf}`} className="platform-current-path__leaf">
              {currentPathParts.leaf}
            </span>
          )}
        </span>
        {links.length > 0 ? (
          <nav className="platform-topbar__nav" aria-label={navLabel}>
            {links.map((link) => (
              <NavLink key={link.to} to={link.to}>
                {link.label}
              </NavLink>
            ))}
          </nav>
        ) : null}
      </div>
      <div className="platform-user" ref={userMenuRef}>
        <button
          className="platform-user__trigger"
          type="button"
          aria-label="打开账号菜单"
          aria-haspopup="menu"
          aria-expanded={isUserMenuOpen}
          onClick={() => setIsUserMenuOpen((current) => !current)}
        >
          <span className="platform-user__avatar" aria-hidden="true">
            {session?.user.name.slice(0, 1) ?? userRoleLabel.slice(0, 1)}
          </span>
          <span>{session ? `${session.user.name} · ${userRoleLabel}` : '未登录'}</span>
          <span className="platform-user__chevron" aria-hidden="true">
            ▾
          </span>
        </button>
        {isUserMenuOpen ? (
          <div className="platform-user-menu" role="menu" aria-label="账号菜单">
            <button className="platform-user-menu__item" type="button" role="menuitem" onClick={handleLogout}>
              退出
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
};

const splitPathTitle = (title: string): { prefix: string | null; leaf: string } => {
  const parts = title.split(' / ');

  if (parts.length <= 1) {
    return { prefix: null, leaf: title };
  }

  const leaf = parts[parts.length - 1] ?? title;

  return {
    prefix: parts.slice(0, -1).join(' / '),
    leaf,
  };
};
