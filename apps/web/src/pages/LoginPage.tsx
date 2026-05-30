import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  ROLE_HOME_METADATA,
  USER_ROLE,
  getRoleHomePath,
  type UserRole,
} from '@labelhub/shared';
import { sessionStore } from '../stores/sessionStore';
import { AnnotationLoginScene } from './login/AnnotationLoginScene';

const LOGIN_ROLE_OPTIONS: Array<{ label: string; role: UserRole }> = [
  { label: 'Owner 任务负责人', role: USER_ROLE.OWNER },
  { label: 'Labeler 标注员', role: USER_ROLE.LABELER },
  { label: 'AI Agent 预审', role: USER_ROLE.AI_AGENT },
  { label: 'Reviewer 审核员', role: USER_ROLE.REVIEWER },
];

const ACCOUNT_ROLE_ALIASES: Record<string, UserRole> = {
  agent: USER_ROLE.AI_AGENT,
  ai: USER_ROLE.AI_AGENT,
  ai_agent: USER_ROLE.AI_AGENT,
  labeler: USER_ROLE.LABELER,
  owner: USER_ROLE.OWNER,
  reviewer: USER_ROLE.REVIEWER,
};

const resolveRoleFromAccount = (account: string, selectedRole: UserRole) => {
  const normalizedAccount = account.trim().toLowerCase().split('@')[0];
  return ACCOUNT_ROLE_ALIASES[normalizedAccount] ?? selectedRole;
};

export const LoginPage = () => {
  const navigate = useNavigate();
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [rememberSession, setRememberSession] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole>(USER_ROLE.OWNER);
  const [formError, setFormError] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!account.trim() || !password.trim()) {
      setFormError('请输入账号和密码');
      return;
    }

    const role = resolveRoleFromAccount(account, selectedRole);
    const nextSession = sessionStore.loginAs(role, { remember: rememberSession });

    navigate(getRoleHomePath(nextSession.user.role), { replace: true });
  };

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-form-shell">
          <div className="login-brand-lockup" aria-label="LabelHub">
            <span className="login-brand-lockup__mark" aria-hidden="true">LH</span>
            <span>LabelHub</span>
          </div>
          <div className="login-form-heading">
            <span>Intelligent Annotation Platform</span>
            <h1 id="login-title">登录 LabelHub</h1>
            <p>任务分发、AI 预审、人工审核和质检闭环统一在一个可信赖的数据标注工作台。</p>
          </div>
          <form className="login-form" onSubmit={handleSubmit}>
            <label>
              <span>账号</span>
              <input
                autoComplete="username"
                name="account"
                placeholder="owner / labeler / agent / reviewer"
                value={account}
                onChange={(event) => {
                  setAccount(event.target.value);
                  setFormError('');
                }}
              />
            </label>
            <label>
              <span>密码</span>
              <input
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
            <label>
              <span>登录身份</span>
              <select
                aria-label="登录身份"
                value={selectedRole}
                onChange={(event) => setSelectedRole(event.target.value as UserRole)}
              >
                {LOGIN_ROLE_OPTIONS.map((option) => (
                  <option key={option.role} value={option.role}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="login-form__meta">
              <label className="login-remember">
                <input
                  checked={rememberSession}
                  type="checkbox"
                  onChange={(event) => setRememberSession(event.target.checked)}
                />
                <span>记住登录状态</span>
              </label>
              <span>{ROLE_HOME_METADATA[selectedRole].displayName}</span>
            </div>
            {formError ? <p className="login-form__error">{formError}</p> : null}
            <button className="login-submit-button" type="submit">
              登录平台
            </button>
          </form>
        </div>
        <AnnotationLoginScene />
      </section>
    </main>
  );
};
