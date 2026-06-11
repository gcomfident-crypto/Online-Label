import { type FormEvent, type KeyboardEvent, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  USER_ROLE,
  getRoleHomePath,
  type UserRole,
} from '@labelhub/shared';
import labelHubLogo from '../assets/LabelHub_logo_closer_transparent.png';
import { sessionStore } from '../stores/sessionStore';

const LOGIN_ROLE_OPTIONS: Array<{ label: string; role: UserRole }> = [
  { label: 'Owner 任务负责人', role: USER_ROLE.OWNER },
  { label: 'Labeler 标注员', role: USER_ROLE.LABELER },
  { label: 'AI Agent 质检', role: USER_ROLE.AI_AGENT },
  { label: 'Reviewer 审核员', role: USER_ROLE.REVIEWER },
];

const ACCOUNT_ROLE_ALIASES: Record<string, UserRole> = {
  zhangzexin: USER_ROLE.OWNER,
  wangyuyang: USER_ROLE.LABELER,
  houshikang: USER_ROLE.LABELER,
  agent: USER_ROLE.AI_AGENT,
  xinzezhang: USER_ROLE.REVIEWER,
};

const DEMO_ACCOUNT_PASSWORDS: Record<string, string> = {
  zhangzexin: 'LabelHub@1101101',
  wangyuyang: '1101101',
  houshikang: '1101101',
  agent: '1101101',
  xinzezhang: '1101101',
};

const resolveRoleFromAccount = (account: string): UserRole | null => {
  const normalizedAccount = account.trim().toLowerCase().split('@')[0];
  return ACCOUNT_ROLE_ALIASES[normalizedAccount] ?? null;
};

const ROLE_LABEL_MAP: Record<UserRole, string> = {
  OWNER: 'Owner 任务负责人',
  LABELER: 'Labeler 标注员',
  AI_AGENT: 'AI Agent 质检',
  REVIEWER: 'Reviewer 审核员',
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

    const accountRole = resolveRoleFromAccount(account);

    if (!accountRole) {
      setFormError('账号不存在，请输入有效的演示账号。');
      return;
    }

    if (accountRole !== selectedRole) {
      setFormError(`账号「${account.trim()}」不是${ROLE_LABEL_MAP[selectedRole]}，请检查身份选择。`);
      return;
    }

    const normalizedAccount = account.trim().toLowerCase().split('@')[0];
    const expectedPassword = DEMO_ACCOUNT_PASSWORDS[normalizedAccount];

    if (!expectedPassword || password !== expectedPassword) {
      setFormError('密码错误，请检查该演示账号对应的密码。');
      return;
    }

    const nextSession = sessionStore.loginAs(accountRole, { account, remember: rememberSession });

    void navigate(getRoleHomePath(nextSession.user.role), { replace: true });
  };

  const errorId = formError ? 'login-form-error' : undefined;

  return (
    <main className="login-page">
      <section className="login-shell" aria-label="LabelHub 登录表单">
        <section className="login-form-panel">
          <div className="login-brand-lockup" aria-label="LabelHub">
            <img className="login-brand-lockup__mark" src={labelHubLogo} alt="" aria-hidden="true" />
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

            <div className="login-role-field">
              <span id="login-role-label">登录身份</span>
              <RoleSelect selectedRole={selectedRole} onRoleChange={setSelectedRole} />
            </div>

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

function RoleSelect({
  selectedRole,
  onRoleChange,
}: {
  selectedRole: UserRole;
  onRoleChange: (role: UserRole) => void;
}) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeRole, setActiveRole] = useState<UserRole>(selectedRole);
  const selectedOption = LOGIN_ROLE_OPTIONS.find((option) => option.role === selectedRole) ?? LOGIN_ROLE_OPTIONS[0];

  const getOptionId = (role: UserRole) => `${listboxId}-${role}`;

  const selectRole = (role: UserRole) => {
    setActiveRole(role);
    onRoleChange(role);
    setIsOpen(false);
  };

  const moveActiveRole = (step: number) => {
    const currentIndex = LOGIN_ROLE_OPTIONS.findIndex((option) => option.role === activeRole);
    const safeIndex = currentIndex >= 0 ? currentIndex : LOGIN_ROLE_OPTIONS.findIndex((option) => option.role === selectedRole);
    const nextIndex = (safeIndex + step + LOGIN_ROLE_OPTIONS.length) % LOGIN_ROLE_OPTIONS.length;
    setActiveRole(LOGIN_ROLE_OPTIONS[nextIndex].role);
    setIsOpen(true);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActiveRole(1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActiveRole(-1);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      setActiveRole(LOGIN_ROLE_OPTIONS[0].role);
      setIsOpen(true);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      setActiveRole(LOGIN_ROLE_OPTIONS[LOGIN_ROLE_OPTIONS.length - 1].role);
      setIsOpen(true);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      if (isOpen) {
        event.preventDefault();
        selectRole(activeRole);
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setIsOpen(false);
    }
  };

  return (
    <div
      ref={rootRef}
      className="login-role-picker"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false);
        }
      }}
    >
      <button
        id="login-role"
        aria-activedescendant={isOpen ? getOptionId(activeRole) : undefined}
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-labelledby="login-role-label"
        className="login-role-trigger"
        role="combobox"
        type="button"
        onClick={() => {
          setActiveRole(selectedRole);
          setIsOpen((current) => !current);
        }}
        onKeyDown={handleKeyDown}
      >
        <span className="login-role-trigger__value">{selectedOption.label}</span>
      </button>

      {isOpen ? (
        <div className="login-role-menu" id={listboxId} role="listbox" aria-labelledby="login-role-label">
          {LOGIN_ROLE_OPTIONS.map((option) => {
            const isSelected = option.role === selectedRole;
            const isActive = option.role === activeRole;

            return (
              <button
                key={option.role}
                id={getOptionId(option.role)}
                aria-selected={isSelected}
                className="login-role-option"
                data-active={isActive || undefined}
                data-selected={isSelected || undefined}
                role="option"
                type="button"
                onClick={() => selectRole(option.role)}
                onMouseEnter={() => setActiveRole(option.role)}
              >
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};
