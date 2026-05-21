import { describe, expect, it } from 'vitest';

import {
  PORTAL_ROUTE_PREFIX,
  ROUTE_PERMISSIONS,
  canAccessRoute,
  getRoutePermission,
} from '.';

describe('Portal 路由 RBAC', () => {
  it('固定四个角色对应的 Portal 路由前缀', () => {
    expect(PORTAL_ROUTE_PREFIX).toEqual({
      OWNER: '/owner',
      LABELER: '/labeler',
      AI_AGENT: '/agent',
      REVIEWER: '/reviewer',
    });
  });

  it('四个角色只能访问自己的 Portal 路由', () => {
    const routesByRole = {
      OWNER: ['/owner', '/owner/tasks'],
      LABELER: ['/labeler', '/labeler/tasks'],
      AI_AGENT: ['/agent', '/agent/reviews'],
      REVIEWER: ['/reviewer', '/reviewer/reviews'],
    } as const;

    for (const [role, ownedRoutes] of Object.entries(routesByRole)) {
      for (const path of ownedRoutes) {
        expect(canAccessRoute(role as keyof typeof routesByRole, path)).toBe(true);
      }

      const foreignRoutes = Object.values(routesByRole)
        .flat()
        .filter((path) => !ownedRoutes.includes(path as never));

      for (const path of foreignRoutes) {
        expect(canAccessRoute(role as keyof typeof routesByRole, path)).toBe(false);
      }
    }
  });

  it('导出路由权限元数据，包含默认首页和中文导航名', () => {
    expect(ROUTE_PERMISSIONS).toEqual([
      {
        path: '/owner',
        allowedRoles: ['OWNER'],
        defaultHomePath: '/owner/tasks',
        navName: '项目管理',
      },
      {
        path: '/labeler',
        allowedRoles: ['LABELER'],
        defaultHomePath: '/labeler/market',
        navName: '标注工作台',
      },
      {
        path: '/agent',
        allowedRoles: ['AI_AGENT'],
        defaultHomePath: '/agent/ai-review',
        navName: 'AI 审核台',
      },
      {
        path: '/reviewer',
        allowedRoles: ['REVIEWER'],
        defaultHomePath: '/reviewer/reviews',
        navName: '复审工作台',
      },
    ]);

    expect(getRoutePermission('/owner/datasets')).toEqual(ROUTE_PERMISSIONS[0]);
    expect(getRoutePermission('/admin')).toBeUndefined();
  });
});
