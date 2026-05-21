import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ROLE_HOME_METADATA, USER_ROLE, USER_ROLES } from '@labelhub/shared';
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
  vi.unstubAllGlobals();
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

  it('四端 Portal Layout 各自渲染对应导航', async () => {
    act(() => {
      sessionStore.loginAs(USER_ROLE.OWNER);
    });
    const { unmount } = renderRoute('/owner/tasks');
    expect(screen.getByRole('navigation', { name: 'Owner 端导航' })).toHaveTextContent('任务管理');
    expect(screen.getByRole('navigation', { name: 'Owner 端导航' })).toHaveTextContent('模板配置');
    expect(screen.getByText('当前使用 seed 演示数据')).toBeInTheDocument();
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
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [] })));
    renderRoute('/reviewer/reviews');
    expect(screen.getByRole('navigation', { name: 'Reviewer 端导航' })).toHaveTextContent('复审台');
    expect(screen.getByRole('navigation', { name: 'Reviewer 端导航' })).toHaveTextContent('终审台');
    expect(screen.queryByRole('navigation', { name: 'AI Agent 端导航' })).not.toBeInTheDocument();
    expect(await screen.findByText('暂无待复审数据')).toBeInTheDocument();
  });
});

describe('Web 路由守卫', () => {
  it('未登录访问 /owner/tasks 跳转 /login', () => {
    renderRoute('/owner/tasks');

    expect(screen.getByRole('heading', { name: '登录 LabelHub' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Owner 演示账号/ })).toBeInTheDocument();
  });

  it('开发 Renderer 调试台可直接访问并切换示例', async () => {
    const user = userEvent.setup();

    renderRoute('/dev/renderer');

    expect(screen.getByRole('heading', { name: 'Renderer 调试台' })).toBeInTheDocument();
    expect(screen.getByText('请说明光合作用的主要过程。')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '答案 JSON' })).toBeInTheDocument();
    expect(screen.getAllByText('一句话总评为必填项。').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: '偏好对比' }));
    expect(screen.getByTestId('preference-compare-panel-a')).toHaveTextContent(
      '回答 A 已准确回应用户问题，但缺少后续操作建议。',
    );

    await user.click(screen.getByRole('button', { name: '问答质量：图片' }));
    expect(screen.getByRole('img', { name: '题目媒体' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '问答质量：视频' }));
    expect(document.querySelector('video')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '问答质量：Markdown' }));
    expect(screen.getByText('售后规则')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '全部物料' }));
    expect(screen.getByText('多 Tab 布局')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: '上传字段' }));
    expect(screen.getByText('图片上传示例')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '商品标题清洗 v3' }));
    expect(screen.getByText('原始商品标题')).toBeInTheDocument();
    await user.type(screen.getByLabelText('清洗后标题'), '降噪蓝牙耳机');
    expect(screen.getByText(/"cleaned_title": "降噪蓝牙耳机"/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '复核' }));
    expect(screen.getByLabelText('清洗后标题')).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '偏好对比' }));
    await user.click(screen.getByRole('button', { name: '商品标题清洗 v3' }));
    expect(screen.getByLabelText('清洗后标题')).toHaveValue('降噪蓝牙耳机');
  });

  it('Labeler 访问 /owner/tasks 被拦截到无权限页', () => {
    act(() => {
      sessionStore.loginAs(USER_ROLE.LABELER);
    });
    renderRoute('/owner/tasks');

    expect(screen.getByRole('heading', { name: '无权限访问' })).toBeInTheDocument();
    expect(screen.getByText('当前账号不能访问该端工作区。')).toBeInTheDocument();
  });

  it.each(USER_ROLES)('登录 %s 后按角色默认首页跳转', async (role) => {
    const user = userEvent.setup();
    renderRoute('/login');

    await user.click(
      screen.getByRole('button', {
        name: new RegExp(`${ROLE_HOME_METADATA[role].displayName.replace(' 端', '')} 演示账号`),
      }),
    );

    expect(
      screen.getByRole('navigation', { name: `${ROLE_HOME_METADATA[role].displayName}导航` }),
    ).toBeInTheDocument();
  });

  it('忽略并清理结构异常的本地会话', async () => {
    vi.resetModules();
    window.localStorage.setItem(
      'labelhub.session.v1',
      JSON.stringify({
        token: { value: 'bad-token' },
        user: { id: 7, name: false, role: 'OWNER' },
      }),
    );

    const { sessionStore: freshSessionStore } = await import('../stores/sessionStore');

    expect(freshSessionStore.getSnapshot()).toBeNull();
    expect(window.localStorage.getItem('labelhub.session.v1')).toBeNull();
  });

  it('恢复结构有效的本地会话', async () => {
    vi.resetModules();
    window.localStorage.setItem(
      'labelhub.session.v1',
      JSON.stringify({
        token: 'mock-token-labeler',
        user: {
          id: 'demo-labeler',
          name: 'Labeler 演示账号',
          role: 'LABELER',
        },
      }),
    );

    const { sessionStore: freshSessionStore } = await import('../stores/sessionStore');

    expect(freshSessionStore.getSnapshot()?.user.role).toBe('LABELER');
    expect(window.localStorage.getItem('labelhub.session.v1')).not.toBeNull();
  });
});

const jsonResponse = (body: unknown): Response =>
  ({
    ok: true,
    json: async () => body,
  }) as Response;
