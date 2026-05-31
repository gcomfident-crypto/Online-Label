import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ToastViewport } from './ToastViewport';

describe('ToastViewport', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('在页面中央浮层中渲染提示并支持带动画手动关闭', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();

    render(
      <ToastViewport
        messages={[{ id: 'task-not-found', type: 'warning', text: '任务不存在或已被删除。' }]}
        onDismiss={onDismiss}
      />,
    );

    const toast = screen.getByRole('alert');
    expect(toast).toHaveClass('toast', 'toast--warning');
    expect(toast.closest('.toast-stack')).not.toBeNull();
    expect(toast).toHaveTextContent('任务不存在或已被删除');

    fireEvent.click(screen.getByRole('button', { name: '关闭提示' }));

    expect(toast).toHaveClass('is-exiting');
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(220);
    });
    expect(onDismiss).toHaveBeenCalledWith('task-not-found');
  });

  it('支持页面顶部横条通知样式', () => {
    const onDismiss = vi.fn();

    render(
      <ToastViewport
        variant="banner"
        messages={[{ id: 'template-deleted', type: 'success', text: '模板已删除。' }]}
        onDismiss={onDismiss}
      />,
    );

    const toast = screen.getByRole('status');
    expect(toast.closest('.toast-stack')).toHaveClass('toast-stack--banner');
    expect(toast).toHaveClass('toast--delete-success');
    expect(toast).toHaveTextContent('模板已删除');
  });

  it('默认 3 秒自动消失，鼠标悬停时暂停计时，消失前播放退出动画', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();

    render(
      <ToastViewport
        messages={[{ id: 'saved', type: 'success', text: '任务已发布。' }]}
        onDismiss={onDismiss}
      />,
    );

    const toast = screen.getByRole('status');
    fireEvent.mouseEnter(toast);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.mouseLeave(toast);
    act(() => {
      vi.advanceTimersByTime(2779);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(toast).toHaveClass('is-exiting');
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(219);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledWith('saved');
  });

  it('支持不可手动关闭且不会自动消失的加载态提示', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();

    render(
      <ToastViewport
        messages={[
          {
            autoDismiss: false,
            id: 'template-analyzing',
            isDismissible: false,
            isLoading: true,
            text: '正在分析输入文件并创建模板',
            type: 'info',
          },
        ]}
        onDismiss={onDismiss}
      />,
    );

    const toast = screen.getByRole('status');
    expect(toast).toHaveTextContent('正在分析输入文件并创建模板');
    expect(toast.querySelector('.toast__spinner')).not.toBeNull();
    expect(screen.queryByRole('button', { name: '关闭提示' })).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(onDismiss).not.toHaveBeenCalled();
  });
});
