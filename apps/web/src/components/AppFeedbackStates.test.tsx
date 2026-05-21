import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AppErrorBoundary } from './AppErrorBoundary';
import { EmptyState } from './EmptyState';
import { PageLoading } from './PageLoading';

const BrokenChild = () => {
  throw new Error('渲染失败');
};

describe('通用页面反馈组件', () => {
  it('PageLoading 提供稳定的加载状态语义', () => {
    render(<PageLoading title="正在加载任务" description="请稍候，正在同步最新数据。" />);

    expect(screen.getByRole('status')).toHaveTextContent('正在加载任务');
    expect(screen.getByText('请稍候，正在同步最新数据。')).toBeInTheDocument();
  });

  it('EmptyState 支持操作按钮区域', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    render(
      <EmptyState
        title="暂无任务"
        description="调整筛选条件后再试。"
        action={
          <button type="button" onClick={handleClick}>
            清空筛选
          </button>
        }
      />,
    );

    expect(screen.getByRole('heading', { name: '暂无任务' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '清空筛选' }));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('AppErrorBoundary 捕获页面异常并支持重试', async () => {
    const user = userEvent.setup();
    const reload = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <AppErrorBoundary onReset={reload}>
        <BrokenChild />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('页面加载异常');
    await user.click(screen.getByRole('button', { name: '重新加载' }));
    expect(reload).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });
});
