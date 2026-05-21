import { describe, expect, it } from 'vitest';

import {
  LABELHUB_SHARED_VERSION,
  ROLE_HOME_METADATA,
  USER_ROLES,
  getRoleHomePath,
  isUserRole,
  type UserRole,
} from '.';

describe('共享角色协议', () => {
  it('导出 shared 包版本常量', () => {
    expect(LABELHUB_SHARED_VERSION).toBe('0.0.0');
  });

  it('固定导出所有用户角色', () => {
    expect(USER_ROLES).toEqual(['OWNER', 'LABELER', 'AI_AGENT', 'REVIEWER']);
  });

  it('为每个角色导出中文名称、路由前缀和默认首页', () => {
    expect(ROLE_HOME_METADATA).toEqual({
      OWNER: {
        displayName: 'Owner 端',
        routePrefix: '/owner',
        homePath: '/owner/tasks',
      },
      LABELER: {
        displayName: 'Labeler 端',
        routePrefix: '/labeler',
        homePath: '/labeler/market',
      },
      AI_AGENT: {
        displayName: 'AI Agent 端',
        routePrefix: '/agent',
        homePath: '/agent/ai-review',
      },
      REVIEWER: {
        displayName: 'Reviewer 端',
        routePrefix: '/reviewer',
        homePath: '/reviewer/reviews',
      },
    });
  });

  it('判断未知输入是否为用户角色', () => {
    expect(isUserRole('OWNER')).toBe(true);
    expect(isUserRole('AI_AGENT')).toBe(true);
    expect(isUserRole('ADMIN')).toBe(false);
    expect(isUserRole(null)).toBe(false);
  });

  it('按角色返回默认首页路径', () => {
    const role: UserRole = 'REVIEWER';

    expect(getRoleHomePath(role)).toBe('/reviewer/reviews');
  });
});
