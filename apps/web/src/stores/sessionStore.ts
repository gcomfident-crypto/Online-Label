import { useSyncExternalStore } from 'react';

import { USER_ROLE, isUserRole, type UserRole } from '@labelhub/shared';

const STORAGE_KEY = 'labelhub.session.v1';

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
    name: 'Owner 演示账号',
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
    name: 'Reviewer 演示账号',
    role: USER_ROLE.REVIEWER,
  },
};

const subscribers = new Set<() => void>();

const getLocalStorage = (): Storage | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const readStoredSession = (): SessionState | null => {
  const storage = getLocalStorage();
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

let currentSession: SessionState | null = readStoredSession();

const emitChange = () => {
  subscribers.forEach((listener) => listener());
};

const persist = (session: SessionState | null) => {
  currentSession = session;

  const storage = getLocalStorage();
  if (storage) {
    if (session) {
      storage.setItem(STORAGE_KEY, JSON.stringify(session));
    } else {
      storage.removeItem(STORAGE_KEY);
    }
  }

  emitChange();
};

export const sessionStore = {
  getSnapshot: () => currentSession,
  subscribe: (listener: () => void) => {
    subscribers.add(listener);
    return () => subscribers.delete(listener);
  },
  loginAs: (role: UserRole) => {
    const user = DEMO_USERS[role];
    const session: SessionState = {
      token: `mock-token-${role.toLowerCase()}`,
      user,
    };

    persist(session);
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

const isStoredSession = (value: Partial<SessionState>): value is SessionState => {
  return (
    typeof value.token === 'string' &&
    typeof value.user?.id === 'string' &&
    typeof value.user?.name === 'string' &&
    isUserRole(value.user?.role)
  );
};
