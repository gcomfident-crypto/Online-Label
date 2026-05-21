import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LabelHubSchema } from '@labelhub/shared';

import { SchemaRenderer } from './SchemaRenderer';
import {
  preferenceCompareRawData,
  preferenceCompareSchema,
  qaQualityRawDataSamples,
  qaQualitySchema,
  titleCleanupRawData,
  titleCleanupSchema,
} from './examples';
import { applySchemaLinkage } from './linkage';
import { validateSchemaAnswers } from './validation';

const baseSchema = (fields: LabelHubSchema['fields']): LabelHubSchema => ({
  schemaVersion: '1.0.0',
  datasetKind: 'generic_json',
  fields,
});

describe('SchemaRenderer', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('渲染 show_item 时展示 rawData 内容和展示项 ShowItem 标识', () => {
    render(
      <SchemaRenderer
        schema={baseSchema([
          { key: 'material', type: 'show_item', label: '题目', sourceKey: 'prompt' },
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

  it('show_item 单字段为空时保留暂无内容占位', () => {
    render(
      <SchemaRenderer
        schema={baseSchema([
          { key: 'material', type: 'show_item', label: '题目', sourceKey: 'prompt' },
        ])}
        rawData={{}}
        value={{}}
        mode="answer"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('暂无内容')).toBeInTheDocument();
  });

  it('qa_quality 官方示例展示 prompt、model_answer 和 reference', () => {
    render(
      <SchemaRenderer
        schema={qaQualitySchema}
        rawData={qaQualityRawDataSamples[0]}
        value={{}}
        mode="answer"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('展示项 ShowItem')).toBeInTheDocument();
    expect(screen.getByText('用户问题')).toBeInTheDocument();
    expect(screen.getByText('请说明光合作用的主要过程。')).toBeInTheDocument();
    expect(screen.getByText('模型回答')).toBeInTheDocument();
    expect(screen.getByText('光合作用会吸收二氧化碳并释放氧气。')).toBeInTheDocument();
    expect(screen.getByText('参考答案')).toBeInTheDocument();
    expect(screen.getByText('应包含光能转化、二氧化碳和水生成有机物、释放氧气。')).toBeInTheDocument();
  });

  it('show_item 按 media_type 渲染 text、image、video 和 markdown', () => {
    const schema = baseSchema([
      {
        key: 'material',
        type: 'show_item',
        label: '题目物料',
        sourceKeys: ['prompt', 'media_type', 'media_url', 'content_markdown'],
      },
    ]);

    const { rerender, container } = render(
      <SchemaRenderer
        schema={schema}
        rawData={{ prompt: '纯文本题目', media_type: 'text' }}
        value={{}}
        mode="answer"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('纯文本题目')).toBeInTheDocument();
    expect(screen.queryByText('媒体类型')).not.toBeInTheDocument();
    expect(screen.queryByText('text')).not.toBeInTheDocument();

    rerender(
      <SchemaRenderer
        schema={schema}
        rawData={{
          prompt: '图片题目',
          media_type: 'image',
          media_url: 'https://example.test/material.png',
        }}
        value={{}}
        mode="answer"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('img', { name: '题目媒体' })).toHaveAttribute(
      'src',
      'https://example.test/material.png',
    );

    rerender(
      <SchemaRenderer
        schema={schema}
        rawData={{
          prompt: '视频题目',
          media_type: 'video',
          media_url: 'https://example.test/material.mp4',
        }}
        value={{}}
        mode="answer"
        onChange={vi.fn()}
      />,
    );

    const video = container.querySelector('video');
    expect(video).toBeInTheDocument();
    expect(video).toHaveAttribute('controls');
    expect(video).toHaveAttribute('src', 'https://example.test/material.mp4');

    rerender(
      <SchemaRenderer
        schema={schema}
        rawData={{
          prompt: 'Markdown 题目',
          media_type: 'markdown',
          content_markdown: '# 标题\n\n- 要点一\n- 要点二',
        }}
        value={{}}
        mode="answer"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('标题')).toBeInTheDocument();
    expect(screen.getByText('要点一')).toBeInTheDocument();
    expect(screen.getByText('要点二')).toBeInTheDocument();
  });

  it('show_item 仅在当前字段配置媒体 sourceKeys 时渲染媒体', () => {
    render(
      <SchemaRenderer
        schema={baseSchema([
          { key: 'prompt_only', type: 'show_item', label: '纯题目', sourceKey: 'prompt' },
        ])}
        rawData={{
          prompt: '这张图片不属于当前展示项',
          media_type: 'image',
          media_url: 'https://example.test/leaked.png',
        }}
        value={{}}
        mode="answer"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('这张图片不属于当前展示项')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: '题目媒体' })).not.toBeInTheDocument();
  });

  it('show_item 在媒体无法消费时回退显示原始媒体链接', () => {
    render(
      <SchemaRenderer
        schema={baseSchema([
          {
            key: 'material',
            type: 'show_item',
            label: '题目物料',
            sourceKeys: ['prompt', 'media_type', 'media_url'],
          },
        ])}
        rawData={{
          prompt: '未知媒体类型',
          media_type: 'audio',
          media_url: 'https://example.test/audio.mp3',
        }}
        value={{}}
        mode="answer"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('未知媒体类型')).toBeInTheDocument();
    expect(screen.queryByText('媒体类型')).not.toBeInTheDocument();
    expect(screen.getByText('媒体链接')).toBeInTheDocument();
    expect(screen.getByText('https://example.test/audio.mp3')).toBeInTheDocument();
  });

  it('show_item 不消费不安全的图片和视频媒体链接', () => {
    const schema = baseSchema([
      {
        key: 'material',
        type: 'show_item',
        label: '题目物料',
        sourceKeys: ['prompt', 'media_type', 'media_url'],
      },
    ]);

    const { container, rerender } = render(
      <SchemaRenderer
        schema={schema}
        rawData={{
          prompt: '危险图片',
          media_type: 'image',
          media_url: 'javascript:alert(1)',
        }}
        value={{}}
        mode="answer"
        onChange={vi.fn()}
      />,
    );

    expect(screen.queryByRole('img', { name: '题目媒体' })).not.toBeInTheDocument();
    expect(screen.getByText('媒体链接')).toBeInTheDocument();
    expect(screen.getByText('javascript:alert(1)')).toBeInTheDocument();

    rerender(
      <SchemaRenderer
        schema={schema}
        rawData={{
          prompt: '危险视频',
          media_type: 'video',
          media_url: 'data:text/html,%3Cscript%3Ealert(1)%3C/script%3E',
        }}
        value={{}}
        mode="answer"
        onChange={vi.fn()}
      />,
    );

    expect(container.querySelector('video')).not.toBeInTheDocument();
    expect(screen.getByText('媒体链接')).toBeInTheDocument();
    expect(
      screen.getByText('data:text/html,%3Cscript%3Ealert(1)%3C/script%3E'),
    ).toBeInTheDocument();
  });

  it('show_item markdown 渲染图片、链接并保持文本安全', () => {
    render(
      <SchemaRenderer
        schema={baseSchema([
          {
            key: 'material',
            type: 'show_item',
            label: 'Markdown 物料',
            sourceKeys: ['media_type', 'content_markdown'],
          },
        ])}
        rawData={{
          media_type: 'markdown',
          content_markdown:
            '![流程图](data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E)\n\n[查看规则](https://example.com/rules)\n\n<script>alert(1)</script>',
        }}
        value={{}}
        mode="answer"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('img', { name: '流程图' })).toHaveAttribute(
      'src',
      expect.stringContaining('data:image/svg+xml'),
    );
    expect(screen.getByRole('link', { name: '查看规则' })).toHaveAttribute(
      'href',
      'https://example.com/rules',
    );
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
  });

  it('show_item markdown 不渲染不安全资源链接', () => {
    render(
      <SchemaRenderer
        schema={baseSchema([
          {
            key: 'material',
            type: 'show_item',
            label: 'Markdown 物料',
            sourceKeys: ['media_type', 'content_markdown'],
          },
        ])}
        rawData={{
          media_type: 'markdown',
          content_markdown:
            '[危险链接](javascript:alert%281%29)\n\n![危险图片](data:text/html,%3Csvg%3E%3C%2Fsvg%3E)',
        }}
        value={{}}
        mode="answer"
        onChange={vi.fn()}
      />,
    );

    expect(screen.queryByRole('link', { name: '危险链接' })).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: '危险图片' })).not.toBeInTheDocument();
    expect(screen.getByText('[危险链接](javascript:alert%281%29)')).toBeInTheDocument();
    expect(
      screen.getByText('![危险图片](data:text/html,%3Csvg%3E%3C%2Fsvg%3E)'),
    ).toBeInTheDocument();
  });

  it('官方媒体示例使用稳定可加载资源地址', () => {
    const imageSample = qaQualityRawDataSamples.find((sample) => sample.media_type === 'image');
    const videoSample = qaQualityRawDataSamples.find((sample) => sample.media_type === 'video');

    expect(imageSample?.media_url).toMatch(/^data:image\/svg\+xml/);
    expect(videoSample?.media_url).toBe(
      'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    );
  });

  it('preference_compare 官方示例并排展示 response_a 与 response_b 并显示 prompt', () => {
    render(
      <SchemaRenderer
        schema={preferenceCompareSchema}
        rawData={preferenceCompareRawData}
        value={{}}
        mode="answer"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('请比较两个回答哪一个更适合作为客服回复。')).toBeInTheDocument();
    expect(screen.getByTestId('preference-compare-panel-a')).toHaveTextContent(
      '回答 A 已准确回应用户问题，但缺少后续操作建议。',
    );
    expect(screen.getByTestId('preference-compare-panel-b')).toHaveTextContent(
      '回答 B 先说明结论，再补充操作路径和注意事项。',
    );
  });

  it('preference_compare 展示项复用媒体控制字段消费逻辑', () => {
    render(
      <SchemaRenderer
        schema={baseSchema([
          {
            key: 'material',
            type: 'show_item',
            label: '偏好对比物料',
            sourceKeys: ['prompt', 'media_type', 'media_url', 'response_a', 'response_b'],
          },
        ])}
        rawData={{
          prompt: '请结合图片比较两个回答。',
          media_type: 'image',
          media_url: 'https://example.test/compare.png',
          response_a: '回答 A',
          response_b: '回答 B',
        }}
        value={{}}
        mode="answer"
        onChange={vi.fn()}
      />,
    );

    expect(screen.queryByText('媒体类型')).not.toBeInTheDocument();
    expect(screen.queryByText('媒体链接')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: '题目媒体' })).toHaveAttribute(
      'src',
      'https://example.test/compare.png',
    );
    expect(screen.getByTestId('preference-compare-panel-a')).toHaveTextContent('回答 A');
    expect(screen.getByTestId('preference-compare-panel-b')).toHaveTextContent('回答 B');
  });

  it('官方示例 schema 使用 fieldKey 写入 answers', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    const ControlledRenderer = () => {
      const [answers, setAnswers] = useState<Record<string, unknown>>({});

      return (
        <SchemaRenderer
          schema={qaQualitySchema}
          rawData={qaQualityRawDataSamples[0]}
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

    await user.type(screen.getByLabelText('一句话总评'), '回答基本可用');

    expect(onChange).toHaveBeenLastCalledWith({ summary: '回答基本可用' });
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

  it('group 递归渲染内部字段，tabs 仅渲染当前激活分组', async () => {
    const user = userEvent.setup();

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
              {
                key: 'second',
                label: '第二组',
                fields: [{ key: 'decision', type: 'textarea', label: '结论' }],
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
    expect(screen.getByRole('tab', { name: '第一组' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: '第二组' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
    expect(screen.getByLabelText('说明')).toBeInTheDocument();
    expect(screen.queryByLabelText('结论')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: '第二组' }));

    expect(screen.getByRole('tab', { name: '第一组' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
    expect(screen.getByRole('tab', { name: '第二组' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.queryByLabelText('说明')).not.toBeInTheDocument();
    expect(screen.getByLabelText('结论')).toBeInTheDocument();
  });

  it('LLM 触发组件可生成并采纳 mock 建议到目标字段', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          datasetKind: 'qa_quality',
          targetFieldKey: 'structured_note',
          summary: '建议补充关键依据，并复核准确性与完整性评分。',
          suggestion: {
            comment: '模型回答覆盖核心方向，但建议补充关键限定。',
            issue_tags: ['missing_info'],
          },
        },
      }),
    });
    const schema: LabelHubSchema = {
      ...baseSchema([
        {
          key: 'structured_note_field',
          fieldKey: 'structured_note',
          type: 'json_editor',
          label: '结构化记录',
        },
        {
          key: 'assist',
          type: 'llm_assist',
          label: 'AI 辅助',
          targetFieldKey: 'structured_note',
          promptTemplate: '请给出结构化建议。',
        },
      ]),
      datasetKind: 'qa_quality',
    };

    vi.stubGlobal('fetch', fetchMock);

    const ControlledRenderer = () => {
      const [answers, setAnswers] = useState<Record<string, unknown>>({});

      return (
        <SchemaRenderer
          schema={schema}
          rawData={{ prompt: '请说明光合作用的主要过程。' }}
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

    expect(screen.getByText('LLM 触发组件')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '生成建议' }));

    expect(fetchMock).toHaveBeenCalledWith(
      '/llm/assist/mock',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datasetKind: 'qa_quality',
          rawData: { prompt: '请说明光合作用的主要过程。' },
          answers: {},
          targetFieldKey: 'structured_note',
          promptTemplate: '请给出结构化建议。',
        }),
      }),
    );
    expect(
      await screen.findByText('建议补充关键依据，并复核准确性与完整性评分。'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '重新生成' }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole('button', { name: '采纳为答案' }));

    expect(onChange).toHaveBeenLastCalledWith({
      structured_note: {
        comment: '模型回答覆盖核心方向，但建议补充关键限定。',
        issue_tags: ['missing_info'],
      },
    });
    expect((screen.getByLabelText('结构化记录') as HTMLTextAreaElement).value).toContain(
      'missing_info',
    );
  });

  it('LLM 触发组件在 mock 请求失败时显示中文错误', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: {
          message: 'LLM 辅助暂时不可用，请稍后重试。',
        },
      }),
    });

    vi.stubGlobal('fetch', fetchMock);

    render(
      <SchemaRenderer
        schema={baseSchema([
          {
            key: 'assist',
            type: 'llm_assist',
            label: 'AI 辅助',
            targetFieldKey: 'structured_note',
          },
        ])}
        rawData={{}}
        value={{}}
        mode="answer"
        onChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: '生成建议' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'LLM 辅助暂时不可用，请稍后重试。',
    );
  });

  it('LLM 触发组件拒绝采纳目标字段不一致的结果', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          datasetKind: 'qa_quality',
          targetFieldKey: 'other_note',
          summary: '建议补充关键依据。',
          suggestion: { comment: '不应写入当前字段' },
        },
      }),
    });

    vi.stubGlobal('fetch', fetchMock);

    render(
      <SchemaRenderer
        schema={baseSchema([
          {
            key: 'assist',
            type: 'llm_assist',
            label: 'AI 辅助',
            targetFieldKey: 'structured_note',
          },
        ])}
        rawData={{}}
        value={{}}
        mode="answer"
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: '生成建议' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'LLM 辅助返回目标字段不一致。',
    );
    expect(screen.queryByRole('button', { name: '重新生成' })).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('商品标题清洗 v3 示例触发长度计数、类目联动、标签必填和 LLM 采纳', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          datasetKind: 'generic_json',
          targetFieldKey: 'cleaned_title',
          summary: '已生成清洗标题。',
          suggestion: '轻量降噪蓝牙耳机 Pro Max 黑色',
        },
      }),
    });

    vi.stubGlobal('fetch', fetchMock);

    const ControlledRenderer = () => {
      const [answers, setAnswers] = useState<Record<string, unknown>>({});

      return (
        <SchemaRenderer
          schema={titleCleanupSchema}
          rawData={titleCleanupRawData}
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

    expect(screen.getByText('商品标题清洗 v3')).toBeInTheDocument();
    expect(screen.getByText('0 / 35')).toBeInTheDocument();

    await user.type(screen.getByLabelText('清洗后标题'), '超长清洗标题'.repeat(8));
    expect(screen.getByText('48 / 35')).toBeInTheDocument();
    expect(screen.getByText('清洗后标题不能超过 35 个字符。')).toBeInTheDocument();

    await user.click(screen.getByLabelText('主类目：数码配件'));
    expect(screen.getByText('卖点关键词为必填项。')).toBeInTheDocument();

    await user.click(screen.getByLabelText('卖点关键词：降噪'));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        category: 'electronics',
        keywords: ['noise_reduction'],
      }),
    );

    await user.click(screen.getByRole('button', { name: '生成建议' }));
    expect(await screen.findByText('已生成清洗标题。')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '采纳为答案' }));

    expect(screen.getByLabelText('清洗后标题')).toHaveValue('轻量降噪蓝牙耳机 Pro Max 黑色');
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

  it('review 模式展示已保存的文件和图片元数据但不把本地 mock 链接渲染为可点击链接', () => {
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
    expect(screen.getByText('mock://local/report.txt')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'mock://local/report.txt' })).not.toBeInTheDocument();
    expect(screen.getByText('photo.png')).toBeInTheDocument();
    expect(screen.getByText('image/png · 512 B')).toBeInTheDocument();
    expect(screen.getByText('mock://local/photo.png')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'mock://local/photo.png' })).not.toBeInTheDocument();
  });

  it('review 模式展示安全的已保存文件链接', () => {
    render(
      <SchemaRenderer
        schema={baseSchema([{ key: 'attachment', type: 'file_upload', label: '附件' }])}
        rawData={{}}
        value={{
          attachment: {
            name: 'report.txt',
            url: 'https://example.test/report.txt',
            mimeType: 'text/plain',
            size: 2048,
          },
        }}
        mode="review"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('link', { name: 'https://example.test/report.txt' })).toHaveAttribute(
      'href',
      'https://example.test/report.txt',
    );
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

  it('json_editor 外部 value 清空时同步清空草稿并清理错误提示', async () => {
    const user = userEvent.setup();
    const schema = baseSchema([{ key: 'payload', type: 'json_editor', label: 'JSON' }]);

    const ControlledRenderer = () => {
      const [answers, setAnswers] = useState<Record<string, unknown>>({});

      return (
        <>
          <button type="button" onClick={() => setAnswers({ payload: { ok: true } })}>
            加载 JSON
          </button>
          <button type="button" onClick={() => setAnswers({})}>
            清空 JSON
          </button>
          <SchemaRenderer
            schema={schema}
            rawData={{}}
            value={answers}
            mode="answer"
            onChange={setAnswers}
          />
        </>
      );
    };

    render(<ControlledRenderer />);

    await user.click(screen.getByRole('button', { name: '加载 JSON' }));

    const input = screen.getByLabelText('JSON');

    expect(input).toHaveValue('{\n  "ok": true\n}');

    await user.type(input, 'x');

    expect(screen.getByRole('alert')).toHaveTextContent('JSON 格式不合法。');

    await user.click(screen.getByRole('button', { name: '清空 JSON' }));

    expect(input).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('json_editor 外部 value 等值重置时也会清空非法草稿', async () => {
    const user = userEvent.setup();
    const schema = baseSchema([{ key: 'payload', type: 'json_editor', label: 'JSON' }]);

    const ControlledRenderer = () => {
      const [answers, setAnswers] = useState<Record<string, unknown>>({});

      return (
        <>
          <button type="button" onClick={() => setAnswers({})}>
            切换空记录
          </button>
          <SchemaRenderer
            schema={schema}
            rawData={{}}
            value={answers}
            mode="answer"
            onChange={setAnswers}
          />
        </>
      );
    };

    render(<ControlledRenderer />);

    const input = screen.getByLabelText('JSON');

    await user.type(input, 'x');

    expect(input).toHaveValue('x');
    expect(screen.getByRole('alert')).toHaveTextContent('JSON 格式不合法。');

    await user.click(screen.getByRole('button', { name: '切换空记录' }));

    expect(input).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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

  it('必填文本为空时返回并展示中文错误', () => {
    const schema = baseSchema([
      { key: 'summary', type: 'text', label: '摘要', validation: { required: true } },
    ]);

    expect(validateSchemaAnswers(schema, {})).toEqual([
      { fieldKey: 'summary', message: '摘要为必填项。' },
    ]);

    render(
      <SchemaRenderer
        schema={schema}
        rawData={{}}
        value={{}}
        mode="answer"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('摘要为必填项。');
  });

  it('minLength、maxLength 和 pattern 校验生效', () => {
    const schema = baseSchema([
      {
        key: 'code',
        type: 'text',
        label: '编码',
        validation: { minLength: 3, maxLength: 5, pattern: '^[A-Z]+$' },
      },
    ]);

    expect(validateSchemaAnswers(schema, { code: 'ab' })).toEqual([
      { fieldKey: 'code', message: '编码不能少于 3 个字符。' },
      { fieldKey: 'code', message: '编码格式不符合要求。' },
    ]);

    expect(validateSchemaAnswers(schema, { code: 'ABCDEF' })).toEqual([
      { fieldKey: 'code', message: '编码不能超过 5 个字符。' },
    ]);
  });

  it('radio 非 options 值时报错', () => {
    const schema = baseSchema([
      {
        key: 'quality',
        type: 'radio',
        label: '质量',
        options: [{ label: '好', value: 'good' }],
      },
    ]);

    expect(validateSchemaAnswers(schema, { quality: 'bad' })).toEqual([
      { fieldKey: 'quality', message: '质量必须选择有效选项。' },
    ]);
    expect(validateSchemaAnswers(schema, { quality: 1 })).toEqual([
      { fieldKey: 'quality', message: '质量必须选择有效选项。' },
    ]);
  });

  it('文本类字段拒绝非字符串答案', () => {
    const schema = baseSchema([
      { key: 'summary', type: 'text', label: '摘要' },
      { key: 'comment', type: 'textarea', label: '备注' },
      { key: 'content', type: 'rich_text', label: '正文' },
    ]);

    expect(
      validateSchemaAnswers(schema, {
        summary: 1,
        comment: {},
        content: [],
      }),
    ).toEqual([
      { fieldKey: 'summary', message: '摘要必须是文本。' },
      { fieldKey: 'comment', message: '备注必须是文本。' },
      { fieldKey: 'content', message: '正文必须是文本。' },
    ]);
  });

  it('checkbox 和 tag_select 必须是字符串数组且值在 options 内', () => {
    const schema = baseSchema([
      {
        key: 'tags',
        type: 'checkbox',
        label: '标签',
        options: [{ label: '清晰', value: 'clear' }],
      },
      {
        key: 'keywords',
        type: 'tag_select',
        label: '关键词',
        options: [{ label: '标题', value: 'title' }],
      },
    ]);

    expect(validateSchemaAnswers(schema, { tags: 'clear', keywords: ['title', 'other'] })).toEqual([
      { fieldKey: 'tags', message: '标签必须是字符串数组。' },
      { fieldKey: 'keywords', message: '关键词包含无效选项。' },
    ]);
  });

  it('json_editor 接受合法值并拒绝非法字符串', () => {
    const schema = baseSchema([{ key: 'payload', type: 'json_editor', label: 'JSON' }]);

    expect(validateSchemaAnswers(schema, { payload: { ok: true } })).toEqual([]);
    expect(validateSchemaAnswers(schema, { payload: '{"ok":' })).toEqual([
      { fieldKey: 'payload', message: 'JSON 必须是结构化对象。' },
    ]);
    expect(validateSchemaAnswers(schema, { payload: ['ok'] })).toEqual([
      { fieldKey: 'payload', message: 'JSON 必须是结构化对象。' },
    ]);
    expect(validateSchemaAnswers(schema, { payload: 1 })).toEqual([
      { fieldKey: 'payload', message: 'JSON 必须是结构化对象。' },
    ]);
  });

  it('file_upload 和 image_upload 校验结构化文件元数据', () => {
    const schema = baseSchema([
      { key: 'attachment', type: 'file_upload', label: '附件' },
      { key: 'photo', type: 'image_upload', label: '图片' },
    ]);

    expect(
      validateSchemaAnswers(schema, {
        attachment: { name: 'a.txt', url: 'mock://local/a.txt', mimeType: 'text/plain' },
        photo: { name: 'p.txt', url: 'mock://local/p.txt', mimeType: 'text/plain', size: 1 },
      }),
    ).toEqual([
      { fieldKey: 'attachment', message: '附件需要上传有效文件。' },
      { fieldKey: 'photo', message: '图片必须上传图片文件。' },
    ]);
  });

  it('file_upload 和 image_upload 拒绝不安全文件链接', () => {
    const schema = baseSchema([
      { key: 'attachment', type: 'file_upload', label: '附件' },
      { key: 'photo', type: 'image_upload', label: '图片' },
    ]);

    expect(
      validateSchemaAnswers(schema, {
        attachment: {
          name: 'a.txt',
          url: 'javascript:alert(1)',
          mimeType: 'text/plain',
          size: 1,
        },
        photo: {
          name: 'p.png',
          url: 'data:text/html,%3Cscript%3Ealert(1)%3C/script%3E',
          mimeType: 'image/png',
          size: 1,
        },
      }),
    ).toEqual([
      { fieldKey: 'attachment', message: '附件需要上传有效文件。' },
      { fieldKey: 'photo', message: '图片需要上传有效文件。' },
    ]);
  });

  it('联动支持 show、hide、disable、require 和 setValue', () => {
    const schema = {
      ...baseSchema([
        {
          key: 'status',
          type: 'radio',
          label: '状态',
          options: [
            { label: '通过', value: 'approved' },
            { label: '拒绝', value: 'rejected' },
          ],
        },
        { key: 'detail', type: 'text', label: '详情', validation: { required: true } },
        { key: 'reason', type: 'textarea', label: '原因' },
        { key: 'score', type: 'text', label: '分数' },
      ]),
      linkageRules: [
        {
          when: { fieldKey: 'status', operator: 'equals', value: 'approved' },
          action: 'show',
          targetFieldKey: 'detail',
        },
        {
          when: { fieldKey: 'status', operator: 'equals', value: 'rejected' },
          action: 'hide',
          targetFieldKey: 'detail',
        },
        {
          when: { fieldKey: 'status', operator: 'equals', value: 'rejected' },
          action: 'disable',
          targetFieldKey: 'score',
        },
        {
          when: { fieldKey: 'status', operator: 'equals', value: 'rejected' },
          action: 'require',
          targetFieldKey: 'reason',
        },
        {
          when: { fieldKey: 'status', operator: 'equals', value: 'approved' },
          action: 'setValue',
          targetFieldKey: 'score',
          value: '5',
        },
      ],
    } satisfies LabelHubSchema & {
      linkageRules: NonNullable<LabelHubSchema['fields'][number]['linkageRules']>;
    };

    const hiddenResult = applySchemaLinkage(schema, {});

    expect(hiddenResult.hiddenFieldKeys.has('detail')).toBe(true);
    expect(validateSchemaAnswers(schema, {}, hiddenResult)).toEqual([]);

    const approvedResult = applySchemaLinkage(schema, { status: 'approved' });

    expect(approvedResult.visibleFieldKeys.has('detail')).toBe(true);
    expect(approvedResult.answers).toMatchObject({ status: 'approved', score: '5' });
    expect(approvedResult.disabledFieldKeys.has('score')).toBe(false);

    const rejectedResult = applySchemaLinkage(schema, { status: 'rejected' });

    expect(rejectedResult.hiddenFieldKeys.has('detail')).toBe(true);
    expect(rejectedResult.disabledFieldKeys.has('score')).toBe(true);
    expect(rejectedResult.requiredFieldKeys.has('reason')).toBe(true);
    expect(validateSchemaAnswers(schema, { status: 'rejected' }, rejectedResult)).toEqual([
      { fieldKey: 'reason', message: '原因为必填项。' },
    ]);
  });

  it('联动条件覆盖 notEquals、contains、notContains、exists 和 notExists', () => {
    const schema = {
      ...baseSchema([
        { key: 'status', type: 'text', label: '状态' },
        { key: 'tags', type: 'tag_select', label: '标签' },
        { key: 'note', type: 'text', label: '备注' },
        { key: 'a', type: 'text', label: 'A' },
        { key: 'b', type: 'text', label: 'B' },
        { key: 'c', type: 'text', label: 'C' },
        { key: 'd', type: 'text', label: 'D' },
        { key: 'e', type: 'text', label: 'E' },
      ]),
      linkageRules: [
        {
          when: { fieldKey: 'status', operator: 'notEquals', value: 'draft' },
          action: 'hide',
          targetFieldKey: 'a',
        },
        {
          when: { fieldKey: 'tags', operator: 'contains', value: 'risk' },
          action: 'disable',
          targetFieldKey: 'b',
        },
        {
          when: { fieldKey: 'tags', operator: 'notContains', value: 'safe' },
          action: 'require',
          targetFieldKey: 'c',
        },
        {
          when: { fieldKey: 'note', operator: 'exists' },
          action: 'setValue',
          targetFieldKey: 'd',
          value: 'has-note',
        },
        {
          when: { fieldKey: 'note', operator: 'notExists' },
          action: 'hide',
          targetFieldKey: 'e',
        },
      ],
    } satisfies LabelHubSchema;

    const result = applySchemaLinkage(schema, {
      status: 'published',
      tags: ['risk'],
      note: '已填写',
    });

    expect(result.hiddenFieldKeys.has('a')).toBe(true);
    expect(result.disabledFieldKeys.has('b')).toBe(true);
    expect(result.requiredFieldKeys.has('c')).toBe(true);
    expect(result.answers.d).toBe('has-note');
    expect(result.hiddenFieldKeys.has('e')).toBe(false);

    const emptyResult = applySchemaLinkage(schema, {});

    expect(emptyResult.hiddenFieldKeys.has('e')).toBe(true);
  });

  it('隐藏和禁用容器时会级联到子字段', () => {
    const schema = {
      ...baseSchema([
        { key: 'status', type: 'text', label: '状态' },
        {
          key: 'basic',
          type: 'group',
          label: '基础信息',
          fields: [{ key: 'summary', type: 'text', label: '摘要', validation: { required: true } }],
        },
        {
          key: 'reviewTabs',
          type: 'tabs',
          label: '审核分组',
          tabs: [
            {
              key: 'first',
              label: '第一组',
              fields: [{ key: 'note', type: 'text', label: '说明' }],
            },
          ],
        },
      ]),
      linkageRules: [
        {
          when: { fieldKey: 'status', operator: 'equals', value: 'hidden' },
          action: 'hide',
          targetFieldKey: 'basic',
        },
        {
          when: { fieldKey: 'status', operator: 'equals', value: 'hidden' },
          action: 'disable',
          targetFieldKey: 'reviewTabs',
        },
      ],
    } satisfies LabelHubSchema;

    const result = applySchemaLinkage(schema, { status: 'hidden' });

    expect(result.hiddenFieldKeys.has('basic')).toBe(true);
    expect(result.hiddenFieldKeys.has('summary')).toBe(true);
    expect(result.disabledFieldKeys.has('reviewTabs')).toBe(true);
    expect(result.disabledFieldKeys.has('note')).toBe(true);
    expect(validateSchemaAnswers(schema, { status: 'hidden' }, result)).toEqual([]);
  });

  it('链式 setValue 在同一轮联动内完成', () => {
    const schema = {
      ...baseSchema([
        { key: 'a', type: 'text', label: 'A' },
        { key: 'b', type: 'text', label: 'B' },
        { key: 'c', type: 'text', label: 'C' },
      ]),
      linkageRules: [
        {
          when: { fieldKey: 'a', operator: 'equals', value: 'go' },
          action: 'setValue',
          targetFieldKey: 'b',
          value: 'ready',
        },
        {
          when: { fieldKey: 'b', operator: 'equals', value: 'ready' },
          action: 'setValue',
          targetFieldKey: 'c',
          value: 'done',
        },
      ],
    } satisfies LabelHubSchema;

    expect(applySchemaLinkage(schema, { a: 'go' }).answers).toEqual({
      a: 'go',
      b: 'ready',
      c: 'done',
    });
  });

  it('setValue 目标字段仍会参与校验', () => {
    const schema = {
      ...baseSchema([
        { key: 'status', type: 'text', label: '状态' },
        { key: 'score', type: 'text', label: '分数', validation: { pattern: '^\\d$' } },
      ]),
      linkageRules: [
        {
          when: { fieldKey: 'status', operator: 'equals', value: 'approved' },
          action: 'setValue',
          targetFieldKey: 'score',
          value: 'bad',
        },
      ],
    } satisfies LabelHubSchema;

    const result = applySchemaLinkage(schema, { status: 'approved' });

    expect(result.answers.score).toBe('bad');
    expect(result.disabledFieldKeys.has('score')).toBe(false);
    expect(validateSchemaAnswers(schema, result.answers, result)).toEqual([
      { fieldKey: 'score', message: '分数格式不符合要求。' },
    ]);
  });

  it('禁用字段默认不触发校验错误', () => {
    const schema = {
      ...baseSchema([
        { key: 'status', type: 'text', label: '状态' },
        { key: 'reason', type: 'text', label: '原因', validation: { required: true } },
      ]),
      linkageRules: [
        {
          when: { fieldKey: 'status', operator: 'equals', value: 'locked' },
          action: 'disable',
          targetFieldKey: 'reason',
        },
      ],
    } satisfies LabelHubSchema;

    const result = applySchemaLinkage(schema, { status: 'locked' });

    expect(result.disabledFieldKeys.has('reason')).toBe(true);
    expect(validateSchemaAnswers(schema, { status: 'locked' }, result)).toEqual([]);
  });

  it('StrictMode 下初始 setValue 联动只回写一次', () => {
    const onChange = vi.fn();
    const schema = {
      ...baseSchema([
        { key: 'status', type: 'text', label: '状态' },
        { key: 'score', type: 'text', label: '分数' },
      ]),
      linkageRules: [
        {
          when: { fieldKey: 'status', operator: 'equals', value: 'approved' },
          action: 'setValue',
          targetFieldKey: 'score',
          value: '5',
        },
      ],
    } satisfies LabelHubSchema;

    render(
      <StrictMode>
        <SchemaRenderer
          schema={schema}
          rawData={{}}
          value={{ status: 'approved' }}
          mode="answer"
          onChange={onChange}
        />
      </StrictMode>,
    );

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith({ status: 'approved', score: '5' });
  });

  it('review 模式不会因为 setValue 联动自动写回 answers', () => {
    const onChange = vi.fn();
    const schema = {
      ...baseSchema([
        { key: 'status', type: 'text', label: '状态' },
        { key: 'score', type: 'text', label: '分数' },
      ]),
      linkageRules: [
        {
          when: { fieldKey: 'status', operator: 'equals', value: 'approved' },
          action: 'setValue',
          targetFieldKey: 'score',
          value: '5',
        },
      ],
    } satisfies LabelHubSchema;

    render(
      <SchemaRenderer
        schema={schema}
        rawData={{}}
        value={{ status: 'approved' }}
        mode="review"
        onChange={onChange}
      />,
    );

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText('分数')).toHaveValue('5');
  });

  it('Renderer 根据联动隐藏字段、禁用字段、动态必填并写入 setValue', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const schema = {
      ...baseSchema([
        {
          key: 'status',
          type: 'radio',
          label: '状态',
          options: [
            { label: '通过', value: 'approved' },
            { label: '拒绝', value: 'rejected' },
          ],
        },
        { key: 'detail', type: 'text', label: '详情', validation: { required: true } },
        { key: 'reason', type: 'textarea', label: '原因' },
        { key: 'score', type: 'text', label: '分数' },
      ]),
      linkageRules: [
        {
          when: { fieldKey: 'status', operator: 'equals', value: 'approved' },
          action: 'show',
          targetFieldKey: 'detail',
        },
        {
          when: { fieldKey: 'status', operator: 'equals', value: 'rejected' },
          action: 'disable',
          targetFieldKey: 'score',
        },
        {
          when: { fieldKey: 'status', operator: 'equals', value: 'rejected' },
          action: 'require',
          targetFieldKey: 'reason',
        },
        {
          when: { fieldKey: 'status', operator: 'equals', value: 'approved' },
          action: 'setValue',
          targetFieldKey: 'score',
          value: '5',
        },
      ],
    } satisfies LabelHubSchema & {
      linkageRules: NonNullable<LabelHubSchema['fields'][number]['linkageRules']>;
    };

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

    expect(screen.queryByLabelText('详情')).not.toBeInTheDocument();

    await user.click(screen.getByLabelText('状态：通过'));

    expect(await screen.findByLabelText('详情')).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith({ status: 'approved', score: '5' });
    expect(screen.getByLabelText('分数')).not.toBeDisabled();

    await user.click(screen.getByLabelText('状态：拒绝'));

    expect(screen.queryByLabelText('详情')).not.toBeInTheDocument();
    expect(screen.getByLabelText('分数')).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('原因为必填项。');
  });

  it('隐藏字段默认不触发必填，validateWhenHidden 为 true 时仍校验', () => {
    const schema = {
      ...baseSchema([
        {
          key: 'status',
          type: 'radio',
          label: '状态',
          options: [{ label: '拒绝', value: 'rejected' }],
        },
        {
          key: 'detail',
          type: 'text',
          label: '详情',
          validation: { required: true },
        },
        {
          key: 'auditNote',
          type: 'text',
          label: '审计备注',
          validation: { required: true },
          validateWhenHidden: true,
        },
      ]),
      linkageRules: [
        {
          when: { fieldKey: 'status', operator: 'equals', value: 'rejected' },
          action: 'hide',
          targetFieldKey: 'detail',
        },
        {
          when: { fieldKey: 'status', operator: 'equals', value: 'rejected' },
          action: 'hide',
          targetFieldKey: 'auditNote',
        },
      ],
    } as LabelHubSchema;

    const linkage = applySchemaLinkage(schema, { status: 'rejected' });

    expect(validateSchemaAnswers(schema, { status: 'rejected' }, linkage)).toEqual([
      { fieldKey: 'auditNote', message: '审计备注为必填项。' },
    ]);
  });

  it('自定义校验 key 命中时返回中文错误', () => {
    const schema = baseSchema([
      {
        key: 'email',
        type: 'text',
        label: '邮箱',
        validation: { customValidatorKey: 'valid_email' },
      },
    ]);

    expect(validateSchemaAnswers(schema, { email: 'bad-email' })).toEqual([
      { fieldKey: 'email', message: '邮箱格式不正确。' },
    ]);
  });

  it('字段校验 message 覆盖默认中文错误', () => {
    const schema = baseSchema([
      {
        key: 'code',
        type: 'text',
        label: '编码',
        validation: { required: true, minLength: 3, pattern: '^[A-Z]+$', message: '编码不合规。' },
      },
    ]);

    expect(validateSchemaAnswers(schema, {})).toEqual([
      { fieldKey: 'code', message: '编码不合规。' },
    ]);
    expect(validateSchemaAnswers(schema, { code: 'ab' })).toEqual([
      { fieldKey: 'code', message: '编码不合规。' },
      { fieldKey: 'code', message: '编码不合规。' },
    ]);
  });
});
