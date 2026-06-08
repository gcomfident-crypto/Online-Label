import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  USER_ROLE,
  getRoleHomePath,
  type UserRole,
} from '@labelhub/shared';
import loginLogo from '../assets/LabelHub_logo_closer_transparent.png';
import { sessionStore } from '../stores/sessionStore';

const ACCOUNT_ROLE_ALIASES: Record<string, UserRole> = {
  zhangman: USER_ROLE.OWNER,
  lilei: USER_ROLE.LABELER,
  hanmeimei: USER_ROLE.LABELER,
  agent: USER_ROLE.AI_AGENT,
  wangfang: USER_ROLE.REVIEWER,
};

const resolveRoleFromAccount = (account: string): UserRole | null => {
  const normalizedAccount = account.trim().toLowerCase().split('@')[0];
  return ACCOUNT_ROLE_ALIASES[normalizedAccount] ?? null;
};

export const LoginPage = () => {
  const navigate = useNavigate();
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [rememberSession, setRememberSession] = useState(false);
  const [formError, setFormError] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!account.trim() || !password.trim()) {
      setFormError('请输入账号和密码');
      return;
    }

    const role = resolveRoleFromAccount(account);

    if (!role) {
      setFormError('账号不存在，请输入有效的演示账号。');
      return;
    }

    const nextSession = sessionStore.loginAs(role, { account, remember: rememberSession });

    void navigate(getRoleHomePath(nextSession.user.role), { replace: true });
  };

  const errorId = formError ? 'login-form-error' : undefined;

  return (
    <main className="login-page">
      <section className="login-shell" aria-label="LabelHub 登录表单">
        <section className="login-form-panel">
          <div className="login-brand-lockup">
            <img className="login-brand-lockup__mark" src={loginLogo} alt="LabelHub" draggable={false} />
          </div>

          <div className="login-form-heading">
            <p>
              <span className="login-form-heading__phrase">团队级数据标注平台，</span>
              <span className="login-form-heading__phrase login-form-heading__phrase--delay">
                统一导入、分发、预审与质检
              </span>
            </p>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            <label htmlFor="login-account">
              <span>账号</span>
              <input
                id="login-account"
                aria-describedby={errorId}
                aria-invalid={formError ? true : undefined}
                autoComplete="username"
                name="account"
                placeholder="请输入账号"
                value={account}
                onChange={(event) => {
                  setAccount(event.target.value);
                  setFormError('');
                }}
              />
            </label>

            <label htmlFor="login-password">
              <span>密码</span>
              <input
                id="login-password"
                aria-describedby={errorId}
                aria-invalid={formError ? true : undefined}
                autoComplete="current-password"
                name="password"
                placeholder="请输入密码"
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setFormError('');
                }}
              />
            </label>

            <div className="login-form__meta">
              <label className="login-remember" htmlFor="login-remember-session">
                <input
                  id="login-remember-session"
                  checked={rememberSession}
                  type="checkbox"
                  onChange={(event) => setRememberSession(event.target.checked)}
                />
                <span className="login-remember__box" aria-hidden="true" />
                <span className="login-remember__text">记住登录状态</span>
              </label>
            </div>

            {formError ? (
              <p className="login-form__error" id="login-form-error">
                {formError}
              </p>
            ) : null}

            <button className="login-submit-button" type="submit">
              登录平台
            </button>
          </form>
        </section>
      </section>
    </main>
  );
};
