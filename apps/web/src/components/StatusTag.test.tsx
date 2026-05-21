import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DemoDataBanner } from './DemoDataBanner';
import { StatusTag } from './StatusTag';

describe('StatusTag', () => {
  it('按任务状态显示 shared 中文标签', () => {
    render(<StatusTag group="task" status="PUBLISHED" />);

    const tag = screen.getByText('发布中');
    expect(tag).toHaveAttribute('data-status', 'PUBLISHED');
    expect(tag).toHaveAttribute('data-tone', 'info');
  });

  it('按提交状态显示 shared 中文标签', () => {
    render(<StatusTag group="submission" status="FINAL_APPROVED" />);

    const tag = screen.getByText('终审通过');
    expect(tag).toHaveAttribute('data-status', 'FINAL_APPROVED');
    expect(tag).toHaveAttribute('data-tone', 'approved');
  });

  it('为暂停和打回状态提供稳定 tone', () => {
    render(
      <>
        <StatusTag group="task" status="PAUSED" />
        <StatusTag group="finalReview" status="FINAL_REJECTED" />
      </>,
    );

    expect(screen.getByText('已暂停')).toHaveAttribute('data-tone', 'warning');
    expect(screen.getByText('终审打回')).toHaveAttribute('data-tone', 'danger');
  });
});

describe('DemoDataBanner', () => {
  it('visible=true 时显示 seed 演示数据提示', () => {
    render(<DemoDataBanner visible />);

    expect(screen.getByText('当前使用 seed 演示数据')).toBeInTheDocument();
  });

  it('visible=false 时不渲染', () => {
    const { container } = render(<DemoDataBanner visible={false} />);

    expect(container).toBeEmptyDOMElement();
  });
});
