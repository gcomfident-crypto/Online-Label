import { useSyncExternalStore } from 'react';

import { USER_ROLE, isUserRole, type UserRole } from '@labelhub/shared';

const STORAGE_KEY = 'labelhub.session.v1';
type SessionStorageScope = 'local' | 'session';

export type SessionUser = {
  id: string;
  name: string;
  role: UserRole;
};

export type SessionState = {
  token: string;
  user: SessionUser;
};

const DEMO_USERS: Record<UserRole, SessionUser> = {
  [USER_ROLE.OWNER]: {
    id: 'demo-owner',
    name: '张满',
    role: USER_ROLE.OWNER,
  },
  [USER_ROLE.LABELER]: {
    id: 'demo-labeler',
    name: 'Labeler 演示账号',
    role: USER_ROLE.LABELER,
  },
  [USER_ROLE.AI_AGENT]: {
    id: 'demo-agent',
    name: 'AI Agent 演示账号',
    role: USER_ROLE.AI_AGENT,
  },
  [USER_ROLE.REVIEWER]: {
    id: 'demo-reviewer',
    name: '王芳',
    role: USER_ROLE.REVIEWER,
  },
};

const DEMO_ACCOUNT_USERS: Record<string, SessionUser> = {
  owner: DEMO_USERS[USER_ROLE.OWNER],
  labeler: {
    id: 'demo-labeler-li-lei',
    name: '李雷',
    role: USER_ROLE.LABELER,
  },
  labeler1: {
    id: 'demo-labeler-li-lei',
    name: '李雷',
    role: USER_ROLE.LABELER,
  },
  labeler2: {
    id: 'demo-labeler-han-mei-mei',
    name: '韩梅梅',
    role: USER_ROLE.LABELER,
  },
  agent: DEMO_USERS[USER_ROLE.AI_AGENT],
  ai: DEMO_USERS[USER_ROLE.AI_AGENT],
  ai_agent: DEMO_USERS[USER_ROLE.AI_AGENT],
  reviewer: DEMO_USERS[USER_ROLE.REVIEWER],
};

const subscribers = new Set<() => void>();

const getStorage = (scope: SessionStorageScope): Storage | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return scope === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
};

const readStoredSessionFrom = (scope: SessionStorageScope): SessionState | null => {
  const storage = getStorage(scope);
  if (!storage) {
    return null;
  }

  const rawSession = storage.getItem(STORAGE_KEY);
  if (!rawSession) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawSession) as Partial<SessionState>;
    if (!isStoredSession(parsed)) {
      storage.removeItem(STORAGE_KEY);
      return null;
    }

    return {
      token: parsed.token,
      user: {
        id: parsed.user.id,
        name: parsed.user.name,
        role: parsed.user.role,
      },
    };
  } catch {
    storage.removeItem(STORAGE_KEY);
    return null;
  }
};

const readStoredSession = (): { session: SessionState; scope: SessionStorageScope } | null => {
  const sessionScopedSession = readStoredSessionFrom('session');
  if (sessionScopedSession) {
    return { session: sessionScopedSession, scope: 'session' };
  }

  const localScopedSession = readStoredSessionFrom('local');
  if (localScopedSession) {
    return { session: localScopedSession, scope: 'local' };
  }

  return null;
};

const storedSession = readStoredSession();
let currentSession: SessionState | null = storedSession?.session ?? null;
let currentStorageScope: SessionStorageScope | null = storedSession?.scope ?? null;

const emitChange = () => {
  subscribers.forEach((listener) => listener());
};

const persist = (session: SessionState | null, scope: SessionStorageScope | null = currentStorageScope) => {
  currentSession = session;
  currentStorageScope = session ? scope : null;

  const localStorage = getStorage('local');
  const sessionStorage = getStorage('session');

  if (session && scope === 'local') {
    localStorage?.setItem(STORAGE_KEY, JSON.stringify(session));
    sessionStorage?.removeItem(STORAGE_KEY);
  } else if (session && scope === 'session') {
    sessionStorage?.setItem(STORAGE_KEY, JSON.stringify(session));
    localStorage?.removeItem(STORAGE_KEY);
  } else {
    localStorage?.removeItem(STORAGE_KEY);
    sessionStorage?.removeItem(STORAGE_KEY);
  }

  emitChange();
};

export const sessionStore = {
  getSnapshot: () => currentSession,
  subscribe: (listener: () => void) => {
    subscribers.add(listener);
    return () => subscribers.delete(listener);
  },
  loginAs: (role: UserRole, options: { account?: string; remember?: boolean } = {}) => {
    const accountUser = resolveDemoAccountUser(options.account);
    const user = accountUser?.role === role ? accountUser : DEMO_USERS[role];
    const session: SessionState = {
      token: `mock-token-${role.toLowerCase()}`,
      user,
    };

    persist(session, options.remember === false ? 'session' : 'local');
    return session;
  },
  clear: () => persist(null),
};

export const useSession = () => {
  return useSyncExternalStore(
    sessionStore.subscribe,
    sessionStore.getSnapshot,
    sessionStore.getSnapshot,
  );
};

function isStoredSession(value: Partial<SessionState>): value is SessionState {
  return (
    typeof value.token === 'string' &&
    typeof value.user?.id === 'string' &&
    typeof value.user?.name === 'string' &&
    isUserRole(value.user?.role)
  );
}

function resolveDemoAccountUser(account?: string): SessionUser | null {
  const normalizedAccount = account?.trim().toLowerCase().split('@')[0];
  return normalizedAccount ? DEMO_ACCOUNT_USERS[normalizedAccount] ?? null : null;
}
