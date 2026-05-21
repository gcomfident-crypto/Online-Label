import { fireEvent, render, screen } from '@testing-library/react';
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

  it('父组件尚未 rerender 时连续更新两个字段不会丢失前一次值', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <SchemaRenderer
        schema={baseSchema([
          { key: 'summary', type: 'text', label: '摘要' },
          { key: 'title', type: 'text', label: '标题' },
        ])}
        rawData={{}}
        value={{}}
        mode="answer"
        onChange={onChange}
      />,
    );

    await user.type(screen.getByLabelText('摘要'), '甲');
    await user.type(screen.getByLabelText('标题'), '乙');

    expect(onChange).toHaveBeenLastCalledWith({ summary: '甲', title: '乙' });
  });

  it('同一 checkbox 字段连续点击两个选项不会丢失前一个选项', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <SchemaRenderer
        schema={baseSchema([
          {
            key: 'tags',
            type: 'checkbox',
            label: '标签',
            options: [
              { label: '清晰', value: 'clear' },
              { label: '完整', value: 'complete' },
            ],
          },
        ])}
        rawData={{}}
        value={{}}
        mode="answer"
        onChange={onChange}
      />,
    );

    await user.click(screen.getByLabelText('清晰'));
    await user.click(screen.getByLabelText('完整'));

    expect(onChange).toHaveBeenLastCalledWith({ tags: ['clear', 'complete'] });
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

  it('rich_text 输入后写入字符串', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const schema = baseSchema([{ key: 'content', type: 'rich_text', label: '正文' }]);

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

    expect(screen.getByText('富文本')).toBeInTheDocument();

    await user.type(screen.getByLabelText('正文'), '<p>你好</p>');

    expect(onChange).toHaveBeenLastCalledWith({ content: '<p>你好</p>' });
  });

  it('file_upload 选择文件后写入结构化对象', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const file = new File(['hello'], 'report.txt', { type: 'text/plain' });

    render(
      <SchemaRenderer
        schema={baseSchema([{ key: 'attachment', type: 'file_upload', label: '附件' }])}
        rawData={{}}
        value={{}}
        mode="answer"
        onChange={onChange}
      />,
    );

    await user.upload(screen.getByLabelText('附件'), file);

    expect(onChange).toHaveBeenLastCalledWith({
      attachment: {
        name: 'report.txt',
        url: 'mock://local/report.txt',
        mimeType: 'text/plain',
        size: 5,
      },
    });
  });

  it('image_upload 限制图片选择并在选择后写入结构化对象', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const file = new File(['image'], 'photo.png', { type: 'image/png' });

    render(
      <SchemaRenderer
        schema={baseSchema([{ key: 'photo', type: 'image_upload', label: '图片' }])}
        rawData={{}}
        value={{}}
        mode="answer"
        onChange={onChange}
      />,
    );

    const input = screen.getByLabelText('图片');

    expect(input).toHaveAttribute('accept', 'image/*');

    await user.upload(input, file);

    expect(onChange).toHaveBeenLastCalledWith({
      photo: {
        name: 'photo.png',
        url: 'mock://local/photo.png',
        mimeType: 'image/png',
        size: 5,
      },
    });
  });

  it('image_upload 拒绝非图片文件且不写入 answers', () => {
    const onChange = vi.fn();
    const file = new File(['hello'], 'report.txt', { type: 'text/plain' });

    render(
      <SchemaRenderer
        schema={baseSchema([{ key: 'photo', type: 'image_upload', label: '图片' }])}
        rawData={{}}
        value={{}}
        mode="answer"
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('图片'), { target: { files: [file] } });

    expect(screen.getByRole('alert')).toHaveTextContent('只能上传图片文件。');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('review 模式展示已保存的文件和图片元数据', () => {
    render(
      <SchemaRenderer
        schema={baseSchema([
          { key: 'attachment', type: 'file_upload', label: '附件' },
          { key: 'photo', type: 'image_upload', label: '图片' },
        ])}
        rawData={{}}
        value={{
          attachment: {
            name: 'report.txt',
            url: 'mock://local/report.txt',
            mimeType: 'text/plain',
            size: 2048,
          },
          photo: {
            name: 'photo.png',
            url: 'mock://local/photo.png',
            mimeType: 'image/png',
            size: 512,
          },
        }}
        mode="review"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('report.txt')).toBeInTheDocument();
    expect(screen.getByText('text/plain · 2.0 KB')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'mock://local/report.txt' })).toBeInTheDocument();
    expect(screen.getByText('photo.png')).toBeInTheDocument();
    expect(screen.getByText('image/png · 512 B')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'mock://local/photo.png' })).toBeInTheDocument();
  });

  it('json_editor 输入合法 JSON 后写入解析对象', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const schema = baseSchema([{ key: 'payload', type: 'json_editor', label: 'JSON' }]);

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

    const input = screen.getByLabelText('JSON');

    await user.click(input);
    await user.paste('{"ok":true}');

    expect(onChange).toHaveBeenLastCalledWith({ payload: { ok: true } });
  });

  it('json_editor 输入非法 JSON 时保留草稿且不覆盖 answers', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <SchemaRenderer
        schema={baseSchema([{ key: 'payload', type: 'json_editor', label: 'JSON' }])}
        rawData={{}}
        value={{ payload: { ok: true } }}
        mode="answer"
        onChange={onChange}
      />,
    );

    await user.type(screen.getByLabelText('JSON'), 'x');

    expect(screen.getByRole('alert')).toHaveTextContent('JSON 格式不合法。');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('同页多个 Renderer 的 radio name 按实例隔离', () => {
    const schema = baseSchema([
      {
        key: 'quality',
        type: 'radio',
        label: '质量',
        options: [
          { label: '好', value: 'good' },
          { label: '差', value: 'bad' },
        ],
      },
    ]);

    render(
      <>
        <SchemaRenderer
          schema={schema}
          rawData={{}}
          value={{ quality: 'good' }}
          mode="answer"
          onChange={vi.fn()}
        />
        <SchemaRenderer
          schema={schema}
          rawData={{}}
          value={{ quality: 'bad' }}
          mode="answer"
          onChange={vi.fn()}
        />
      </>,
    );

    const goodOptions = screen.getAllByLabelText('好');

    expect(goodOptions[0]).not.toHaveAttribute('name', goodOptions[1].getAttribute('name'));
  });

  it('review 模式禁用新增的可编辑字段', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <SchemaRenderer
        schema={baseSchema([
          { key: 'content', type: 'rich_text', label: '正文' },
          { key: 'attachment', type: 'file_upload', label: '附件' },
          { key: 'photo', type: 'image_upload', label: '图片' },
          { key: 'payload', type: 'json_editor', label: 'JSON' },
        ])}
        rawData={{}}
        value={{ content: '', attachment: null, photo: null, payload: {} }}
        mode="review"
        onChange={onChange}
      />,
    );

    const richText = screen.getByLabelText('正文');
    const fileUpload = screen.getByLabelText('附件');
    const imageUpload = screen.getByLabelText('图片');
    const jsonEditor = screen.getByLabelText('JSON');

    expect(richText).toBeDisabled();
    expect(fileUpload).toBeDisabled();
    expect(imageUpload).toBeDisabled();
    expect(jsonEditor).toBeDisabled();

    await user.type(richText, '<p>不能输入</p>');
    await user.upload(fileUpload, new File(['hello'], 'report.txt', { type: 'text/plain' }));
    await user.upload(imageUpload, new File(['image'], 'photo.png', { type: 'image/png' }));
    await user.type(jsonEditor, '{"ok":true}');

    expect(onChange).not.toHaveBeenCalled();
  });
});
