import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ROLE_HOME_METADATA, USER_ROLE, USER_ROLES } from '@labelhub/shared';
import databoardIconAsset from '../assets/databoard.svg';
import exportIconAsset from '../assets/export.svg';
import foldIconAsset from '../assets/fold.svg';
import llmIconAsset from '../assets/llm.svg';
import logoIconAsset from '../assets/logo.svg';
import missionSquareIconAsset from '../assets/mission_square.svg';
import modelIconAsset from '../assets/model.svg';
import personIconAsset from '../assets/person.svg';
import taskIconAsset from '../assets/task.svg';
import workbenchIconAsset from '../assets/workbench.svg';
import { resolvePortalPageTransitionKey } from '../layouts/PortalPageTransitionOutlet';
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
  window.sessionStorage?.clear();
});

describe('Web 壳 smoke test', () => {
  it('标注台题目间切换复用页面转场 key，避免整页进入动画闪烁', () => {
    expect(resolvePortalPageTransitionKey('/labeler/tasks/task_qa/items/item_qa_1')).toBe(
      '/labeler/tasks/:taskId/items/:itemId',
    );
    expect(resolvePortalPageTransitionKey('/labeler/tasks/task_qa/items/item_qa_2')).toBe(
      '/labeler/tasks/:taskId/items/:itemId',
    );
    expect(resolvePortalPageTransitionKey('/labeler/my-data')).toBe('/labeler/my-data');
  });

  it('在 /login 渲染仅包含登录表单的背景图登录页', async () => {
    const user = userEvent.setup();
    const { container } = renderRoute('/login');

    const logo = screen.getByAltText('LabelHub');
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute('src', expect.stringContaining('LabelHub_logo_closer_transparent'));
    expect(screen.queryByText('登录 LabelHub')).not.toBeInTheDocument();
    expect(screen.queryByText('智能标注工作台')).not.toBeInTheDocument();
    expect(screen.queryByText('进入 LabelHub 多角色工作台，集中处理项目任务。')).not.toBeInTheDocument();
    expect(screen.queryByText('面向团队的数据标注平台，统一完成数据导入、任务分发、智能预审与人工质检')).not.toBeInTheDocument();
    expect(container.querySelector('.login-form-heading')).toHaveTextContent(
      '团队级数据标注平台，统一导入、分发、预审与质检',
    );
    expect(screen.queryByText('Intelligent Annotation Platform')).not.toBeInTheDocument();
    expect(screen.getByLabelText('账号')).toBeInTheDocument();
    expect(screen.getByLabelText('密码')).toBeInTheDocument();
    expect(container.querySelector('select#login-role')).not.toBeInTheDocument();
    const roleCombobox = screen.getByRole('combobox', { name: '登录身份' });
    expect(roleCombobox).toBeInTheDocument();
    expect(roleCombobox).toHaveAttribute('aria-expanded', 'false');
    expect(container.querySelector('.login-role-trigger__cue')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('3D 数据流动画')).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'LabelHub 平台能力总览' })).not.toBeInTheDocument();
    expect(screen.queryByText('流程总览')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '任务流转' })).not.toBeInTheDocument();
    expect(screen.queryByText('从任务创建到终审交付的完整数据生产链路')).not.toBeInTheDocument();
    expect(screen.queryByText('92.4%')).not.toBeInTheDocument();
    expect(screen.queryByText('通过率')).not.toBeInTheDocument();
    expect(screen.queryByText('AI 预审完成 · 2 分钟前')).not.toBeInTheDocument();
    expect(screen.queryByText('审核员已接收 · 8 分钟前')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '登录平台' })).toBeInTheDocument();
    expect(screen.getByText('记住登录状态')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '记住登录状态' })).not.toBeChecked();
    expect(container.querySelector('.login-remember__box')).toBeInTheDocument();
    expect(screen.queryByText('Owner 端')).not.toBeInTheDocument();

    await user.click(roleCombobox);
    expect(roleCombobox).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByRole('option', { name: 'AI Agent 预审' }));
    expect(roleCombobox).toHaveTextContent('AI Agent 预审');
    expect(roleCombobox).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('AI Agent 端')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '登录平台' }));
    expect(screen.getByText('请输入账号和密码')).toBeInTheDocument();
  });

  it('登录身份自定义下拉选择的角色会用于登录跳转', async () => {
    const user = userEvent.setup();
    const { container } = renderRoute('/login');

    expect(container.querySelector('select#login-role')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('账号'), 'demo-user');
    await user.type(screen.getByLabelText('密码'), 'password');
    await user.click(screen.getByRole('combobox', { name: '登录身份' }));
    await user.click(screen.getByRole('option', { name: 'AI Agent 预审' }));
    await user.click(screen.getByRole('button', { name: '登录平台' }));

    expect(await screen.findByRole('navigation', { name: 'AI Agent 端导航' })).toBeInTheDocument();
  });

  it('根路径不会复用历史 Agent 会话自动进入 Agent 页面', () => {
    act(() => {
      sessionStore.loginAs(USER_ROLE.AI_AGENT);
    });

    renderRoute('/');

    expect(screen.getByRole('button', { name: '登录平台' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'AI Agent 端导航' })).not.toBeInTheDocument();
  });

  it('浏览器标签标题随当前路径显示所在位置', async () => {
    renderRoute('/login');
    await waitFor(() => expect(document.title).toBe('登录 - LabelHub'));
    cleanup();

    act(() => {
      sessionStore.loginAs(USER_ROLE.OWNER);
    });
    renderRoute('/owner/templates');
    await waitFor(() => expect(document.title).toBe('任务负责人后台 / 评测模板 - LabelHub'));
    cleanup();

    act(() => {
      sessionStore.loginAs(USER_ROLE.LABELER);
    });
    renderRoute('/labeler/my-data');
    await waitFor(() => expect(document.title).toBe('标注员工作台 / 工作台 - LabelHub'));
    cleanup();

    act(() => {
      sessionStore.loginAs(USER_ROLE.AI_AGENT);
    });
    renderRoute('/agent/dashboard');
    await waitFor(() => expect(document.title).toBe('AI 预审后台 / 数据看板 - LabelHub'));
  });

  it('四端 Portal Layout 各自渲染对应导航', async () => {
    act(() => {
      sessionStore.loginAs(USER_ROLE.OWNER);
    });
    const { unmount } = renderRoute('/owner/tasks');
    const ownerTopbar = screen.getByRole('banner', { name: '平台顶栏' });
    expect(ownerTopbar).toHaveTextContent('LabelHub');
    const brandIcon = ownerTopbar.querySelector('.platform-brand__mark');
    expect(brandIcon?.tagName.toLowerCase()).toBe('img');
    expect(brandIcon?.getAttribute('src')).toContain(logoIconAsset);
    expect(screen.getByRole('banner', { name: '平台顶栏' })).toHaveTextContent('任务负责人后台 / 任务管理');
    expect(screen.getByRole('banner', { name: '平台顶栏' })).toHaveTextContent('张满 · Owner');
    const currentPath = screen.getByLabelText('当前路径');
    expect(currentPath.querySelector('.platform-current-path__prefix')).toHaveTextContent('任务负责人后台');
    expect(currentPath.querySelector('.platform-current-path__leaf')).toHaveTextContent('任务管理');
    expect(screen.getByRole('navigation', { name: 'Owner 端导航' })).toHaveTextContent('任务管理');
    expect(screen.getByRole('navigation', { name: 'Owner 端导航' })).toHaveTextContent('评测模板');
    expect(screen.getByRole('navigation', { name: 'Owner 端导航' })).toHaveTextContent('导出中心');
    expect(screen.getByRole('navigation', { name: 'Owner 端导航' })).not.toHaveTextContent('AI规则');
    expect(
      Array.from(screen.getByRole('navigation', { name: 'Owner 端导航' }).querySelectorAll('.portal-nav__icon')).map(
        (node) => Array.from(node.classList).find((className) => className.startsWith('portal-nav__icon--')),
      ),
    ).toEqual([
      'portal-nav__icon--tasks',
      'portal-nav__icon--templates',
      'portal-nav__icon--exports',
    ]);
    const taskIcon = screen.getByRole('link', { name: '任务管理' }).querySelector('.portal-nav__icon--tasks');
    expect(taskIcon).toHaveClass('portal-nav__icon--asset');
    expect(taskIcon?.getAttribute('style')).toContain('url("');
    expect(taskIcon?.getAttribute('style')).toContain(taskIconAsset);
    const templateIcon = screen.getByRole('link', { name: '评测模板' }).querySelector('.portal-nav__icon--templates');
    expect(templateIcon).toHaveClass('portal-nav__icon--asset');
    expect(templateIcon?.getAttribute('style')).toContain('url("');
    expect(templateIcon?.getAttribute('style')).toContain(modelIconAsset);
    const exportIcon = screen.getByRole('link', { name: '导出中心' }).querySelector('.portal-nav__icon--exports');
    expect(exportIcon).toHaveClass('portal-nav__icon--asset');
    expect(exportIcon?.getAttribute('style')).toContain('url("');
    expect(exportIcon?.getAttribute('style')).toContain(exportIconAsset);
    expect(screen.queryByRole('link', { name: 'AI规则' })).not.toBeInTheDocument();
    const collapseButton = screen.getByRole('button', { name: '收起侧边栏' });
    expect(collapseButton).toHaveTextContent('收起');
    expect(collapseButton.querySelector('.portal-sidebar__toggle-icon')).not.toBeNull();
    expect(collapseButton.querySelector('.portal-sidebar__toggle-icon img')).toHaveAttribute('src', foldIconAsset);
    await userEvent.click(collapseButton);
    expect(document.querySelector('.owner-shell')).toHaveClass('is-sidebar-collapsed');
    const collapsedNavLabel = screen.getByRole('link', { name: '任务管理' }).querySelector('.portal-nav__label');
    expect(collapsedNavLabel).toHaveClass('is-hidden');
    const expandButton = screen.getByRole('button', { name: '展开侧边栏' });
    expect(expandButton).toBeInTheDocument();
    expect(expandButton.querySelector('.portal-sidebar__toggle-icon.is-collapsed')).not.toBeNull();
    expect(expandButton.querySelector('.portal-sidebar__toggle-icon.is-collapsed img')).toHaveAttribute(
      'src',
      foldIconAsset,
    );
    expect(expandButton.querySelector('.portal-sidebar__toggle-label')).toHaveClass('is-hidden');
    expect(screen.queryByText('当前使用 seed 演示数据')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Labeler 端导航' })).not.toBeInTheDocument();
    unmount();

    act(() => {
      sessionStore.loginAs(USER_ROLE.LABELER);
    });
    const labelerView = renderRoute('/labeler/market');
    expect(screen.getByRole('banner', { name: '平台顶栏' })).toHaveTextContent('标注员工作台 / 任务广场');
    const labelerNav = screen.getByRole('navigation', { name: 'Labeler 端导航' });
    expect(labelerNav).toHaveTextContent('任务广场');
    expect(labelerNav).toHaveTextContent('工作台');
    const marketIcon = within(labelerNav)
      .getByRole('link', { name: '任务广场' })
      .querySelector('.portal-nav__icon--market');
    expect(marketIcon).toHaveClass('portal-nav__icon--asset');
    expect(marketIcon?.getAttribute('style')).toContain('url("');
    expect(marketIcon?.getAttribute('style')).toContain(missionSquareIconAsset);
    const workbenchIcon = within(labelerNav)
      .getByRole('link', { name: '工作台' })
      .querySelector('.portal-nav__icon--my-data');
    expect(workbenchIcon).toHaveClass('portal-nav__icon--asset');
    expect(workbenchIcon?.getAttribute('style')).toContain('url("');
    expect(workbenchIcon?.getAttribute('style')).toContain(workbenchIconAsset);
    expect(screen.queryByRole('navigation', { name: 'Owner 端导航' })).not.toBeInTheDocument();
    labelerView.unmount();

    act(() => {
      sessionStore.loginAs(USER_ROLE.AI_AGENT);
    });
    const agentView = renderRoute('/agent/dashboard');
    expect(screen.getByRole('banner', { name: '平台顶栏' })).toHaveTextContent('AI 预审后台 / 数据看板');
    const agentNav = screen.getByRole('navigation', { name: 'AI Agent 端导航' });
    expect(agentNav).toHaveTextContent('数据看板');
    expect(agentNav).toHaveTextContent('机审队列');
    expect(
      within(agentNav).getAllByRole('link').map((link) => link.getAttribute('aria-label')),
    ).toEqual(['数据看板', '机审队列']);
    expect(screen.getByRole('heading', { name: '数据看板' })).toBeInTheDocument();
    const agentDashboardIcon = screen.getByRole('link', { name: '数据看板' }).querySelector('.portal-nav__icon--dashboard');
    expect(agentDashboardIcon).toHaveClass('portal-nav__icon--asset');
    expect(agentDashboardIcon?.getAttribute('style')).toContain('url("');
    expect(agentDashboardIcon?.getAttribute('style')).toContain(databoardIconAsset);
    const agentReviewIcon = screen.getByRole('link', { name: '机审队列' }).querySelector('.portal-nav__icon--ai-review');
    expect(agentReviewIcon).toHaveClass('portal-nav__icon--asset');
    expect(agentReviewIcon?.getAttribute('style')).toContain('url("');
    expect(agentReviewIcon?.getAttribute('style')).toContain(llmIconAsset);
    expect(screen.queryByRole('navigation', { name: 'Reviewer 端导航' })).not.toBeInTheDocument();
    agentView.unmount();

    act(() => {
      sessionStore.loginAs(USER_ROLE.REVIEWER);
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [] })));
    renderRoute('/reviewer/reviews');
    expect(screen.getByRole('banner', { name: '平台顶栏' })).toHaveTextContent('审核与质检 / 人工审核 / 审核任务列表');
    const reviewerNav = screen.getByRole('navigation', { name: 'Reviewer 端导航' });
    expect(reviewerNav).toHaveTextContent('人工审核');
    expect(reviewerNav).not.toHaveTextContent('终审');
    const reviewerIcon = screen.getByRole('link', { name: '人工审核' }).querySelector('.portal-nav__icon--review');
    expect(reviewerIcon).toHaveClass('portal-nav__icon--asset');
    expect(reviewerIcon?.getAttribute('style')).toContain('url("');
    expect(reviewerIcon?.getAttribute('style')).toContain(personIconAsset);
    expect(document.querySelector('.reviewer-shell .portal-sidebar')).toBeInTheDocument();
    expect(document.querySelector('.reviewer-shell--flat')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'AI Agent 端导航' })).not.toBeInTheDocument();
    expect(await screen.findByRole('table', { name: '人工审核任务列表' })).toBeInTheDocument();
  });

  it('Owner 顶栏点击账号头像后在下拉菜单中退出', async () => {
    const user = userEvent.setup();
    act(() => {
      sessionStore.loginAs(USER_ROLE.OWNER);
    });

    renderRoute('/owner/templates');

    expect(screen.queryByRole('menu', { name: '账号菜单' })).not.toBeInTheDocument();
    const accountButton = screen.getByRole('button', { name: '打开账号菜单' });
    expect(accountButton.querySelector('.platform-user__chevron')).toBeNull();
    expect(accountButton).not.toHaveTextContent('▾');
    await user.click(accountButton);
    const menu = screen.getByRole('menu', { name: '账号菜单' });
    expect(menu).toBeInTheDocument();
    expect(within(menu).queryByText('Owner 演示账号')).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '退出' })).toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: '退出' }));

    expect(screen.getByRole('button', { name: '登录平台' })).toBeInTheDocument();
  });
});

