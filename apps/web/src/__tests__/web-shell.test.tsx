import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { USER_ROLE } from '@labelhub/shared';
import { AppRouter } from '../router';
import { sessionStore } from '../stores/sessionStore';

const renderRoute = (initialPath: string) => {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AppRouter />
    </MemoryRouter>,
  );
};

afterEach(() => {
  cleanup();
  act(() => {
    sessionStore.clear();
  });
  window.localStorage?.clear();
});

describe('Web 壳 smoke test', () => {
  it('在 /login 渲染四个演示账号入口', () => {
    renderRoute('/login');

    expect(screen.getByRole('button', { name: /Owner 演示账号/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Labeler 演示账号/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /AI Agent 演示账号/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reviewer 演示账号/ })).toBeInTheDocument();
  });

  it('四端 Portal Layout 各自渲染对应导航', () => {
    act(() => {
      sessionStore.loginAs(USER_ROLE.OWNER);
    });
    const { unmount } = renderRoute('/owner/tasks');
    expect(screen.getByRole('navigation', { name: 'Owner 端导航' })).toHaveTextContent('任务管理');
    expect(screen.getByRole('navigation', { name: 'Owner 端导航' })).toHaveTextContent('模板配置');
    expect(screen.queryByRole('navigation', { name: 'Labeler 端导航' })).not.toBeInTheDocument();
    unmount();

    act(() => {
      sessionStore.loginAs(USER_ROLE.LABELER);
    });
    const labelerView = renderRoute('/labeler/market');
    expect(screen.getByRole('navigation', { name: 'Labeler 端导航' })).toHaveTextContent('任务广场');
    expect(screen.queryByRole('navigation', { name: 'Owner 端导航' })).not.toBeInTheDocument();
    labelerView.unmount();

    act(() => {
      sessionStore.loginAs(USER_ROLE.AI_AGENT);
    });
    const agentView = renderRoute('/agent/ai-review');
    expect(screen.getByRole('navigation', { name: 'AI Agent 端导航' })).toHaveTextContent('机审队列');
    expect(screen.queryByRole('navigation', { name: 'Reviewer 端导航' })).not.toBeInTheDocument();
    agentView.unmount();

    act(() => {
      sessionStore.loginAs(USER_ROLE.REVIEWER);
    });
    renderRoute('/reviewer/reviews');
    expect(screen.getByRole('navigation', { name: 'Reviewer 端导航' })).toHaveTextContent('验收台');
    expect(screen.queryByRole('navigation', { name: 'AI Agent 端导航' })).not.toBeInTheDocument();
  });
});

describe('Web 路由守卫', () => {
  it('未登录访问 /owner/tasks 跳转 /login', () => {
    renderRoute('/owner/tasks');

    expect(screen.getByRole('heading', { name: '登录 LabelHub' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Owner 演示账号/ })).toBeInTheDocument();
  });

  it('Labeler 访问 /owner/tasks 被拦截到无权限页', () => {
    act(() => {
      sessionStore.loginAs(USER_ROLE.LABELER);
    });
    renderRoute('/owner/tasks');

    expect(screen.getByRole('heading', { name: '无权限访问' })).toBeInTheDocument();
    expect(screen.getByText('当前账号不能访问该端工作区。')).toBeInTheDocument();
  });

  it('登录后按角色默认首页跳转', async () => {
    const user = userEvent.setup();
    renderRoute('/login');

    await user.click(screen.getByRole('button', { name: /Reviewer 演示账号/ }));

    expect(screen.getByRole('navigation', { name: 'Reviewer 端导航' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '验收台' })).toBeInTheDocument();
  });
});
