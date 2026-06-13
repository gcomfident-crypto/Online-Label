import { useSyncExternalStore } from 'react';

import { USER_ROLE, isUserRole, type UserRole } from '@labelhub/shared';

const STORAGE_KEY = 'labelhub.session.v1';
const REMEMBERED_STORAGE_KEY = 'labelhub.rememberedSession.v1';
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
    id: 'user_owner_zhang_man',
    name: '张泽鑫',
    role: USER_ROLE.OWNER,
  },
  [USER_ROLE.LABELER]: {
    id: 'user_labeler_li_lei',
    name: 'Labeler 演示账号',
    role: USER_ROLE.LABELER,
  },
  [USER_ROLE.AI_AGENT]: {
    id: 'user_ai_agent_system',
    name: 'AI Agent 演示账号',
    role: USER_ROLE.AI_AGENT,
  },
  [USER_ROLE.REVIEWER]: {
    id: 'user_reviewer_wang_fang',
    name: '鑫泽张',
    role: USER_ROLE.REVIEWER,
  },
};

const DEMO_ACCOUNT_USERS: Record<string, SessionUser> = {
  zhangzexin: DEMO_USERS[USER_ROLE.OWNER],
  wangyuyang: {
    id: 'user_labeler_li_lei',
    name: '王昱阳',
    role: USER_ROLE.LABELER,
  },
  houshikang: {
    id: 'user_labeler_han_mei_mei',
    name: '侯士康',
    role: USER_ROLE.LABELER,
  },
  agent: DEMO_USERS[USER_ROLE.AI_AGENT],
  xinzezhang: DEMO_USERS[USER_ROLE.REVIEWER],
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

const readStoredSessionFrom = (scope: SessionStorageScope, key = STORAGE_KEY): SessionState | null => {
  const storage = getStorage(scope);
  if (!storage) {
    return null;
  }

  const rawSession = storage.getItem(key);
  if (!rawSession) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawSession) as Partial<SessionState>;
    if (!isStoredSession(parsed)) {
      storage.removeItem(key);
      return null;
    }

    const session = {
      token: parsed.token,
      user: normalizeStoredUser({
        id: parsed.user.id,
        name: parsed.user.name,
        role: parsed.user.role,
      }),
    };

    if (session.user.name !== parsed.user.name) {
      storage.setItem(key, JSON.stringify(session));
    }

    return session;
  } catch {
    storage.removeItem(key);
    return null;
  }
};

const readStoredSession = (): { session: SessionState; scope: SessionStorageScope } | null => {
  const sessionScopedSession = readStoredSessionFrom('session');
  if (sessionScopedSession) {
    return { session: sessionScopedSession, scope: 'session' };
  }

  const rememberedScopedSession = readStoredSessionFrom('local', REMEMBERED_STORAGE_KEY);
  if (rememberedScopedSession) {
    return { session: rememberedScopedSession, scope: 'local' };
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

  if (session) {
    sessionStorage?.setItem(STORAGE_KEY, JSON.stringify(session));
    localStorage?.removeItem(STORAGE_KEY);

    if (scope === 'local') {
      localStorage?.setItem(REMEMBERED_STORAGE_KEY, JSON.stringify(session));
    } else {
      localStorage?.removeItem(REMEMBERED_STORAGE_KEY);
    }
  } else {
    localStorage?.removeItem(STORAGE_KEY);
    localStorage?.removeItem(REMEMBERED_STORAGE_KEY);
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
  loginWithSession: (session: SessionState, options: { remember?: boolean } = {}) => {
    persist(normalizeSession(session), options.remember ? 'local' : 'session');
    return currentSession;
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

function normalizeStoredUser(user: SessionUser): SessionUser {
  if (user.id === 'mock-owner' || user.id === 'demo-owner') {
    return { ...user, id: 'user_owner_zhang_man', name: '张泽鑫' };
  }

  if (user.id === 'mock-labeler-wang-yu-yang' || user.id === 'demo-labeler-wang-yu-yang') {
    return { ...user, id: 'user_labeler_li_lei', name: '王昱阳' };
  }

  if (user.id === 'mock-labeler-hou-shi-kang' || user.id === 'demo-labeler-hou-shi-kang') {
    return { ...user, id: 'user_labeler_han_mei_mei', name: '侯士康' };
  }

  if (user.id === 'mock-ai_agent' || user.id === 'demo-agent') {
    return { ...user, id: 'user_ai_agent_system', name: 'AI Agent' };
  }

  if (user.id === 'mock-reviewer' || user.id === 'demo-reviewer') {
    return { ...user, id: 'user_reviewer_wang_fang', name: '鑫泽张' };
  }

  if (user.role === USER_ROLE.OWNER && user.name === '张满') {
    return { ...user, name: '张泽鑫' };
  }

  if (user.role === USER_ROLE.LABELER && user.name === '李雷') {
    return { ...user, name: '王昱阳' };
  }

  if (user.role === USER_ROLE.LABELER && user.name === '韩梅梅') {
    return { ...user, name: '侯士康' };
  }

  if (user.role === USER_ROLE.REVIEWER && user.name === '王芳') {
    return { ...user, name: '鑫泽张' };
  }

  return user;
}

function normalizeSession(session: SessionState): SessionState {
  return {
    token: session.token,
    user: normalizeStoredUser(session.user),
  };
}

function resolveDemoAccountUser(account?: string): SessionUser | null {
  const normalizedAccount = account?.trim().toLowerCase().split('@')[0];
  return normalizedAccount ? DEMO_ACCOUNT_USERS[normalizedAccount] ?? null : null;
}
