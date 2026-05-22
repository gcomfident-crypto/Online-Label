import type { UserRole } from './roles.ts';
import { getRoutePermission } from './routes.ts';

export const canAccessRoute = (role: UserRole, path: string): boolean => {
  const permission = getRoutePermission(path);

  return permission?.allowedRoles.includes(role) ?? false;
};
