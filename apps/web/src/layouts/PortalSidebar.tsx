import type { CSSProperties } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

export type PortalSidebarItem = {
  icon: string;
  iconAsset?: string;
  label: string;
  parts: string[];
  to: string;
  isActive?: (pathname: string) => boolean;
};

type PortalSidebarProps = {
  isCollapsed: boolean;
  items: PortalSidebarItem[];
  navLabel: string;
  onToggle: () => void;
};

export const PortalSidebar = ({
  isCollapsed,
  items,
  navLabel,
  onToggle,
}: PortalSidebarProps) => {
  const hiddenLabelClass = isCollapsed ? ' is-hidden' : '';
  const { pathname } = useLocation();

  return (
    <aside className="portal-sidebar">
      <nav className="portal-nav" aria-label={navLabel}>
        {items.map((item) => {
          const isItemActive = item.isActive?.(pathname);
          const iconClassName = item.iconAsset
            ? `portal-nav__icon portal-nav__icon--${item.icon} portal-nav__icon--asset`
            : `portal-nav__icon portal-nav__icon--${item.icon}`;
          const iconStyle = item.iconAsset
            ? ({ '--portal-nav-icon-url': toCssUrl(item.iconAsset) } as CSSProperties)
            : undefined;

          return (
            <NavLink
              key={item.to}
              to={item.to}
              aria-label={item.label}
              title={item.label}
              className={({ isActive }) => (isActive || isItemActive ? 'active' : undefined)}
            >
              <span className={iconClassName} style={iconStyle} aria-hidden="true" />
              <span className={`portal-nav__label${hiddenLabelClass}`} aria-hidden="true">
                {item.parts.map((part, index) => (
                  <span key={`${item.to}-${index}`}>{part}</span>
                ))}
              </span>
            </NavLink>
          );
        })}
      </nav>
      <button
        className="portal-sidebar__toggle"
        type="button"
        aria-label={isCollapsed ? '展开侧边栏' : '收起侧边栏'}
        title={isCollapsed ? '展开侧边栏' : '收起侧边栏'}
        onClick={onToggle}
      >
        <span
          className={
            isCollapsed
              ? 'portal-sidebar__toggle-icon is-collapsed'
              : 'portal-sidebar__toggle-icon'
          }
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" focusable="false">
            <rect x="4.5" y="5" width="15" height="14" rx="3" />
            <path d="M10 5.5V18.5" />
            <path className="portal-sidebar__toggle-arrow" d="M15.2 9.2L12.4 12L15.2 14.8" />
          </svg>
        </span>
        <span className={`portal-sidebar__toggle-label${hiddenLabelClass}`} aria-hidden="true">
          {isCollapsed ? '展开' : '收起'}
        </span>
      </button>
    </aside>
  );
};

const toCssUrl = (url: string): string => {
  return `url("${url.replace(/"/g, '\\"')}")`;
};
