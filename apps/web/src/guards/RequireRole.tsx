import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';

import type { UserRole } from '@labelhub/shared';
import { useSession } from '../stores/sessionStore';

type RequireRoleProps = {
  role: UserRole;
  children: ReactNode;
};

export const RequireRole = ({ role, children }: RequireRoleProps) => {
  const session = useSession();

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (session.user.role !== role) {
    return <Navigate to="/forbidden" replace />;
  }

  return children;
};
