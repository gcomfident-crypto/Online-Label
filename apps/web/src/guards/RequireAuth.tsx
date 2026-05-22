import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

import { useSession } from '../stores/sessionStore';

type RequireAuthProps = {
  children: ReactNode;
};

export const RequireAuth = ({ children }: RequireAuthProps) => {
  const session = useSession();
  const location = useLocation();

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
};
