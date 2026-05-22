import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { ROLE_HOME_METADATA, USER_ROLES, getRoleHomePath } from '@labelhub/shared';
import { sessionStore, useSession } from '../stores/sessionStore';

export const LoginPage = () => {
  const navigate = useNavigate();
  const session = useSession();

  useEffect(() => {
    if (session) {
      navigate(getRoleHomePath(session.user.role), { replace: true });
    }
  }, [navigate, session]);

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-copy">
          <p className="eyebrow">LabelHub 演示环境</p>
          <h1 id="login-title">登录 LabelHub</h1>
          <p>
            选择一个演示账号进入对应端工作区。本阶段只提供门户基础壳和后续功能入口，业务流程尚未接线。
          </p>
        </div>
        <div className="demo-account-grid" aria-label="演示账号">
          {USER_ROLES.map((role) => {
            const metadata = ROLE_HOME_METADATA[role];

            return (
              <button
                className="demo-account-button"
                key={role}
                type="button"
                onClick={() => {
                  sessionStore.loginAs(role);
                  navigate(metadata.homePath, { replace: true });
                }}
              >
                <span>{metadata.displayName.replace(' 端', '')} 演示账号</span>
                <small>{metadata.homePath}</small>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
};
