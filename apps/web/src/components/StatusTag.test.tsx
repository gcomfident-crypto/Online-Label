import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DemoDataBanner } from './DemoDataBanner';
import { StatusTag } from './StatusTag';

describe('StatusTag', () => {
  it('按任务状态显示 shared 中文标签', () => {
    render(<StatusTag group="task" status="PUBLISHED" />);

    const tag = screen.getByText('进行中');
    expect(tag).toHaveAttribute('data-status', 'PUBLISHED');
    expect(tag).toHaveAttribute('data-tone', 'info');
  });

  it('按提交状态显示 shared 中文标签', () => {
    render(<StatusTag group="submission" status="FINAL_APPROVED" />);

    const tag = screen.getByText('已完成');
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
    expect(screen.getByText('已打回')).toHaveAttribute('data-tone', 'danger');
  });

  it('任务状态使用浅底色胶囊、圆点和指定配色', () => {
    render(
      <>
        <StatusTag group="task" status="DRAFT" />
        <StatusTag group="task" status="PUBLISHED" />
        <StatusTag group="task" status="PAUSED" />
        <StatusTag group="task" status="ENDED" />
      </>,
    );

    const expectedStyles = [
      ['草稿', '#64748B', '#64748B', '#F3F4F6'],
      ['进行中', '#D97706', '#D97706', '#FFF7E6'],
      ['已暂停', '#DC2626', '#DC2626', '#FEF2F2'],
      ['已完成', '#0FB86B', '#0FB86B', '#E8F7EF'],
    ] as const;

    for (const [label, dotColor, textColor, backgroundColor] of expectedStyles) {
      const tag = screen.getByText(label).closest('.status-tag') as HTMLElement | null;

      expect(tag).toHaveClass('status-tag--task');
      expect(tag?.querySelector('.status-tag__dot')).not.toBeNull();
      expect(tag?.style.getPropertyValue('--status-dot-color')).toBe(dotColor);
      expect(tag?.style.getPropertyValue('--status-text-color')).toBe(textColor);
      expect(tag?.style.getPropertyValue('--status-bg-color')).toBe(backgroundColor);
    }
  });

  it('为 AI 审核重试状态提供 warning tone', () => {
    render(<StatusTag group="aiReview" status="FAILED_RETRYING" />);

    expect(screen.getByText('AI 预审失败重试中')).toHaveAttribute('data-tone', 'warning');
  });

  it('为导出失败状态提供 danger tone', () => {
    render(<StatusTag group="export" status="FAILED" />);

    expect(screen.getByText('导出失败')).toHaveAttribute('data-tone', 'danger');
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
