export const USER_ROLE = {
  OWNER: 'OWNER',
  LABELER: 'LABELER',
  AI_AGENT: 'AI_AGENT',
  REVIEWER: 'REVIEWER',
} as const;

export const USER_ROLES = [
  USER_ROLE.OWNER,
  USER_ROLE.LABELER,
  USER_ROLE.AI_AGENT,
  USER_ROLE.REVIEWER,
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export type RoleHomeMetadata = {
  displayName: string;
  routePrefix: string;
  homePath: string;
};

export const ROLE_HOME_METADATA = {
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
} as const satisfies Record<UserRole, RoleHomeMetadata>;

export const isUserRole = (value: unknown): value is UserRole => {
  return typeof value === 'string' && USER_ROLES.includes(value as UserRole);
};

export const getRoleHomePath = (role: UserRole): string => {
  return ROLE_HOME_METADATA[role].homePath;
};
