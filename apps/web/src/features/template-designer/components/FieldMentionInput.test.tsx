import { useState } from 'react';

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FieldMentionInput } from './FieldMentionInput';

const FIELD_OPTIONS = [
  { value: 'preferred', label: '偏好选择', description: 'preferred' },
  { value: 'margin', label: '优劣程度', description: 'margin' },
  { value: 'answer', label: '答案说明', description: 'answer' },
] as const;

describe('FieldMentionInput', () => {
  it('输入 # 后展示候选字段，并按字段标题和 fieldKey 过滤', () => {
    render(
      <FieldMentionInput
        ariaLabel="规则 1 条件字段"
        options={FIELD_OPTIONS}
        value=""
        onChange={vi.fn()}
      />,
    );

    const input = screen.getByRole('combobox', { name: '规则 1 条件字段' });
    expect(input).toHaveAttribute('placeholder', '输入 # 搜索字段');

    fireEvent.change(input, { target: { value: '#pref' } });
    const listbox = screen.getByRole('listbox', { name: '规则 1 条件字段选项' });

    expect(within(listbox).getByRole('option', { name: '偏好选择 · preferred' })).toBeInTheDocument();
    expect(within(listbox).queryByRole('option', { name: '优劣程度 · margin' })).not.toBeInTheDocument();
  });

  it('支持键盘选择字段并渲染高亮 token', () => {
    const Wrapper = () => {
      const [value, setValue] = useState<string | null>('');

      return (
        <FieldMentionInput
          ariaLabel="规则 1 条件字段"
          options={FIELD_OPTIONS}
          value={value}
          onChange={setValue}
        />
      );
    };

    render(<Wrapper />);

    const input = screen.getByRole('combobox', { name: '规则 1 条件字段' });
    fireEvent.change(input, { target: { value: '#优劣' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    const token = screen.getByRole('button', { name: '规则 1 条件字段' });
    expect(token).toHaveTextContent('优劣程度');
    expect(screen.queryByRole('combobox', { name: '规则 1 条件字段' })).not.toBeInTheDocument();
  });

  it('Backspace 可以整体删除 token，并恢复占位输入', () => {
    const Wrapper = () => {
      const [value, setValue] = useState<string | null>('preferred');

      return (
        <FieldMentionInput
          ariaLabel="规则 1 条件字段"
          options={FIELD_OPTIONS}
          value={value}
          onChange={setValue}
        />
      );
    };

    render(<Wrapper />);

    const token = screen.getByRole('button', { name: '规则 1 条件字段' });
    fireEvent.keyDown(token, { key: 'Backspace' });

    const input = screen.getByRole('combobox', { name: '规则 1 条件字段' });
    expect(input).toHaveValue('');
    expect(input).toHaveAttribute('placeholder', '输入 # 搜索字段');
  });

  it('点击 token 后进入空输入态，只有手动输入 # 才展示字段候选面板', () => {
    render(
      <FieldMentionInput
        ariaLabel="规则 1 条件字段"
        options={FIELD_OPTIONS}
        value="preferred"
        onChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '规则 1 条件字段' }));

    const input = screen.getByRole('combobox', { name: '规则 1 条件字段' });
    expect(input).toHaveValue('');
    expect(screen.queryByRole('listbox', { name: '规则 1 条件字段选项' })).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: '#' } });
    expect(screen.getByRole('listbox', { name: '规则 1 条件字段选项' })).toBeInTheDocument();
  });

  it('中文输入法组合输入过程中不会误触发 Enter 选中', () => {
    const onChange = vi.fn();

    render(
      <FieldMentionInput
        ariaLabel="规则 1 条件字段"
        options={FIELD_OPTIONS}
        value=""
        onChange={onChange}
      />,
    );

    const input = screen.getByRole('combobox', { name: '规则 1 条件字段' });
    fireEvent.change(input, { target: { value: '#偏好' } });
    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('preferred');
  });
});
