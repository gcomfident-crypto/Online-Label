import { useLocation, useOutlet } from 'react-router-dom';

export const PortalPageTransitionOutlet = () => {
  const location = useLocation();
  const outlet = useOutlet();
  const transitionKey = resolvePortalPageTransitionKey(location.pathname);

  return (
    <div key={transitionKey} className="portal-page-transition">
      {outlet}
    </div>
  );
};

export function resolvePortalPageTransitionKey(pathname: string): string {
  if (/^\/labeler\/tasks\/[^/]+\/items\/[^/]+$/.test(pathname)) {
    return '/labeler/tasks/:taskId/items/:itemId';
  }

  return pathname;
}
