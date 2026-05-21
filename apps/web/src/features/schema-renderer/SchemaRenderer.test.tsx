import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { LabelHubSchema } from '@labelhub/shared';

import { SchemaRenderer } from './SchemaRenderer';

const baseSchema = (fields: LabelHubSchema['fields']): LabelHubSchema => ({
  schemaVersion: '1.0.0',
  datasetKind: 'generic_json',
  fields,
});

describe('SchemaRenderer', () => {
  it('渲染 show_item 时展示 rawData 内容和展示项 ShowItem 标识', () => {
    render(
      <SchemaRenderer
        schema={baseSchema([
          { key: 'prompt', type: 'show_item', label: '题目' },
        ])}
        rawData={{ prompt: '请总结这段内容' }}
        value={{}}
        mode="answer"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('展示项 ShowItem')).toBeInTheDocument();
    expect(screen.getByText('题目')).toBeInTheDocument();
    expect(screen.getByText('请总结这段内容')).toBeInTheDocument();
  });

  it('文本字段输入后用 field.key 写入 answers', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const schema = baseSchema([{ key: 'summary', type: 'text', label: '摘要' }]);

    const ControlledRenderer = () => {
      const [answers, setAnswers] = useState<Record<string, unknown>>({});

      return (
        <SchemaRenderer
          schema={schema}
          rawData={{}}
          value={answers}
          mode="answer"
          onChange={(next) => {
            setAnswers(next);
            onChange(next);
          }}
        />
      );
    };

    render(<ControlledRenderer />);

    await user.type(screen.getByLabelText('摘要'), '新的摘要');

    expect(onChange).toHaveBeenLastCalledWith({ summary: '新的摘要' });
  });

  it('review 模式禁用可提交字段且不允许编辑', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <SchemaRenderer
        schema={baseSchema([
          { key: 'summary', type: 'text', label: '摘要' },
          { key: 'comment', type: 'textarea', label: '备注' },
          {
            key: 'quality',
            type: 'radio',
            label: '质量',
            options: [{ label: '好', value: 'good' }],
          },
          {
            key: 'tags',
            type: 'checkbox',
            label: '标签',
            options: [{ label: '清晰', value: 'clear' }],
          },
        ])}
        rawData={{}}
        value={{ summary: '旧摘要', comment: '旧备注', quality: '', tags: [] }}
        mode="review"
        onChange={onChange}
      />,
    );

    const input = screen.getByLabelText('摘要');
    const textarea = screen.getByLabelText('备注');
    const radio = screen.getByLabelText('好');
    const checkbox = screen.getByLabelText('清晰');

    expect(input).toBeDisabled();
    expect(textarea).toBeDisabled();
    expect(radio).toBeDisabled();
    expect(checkbox).toBeDisabled();

    await user.type(input, '不能输入');
    await user.type(textarea, '不能输入');
    await user.click(radio);
    await user.click(checkbox);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('group 和 tabs 能递归渲染内部字段', () => {
    render(
      <SchemaRenderer
        schema={baseSchema([
          {
            key: 'basic',
            type: 'group',
            label: '基础信息',
            fields: [{ key: 'summary', type: 'text', label: '摘要' }],
          },
          {
            key: 'reviewTabs',
            type: 'tabs',
            label: '审核分组',
            tabs: [
              {
                key: 'first',
                label: '第一组',
                fields: [{ key: 'note', type: 'textarea', label: '说明' }],
              },
            ],
          },
        ])}
        rawData={{}}
        value={{}}
        mode="answer"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('基础信息')).toBeInTheDocument();
    expect(screen.getByLabelText('摘要')).toBeInTheDocument();
    expect(screen.getByText('审核分组')).toBeInTheDocument();
    expect(screen.getByText('第一组')).toBeInTheDocument();
    expect(screen.getByLabelText('说明')).toBeInTheDocument();
  });

  it('未实现字段类型显示中文后续接入占位且不崩溃', () => {
    render(
      <SchemaRenderer
        schema={baseSchema([
          { key: 'assist', type: 'llm_assist', label: 'AI 辅助' },
        ])}
        rawData={{}}
        value={{}}
        mode="answer"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('AI 辅助')).toBeInTheDocument();
    expect(screen.getByText('llm_assist 物料将在后续接入')).toBeInTheDocument();
  });
});
