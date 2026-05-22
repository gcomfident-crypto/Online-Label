import { ROLE_HOME_METADATA, type UserRole } from './roles.ts';

export const PORTAL_ROUTE_PREFIX = {
  OWNER: '/owner',
  LABELER: '/labeler',
  AI_AGENT: '/agent',
  REVIEWER: '/reviewer',
} as const satisfies Record<UserRole, string>;

export type PortalRoutePrefix = (typeof PORTAL_ROUTE_PREFIX)[UserRole];

export type RoutePermission = {
  path: PortalRoutePrefix;
  allowedRoles: readonly UserRole[];
  defaultHomePath: string;
  navName: string;
};

export const ROUTE_PERMISSIONS = [
  {
    path: PORTAL_ROUTE_PREFIX.OWNER,
    allowedRoles: ['OWNER'],
    defaultHomePath: ROLE_HOME_METADATA.OWNER.homePath,
    navName: '项目管理',
  },
  {
    path: PORTAL_ROUTE_PREFIX.LABELER,
    allowedRoles: ['LABELER'],
    defaultHomePath: ROLE_HOME_METADATA.LABELER.homePath,
    navName: '标注工作台',
  },
  {
    path: PORTAL_ROUTE_PREFIX.AI_AGENT,
    allowedRoles: ['AI_AGENT'],
    defaultHomePath: ROLE_HOME_METADATA.AI_AGENT.homePath,
    navName: 'AI 审核台',
  },
  {
    path: PORTAL_ROUTE_PREFIX.REVIEWER,
    allowedRoles: ['REVIEWER'],
    defaultHomePath: ROLE_HOME_METADATA.REVIEWER.homePath,
    navName: '复审工作台',
  },
] as const satisfies readonly RoutePermission[];

const normalizePath = (path: string): string => {
  const pathname = path.split(/[?#]/, 1)[0] ?? '/';
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;

  return normalized || '/';
};

export const getRoutePermission = (path: string): RoutePermission | undefined => {
  const normalizedPath = normalizePath(path);

  return ROUTE_PERMISSIONS.find((permission) => {
    return (
      normalizedPath === permission.path || normalizedPath.startsWith(`${permission.path}/`)
    );
  });
};
