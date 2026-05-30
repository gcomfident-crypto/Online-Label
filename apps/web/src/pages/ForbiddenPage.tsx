import { Link } from 'react-router-dom';

import { getRoleHomePath } from '@labelhub/shared';
import { useSession } from '../stores/sessionStore';

export const ForbiddenPage = () => {
  const session = useSession();
  const homePath = session ? getRoleHomePath(session.user.role) : '/login';

  return (
    <main className="system-page">
      <section className="system-panel" aria-labelledby="forbidden-title">
        <h1 id="forbidden-title">无权限访问</h1>
        <p>当前账号不能访问该端工作区。</p>
        <Link className="primary-link" to={homePath}>
          返回当前端首页
        </Link>
      </section>
    </main>
  );
};