describe('Web 路由守卫', () => {
  it('未登录访问 /owner/tasks 跳转 /login', () => {
    renderRoute('/owner/tasks');

    expect(screen.queryByText('登录 LabelHub')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '登录平台' })).toBeInTheDocument();
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

    await user.type(screen.getByLabelText('账号'), role.toLowerCase());
    await user.type(screen.getByLabelText('密码'), 'password');
    await user.click(screen.getByRole('button', { name: '登录平台' }));

    expect(
      await screen.findByRole('navigation', { name: `${ROLE_HOME_METADATA[role].displayName}导航` }),
    ).toBeInTheDocument();
  });

  it('未勾选记住登录状态时使用当前标签页会话，不写入跨窗口本地会话', async () => {
    const user = userEvent.setup();
    renderRoute('/login');

    await user.type(screen.getByLabelText('账号'), 'owner');
    await user.type(screen.getByLabelText('密码'), 'password');
    await user.click(screen.getByRole('button', { name: '登录平台' }));

    expect(await screen.findByRole('navigation', { name: 'Owner 端导航' })).toBeInTheDocument();
    expect(window.localStorage.getItem('labelhub.session.v1')).toBeNull();
    expect(JSON.parse(window.sessionStorage.getItem('labelhub.session.v1') ?? '{}')).toMatchObject({
      user: { role: 'OWNER' },
    });
  });

  it('勾选记住登录状态时使用跨窗口本地会话', async () => {
    const user = userEvent.setup();
    renderRoute('/login');

    await user.type(screen.getByLabelText('账号'), 'labeler');
    await user.type(screen.getByLabelText('密码'), 'password');
    await user.click(screen.getByRole('checkbox', { name: '记住登录状态' }));
    await user.click(screen.getByRole('button', { name: '登录平台' }));

    expect(await screen.findByRole('navigation', { name: 'Labeler 端导航' })).toBeInTheDocument();
    expect(window.sessionStorage.getItem('labelhub.session.v1')).toBeNull();
    expect(JSON.parse(window.localStorage.getItem('labelhub.session.v1') ?? '{}')).toMatchObject({
      user: { role: 'LABELER' },
    });
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

  it('当前标签页会话优先于跨窗口本地会话，支持同一浏览器多角色并行调试', async () => {
    vi.resetModules();
    window.localStorage.setItem(
      'labelhub.session.v1',
      JSON.stringify({
        token: 'mock-token-owner',
        user: {
          id: 'demo-owner',
          name: '张满',
          role: 'OWNER',
        },
      }),
    );
    window.sessionStorage.setItem(
      'labelhub.session.v1',
      JSON.stringify({
        token: 'mock-token-reviewer',
        user: {
          id: 'demo-reviewer',
          name: 'Reviewer 演示账号',
          role: 'REVIEWER',
        },
      }),
    );

    const { sessionStore: freshSessionStore } = await import('../stores/sessionStore');

    expect(freshSessionStore.getSnapshot()?.user.role).toBe('REVIEWER');
    expect(window.localStorage.getItem('labelhub.session.v1')).not.toBeNull();
    expect(window.sessionStorage.getItem('labelhub.session.v1')).not.toBeNull();
  });
});

const jsonResponse = (body: unknown): Response =>
  ({
    ok: true,
    json: async () => body,
  }) as Response;
