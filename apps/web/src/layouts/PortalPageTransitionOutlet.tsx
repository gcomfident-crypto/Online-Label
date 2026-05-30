import { useLocation, useOutlet } from 'react-router-dom';

export const PortalPageTransitionOutlet = () => {
  const location = useLocation();
  const outlet = useOutlet();

  return (
    <div key={location.pathname} className="portal-page-transition">
      {outlet}
    </div>
  );
};
