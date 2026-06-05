import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  TemplateDesignerPage,
  resolveDesignerDropTargetAtPoint,
  resolveDesignerDropTargetForProjection,
} from './TemplateDesignerPage';
import { OWNER_TASKS_PATH, writeTemplateOpenTarget } from './templateDraftHandoff';
import diffIcon from '../../assets/diff.svg';
import divideIcon from '../../assets/divide.svg';
import recoverIcon from '../../assets/recover.svg';
import starIcon from '../../assets/star.svg';
import tabsIcon from '../../assets/tabs.svg';
import versionIcon from '../../assets/version.svg';
import { DesignerCanvas } from '../../features/template-designer/DesignerCanvas';
import { MaterialDragOverlay } from '../../features/template-designer/MaterialPanel';
import { DESIGNER_MATERIALS, useTemplateDesignerStore } from '../../features/template-designer/templateStore';
import {
  createLabelHubSchema,
  qaQualitySampleSchema,
  titleCleanupSampleSchema,
  type FieldType,
  type LabelHubSchema,
} from '@labelhub/shared';

const createDomRect = ({
  height,
  left = 0,
  top,
  width = 360,
}: {
  height: number;
  left?: number;
  top: number;
  width?: number;
}): DOMRect => {
  const rect = {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => rect,
  };

  return rect as DOMRect;
};

describe('TemplateDesignerPage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    useTemplateDesignerStore.getState().resetDesigner();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ data: [] })));
  });

  afterEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
    window.history.pushState({}, '', '/');
    vi.unstubAllGlobals();
  });

  it('从 qa_quality 蓝本进入三栏 Designer 并同步属性修改', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          data: [
            createTemplateDto({
              id: 'template_qa',
              name: '问答质量模板',
              schema: qaQualitySampleSchema,
              status: 'PUBLISHED',
            }),
          ],
        }),
      ),
    );

    render(<TemplateDesignerPage />);
    await openTemplateByName(user, '问答质量模板');

    expect(screen.getByRole('dialog', { name: '模板配置' })).toBeInTheDocument();
    expect(screen.getByText('物料')).toBeInTheDocument();
    const designerCanvas = screen.getByRole('main', { name: '模板编辑区域' });
    const editTemplateNameButton = within(designerCanvas).getByRole('button', { name: '编辑模板名称' });
    expect(editTemplateNameButton).toHaveTextContent('问答质量模板');
    expect(editTemplateNameButton.querySelector('.designer-canvas__template-name-icon')).not.toBeNull();
    expect(within(designerCanvas).queryByRole('textbox', { name: '模板名称' })).not.toBeInTheDocument();
    await user.click(editTemplateNameButton);
    expect(within(designerCanvas).getByRole('textbox', { name: '模板名称' })).toHaveValue('问答质量模板');
    expect(screen.queryByText(/个顶层字段/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^预览$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '导出 Schema JSON' })).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: '属性配置' })).toBeInTheDocument();
    const inspector = screen.getByRole('complementary', { name: '右侧配置面板' });
    expect(within(inspector).queryByRole('tablist', { name: '配置面板视图' })).not.toBeInTheDocument();
    expect(within(inspector).queryByRole('tab', { name: '属性' })).not.toBeInTheDocument();
    expect(within(inspector).queryByRole('tab', { name: 'JSON' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Schema JSON' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '使用商品标题清洗 v3' })).not.toBeInTheDocument();
    expect(screen.queryByText('商品标题清洗 v3')).not.toBeInTheDocument();
    expect(
      screen.queryByText('对齐图 2 蓝本，包含 ShowItem、清洗标题、类目、关键词和 LLM 触发组件。'),
    ).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: '选择 题目原始数据' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '选择 一句话总评' }));
    expect(screen.getByRole('heading', { name: '属性配置' })).toBeInTheDocument();
    expect(screen.queryByText('属性配置 · summary')).not.toBeInTheDocument();

    const lengthLimitEditor = screen.getByRole('group', { name: '长度限制' });
    await user.click(within(lengthLimitEditor).getByRole('button', { name: '最多' }));
    const maxLengthInput = await screen.findByLabelText('最大长度');
    await user.clear(maxLengthInput);
    await user.type(maxLengthInput, '42');
    fireEvent.change(screen.getByLabelText('正则'), { target: { value: '^[^#]+$' } });
    await user.selectOptions(screen.getByLabelText('预置校验'), 'valid_json');

    expect(findDesignerField('summary')?.validation).toMatchObject({
      maxLength: 42,
      pattern: '^[^#]+$',
      customValidatorKey: 'valid_json',
    });

    await user.click(screen.getByLabelText('显示字段联动'));
    expect(screen.getByLabelText('隐藏字段联动')).toBeChecked();
    await user.click(screen.getByRole('button', { name: '新增联动规则' }));
    expect(screen.getByText('联动 1')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '联动 1 条件' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '联动 1 动作' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '规则 1 动作 1 类型' })).toHaveTextContent('显示');
    expect(screen.queryByRole('combobox', { name: '规则 1 条件字段 1' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '规则 1 条件字段 1' })).toHaveTextContent('选择字段');

    expect(screen.queryByRole('region', { name: 'Renderer 预览' })).not.toBeInTheDocument();
  });

  it('从输入文件创建模板时，画布 ShowItem 使用上传文件样例数据预览', async () => {
    const user = userEvent.setup();

    window.sessionStorage.setItem(
      'labelhub.templateDraftHandoff',
      JSON.stringify({
        name: '自动解析模板 · sample.json',
        sourceFileName: 'sample.json',
        schema: createLabelHubSchema({
          schemaVersion: 'auto-draft',
          datasetKind: 'generic_json',
          fields: [
            {
              key: 'auto_show_item',
              type: 'show_item',
              label: 'sample.json',
              sourceKeys: ['prompt', 'response_a'],
              displayConfig: {
                layout: 'field_list',
                fields: [
                  { sourceKey: 'prompt', label: '问题', area: 'primary', format: 'long_text' },
                  { sourceKey: 'response_a', label: '回答 A', area: 'content', format: 'long_text' },
                ],
              },
            },
          ],
        }),
        previewRecords: [
          {
            prompt: '上传文件里的真实问题',
            response_a: '上传文件里的候选回答 A',
            raw_field_03: '原始字段 3',
            raw_field_04: '原始字段 4',
            raw_field_05: '原始字段 5',
            raw_field_06: '原始字段 6',
            raw_field_07: '原始字段 7',
            raw_field_08: '原始字段 8',
            raw_field_09: '原始字段 9',
            raw_field_10: '原始字段 10',
          },
          ...Array.from({ length: 11 }, (_, index) => ({
            prompt: `上传文件里的真实问题 ${index + 2}`,
            response_a: `上传文件里的候选回答 ${index + 2}`,
          })),
        ],
      }),
    );

    render(<TemplateDesignerPage />);

    const dialog = await screen.findByRole('dialog', { name: '模板配置' });
    const canvas = within(dialog).getByRole('main', { name: '模板编辑区域' });

    expect(within(dialog).queryByText('已根据 sample.json 创建模板草稿。')).not.toBeInTheDocument();
    expect(within(canvas).queryByText('字段名：auto_show_item')).not.toBeInTheDocument();
    expect(within(canvas).queryByText('sample.json')).not.toBeInTheDocument();
    expect(within(canvas).getByText('上传文件里的真实问题')).toBeInTheDocument();
    expect(within(canvas).getByText('上传文件里的候选回答 A')).toBeInTheDocument();
    expect(within(canvas).queryByText('用户询问如何判断一段回答是否准确、完整且没有安全风险。')).not.toBeInTheDocument();

    const uploadedPreviewButton = within(canvas).getByRole('button', { name: '预览已上传文件' });
    expect(uploadedPreviewButton).toHaveClass('designer-canvas__uploaded-preview');
    expect(uploadedPreviewButton.closest('.designer-canvas__toolbar')).not.toBeNull();
    expect(uploadedPreviewButton.closest('.designer-canvas__header-meta')).toBeNull();
    expect(uploadedPreviewButton.querySelector('.designer-canvas__uploaded-preview-icon')).toBeNull();

    const labelerPreviewButton = within(canvas).getByRole('button', { name: '预览 Labeler 标注效果' });
    expect(labelerPreviewButton).toHaveClass('designer-canvas__labeler-preview');
    expect(labelerPreviewButton).toHaveTextContent('预览模板');
    expect(labelerPreviewButton.closest('.designer-canvas__toolbar')).not.toBeNull();

    await user.click(labelerPreviewButton);

    const inlinePreview = within(canvas).getByRole('region', { name: 'Labeler 标注预览' });
    expect(screen.queryByRole('dialog', { name: 'Labeler 标注预览' })).not.toBeInTheDocument();
    expect(inlinePreview).toHaveClass('designer-canvas__labeler-preview-surface');
    expect(within(inlinePreview).getByText('上传文件里的真实问题')).toBeInTheDocument();
    expect(within(inlinePreview).getByText('上传文件里的候选回答 A')).toBeInTheDocument();
    expect(within(canvas).getByText('自动解析模板 · sample.json')).toBeInTheDocument();
    expect(within(canvas).getByText('1 个字段')).toBeInTheDocument();
    const exitPreviewButton = within(canvas).getByRole('button', { name: '退出 Labeler 标注预览' });
    expect(exitPreviewButton).toHaveAttribute('aria-pressed', 'true');
    expect(
      exitPreviewButton.querySelector('.designer-canvas__labeler-preview-icon'),
    ).toHaveAttribute('data-preview-icon', 'closed');

    await user.click(exitPreviewButton);
    expect(within(canvas).queryByRole('region', { name: 'Labeler 标注预览' })).not.toBeInTheDocument();

    await user.click(uploadedPreviewButton);

    const previewDialog = await screen.findByRole('dialog', { name: '预览已上传文件' });
    const previewOverlay = previewDialog.parentElement as HTMLElement;
    expect(previewOverlay).not.toHaveClass('task-dataset-preview-overlay--workspace');
    expect(previewOverlay).toHaveClass('task-dataset-preview-overlay--drawer');
    expect(previewOverlay.parentElement).toBe(document.body);
    expect(previewOverlay.closest('.template-designer-drawer-shell')).toBeNull();
    expect(within(previewDialog).getByText('共 12 条样例')).toBeInTheDocument();
    expect(within(previewDialog).getByRole('columnheader', { name: 'prompt' })).toBeInTheDocument();
    expect(within(previewDialog).getByRole('columnheader', { name: 'raw_field_10' })).toBeInTheDocument();
    expect(within(previewDialog).getByText('上传文件里的真实问题')).toBeInTheDocument();
    expect(within(previewDialog).getByText('原始字段 10')).toBeInTheDocument();
    expect(within(previewDialog).getByText('上传文件里的真实问题 12')).toBeInTheDocument();
  });

  it('保存自动解析模板后重新打开仍保留上传工具栏和完整 ShowItem 预览', async () => {
    const user = userEvent.setup();
    const autoSchema = createLabelHubSchema({
      schemaVersion: 'auto-draft',
      datasetKind: 'generic_json',
      fields: [
        {
          key: 'auto_show_item',
          type: 'show_item',
          label: 'sample.jsonl',
          sourceKeys: ['prompt', 'response_a', 'image_url'],
          displayConfig: {
            layout: 'table',
            fields: [
              { sourceKey: 'prompt', label: '问题', area: 'content', format: 'long_text' },
              { sourceKey: 'response_a', label: '回答 A', area: 'content', format: 'long_text' },
              { sourceKey: 'image_url', label: '图片链接', area: 'content', format: 'text' },
            ],
          },
        },
      ],
    });
    const previewRecord = {
      prompt: '保存后仍要展示的问题',
      response_a: '保存后仍要展示的回答 A',
      image_url: 'https://www.w3schools.com/w3css/img_lights.jpg',
    };
    let savedTemplate: ReturnType<typeof createTemplateDto> | null = null;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = input.toString();
      const method = init?.method ?? 'GET';

      if (path === '/templates' && method === 'GET') {
        return jsonResponse({ data: savedTemplate ? [savedTemplate] : [] });
      }

      if (path === '/templates' && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          actorId?: string;
          name: string;
          schema: typeof autoSchema;
        };
        savedTemplate = createTemplateDto({
          id: 'template_auto_saved',
          name: body.name,
          schema: body.schema,
          status: 'DRAFT',
          createdById: body.actorId ?? null,
        });

        return jsonResponse({ data: savedTemplate });
      }

      return jsonResponse({ data: {} });
    });
    vi.stubGlobal('fetch', fetchMock);

    window.sessionStorage.setItem(
      'labelhub.templateDraftHandoff',
      JSON.stringify({
        name: '自动解析模板 · sample.jsonl',
        sourceFileName: 'sample.jsonl',
        schema: autoSchema,
        previewRecords: [previewRecord],
      }),
    );

    render(<TemplateDesignerPage />);

    let dialog = await screen.findByRole('dialog', { name: '模板配置' });
    let canvas = within(dialog).getByRole('main', { name: '模板编辑区域' });
    expect(within(canvas).getByText('保存后仍要展示的问题')).toBeInTheDocument();

    await user.click(screen.getByTestId('template-designer-backdrop'));
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: '模板配置' })).not.toBeInTheDocument(),
    );
    const createTemplateCall = fetchMock.mock.calls.find(
      ([path, init]) => path.toString() === '/templates' && init?.method === 'POST',
    );
    const createTemplateBody = JSON.parse(String(createTemplateCall?.[1]?.body ?? '{}')) as {
      actorId?: string;
      schema: LabelHubSchema;
    };
    expect(createTemplateBody.actorId).toBe('user_owner_zhang_man');
    expect(createTemplateBody.schema.metadata?.autoTemplateSource).toEqual({
      sourceFileName: 'sample.jsonl',
      previewRecords: [previewRecord],
    });

    await openTemplateByName(user, '自动解析模板 · sample.jsonl');

    dialog = screen.getByRole('dialog', { name: '模板配置' });
    canvas = within(dialog).getByRole('main', { name: '模板编辑区域' });
    expect(within(canvas).getByRole('button', { name: '预览已上传文件' })).toBeInTheDocument();
    expect(within(canvas).getByRole('button', { name: '查看AI预审Prompt' })).toBeInTheDocument();
    expect(within(canvas).getByRole('button', { name: '预览 Labeler 标注效果' })).toBeInTheDocument();
    expect(within(canvas).getByText('保存后仍要展示的问题')).toBeInTheDocument();
    expect(within(canvas).getByText('保存后仍要展示的回答 A')).toBeInTheDocument();
    expect(within(canvas).getByRole('img', { name: '图片链接' })).toBeInTheDocument();
  });

  it('模板配置页可查看由 ShowItem、标注答案、字段标准和输出格式组成的 AI Prompt', async () => {
    const user = userEvent.setup();

    window.sessionStorage.setItem(
      'labelhub.templateDraftHandoff',
      JSON.stringify({
        name: '自动解析模板 · prompt.jsonl',
        sourceFileName: 'prompt.jsonl',
        schema: createLabelHubSchema({
          schemaVersion: 'auto-draft',
          datasetKind: 'generic_json',
          fields: [
            {
              key: 'auto_show_item',
              type: 'show_item',
              label: 'prompt.jsonl',
              displayConfig: {
                layout: 'table',
                fields: [
                  { sourceKey: 'prompt', label: 'Prompt', area: 'content', format: 'long_text' },
                  { sourceKey: 'response_a', label: '回答 A', area: 'content', format: 'text' },
                ],
              },
            },
            {
              key: 'preferred_field',
              fieldKey: 'preferred',
              sourceKey: 'preferred',
              type: 'radio',
              label: '选择更优回答',
              validation: { required: true },
              options: [
                { label: '回答 A', value: 'A' },
                { label: '回答 B', value: 'B' },
              ],
              aiReview: {
                enabled: true,
                role: 'annotation_answer',
                requirement: '必须结合两个回答的事实准确性和完整性判断。',
              },
            },
            {
              key: 'internal_note_field',
              fieldKey: 'internal_note',
              type: 'textarea',
              label: '内部备注',
              aiReview: {
                enabled: false,
                role: 'annotation_answer',
                requirement: '关闭 AI 预审时不应该进入 Prompt。',
              },
            },
          ],
        }),
        previewRecords: [
          {
            prompt: '上传 Prompt：比较两个回答',
            response_a: '候选回答 A',
            response_b: '候选回答 B',
          },
        ],
      }),
    );

    render(<TemplateDesignerPage />);

    const dialog = await screen.findByRole('dialog', { name: '模板配置' });
    const canvas = within(dialog).getByRole('main', { name: '模板编辑区域' });
    const aiPromptButton = within(canvas).getByRole('button', { name: '查看AI预审Prompt' });

    expect(aiPromptButton.closest('.designer-canvas__toolbar')).not.toBeNull();

    await user.click(aiPromptButton);

    const promptPreview = within(canvas).getByRole('region', { name: 'AI Prompt 预览' });
    expect(within(canvas).getByRole('button', { name: '退出 AI Prompt 预览' })).toHaveAttribute('aria-pressed', 'true');
    expect(promptPreview).toHaveTextContent('Prompt 组成部分');
    expect(within(promptPreview).getByRole('button', { name: '查看完整 Prompt' })).toHaveAttribute('aria-pressed', 'false');
    expect(within(promptPreview).queryByLabelText('编辑完整 AI Prompt')).not.toBeInTheDocument();
    expect(within(promptPreview).queryByLabelText('AI Prompt 统计')).not.toBeInTheDocument();
    expect(within(promptPreview).getByLabelText('Prompt 组成部分')).toBeInTheDocument();
    expect(promptPreview).toHaveTextContent('1. 角色设定');
    expect(within(promptPreview).getByLabelText('编辑角色设定')).toHaveAttribute(
      'placeholder',
      '请填写 AI 预审角色设定，说明模型的身份、任务目标和审核范围',
    );
    expect((within(promptPreview).getByLabelText('编辑角色设定') as HTMLTextAreaElement).value).toBe('');
    expect(promptPreview).toHaveTextContent('2. 题目展示信息 Show Item');
    expect(
      (within(promptPreview).getByLabelText('编辑题目展示信息 Show Item') as HTMLTextAreaElement).value,
    ).toContain('上传 Prompt：比较两个回答');
    expect(promptPreview).toHaveTextContent('3. 标注员提交内容');
    const answersTextarea = within(promptPreview).getByLabelText('编辑标注员提交内容') as HTMLTextAreaElement;
    expect(answersTextarea.value).toContain('"preferred": null');
    expect(answersTextarea.value).not.toContain('internal_note');
    expect(promptPreview).toHaveTextContent('4. 字段级审核标准');
    expect((within(promptPreview).getByLabelText('编辑字段级审核标准') as HTMLTextAreaElement).value).toContain(
      '必须结合两个回答的事实准确性和完整性判断。',
    );
    expect((within(promptPreview).getByLabelText('编辑字段级审核标准') as HTMLTextAreaElement).value).not.toContain(
      '关闭 AI 预审时不应该进入 Prompt。',
    );
    expect(promptPreview).toHaveTextContent('5. 输出格式约束');
    expect((within(promptPreview).getByLabelText('编辑输出格式约束') as HTMLTextAreaElement).value).toContain('verdict');
    expect(promptPreview).not.toHaveTextContent('Prompt Hash');
    expect(within(canvas).queryByRole('region', { name: 'Labeler 标注预览' })).not.toBeInTheDocument();

    const personaCollapseButton = within(promptPreview).getAllByRole('button', { name: '收起' })[0];
    expect(personaCollapseButton).toHaveAttribute('aria-expanded', 'true');
    await user.click(personaCollapseButton);
    expect(personaCollapseButton).toHaveTextContent('展开');
    expect(personaCollapseButton).toHaveAttribute('aria-expanded', 'false');
    expect(within(promptPreview).getByLabelText('编辑角色设定')).toHaveAttribute('tabindex', '-1');
    await user.click(personaCollapseButton);
    expect(personaCollapseButton).toHaveTextContent('收起');
    expect(personaCollapseButton).toHaveAttribute('aria-expanded', 'true');

    fireEvent.change(within(promptPreview).getByLabelText('编辑角色设定'), {
      target: { value: '你是偏好标注复核专家。' },
    });
    expect(useTemplateDesignerStore.getState().schema.aiReviewPrompt?.sectionOverrides?.persona).toBe(
      '你是偏好标注复核专家。',
    );

    await user.click(within(promptPreview).getByRole('button', { name: '查看完整 Prompt' }));

    expect(within(promptPreview).getByRole('button', { name: '查看分段' })).toHaveAttribute('aria-pressed', 'true');
    expect((within(promptPreview).getByLabelText('编辑完整 AI Prompt') as HTMLTextAreaElement).value).toContain(
      '# 1. 角色设定\n你是偏好标注复核专家。',
    );
    fireEvent.change(within(promptPreview).getByLabelText('编辑完整 AI Prompt'), {
      target: { value: '完整自定义 Prompt：只输出 JSON。' },
    });
    expect(useTemplateDesignerStore.getState().schema.aiReviewPrompt?.fullPromptOverride).toBe(
      '完整自定义 Prompt：只输出 JSON。',
    );
    expect(within(promptPreview).queryByLabelText('Prompt 组成部分')).not.toBeInTheDocument();
  });

  it('从输入文件待分类草稿进入时，用 Toast 提示分析进度并在完成后打开模板配置', async () => {
    let resolveClassification: (response: Response) => void = () => {};
    const classificationResponse = new Promise<Response>((resolve) => {
      resolveClassification = resolve;
    });
    const fetchMock = vi.fn((url: RequestInfo | URL) => {
      if (String(url) === '/llm/template-fields/classify') {
        return classificationResponse;
      }

      return Promise.resolve(jsonResponse({ data: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    window.sessionStorage.setItem(
      'labelhub.templateDraftHandoff',
      JSON.stringify({
        name: '自动解析模板 · pending.json',
        sourceFileName: 'pending.json',
        schema: createLabelHubSchema({
          schemaVersion: 'auto-draft',
          datasetKind: 'generic_json',
          fields: [],
        }),
        previewRecords: [
          {
            prompt: '真实问题：为什么会延迟跳转？',
            response_a: '真实回答 A',
            dimension: '',
          },
        ],
        autoClassificationRequest: {
          fileName: 'pending.json',
          fields: [
            { sourceKey: 'prompt', samples: ['真实问题：为什么会延迟跳转？'], valueTypes: ['string'], filledCount: 1, totalCount: 1 },
            { sourceKey: 'response_a', samples: ['真实回答 A'], valueTypes: ['string'], filledCount: 1, totalCount: 1 },
            { sourceKey: 'dimension', samples: [], valueTypes: [], filledCount: 0, totalCount: 1 },
          ],
          records: [
            {
              prompt: '真实问题：为什么会延迟跳转？',
              response_a: '真实回答 A',
              dimension: '',
            },
          ],
        },
      }),
    );

    render(<TemplateDesignerPage />);

    const loadingToast = await screen.findByRole('status');
    expect(loadingToast).toHaveTextContent('正在分析输入文件并创建模板');
    expect(loadingToast.closest('.toast')).toHaveClass('toast--info', 'toast--brand-blue');
    expect(loadingToast.closest('.toast')?.querySelector('.toast__spinner')).not.toBeNull();
    expect(within(loadingToast.closest('.toast') as HTMLElement).queryByRole('button', { name: '关闭提示' }))
      .not.toBeInTheDocument();
    expect(loadingToast.closest('.template-manager-page')).toBeNull();
    expect(document.querySelector('.template-manager-auto-loading')).toBeNull();
    expect(screen.queryByRole('dialog', { name: '模板配置' })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/llm/template-fields/classify',
      expect.objectContaining({ method: 'POST' }),
    );

    resolveClassification(
      jsonResponse({
        data: {
          layout: 'field_list',
          displayFields: [
            { sourceKey: 'prompt', label: '问题', area: 'primary', format: 'long_text', maxLines: 8 },
            { sourceKey: 'response_a', label: '回答 A', area: 'content', format: 'long_text', maxLines: 12 },
          ],
          annotationFields: [
            {
              sourceKey: 'dimension',
              label: '评测维度',
              type: 'checkbox',
              description: '选择适用的评测维度',
              options: [
                { label: '准确性', value: 'accuracy' },
                { label: '完整性', value: 'completeness' },
              ],
            },
          ],
          provider: 'deepseek',
          model: 'deepseek-chat',
        },
      }),
    );

    const dialog = await screen.findByRole('dialog', { name: '模板配置' });
    await waitFor(() => expect(screen.queryByText('正在分析输入文件并创建模板')).not.toBeInTheDocument());
    const canvas = within(dialog).getByRole('main', { name: '模板编辑区域' });
    expect(within(canvas).getByText('真实问题：为什么会延迟跳转？')).toBeInTheDocument();
    expect(within(canvas).getByText('真实回答 A')).toBeInTheDocument();
    const dimensionCard = within(canvas).getByRole('button', { name: '选择 评测维度' });
    expect(within(dimensionCard).getByText('多选 - 评测维度')).toBeInTheDocument();
    expect(dimensionCard.querySelector('.designer-field-card__required-mark')).toHaveTextContent('*');
    const description = within(dimensionCard).getByText('选择适用的评测维度');
    expect(description).toHaveClass('designer-field-card__description');
  });

  it('输入文件字段分类失败时静默降级使用本地解析模板并打开配置抽屉', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: RequestInfo | URL) => {
        if (String(url) === '/llm/template-fields/classify') {
          return Promise.resolve(new Response('', { status: 500 }));
        }

        return Promise.resolve(jsonResponse({ data: [] }));
      }),
    );
    window.sessionStorage.setItem(
      'labelhub.templateDraftHandoff',
      JSON.stringify({
        name: '自动解析模板 · failed.json',
        sourceFileName: 'failed.json',
        schema: createLabelHubSchema({
          schemaVersion: 'auto-draft',
          datasetKind: 'generic_json',
          fields: [],
        }),
        previewRecords: [{ prompt: '失败样例' }],
        autoClassificationRequest: {
          fileName: 'failed.json',
          fields: [
            { sourceKey: 'prompt', samples: ['失败样例'], valueTypes: ['string'], filledCount: 1, totalCount: 1 },
          ],
          records: [{ prompt: '失败样例' }],
        },
      }),
    );

    render(<TemplateDesignerPage />);

    const dialog = await screen.findByRole('dialog', { name: '模板配置' });
    expect(within(dialog).getByText('失败样例')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('字段分类接口不可用，已使用本地解析结果创建模板')).not.toBeInTheDocument();
  });

  it('用户在右侧修改 ShowItem 字段显示名时，画布立即更新且保留上传样例值', async () => {
    const user = userEvent.setup();

    window.sessionStorage.setItem(
      'labelhub.templateDraftHandoff',
      JSON.stringify({
        name: '自动解析模板 · show-item-edit.json',
        sourceFileName: 'show-item-edit.json',
        schema: createLabelHubSchema({
          schemaVersion: 'auto-draft',
          datasetKind: 'generic_json',
          fields: [
            {
              key: 'auto_show_item',
              type: 'show_item',
              label: 'show-item-edit.json',
              sourceKeys: ['prompt', 'response_a'],
              displayConfig: {
                layout: 'field_list',
                fields: [
                  { sourceKey: 'prompt', label: '问题', area: 'primary', format: 'long_text' },
                  { sourceKey: 'response_a', label: '回答 A', area: 'content', format: 'long_text' },
                ],
              },
            },
          ],
        }),
        previewRecords: [
          {
            prompt: '上传样例：人工保留的问题文本',
            response_a: '上传样例：人工保留的候选回答',
          },
        ],
      }),
    );

    render(<TemplateDesignerPage />);

    const dialog = await screen.findByRole('dialog', { name: '模板配置' });
    const canvas = within(dialog).getByRole('main', { name: '模板编辑区域' });
    const properties = within(dialog).getByRole('complementary', { name: '属性配置' });

    expect(within(canvas).getByText('问题')).toBeInTheDocument();
    expect(within(canvas).queryByText('字段名：auto_show_item')).not.toBeInTheDocument();
    expect(within(canvas).queryByText('show-item-edit.json')).not.toBeInTheDocument();
    expect(within(canvas).getByText('上传样例：人工保留的问题文本')).toBeInTheDocument();

    await user.clear(within(properties).getByLabelText('展示字段 1 显示名'));
    await user.type(within(properties).getByLabelText('展示字段 1 显示名'), '用户问题');

    expect(within(canvas).getByText('用户问题')).toBeInTheDocument();
    expect(within(canvas).getByText('上传样例：人工保留的问题文本')).toBeInTheDocument();
    expect(within(canvas).getByText('上传样例：人工保留的候选回答')).toBeInTheDocument();
    expect(within(canvas).queryByText('用户询问如何判断一段回答是否准确、完整且没有安全风险。')).not.toBeInTheDocument();
  });

  it('从输入文件创建模板后再打开普通模板会重置画布 ShowItem 预览数据', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          data: [
            createTemplateDto({
              id: 'template_qa',
              name: '问答质量模板',
              schema: qaQualitySampleSchema,
              status: 'PUBLISHED',
            }),
          ],
        }),
      ),
    );

    window.sessionStorage.setItem(
      'labelhub.templateDraftHandoff',
      JSON.stringify({
        name: '自动解析模板 · reset-source.json',
        sourceFileName: 'reset-source.json',
        schema: createLabelHubSchema({
          schemaVersion: 'auto-draft',
          datasetKind: 'generic_json',
          fields: [
            {
              key: 'auto_show_item',
              type: 'show_item',
              label: 'reset-source.json',
              sourceKeys: ['prompt'],
              displayConfig: {
                layout: 'field_list',
                fields: [{ sourceKey: 'prompt', label: '问题', area: 'primary', format: 'long_text' }],
              },
            },
          ],
        }),
        previewRecords: [{ prompt: '上传样例：不应污染普通模板' }],
      }),
    );

    render(<TemplateDesignerPage />);

    let dialog = await screen.findByRole('dialog', { name: '模板配置' });
    expect(within(within(dialog).getByRole('main', { name: '模板编辑区域' })).getByText('上传样例：不应污染普通模板')).toBeInTheDocument();

    await user.click(screen.getByTestId('template-designer-backdrop'));
    expect(screen.getByText('需要保存成草稿吗？')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '取消' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: '模板配置' })).not.toBeInTheDocument(),
    );

    await openTemplateByName(user, '问答质量模板');
    dialog = screen.getByRole('dialog', { name: '模板配置' });
    const canvas = within(dialog).getByRole('main', { name: '模板编辑区域' });

    expect(within(canvas).queryByText('上传样例：不应污染普通模板')).not.toBeInTheDocument();
    expect(within(canvas).getByText('用户询问如何判断一段回答是否准确、完整且没有安全风险。')).toBeInTheDocument();
  });

  it('进入评测模板先显示模板列表，新增或点击列表项打开配置抽屉，关闭后回到列表', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          createTemplateDto({
            id: 'template_1',
            name: '问答质量模板',
            schema: qaQualitySampleSchema,
            status: 'PUBLISHED',
          }),
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<TemplateDesignerPage />);

    expect(screen.getByRole('heading', { name: '评测模板' })).toBeInTheDocument();
    const pageHeader = screen.getByRole('heading', { name: '评测模板' }).closest('.task-management-header');
    expect(pageHeader).not.toBeNull();
    const pageDescription = within(pageHeader as HTMLElement).getByText(
      '管理数据标注评测模板的创建、状态、版本、字段数和负责人，支持模板从配置到发布复用的全流程管理',
    );
    expect(pageDescription).toHaveClass('task-management-table-description');
    expect(screen.queryByText('管理标注模板、字段结构与版本配置')).not.toBeInTheDocument();
    expect(document.querySelector('.template-manager-toolbar')).toBeNull();
    expect(screen.queryByRole('dialog', { name: '模板配置' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('评测模板标题区')).not.toBeInTheDocument();
    expect(document.querySelector('.template-manager-metrics')).toBeNull();
    expect(screen.queryByLabelText('本地草稿')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '继续编辑最近草稿' })).not.toBeInTheDocument();
    const filterBar = screen.getByLabelText('模板筛选栏');
    expect(within(filterBar).getByRole('button', { name: '新增模板' })).toHaveClass('task-filter-bar__create');
    expect(screen.getByPlaceholderText('搜索模板名称 / ID / 负责人')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '数据类型筛选' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '状态筛选' })).not.toBeInTheDocument();
    expect(screen.queryByText('全部数据类型')).not.toBeInTheDocument();
    expect(screen.queryByText('全部状态')).not.toBeInTheDocument();
    expect(document.querySelectorAll('.template-manager-filter-bar .task-filter-select')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: '卡片视图' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '表格视图' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('模板视图切换')).not.toBeInTheDocument();
    const templateTable = screen.getByRole('table', { name: '模板列表' });
    expect(templateTable).toBeInTheDocument();
    const templateListPanel = templateTable.closest('.template-manager-list');
    expect(templateListPanel).not.toBeNull();
    expect(templateListPanel).toHaveClass('task-management-table-card', 'template-manager-table-panel');
    expect(within(templateListPanel as HTMLElement).queryByText(pageDescription.textContent ?? '')).not.toBeInTheDocument();
    const summaryRegion = within(templateListPanel as HTMLElement).getByLabelText('模板状态筛选');
    expect(summaryRegion).toHaveClass('task-summary-grid', 'template-summary-grid');
    expect(within(summaryRegion).getByText('总模版')).toBeInTheDocument();
    expect(within(summaryRegion).getByText('草稿')).toBeInTheDocument();
    expect(within(summaryRegion).getByText('已发布')).toBeInTheDocument();
    expect(within(summaryRegion).queryByText('已归档')).not.toBeInTheDocument();
    expect(templateTable).toHaveClass('task-table', 'template-manager-table');
    expect(templateTable.closest('.task-table-scroll')).toHaveClass('template-manager-table-scroll');
    expect((templateTable.closest('.task-management-table-card') as HTMLElement).querySelector('.task-management-table-toolbar')).not.toBeNull();
    const templateListTitle = (templateListPanel as HTMLElement).querySelector('.labeler-list-panel-heading__title');
    expect(templateListTitle).toBeNull();
    expect(within(templateListPanel as HTMLElement).queryByRole('heading', { name: '模板列表' })).not.toBeInTheDocument();
    expect((templateListPanel as HTMLElement).querySelector('.export-table-heading__total')).toBeNull();
    expect(within(templateListPanel as HTMLElement).queryByText('按创建时间排序')).not.toBeInTheDocument();
    expect(within(templateListPanel as HTMLElement).getByRole('button', { name: '新增模板' })).toHaveClass(
      'primary-action',
      'task-filter-bar__create',
    );
    expect(within(templateTable).queryByText('数据类型')).not.toBeInTheDocument();
    expect(templateTable.querySelectorAll('colgroup col')).toHaveLength(8);
    expect(templateTable.querySelector('.template-manager-table__col-name')).not.toBeNull();
    expect(templateTable.querySelector('.template-manager-table__col-dataset')).toBeNull();
    expect(templateTable.querySelector('.template-manager-table__col-status')).not.toBeNull();
    expect(screen.getByLabelText('模板列表分页')).toHaveClass('task-table-pagination');
    expect(screen.queryByRole('list', { name: '模板资产卡片列表' })).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /打开模板 问答质量模板/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /打开官方模板/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '预览 问答质量模板' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '编辑 问答质量模板' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '复制 问答质量模板' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '查看 问答质量模板 版本管理' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '删除 问答质量模板' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: '更多操作 问答质量模板' })).not.toBeInTheDocument();
    const publishedTemplateRow = screen.getByRole('button', { name: /打开模板 问答质量模板/ });
    const publishedStatusTag = within(publishedTemplateRow).getByText('已发布').closest('.template-manager-status-tag') as HTMLElement | null;
    expect(publishedStatusTag).not.toBeNull();
    expect(publishedStatusTag).toHaveClass('status-tag', 'status-tag--task');
    expect(publishedStatusTag).toHaveAttribute('data-status', 'PUBLISHED');
    expect(publishedStatusTag?.querySelector('.status-tag__dot')).not.toBeNull();
    expect(publishedStatusTag?.style.getPropertyValue('--status-dot-color')).toBe('#0FB86B');
    expect(publishedStatusTag?.style.getPropertyValue('--status-text-color')).toBe('#0FB86B');
    expect(publishedStatusTag?.style.getPropertyValue('--status-bg-color')).toBe('#E8F7EF');
    expect(screen.getByText('2026-05-21 00:00')).toBeInTheDocument();
    expect(screen.queryByText('暂无自定义模板')).not.toBeInTheDocument();
    expect(screen.queryByText('暂无模板')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('搜索模板'), 'template_1');
    expect(screen.getByRole('button', { name: /打开模板 问答质量模板/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /打开官方模板/ })).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText('搜索模板'));
    await user.type(screen.getByLabelText('搜索模板'), '系统内置');
    expect(screen.queryByRole('button', { name: /打开官方模板/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /打开模板 问答质量模板/ })).not.toBeInTheDocument();
    expect(screen.getByText('暂无模板')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('搜索模板'));
    await user.click(screen.getByRole('button', { name: /已发布/ }));
    expect(screen.getByRole('button', { name: /打开模板 问答质量模板/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /打开官方模板/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /总模版/ }));
    expect(screen.getByRole('button', { name: /打开模板 问答质量模板/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /打开官方模板/ })).not.toBeInTheDocument();

    expect(screen.getByRole('table', { name: '模板列表' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: '模板资产卡片列表' })).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText('搜索模板'));
    const selectionSpy = vi
      .spyOn(window, 'getSelection')
      .mockReturnValue({ toString: () => 'M-001' } as Selection);
    await user.click(screen.getByText('M-001'));
    expect(screen.queryByRole('dialog', { name: '模板配置' })).not.toBeInTheDocument();
    selectionSpy.mockRestore();

    await user.click(screen.getByText('M-001'));
    expect(await screen.findByRole('dialog', { name: '模板配置' })).toBeInTheDocument();
    expect(document.querySelector('.template-designer-drawer-shell')?.parentElement).toBe(document.body);
    expect(screen.getByRole('button', { name: '选择 题目原始数据' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '关闭模板配置' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('dialog', { name: '模板配置' }));
    expect(screen.getByRole('dialog', { name: '模板配置' })).toBeInTheDocument();

    await user.click(screen.getByTestId('template-designer-backdrop'));
    expect(screen.queryByText('需要保存成草稿吗？')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(document.querySelector('.template-designer-drawer-shell')).toHaveClass('is-closing'),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: '模板配置' })).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole('dialog', { name: '模板配置' })).not.toBeInTheDocument();

    await user.click(screen.getByText('M-001'));
    expect(await screen.findByRole('dialog', { name: '模板配置' })).toBeInTheDocument();
    await user.click(screen.getByTestId('template-designer-backdrop'));
    expect(screen.queryByText('需要保存成草稿吗？')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: '模板配置' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /打开模板 问答质量模板/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '新增模板' }));
    expect(await screen.findByRole('dialog', { name: '模板配置' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '选择 题目原始数据' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '使用 qa_quality' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '使用 preference_compare' })).not.toBeInTheDocument();
  });

  it('从任务抽屉预览模板带着 URL templateId 进入时，点击外侧会返回任务管理', async () => {
    const user = userEvent.setup();
    const onReturnTo = vi.fn();
    const targetTemplate = createTemplateDto({
      id: 'template_qa',
      name: '问答质量模板',
      schema: qaQualitySampleSchema,
      status: 'PUBLISHED',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          data: [targetTemplate],
        }),
      ),
    );

    writeTemplateOpenTarget(targetTemplate.id, { returnTo: OWNER_TASKS_PATH });
    window.history.pushState({}, '', `/owner/templates?templateId=${targetTemplate.id}`);

    render(<TemplateDesignerPage onReturnTo={onReturnTo} />);

    expect(await screen.findByRole('dialog', { name: '模板配置' })).toBeInTheDocument();

    await user.click(screen.getByTestId('template-designer-backdrop'));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: '模板配置' })).not.toBeInTheDocument(),
    );
    expect(onReturnTo).toHaveBeenCalledWith(OWNER_TASKS_PATH);
  });

  it('模板列表状态使用任务管理同款圆点胶囊并沿用模板筛选配色', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          data: [
            createTemplateDto({
              id: 'template_draft',
              name: '草稿模板',
              status: 'DRAFT',
            }),
            createTemplateDto({
              id: 'template_published',
              name: '已发布模板',
              status: 'PUBLISHED',
            }),
          ],
        }),
      ),
    );

    render(<TemplateDesignerPage />);

    const draftRow = await screen.findByRole('button', { name: /打开模板 草稿模板/ });
    const publishedRow = await screen.findByRole('button', { name: /打开模板 已发布模板/ });
    const draftStatusTag = within(draftRow).getByText('草稿').closest('.template-manager-status-tag') as HTMLElement | null;
    const publishedStatusTag = within(publishedRow).getByText('已发布').closest('.template-manager-status-tag') as HTMLElement | null;

    expect(draftStatusTag).toHaveClass('status-tag--task');
    expect(draftStatusTag?.querySelector('.status-tag__dot')).not.toBeNull();
    expect(draftStatusTag?.style.getPropertyValue('--status-dot-color')).toBe('#64748B');
    expect(draftStatusTag?.style.getPropertyValue('--status-text-color')).toBe('#64748B');
    expect(draftStatusTag?.style.getPropertyValue('--status-bg-color')).toBe('#F3F4F6');
    expect(publishedStatusTag).toHaveClass('status-tag--task');
    expect(publishedStatusTag?.style.getPropertyValue('--status-dot-color')).toBe('#0FB86B');
    expect(publishedStatusTag?.style.getPropertyValue('--status-text-color')).toBe('#0FB86B');
    expect(publishedStatusTag?.style.getPropertyValue('--status-bg-color')).toBe('#E8F7EF');
  });

  it('模板列表接口不可用时显示空表格且不展示代理 500 错误', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })));

    render(<TemplateDesignerPage />);

    await waitFor(() => {
      expect(screen.queryByText('模板列表加载中...')).not.toBeInTheDocument();
    });
    expect(screen.getByText('暂无模板')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /打开官方模板/ })).not.toBeInTheDocument();
    expect(screen.queryByText('模板接口请求失败，请稍后重试。（HTTP 500）。')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('模板列表每行提供复制和删除按钮，复制生成草稿，删除移除自定义模板', async () => {
    const user = userEvent.setup();
    const customTemplate = createTemplateDto({
      id: 'template_custom_1',
      name: '自定义问答模板',
      schema: qaQualitySampleSchema,
      status: 'PUBLISHED',
    });
    const copiedTemplate = createTemplateDto({
      ...customTemplate,
      id: 'template_copy_1',
      name: '自定义问答模板 副本',
      status: 'DRAFT',
      version: 0,
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = input.toString();
      const method = init?.method ?? 'GET';

      if (path === '/templates' && method === 'GET') {
        return jsonResponse({ data: [customTemplate] });
      }

      if (path === '/templates' && method === 'POST') {
        return jsonResponse({ data: copiedTemplate });
      }

      if (path === '/templates/template_custom_1' && method === 'DELETE') {
        return jsonResponse({ data: { id: 'template_custom_1' } });
      }

      return jsonResponse({ data: {} });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<TemplateDesignerPage />);

    const templateTable = await screen.findByRole('table', { name: '模板列表' });
    const customVersionButton = within(templateTable).getByRole('button', { name: '查看 自定义问答模板 版本管理' });
    expect(customVersionButton.querySelector('img')).toHaveAttribute('src', versionIcon);
    expect(customVersionButton.querySelector('img')).toHaveAttribute('alt', '');
    expect(within(templateTable).getByRole('button', { name: '复制 自定义问答模板' })).toBeInTheDocument();
    const customDeleteButton = within(templateTable).getByRole('button', { name: '删除 自定义问答模板' });
    expect(customDeleteButton).toBeEnabled();
    expect(customDeleteButton).toHaveClass('template-manager-row-action--delete');
    expect(customDeleteButton.querySelector('path')).toHaveAttribute('fill', 'currentColor');

    await user.click(within(templateTable).getByRole('button', { name: '复制 自定义问答模板' }));

    expect(fetchMock).toHaveBeenCalledWith(
      '/templates',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"name":"自定义问答模板 副本"'),
      }),
    );
    expect(await screen.findByText('模板已复制为草稿')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /打开模板 自定义问答模板 副本/ })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '模板配置' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '删除 自定义问答模板' }));

    expect(fetchMock).toHaveBeenCalledWith('/templates/template_custom_1', expect.objectContaining({ method: 'DELETE' }));
    const deleteToastText = await screen.findByText('模板已删除');
    expect(deleteToastText.closest('.toast')).toHaveClass('toast--info', 'toast--delete-success');
    expect(deleteToastText.closest('.toast-stack')).toHaveClass('toast-stack--banner');
    expect(document.querySelector('.template-manager-list-status')).toBeNull();
    expect(screen.queryByRole('button', { name: /打开模板 自定义问答模板$/ })).not.toBeInTheDocument();
  });

  it('被未完成任务占用的模板禁用删除按钮并提示原因', async () => {
    const user = userEvent.setup();
    const lockedTemplate = createTemplateDto({
      id: 'template_locked',
      name: '使用中模板',
      schema: qaQualitySampleSchema,
      status: 'PUBLISHED',
      usageCount: 2,
      activeUsageCount: 1,
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = input.toString();
      const method = init?.method ?? 'GET';

      if (path === '/templates' && method === 'GET') {
        return jsonResponse({ data: [lockedTemplate] });
      }

      return jsonResponse({ data: {} });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<TemplateDesignerPage />);

    const templateTable = await screen.findByRole('table', { name: '模板列表' });
    const deleteButton = within(templateTable).getByRole('button', { name: '删除 使用中模板' });

    expect(deleteButton).toBeDisabled();
    expect(deleteButton).toHaveAttribute('title', '模板正在被未完成任务使用，暂不可删除');

    await user.click(deleteButton);

    expect(fetchMock).not.toHaveBeenCalledWith(
      '/templates/template_locked',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('模板列表行版本管理点击 Diff 后收缩版本列表，并在未完成任务占用时禁用恢复', async () => {
    const user = userEvent.setup();
    const restoredTemplate = createTemplateDto({
      id: 'template_v1',
      name: '版本链模板',
      schema: createLabelHubSchema({
        schemaVersion: 'v1',
        datasetKind: 'generic_json',
        fields: [
          { key: 'material', type: 'show_item', label: '题目材料', sourceKey: 'prompt' },
          { key: 'prompt', type: 'text', label: '题目' },
          { key: 'obsolete', type: 'text', label: '旧字段' },
        ],
      }),
      status: 'PUBLISHED',
      version: 1,
      rootTemplateId: 'template_v1',
      createdById: 'user_owner_zhang_man',
    });
    const middleTemplate = createTemplateDto({
      id: 'template_v2',
      name: '版本链模板',
      schema: createLabelHubSchema({
        schemaVersion: 'v2',
        datasetKind: 'generic_json',
        fields: [
          { key: 'material', type: 'show_item', label: '题目材料', sourceKey: 'prompt' },
          { key: 'prompt', type: 'textarea', label: '题目文本' },
        ],
      }),
      status: 'PUBLISHED',
      version: 2,
      parentTemplateId: 'template_v1',
      rootTemplateId: 'template_v1',
      createdById: 'user_owner_zhang_man',
    });
    const currentTemplate = createTemplateDto({
      id: 'template_v3',
      name: '版本链模板',
      schema: createLabelHubSchema({
        schemaVersion: 'v3',
        datasetKind: 'generic_json',
        fields: [
          { key: 'material', type: 'show_item', label: '题目材料', sourceKey: 'prompt' },
          { key: 'prompt', type: 'textarea', label: '题目文本' },
          { key: 'comment', type: 'textarea', label: '备注' },
        ],
      }),
      status: 'PUBLISHED',
      version: 3,
      parentTemplateId: 'template_v2',
      rootTemplateId: 'template_v1',
      createdById: 'user_owner_zhang_man',
    });
    const archivedTemplate = {
      ...currentTemplate,
      status: 'ARCHIVED' as const,
      archivedAt: '2026-05-22T00:00:00.000Z',
    };
    const versionList = [
      createTemplateVersionDto(currentTemplate, { activeUsageCount: 1, isCurrent: true, usageCount: 1 }),
      createTemplateVersionDto(middleTemplate, { activeUsageCount: 0, isCurrent: false, usageCount: 0 }),
      createTemplateVersionDto(restoredTemplate, { activeUsageCount: 0, isCurrent: false, usageCount: 0 }),
    ];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = input.toString();
      const method = init?.method ?? 'GET';

      if (path === '/templates' && method === 'GET') {
        return jsonResponse({ data: [currentTemplate] });
      }

      if (path === '/templates/template_v3/versions' && method === 'GET') {
        return jsonResponse({ data: versionList });
      }

      if (path === '/templates/template_v3/versions/template_v1/diff' && method === 'GET') {
        return jsonResponse({
          data: {
            summary: { added: 1, removed: 1, changed: 1 },
            sections: [
              {
                type: 'added',
                title: '新增字段',
                items: [{ fieldKey: 'comment', label: '备注', changeDescription: '新增字段 备注' }],
              },
              {
                type: 'removed',
                title: '删除字段',
                items: [{ fieldKey: 'obsolete', label: '旧字段', changeDescription: '删除字段 旧字段' }],
              },
              {
                type: 'changed',
                title: '字段类型变化',
                items: [
                  {
                    fieldKey: 'prompt',
                    before: 'text',
                    after: 'textarea',
                    changeDescription: '字段类型由 text 调整为 textarea',
                  },
                ],
              },
            ],
          },
        });
      }

      if (path === '/templates/template_v3/versions/template_v2/diff' && method === 'GET') {
        return jsonResponse({
          data: {
            summary: { added: 1, removed: 0, changed: 0 },
            sections: [
              {
                type: 'added',
                title: '新增字段',
                items: [{ fieldKey: 'comment', label: '备注', changeDescription: '新增字段 备注' }],
              },
            ],
          },
        });
      }

      return jsonResponse({ data: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<TemplateDesignerPage />);

    const row = await screen.findByRole('button', { name: /打开模板 版本链模板/ });
    await user.click(within(row).getByRole('button', { name: '查看 版本链模板 版本管理' }));

    const modal = await screen.findByRole('dialog', { name: '模板版本管理' });
    expect(within(modal).getByText('模板版本管理')).toBeInTheDocument();
    expect(within(modal).getByText(/当前版本 v3/)).toBeInTheDocument();
    expect(within(modal).getAllByText('张满')).toHaveLength(3);
    expect(within(modal).getByText('1 个未完成任务')).toBeInTheDocument();
    expect(within(modal).getAllByText('无未完成任务')).toHaveLength(2);
    const versionTable = within(modal).getByRole('table', { name: '模板历史版本列表' });
    expect(within(versionTable).getByRole('columnheader', { name: '版本' })).toBeInTheDocument();
    expect(within(versionTable).queryByRole('columnheader', { name: '状态' })).not.toBeInTheDocument();
    expect(within(versionTable).getAllByText('2026-05-21 08:00')).toHaveLength(3);
    expect(within(versionTable).getByRole('columnheader', { name: '任务使用' })).toBeInTheDocument();
    const v1Row = within(versionTable).getByRole('row', { name: /v1/ });
    const diffButton = within(v1Row).getByRole('button', { name: 'Diff' });
    expect(diffButton).toHaveClass('template-manager-row-action', 'template-version-table__icon-action');
    expect(diffButton).toHaveTextContent('');
    expect(diffButton.querySelector('.template-manager-row-action__icon')).not.toBeNull();
    expect(diffButton.querySelector('img')).toHaveAttribute('src', diffIcon);
    expect(within(versionTable).getAllByRole('button', { name: 'Diff' })).toHaveLength(2);
    expect(within(versionTable).queryByRole('button', { name: '当前版本' })).not.toBeInTheDocument();
    expect(within(versionTable).queryByRole('button', { name: '已是当前' })).not.toBeInTheDocument();
    const restoreButton = within(v1Row).getByRole('button', { name: '恢复' });
    expect(within(versionTable).getAllByRole('button', { name: '恢复' })).toHaveLength(2);
    expect(restoreButton).toHaveClass('template-manager-row-action', 'template-version-table__icon-action');
    expect(restoreButton).toBeDisabled();
    expect(restoreButton).toHaveAttribute('title', '模板正在被未完成任务使用，暂不可恢复历史版本');
    expect(restoreButton).toHaveTextContent('');
    expect(restoreButton.querySelector('.template-manager-row-action__icon')).not.toBeNull();
    expect(restoreButton.querySelector('img')).toHaveAttribute('src', recoverIcon);
    await user.click(restoreButton);

    expect(fetchMock).not.toHaveBeenCalledWith(
      '/templates/template_v3/versions/template_v1/restore',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(screen.queryByRole('dialog', { name: '确认恢复版本' })).not.toBeInTheDocument();
    expect(within(modal).queryByRole('region', { name: '版本详情' })).not.toBeInTheDocument();
    expect(within(modal).queryByText('版本差异对比')).not.toBeInTheDocument();
    expect(within(modal).queryByText('请选择旧版本查看与当前版本的差异')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '模板配置' })).not.toBeInTheDocument();

    await user.click(diffButton);

    const collapsedSummary = await within(modal).findByRole('region', { name: '历史版本列表摘要' });
    expect(within(collapsedSummary).getByText('历史版本列表')).toBeInTheDocument();
    expect(within(collapsedSummary).getByText('正在对比 v1 和当前 v3')).toBeInTheDocument();
    expect(within(collapsedSummary).getByRole('button', { name: '展开列表' })).toBeInTheDocument();
    expect(collapsedSummary.closest('.template-version-modal__list')).toHaveClass(
      'template-version-modal__list--collapsed',
    );
    expect(within(modal).queryByRole('table', { name: '模板历史版本列表' })).not.toBeInTheDocument();

    const diffRegion = await within(modal).findByRole('region', { name: '版本差异' });
    expect(within(diffRegion).getByRole('heading', { name: 'v1 对比 v3' })).toBeInTheDocument();
    expect(within(diffRegion).getByText('新增 1')).toBeInTheDocument();
    expect(within(diffRegion).getByText('删除 1')).toBeInTheDocument();
    expect(within(diffRegion).getByText('变更 1')).toBeInTheDocument();
    const renderedDiff = within(diffRegion).getByLabelText('旧版本与当前版本渲染对比');
    const oldPreview = within(renderedDiff).getByRole('group', { name: '旧版本 v1 渲染预览' });
    const currentPreview = within(renderedDiff).getByRole('group', { name: '当前版本 v3 渲染预览' });

    const oldOwnerPreviewShell = oldPreview.querySelector('.template-version-side-by-side-diff__owner-preview-shell');
    const currentOwnerPreviewShell = currentPreview.querySelector('.template-version-side-by-side-diff__owner-preview-shell');

    expect(oldOwnerPreviewShell).toHaveClass('designer-canvas', 'is-previewing-labeler');
    expect(currentOwnerPreviewShell).toHaveClass('designer-canvas', 'is-previewing-labeler');
    expect(oldOwnerPreviewShell?.querySelector('.template-version-side-by-side-diff__canvas')).toHaveClass(
      'annotation-canvas-scroll',
      'designer-canvas__labeler-preview-surface',
    );
    expect(currentOwnerPreviewShell?.querySelector('.template-version-side-by-side-diff__canvas')).toHaveClass(
      'annotation-canvas-scroll',
      'designer-canvas__labeler-preview-surface',
    );
    expect(oldPreview.querySelector('.schema-renderer')).toHaveAttribute('data-mode', 'review');
    expect(currentPreview.querySelector('.schema-renderer')).toHaveAttribute('data-mode', 'review');
    expect(within(oldPreview).getByRole('heading', { name: '旧版本 v1' })).toBeInTheDocument();
    expect(within(currentPreview).getByRole('heading', { name: '当前版本 v3' })).toBeInTheDocument();
    expect(within(oldPreview).getByText('题目材料')).toBeInTheDocument();
    expect(within(oldPreview).getByText('prompt 样例值')).toBeInTheDocument();
    expect(within(currentPreview).getByText('prompt 样例值')).toBeInTheDocument();
    expect(within(oldPreview).getByLabelText('题目')).toBeDisabled();
    expect(within(currentPreview).getByLabelText('题目文本')).toBeDisabled();
    expect(within(currentPreview).getByLabelText('备注')).toBeDisabled();
    expect(within(oldPreview).getByLabelText('旧字段')).toBeDisabled();
    expect(within(currentPreview).queryByLabelText('旧字段')).not.toBeInTheDocument();

    const addedNode = currentPreview.querySelector('[data-field-key="comment"]');
    const removedNode = oldPreview.querySelector('[data-field-key="obsolete"]');
    const oldChangedNode = oldPreview.querySelector('[data-field-key="prompt"]');
    const currentChangedNode = currentPreview.querySelector('[data-field-key="prompt"]');

    expect(addedNode).toHaveAttribute('data-diff-state', 'added');
    expect(removedNode).toHaveAttribute('data-diff-state', 'removed');
    expect(oldChangedNode).toHaveAttribute('data-diff-state', 'changed');
    expect(currentChangedNode).toHaveAttribute('data-diff-state', 'changed');
    expect(within(addedNode as HTMLElement).getByText('新增')).toBeInTheDocument();
    expect(within(removedNode as HTMLElement).getByText('已删除')).toBeInTheDocument();
    expect(within(oldChangedNode as HTMLElement).getByText('已修改')).toBeInTheDocument();
    expect(within(currentChangedNode as HTMLElement).getByText('已修改')).toBeInTheDocument();
    expect(within(diffRegion).queryByText('新增字段 备注')).not.toBeInTheDocument();

    await user.click(within(collapsedSummary).getByRole('button', { name: '展开列表' }));

    const expandedVersionTable = within(modal).getByRole('table', { name: '模板历史版本列表' });
    expect(expandedVersionTable.closest('.template-version-modal__list')).toHaveClass(
      'template-version-modal__list--expanded',
    );
    expect(within(expandedVersionTable).getByRole('columnheader', { name: '版本' })).toBeInTheDocument();
    expect(within(modal).queryByRole('region', { name: '历史版本列表摘要' })).not.toBeInTheDocument();
    expect(within(modal).getByLabelText('旧版本与当前版本渲染对比')).toBeInTheDocument();
    expect(within(modal).getByRole('region', { name: '版本差异' })).toHaveTextContent('新增 1');

    const expandedV2Row = within(expandedVersionTable).getByRole('row', { name: /v2/ });
    await user.click(within(expandedV2Row).getByRole('button', { name: 'Diff' }));

    const nextCollapsedSummary = await within(modal).findByRole('region', { name: '历史版本列表摘要' });
    expect(within(nextCollapsedSummary).getByText('正在对比 v2 和当前 v3')).toBeInTheDocument();
    expect(within(modal).queryByRole('table', { name: '模板历史版本列表' })).not.toBeInTheDocument();
    expect(within(modal).getByRole('heading', { name: 'v2 对比 v3' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/templates/template_v3/versions/template_v2/diff',
      expect.objectContaining({ method: 'GET' }),
    );

    await user.click(within(nextCollapsedSummary).getByRole('button', { name: '展开列表' }));

    const finalVersionTable = within(modal).getByRole('table', { name: '模板历史版本列表' });
    await user.click(within(finalVersionTable).getByRole('button', { name: 'v3' }));

    expect(within(modal).getByRole('table', { name: '模板历史版本列表' })).toBeInTheDocument();
    expect(within(modal).queryByRole('region', { name: '历史版本列表摘要' })).not.toBeInTheDocument();
    expect(within(modal).queryByRole('region', { name: '版本差异' })).not.toBeInTheDocument();
  });

  it('模板版本链没有未完成任务占用时允许确认恢复历史版本', async () => {
    const user = userEvent.setup();
    const restoredTemplate = createTemplateDto({
      id: 'template_v1',
      name: '可恢复版本链模板',
      schema: createLabelHubSchema({
        schemaVersion: 'v1',
        datasetKind: 'generic_json',
        fields: [{ key: 'prompt', type: 'text', label: '题目' }],
      }),
      status: 'PUBLISHED',
      version: 1,
      rootTemplateId: 'template_v1',
      createdById: 'user_owner_zhang_man',
    });
    const currentTemplate = createTemplateDto({
      id: 'template_v2',
      name: '可恢复版本链模板',
      schema: createLabelHubSchema({
        schemaVersion: 'v2',
        datasetKind: 'generic_json',
        fields: [{ key: 'prompt', type: 'textarea', label: '题目文本' }],
      }),
      status: 'PUBLISHED',
      version: 2,
      parentTemplateId: 'template_v1',
      rootTemplateId: 'template_v1',
      createdById: 'user_owner_zhang_man',
    });
    const archivedTemplate = {
      ...currentTemplate,
      status: 'ARCHIVED' as const,
      archivedAt: '2026-05-22T00:00:00.000Z',
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = input.toString();
      const method = init?.method ?? 'GET';

      if (path === '/templates' && method === 'GET') {
        return jsonResponse({ data: [currentTemplate] });
      }

      if (path === '/templates/template_v2/versions' && method === 'GET') {
        return jsonResponse({
          data: [
            createTemplateVersionDto(currentTemplate, { activeUsageCount: 0, isCurrent: true, usageCount: 1 }),
            createTemplateVersionDto(restoredTemplate, { activeUsageCount: 0, isCurrent: false, usageCount: 1 }),
          ],
        });
      }

      if (path === '/templates/template_v2/versions/template_v1/restore' && method === 'POST') {
        return jsonResponse({
          data: {
            restoredTemplate,
            archivedVersions: [archivedTemplate],
            affectedActiveTasks: [],
            message: '模板版本已恢复。',
          },
        });
      }

      if (path === '/templates/template_v1/versions' && method === 'GET') {
        return jsonResponse({
          data: [
            createTemplateVersionDto(restoredTemplate, { activeUsageCount: 0, isCurrent: true, usageCount: 1 }),
            createTemplateVersionDto(archivedTemplate, {
              activeUsageCount: 0,
              isArchived: true,
              isCurrent: false,
              usageCount: 1,
            }),
          ],
        });
      }

      return jsonResponse({ data: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<TemplateDesignerPage />);

    const row = await screen.findByRole('button', { name: /打开模板 可恢复版本链模板/ });
    await user.click(within(row).getByRole('button', { name: '查看 可恢复版本链模板 版本管理' }));
    const modal = await screen.findByRole('dialog', { name: '模板版本管理' });
    const versionTable = within(modal).getByRole('table', { name: '模板历史版本列表' });
    const restoreButton = within(versionTable).getByRole('button', { name: '恢复' });

    expect(restoreButton).toBeEnabled();

    await user.click(restoreButton);
    expect(screen.getByText('恢复到 v1 后，v1 之后的版本将被归档，不再作为当前可用版本展示。请确认是否继续？')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '确认恢复' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/templates/template_v2/versions/template_v1/restore',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/templates/template_v1/versions',
        expect.objectContaining({ method: 'GET' }),
      ),
    );
    expect(await within(modal).findByText(/当前版本 v1/)).toBeInTheDocument();
  });

  it('模板配置抽屉顶部提供版本管理入口，未保存新模板不展示入口', async () => {
    const user = userEvent.setup();
    const savedTemplate = createTemplateDto({
      id: 'template_saved',
      name: '已保存模板',
      schema: qaQualitySampleSchema,
      status: 'PUBLISHED',
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = input.toString();
      const method = init?.method ?? 'GET';

      if (path === '/templates' && method === 'GET') {
        return jsonResponse({ data: [savedTemplate] });
      }

      if (path === '/templates/template_saved/versions' && method === 'GET') {
        return jsonResponse({
          data: [createTemplateVersionDto(savedTemplate, { isCurrent: true })],
        });
      }

      return jsonResponse({ data: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<TemplateDesignerPage />);
    await openTemplateByName(user, '已保存模板');

    const drawer = screen.getByRole('dialog', { name: '模板配置' });
    const drawerVersionButton = within(drawer).getByRole('button', { name: '版本管理' });
    expect(drawerVersionButton.querySelector('img')).toHaveAttribute('src', versionIcon);
    expect(drawerVersionButton.querySelector('img')).toHaveAttribute('alt', '');
    await user.click(drawerVersionButton);
    const modal = await screen.findByRole('dialog', { name: '模板版本管理' });
    const modalShell = modal.closest('.template-version-modal');
    expect(modalShell?.parentElement).toBe(document.body);
    expect(modalShell).toHaveClass('template-version-modal--entering');
    expect(modalShell).not.toHaveClass('template-version-modal--closing');
    expect(fetchMock).toHaveBeenCalledWith('/templates/template_saved/versions', expect.objectContaining({ method: 'GET' }));

    await user.click(modalShell as HTMLElement);
    expect(modalShell).toHaveClass('template-version-modal--closing');
    expect(screen.getByRole('dialog', { name: '模板版本管理' })).toBeInTheDocument();
    fireEvent.animationEnd(modal);
    expect(screen.queryByRole('dialog', { name: '模板版本管理' })).not.toBeInTheDocument();

    await user.click(drawerVersionButton);
    const reopenedModal = await screen.findByRole('dialog', { name: '模板版本管理' });
    const reopenedModalShell = reopenedModal.closest('.template-version-modal');
    await user.click(screen.getByRole('button', { name: '关闭版本管理' }));
    expect(reopenedModalShell).toHaveClass('template-version-modal--closing');
    fireEvent.animationEnd(reopenedModal);
    expect(screen.queryByRole('dialog', { name: '模板版本管理' })).not.toBeInTheDocument();

    await user.click(screen.getByTestId('template-designer-backdrop'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '模板配置' })).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: '新增模板' }));

    expect(await screen.findByRole('dialog', { name: '模板配置' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '版本管理' })).not.toBeInTheDocument();
  });

  it('物料面板点击不新增字段，字段只能通过拖拽流程进入画布', async () => {
    const user = userEvent.setup();

    render(<TemplateDesignerPage />);
    await openNewTemplate(user);
    const dialog = screen.getByRole('dialog', { name: '模板配置' });
    expect(within(dialog).getByText('0 个字段')).toBeInTheDocument();
    expect(within(dialog).queryByText('0 个顶层字段')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '撤销' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: '重做' })).toBeDisabled();

    const textMaterial = screen.getByLabelText('单行输入');
    expect(screen.queryByText('基础物料')).not.toBeInTheDocument();
    expect(screen.queryByText('高级物料')).not.toBeInTheDocument();
    expect(screen.queryByText('布局物料')).not.toBeInTheDocument();
    expect(screen.getByText('布局')).toHaveClass('designer-materials__group-title');
    const materialLabels = [...document.querySelectorAll('.designer-material > span:last-child')].map((node) =>
      node.textContent,
    );
    expect(materialLabels).toEqual([
      '单行输入',
      '多行文本',
      '单选',
      '多选',
      '标签选择',
      '富文本',
      '文件/图片',
      'JSON 编辑器',
      '展示项 ShowItem',
      '分组容器',
      '多 Tab 布局',
    ]);
    expect(screen.queryByLabelText('LLM 触发组件')).not.toBeInTheDocument();
    const textMaterialShell = textMaterial.closest('.designer-material-shell');
    expect(textMaterialShell).not.toBeNull();
    expect(within(textMaterial).getByText('单行输入')).toBeInTheDocument();
    expect(within(textMaterial).queryByText('text')).not.toBeInTheDocument();
    expect(within(textMaterial).getByText('', { selector: '.designer-material__icon' })).toBeInTheDocument();
    expect(textMaterial.querySelector('svg path')?.getAttribute('d')).toContain('M717.856');
    expect(screen.getByLabelText('富文本').querySelector('svg path')?.getAttribute('d')).toContain('M106.667');
    expect(screen.getByLabelText('文件/图片').querySelector('svg path')?.getAttribute('d')).toContain(
      'M966.382033',
    );
    expect(screen.getByLabelText('JSON 编辑器').querySelector('svg path')?.getAttribute('d')).toContain('M355.398');
    expect(screen.getByLabelText('展示项 ShowItem').querySelector('svg path')?.getAttribute('d')).toContain(
      'M502.054',
    );
    expect(screen.getByLabelText('分组容器').querySelector('img')).toHaveAttribute(
      'src',
      divideIcon,
    );
    expect(screen.getByLabelText('多 Tab 布局').querySelector('img')).toHaveAttribute(
      'src',
      tabsIcon,
    );
    expect(within(textMaterialShell as HTMLElement).getByRole('button', { name: '拖拽单行输入' })).toHaveClass(
      'designer-material__handle',
    );
    expect(
      within(textMaterialShell as HTMLElement)
        .getByRole('button', { name: '拖拽单行输入' })
        .querySelectorAll('.designer-material__handle-dot'),
    ).toHaveLength(6);
    const materialPanel = screen.getByLabelText('物料');
    Object.defineProperty(materialPanel, 'clientHeight', { configurable: true, value: 100 });
    Object.defineProperty(materialPanel, 'scrollHeight', { configurable: true, value: 600 });
    fireEvent.wheel(textMaterial, { deltaY: 120 });
    expect(materialPanel.scrollTop).toBe(120);

    await user.click(textMaterial);
    expect(screen.queryByRole('button', { name: '选择 单行输入' })).not.toBeInTheDocument();

    addDesignerField('text');
    const selectButton = screen.getByRole('button', { name: '选择 单行输入' });
    expect(selectButton).toBeInTheDocument();
    const fieldCard = selectButton.closest('.designer-field-card');
    expect(fieldCard).not.toBeNull();
    const dragHandle = screen.getByRole('button', { name: '拖拽排序 单行输入' });
    expect(dragHandle).toHaveAttribute('title', '按住拖动排序');
    expect(within(dragHandle).getAllByText('', { selector: '.designer-field-card__sort-dot' })).toHaveLength(6);
    const copyButton = within(fieldCard as HTMLElement).getByRole('button', { name: '复制 单行输入' });
    expect(copyButton).toHaveClass('template-manager-row-action', 'designer-field-card__copy-button');
    expect(copyButton).not.toHaveTextContent('复制');
    expect(copyButton.querySelector('.template-manager-row-action__icon')).not.toBeNull();
    expect(copyButton.nextElementSibling).toHaveClass('designer-field-card__delete-button');
    expect(within(fieldCard as HTMLElement).getAllByText('单行输入')).toHaveLength(1);
    const deleteButton = within(fieldCard as HTMLElement).getByRole('button', { name: '删除 单行输入' });
    expect(deleteButton).toHaveClass('template-manager-row-action', 'designer-field-card__delete-button');
    expect(deleteButton).not.toHaveTextContent('×');
    expect(deleteButton.querySelector('.template-manager-row-action__icon')).not.toBeNull();
    expect(deleteButton.querySelector('path')).toHaveAttribute('fill', 'currentColor');
    expect(screen.queryByRole('button', { name: '上移 单行输入' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '下移 单行输入' })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '撤销' })).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: '重做' })).toBeDisabled();

    await user.click(
      within(fieldCard as HTMLElement).getByText((_, node) => node?.textContent === '字段名：text_1'),
    );
    expect(screen.getByRole('heading', { name: '属性配置' })).toBeInTheDocument();
    expect(screen.queryByText('属性配置 · text_1')).not.toBeInTheDocument();
  });

  it('模板配置标题旁的撤销重做按钮和快捷键可以回滚画布操作', async () => {
    const user = userEvent.setup();

    render(<TemplateDesignerPage />);
    await openNewTemplate(user);
    const dialog = screen.getByRole('dialog', { name: '模板配置' });
    const undoButton = within(dialog).getByRole('button', { name: '撤销' });
    const redoButton = within(dialog).getByRole('button', { name: '重做' });

    expect(undoButton).toBeDisabled();
    expect(redoButton).toBeDisabled();

    addDesignerField('text');
    expect(undoButton).toBeEnabled();
    expect(redoButton).toBeDisabled();
    expect(screen.getAllByRole('button', { name: /^选择 / })).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: '复制 单行输入' }));
    expect(screen.getAllByRole('button', { name: /^选择 / })).toHaveLength(2);

    await user.click(undoButton);
    expect(screen.getAllByRole('button', { name: /^选择 / })).toHaveLength(1);
    expect(redoButton).toBeEnabled();

    await user.click(redoButton);
    expect(screen.getAllByRole('button', { name: /^选择 / })).toHaveLength(2);

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(screen.getAllByRole('button', { name: /^选择 / })).toHaveLength(1);

    fireEvent.keyDown(window, { key: 'y', ctrlKey: true });
    expect(screen.getAllByRole('button', { name: /^选择 / })).toHaveLength(2);

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(screen.getAllByRole('button', { name: /^选择 / })).toHaveLength(1);

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(screen.getAllByRole('button', { name: /^选择 / })).toHaveLength(2);

    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect(screen.getAllByRole('button', { name: /^选择 / })).toHaveLength(1);

    fireEvent.keyDown(window, { key: 'z', metaKey: true, shiftKey: true });
    expect(screen.getAllByRole('button', { name: /^选择 / })).toHaveLength(2);

    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect(screen.getAllByRole('button', { name: /^选择 / })).toHaveLength(1);

    fireEvent.keyDown(window, { key: 'y', metaKey: true });
    expect(screen.getAllByRole('button', { name: /^选择 / })).toHaveLength(2);

    const titleInput = screen.getByLabelText('标题');
    titleInput.focus();
    fireEvent.keyDown(titleInput, { key: 'z', ctrlKey: true });
    expect(screen.getAllByRole('button', { name: /^选择 / })).toHaveLength(2);
    expect(undoButton).toBeEnabled();
  });

  it('撤销删除会把画布物料恢复到原位置，并可重做删除', async () => {
    const user = userEvent.setup();

    render(<TemplateDesignerPage />);
    await openNewTemplate(user);
    const dialog = screen.getByRole('dialog', { name: '模板配置' });

    addDesignerField('text');
    addDesignerField('textarea');
    expect(topLevelDesignerFieldLabels()).toEqual(['单行输入', '多行文本']);

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: '删除 单行输入' }));

    act(() => {
      vi.advanceTimersByTime(320);
    });

    expect(screen.queryByRole('button', { name: '选择 单行输入' })).not.toBeInTheDocument();
    expect(topLevelDesignerFieldLabels()).toEqual(['多行文本']);

    fireEvent.click(within(dialog).getByRole('button', { name: '撤销' }));
    expect(topLevelDesignerFieldLabels()).toEqual(['单行输入', '多行文本']);

    fireEvent.click(within(dialog).getByRole('button', { name: '重做' }));
    expect(screen.queryByRole('button', { name: '选择 单行输入' })).not.toBeInTheDocument();
    expect(topLevelDesignerFieldLabels()).toEqual(['多行文本']);
  });

  it('开启 LLM 提示的画布物料在复制按钮左侧展示可测试的星标按钮', async () => {
    const onTestLlmPrompt = vi.fn().mockResolvedValue(undefined);
    const schema = createLabelHubSchema({
      schemaVersion: 'draft',
      datasetKind: 'generic_json',
      fields: [
        {
          key: 'title',
          fieldKey: 'title',
          type: 'text',
          label: '清洗标题',
          promptTemplate: '',
        },
        { key: 'note', fieldKey: 'note', type: 'textarea', label: '备注' },
      ],
    });

    render(
      <DesignerCanvas
        schema={schema}
        selectedFieldKey={null}
        onTestLlmPrompt={onTestLlmPrompt}
        onSelectField={() => undefined}
        onDuplicateField={() => undefined}
        onRemoveField={() => undefined}
      />,
    );

    const promptCard = screen.getByRole('button', { name: '选择 清洗标题' });
    const promptCopyButton = within(promptCard).getByRole('button', { name: '复制 清洗标题' });
    const promptButton = within(promptCard).getByRole('button', { name: '测试 清洗标题 LLM 提示' });
    const promptIcon = promptButton.querySelector('.designer-field-card__llm-prompt-icon');

    expect(promptCard).toHaveClass('designer-field-card--has-llm-prompt');
    expect(promptButton).toHaveClass('template-manager-row-action', 'designer-field-card__llm-prompt-button');
    expect(promptButton.nextElementSibling).toBe(promptCopyButton);
    expect(promptIcon).not.toBeNull();
    expect(promptIcon).toHaveAttribute('src', starIcon);
    fireEvent.click(promptButton);
    await waitFor(() => expect(onTestLlmPrompt).toHaveBeenCalledWith(expect.objectContaining({ key: 'title' })));

    const noteCard = screen.getByRole('button', { name: '选择 备注' });
    expect(noteCard).not.toHaveClass('designer-field-card--has-llm-prompt');
    expect(within(noteCard).queryByRole('button', { name: '测试 备注 LLM 提示' })).toBeNull();
  });

  it('点击画布卡片内容区域即可切换右侧属性配置', async () => {
    const user = userEvent.setup();

    render(<TemplateDesignerPage />);
    await openNewTemplate(user);

    addDesignerField('text');
    addDesignerField('textarea');
    expect(screen.getByRole('heading', { name: '属性配置' })).toBeInTheDocument();
    expect(screen.queryByText('属性配置 · textarea_2')).not.toBeInTheDocument();

    const textCard = screen.getByRole('button', { name: '选择 单行输入' });
    await user.click(within(textCard).getByText((_, node) => node?.textContent === '字段名：text_1'));

    expect(screen.getByRole('heading', { name: '属性配置' })).toBeInTheDocument();
    expect(screen.queryByText('属性配置 · text_1')).not.toBeInTheDocument();
  });

  it('左侧物料拖入已有字段时渲染不挤动布局的插入线', () => {
    const schema = createLabelHubSchema({
      schemaVersion: 'draft',
      datasetKind: 'generic_json',
      fields: [
        { key: 'text_1', fieldKey: 'text_1', type: 'text', label: '单行输入' },
        { key: 'textarea_2', fieldKey: 'textarea_2', type: 'textarea', label: '多行文本' },
      ],
    });
    const { container } = render(
      <DesignerCanvas
        schema={schema}
        selectedFieldKey={null}
        materialDropPreview={{ target: { kind: 'root', beforeFieldKey: 'textarea_2' }, type: 'checkbox' }}
        onSelectField={() => undefined}
        onDuplicateField={() => undefined}
        onRemoveField={() => undefined}
      />,
    );

    expect(
      Array.from(container.querySelectorAll('.designer-canvas__fields > .designer-field-card .designer-field-card__type-label')).map(
        (node) => node.textContent,
      ),
    ).toEqual(['单行输入', '多行文本']);
    const preview = container.querySelector('.designer-drop-insertion-marker');

    expect(preview).not.toBeNull();
    expect(preview).toHaveClass('designer-drop-insertion-marker--before');
    expect(container.querySelector('.designer-canvas__fields > .designer-drop-insertion-marker')).toBeNull();
    expect(preview?.closest('.designer-field-card')?.getAttribute('data-designer-field-key')).toBe('textarea_2');
    expect(preview).toHaveTextContent('松手添加 多选');
  });

  it('上传文件解析模板时才显示画布上方空白横栏', () => {
    const schema = createLabelHubSchema({
      schemaVersion: 'draft',
      datasetKind: 'generic_json',
      fields: [
        { key: 'text_1', fieldKey: 'text_1', type: 'text', label: '单行输入' },
      ],
    });
    const canvasProps = {
      schema,
      selectedFieldKey: null,
      onSelectField: () => undefined,
      onDuplicateField: () => undefined,
      onRemoveField: () => undefined,
    };
    const { container, rerender } = render(<DesignerCanvas {...canvasProps} />);

    expect(container.querySelector('.designer-canvas__toolbar')).toBeNull();

    rerender(<DesignerCanvas {...canvasProps} previewRecordCount={1} />);

    const uploadedFileToolbar = container.querySelector('.designer-canvas__toolbar');
    expect(uploadedFileToolbar).not.toBeNull();
    expect(uploadedFileToolbar).toHaveAttribute('aria-label', '上传文件操作栏');
  });

  it('拖拽新物料时暂停画布位移动画，避免现有物料乱跳', () => {
    const schema = createLabelHubSchema({
      schemaVersion: 'draft',
      datasetKind: 'generic_json',
      fields: [
        { key: 'text_1', fieldKey: 'text_1', type: 'text', label: '单行输入' },
        { key: 'textarea_2', fieldKey: 'textarea_2', type: 'textarea', label: '多行文本' },
      ],
    });
    const rectTopByFieldKey = new Map([
      ['text_1', 100],
      ['textarea_2', 180],
    ]);
    const animation = { cancel: vi.fn(), finished: Promise.resolve() } as unknown as Animation;
    const originalAnimate = HTMLElement.prototype.animate;
    const animateMock = vi.fn(() => animation);
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: animateMock,
    });
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const fieldKey = this.dataset.designerFieldKey;

      if (fieldKey) {
        return createDomRect({ top: rectTopByFieldKey.get(fieldKey) ?? 0, height: 64 });
      }

      return createDomRect({ top: 0, height: 480, width: 420 });
    });

    try {
      const canvasProps = {
        schema,
        selectedFieldKey: null,
        onSelectField: () => undefined,
        onDuplicateField: () => undefined,
        onRemoveField: () => undefined,
      };
      const { rerender } = render(<DesignerCanvas {...canvasProps} />);

      expect(animateMock).not.toHaveBeenCalled();
      rectTopByFieldKey.set('text_1', 88);
      rectTopByFieldKey.set('textarea_2', 168);

      rerender(
        <DesignerCanvas
          {...canvasProps}
          isDropHighlighted
          materialDropPreview={{ target: { kind: 'root', beforeFieldKey: 'textarea_2' }, type: 'checkbox' }}
        />,
      );

      expect(animateMock).not.toHaveBeenCalled();

      const schemaAfterDrop = createLabelHubSchema({
        schemaVersion: 'draft',
        datasetKind: 'generic_json',
        fields: [
          { key: 'text_1', fieldKey: 'text_1', type: 'text', label: '单行输入' },
          { key: 'radio_3', fieldKey: 'radio_3', type: 'radio', label: '单选' },
          { key: 'textarea_2', fieldKey: 'textarea_2', type: 'textarea', label: '多行文本' },
        ],
      });
      rectTopByFieldKey.set('text_1', 88);
      rectTopByFieldKey.set('radio_3', 168);
      rectTopByFieldKey.set('textarea_2', 244);

      rerender(
        <DesignerCanvas
          {...canvasProps}
          schema={schemaAfterDrop}
          committingFieldKey={null}
          materialDropPreview={null}
        />,
      );
      expect(animateMock).not.toHaveBeenCalled();

      rerender(
        <DesignerCanvas
          {...canvasProps}
          schema={schemaAfterDrop}
          committingFieldKey={null}
          isMaterialDropSettling
          materialDropPreview={null}
        />,
      );
      expect(animateMock).not.toHaveBeenCalled();

      rerender(
        <DesignerCanvas
          {...canvasProps}
          schema={schemaAfterDrop}
          committingFieldKey="radio_3"
          isMaterialDropSettling
          materialDropPreview={null}
        />,
      );
      expect(animateMock).not.toHaveBeenCalled();

      rerender(
        <DesignerCanvas
          {...canvasProps}
          schema={schemaAfterDrop}
          committingFieldKey={null}
          isMaterialDropSettling={false}
          materialDropPreview={null}
        />,
      );
      expect(animateMock).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'animate', {
        configurable: true,
        value: originalAnimate,
      });
      rectSpy.mockRestore();
    }
  });

  it('画布中分组容器和多 Tab 布局以真实容器展示并支持容器内占位', async () => {
    const user = userEvent.setup();
    const schema = createLabelHubSchema({
      schemaVersion: 'draft',
      datasetKind: 'generic_json',
      fields: [
        {
          key: 'group_1',
          type: 'group',
          label: '基础信息',
          fields: [
            { key: 'text_1', fieldKey: 'text_1', type: 'text', label: '标题字段' },
          ],
        },
        {
          key: 'tabs_1',
          type: 'tabs',
          label: '分步标注',
          layout: 'three_columns',
          tabs: [
            {
              key: 'tab_1',
              label: '题目信息',
              fields: [
                { key: 'textarea_1', fieldKey: 'textarea_1', type: 'textarea', label: '题干' },
                { key: 'text_2', fieldKey: 'text_2', type: 'text', label: '补充说明' },
                { key: 'text_3', fieldKey: 'text_3', type: 'text', label: '参考信息' },
              ],
            },
            { key: 'tab_2', label: '标注结果', fields: [] },
          ],
        },
      ],
    });
    const onActiveTabChange = vi.fn();
    const canvasProps = {
      schema,
      selectedFieldKey: null,
      onActiveTabChange,
      onSelectField: () => undefined,
      onDuplicateField: () => undefined,
      onRemoveField: () => undefined,
    };
    const { rerender } = render(
      <DesignerCanvas
        {...canvasProps}
        activeTabByFieldKey={{ tabs_1: 'tab_1' }}
      />,
    );

    expect(screen.getByText('分组容器 - 基础信息')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '选择 标题字段' })).toBeInTheDocument();
    expect(screen.getByText('多 Tab 布局 - 分步标注')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '题目信息' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: '选择 题干' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '选择 补充说明' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '选择 参考信息' })).toBeInTheDocument();
    expect(document.querySelector('.designer-field-card__tab-panel--auto_rows')).not.toBeNull();
    expect(document.querySelector('.designer-field-card__tab-row--3')).not.toBeNull();
    expect(screen.queryByText('拖入字段到当前 Tab')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: '标注结果' }));
    expect(onActiveTabChange).toHaveBeenLastCalledWith('tabs_1', 'tab_2');

    rerender(
      <DesignerCanvas
        {...canvasProps}
        activeTabByFieldKey={{ tabs_1: 'tab_2' }}
      />,
    );

    expect(screen.queryByRole('button', { name: '选择 题干' })).not.toBeInTheDocument();
    expect(screen.getByText('拖入字段到当前 Tab')).toBeInTheDocument();
  });

  it('多 Tab 自动行布局按物料数量自适应为一列、两列和三列', () => {
    const schema = createLabelHubSchema({
      schemaVersion: 'draft',
      datasetKind: 'generic_json',
      fields: [
        {
          key: 'tabs_1',
          type: 'tabs',
          label: '自动布局',
          layout: 'auto_rows',
          tabs: [
            {
              key: 'tab_1',
              label: '题目信息',
              fields: [
                { key: 'text_1', fieldKey: 'text_1', type: 'text', label: '字段一' },
                { key: 'text_2', fieldKey: 'text_2', type: 'text', label: '字段二' },
                { key: 'text_3', fieldKey: 'text_3', type: 'text', label: '字段三' },
                { key: 'text_4', fieldKey: 'text_4', type: 'text', label: '字段四' },
              ],
            },
          ],
        },
      ],
    });

    render(
      <DesignerCanvas
        schema={schema}
        selectedFieldKey={null}
        activeTabByFieldKey={{ tabs_1: 'tab_1' }}
        onSelectField={() => undefined}
        onDuplicateField={() => undefined}
        onRemoveField={() => undefined}
      />,
    );

    expect(document.querySelector('.designer-field-card__tab-panel--auto_rows')).not.toBeNull();
    expect(document.querySelectorAll('.designer-field-card__tab-row')).toHaveLength(2);
    expect(document.querySelector('.designer-field-card__tab-row--3')).not.toBeNull();
    expect(document.querySelector('.designer-field-card__tab-row--1')).not.toBeNull();
  });

  it('画布能在 group 和当前 Tab 内渲染物料拖入预览', () => {
    const schema = createLabelHubSchema({
      schemaVersion: 'draft',
      datasetKind: 'generic_json',
      fields: [
        { key: 'group_1', type: 'group', label: '基础信息', fields: [] },
        {
          key: 'tabs_1',
          type: 'tabs',
          label: '分步标注',
          tabs: [{ key: 'tab_1', label: '标注结果', fields: [] }],
        },
      ],
    });
    const canvasProps = {
      schema,
      selectedFieldKey: null,
      onSelectField: () => undefined,
      onDuplicateField: () => undefined,
      onRemoveField: () => undefined,
    };
    const { container, rerender } = render(
      <DesignerCanvas
        {...canvasProps}
        materialDropPreview={{ target: { kind: 'group', groupKey: 'group_1' }, type: 'text' }}
      />,
    );

    const groupPreview = container.querySelector('.designer-drop-insertion-marker');
    expect(groupPreview).not.toBeNull();
    expect(groupPreview).toHaveClass('designer-drop-insertion-marker--append');
    expect(screen.getByText('拖入字段到此分组')).toBeInTheDocument();

    rerender(
      <DesignerCanvas
        {...canvasProps}
        activeTabByFieldKey={{ tabs_1: 'tab_1' }}
        materialDropPreview={{
          target: { kind: 'tab', tabsKey: 'tabs_1', tabKey: 'tab_1' },
          type: 'checkbox',
        }}
      />,
    );

    const tabPreview = container.querySelector('.designer-drop-insertion-marker');
    expect(tabPreview).not.toBeNull();
    expect(tabPreview).toHaveClass('designer-drop-insertion-marker--append');
    expect(screen.getByText('拖入字段到当前 Tab')).toBeInTheDocument();
  });

  it('拖拽物料到根画布字段间隙时能解析为下一字段前插入', () => {
    const originalElementsFromPoint = document.elementsFromPoint;
    const root = document.createElement('div');
    const firstField = document.createElement('article');
    const secondField = document.createElement('article');

    root.dataset.designerDropTargetKind = 'root';
    firstField.className = 'designer-field-card';
    secondField.className = 'designer-field-card';
    firstField.dataset.designerFieldKey = 'text_1';
    secondField.dataset.designerFieldKey = 'textarea_2';
    root.append(firstField, secondField);
    document.body.append(root);

    vi.spyOn(firstField, 'getBoundingClientRect').mockReturnValue(createDomRect({ top: 0, height: 60 }));
    vi.spyOn(secondField, 'getBoundingClientRect').mockReturnValue(createDomRect({ top: 92, height: 60 }));
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(createDomRect({ top: 0, height: 160 }));
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: vi.fn(() => [root]),
    });

    try {
      expect(resolveDesignerDropTargetAtPoint({ x: 24, y: 78 })?.target).toEqual({
        kind: 'root',
        beforeFieldKey: 'textarea_2',
      });
    } finally {
      Object.defineProperty(document, 'elementsFromPoint', {
        configurable: true,
        value: originalElementsFromPoint,
      });
      root.remove();
    }
  });

  it('拖拽物料到根画布靠下字段右半区时仍按上下位置插入', () => {
    const originalElementsFromPoint = document.elementsFromPoint;
    const root = document.createElement('div');
    const firstField = document.createElement('article');
    const secondField = document.createElement('article');

    root.dataset.designerDropTargetKind = 'root';
    firstField.className = 'designer-field-card';
    secondField.className = 'designer-field-card';
    firstField.dataset.designerFieldKey = 'text_1';
    secondField.dataset.designerFieldKey = 'textarea_2';
    root.append(firstField, secondField);
    document.body.append(root);

    vi.spyOn(firstField, 'getBoundingClientRect').mockReturnValue(createDomRect({ top: 0, height: 60 }));
    vi.spyOn(secondField, 'getBoundingClientRect').mockReturnValue(createDomRect({ top: 92, height: 60 }));
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(createDomRect({ top: 0, height: 160 }));
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: vi.fn(() => [root]),
    });

    try {
      expect(resolveDesignerDropTargetAtPoint({ x: 330, y: 104 })?.target).toEqual({
        kind: 'root',
        beforeFieldKey: 'textarea_2',
      });
    } finally {
      Object.defineProperty(document, 'elementsFromPoint', {
        configurable: true,
        value: originalElementsFromPoint,
      });
      root.remove();
    }
  });

  it('拖拽物料到根画布字段下半区时解析为插到下一项前或末尾追加', () => {
    const originalElementsFromPoint = document.elementsFromPoint;
    const root = document.createElement('div');
    const firstField = document.createElement('article');
    const secondField = document.createElement('article');

    root.dataset.designerDropTargetKind = 'root';
    firstField.className = 'designer-field-card';
    secondField.className = 'designer-field-card';
    firstField.dataset.designerFieldKey = 'text_1';
    secondField.dataset.designerFieldKey = 'textarea_2';
    root.append(firstField, secondField);
    document.body.append(root);

    vi.spyOn(firstField, 'getBoundingClientRect').mockReturnValue(createDomRect({ top: 0, height: 60 }));
    vi.spyOn(secondField, 'getBoundingClientRect').mockReturnValue(createDomRect({ top: 92, height: 60 }));
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(createDomRect({ top: 0, height: 160 }));
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: vi.fn(() => [root]),
    });

    try {
      expect(resolveDesignerDropTargetAtPoint({ x: 180, y: 50 })?.target).toEqual({
        kind: 'root',
        beforeFieldKey: 'textarea_2',
      });
      expect(resolveDesignerDropTargetAtPoint({ x: 180, y: 142 })?.target).toEqual({
        kind: 'root',
      });
    } finally {
      Object.defineProperty(document, 'elementsFromPoint', {
        configurable: true,
        value: originalElementsFromPoint,
      });
      root.remove();
    }
  });

  it('拖拽物料时真实指针命中优先于 dnd-kit 旧 overId 目标', () => {
    expect(
      resolveDesignerDropTargetForProjection({
        overTarget: { kind: 'root', beforeFieldKey: 'text_12' },
        pointTarget: { kind: 'root', beforeFieldKey: 'text_13' },
      }),
    ).toEqual({ kind: 'root', beforeFieldKey: 'text_13' });
  });

  it('拖拽物料到画布底部空白区时仍解析为根画布追加', () => {
    const originalElementsFromPoint = document.elementsFromPoint;
    const canvas = document.createElement('div');

    canvas.className = 'designer-canvas';
    canvas.dataset.designerDropTargetKind = 'root';
    document.body.append(canvas);

    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(createDomRect({ top: 0, height: 420 }));
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: vi.fn(() => [canvas]),
    });

    try {
      expect(resolveDesignerDropTargetAtPoint({ x: 24, y: 360 })?.target).toEqual({
        kind: 'root',
      });
    } finally {
      Object.defineProperty(document, 'elementsFromPoint', {
        configurable: true,
        value: originalElementsFromPoint,
      });
      canvas.remove();
    }
  });

  it('拖拽物料到 group 内字段间隙时不再被容器追加目标吞掉', () => {
    const originalElementsFromPoint = document.elementsFromPoint;
    const groupShell = document.createElement('section');
    const firstField = document.createElement('article');
    const secondField = document.createElement('article');

    groupShell.dataset.designerDropTargetKind = 'group';
    groupShell.dataset.designerGroupKey = 'group_1';
    firstField.className = 'designer-field-card';
    secondField.className = 'designer-field-card';
    firstField.dataset.designerFieldKey = 'text_1';
    secondField.dataset.designerFieldKey = 'textarea_2';
    groupShell.append(firstField, secondField);
    document.body.append(groupShell);

    vi.spyOn(firstField, 'getBoundingClientRect').mockReturnValue(createDomRect({ top: 10, height: 56 }));
    vi.spyOn(secondField, 'getBoundingClientRect').mockReturnValue(createDomRect({ top: 86, height: 56 }));
    vi.spyOn(groupShell, 'getBoundingClientRect').mockReturnValue(createDomRect({ top: 0, height: 156 }));
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: vi.fn(() => [groupShell]),
    });

    try {
      expect(resolveDesignerDropTargetAtPoint({ x: 24, y: 74 })?.target).toEqual({
        kind: 'group',
        groupKey: 'group_1',
        beforeFieldKey: 'textarea_2',
      });
    } finally {
      Object.defineProperty(document, 'elementsFromPoint', {
        configurable: true,
        value: originalElementsFromPoint,
      });
      groupShell.remove();
    }
  });

  it('模板名称使用标题式内联编辑并支持 Enter 提交和 Esc 取消', async () => {
    const user = userEvent.setup();
    const schema = createLabelHubSchema({
      schemaVersion: 'draft',
      datasetKind: 'generic_json',
      fields: [],
    });

    const TemplateNameHarness = () => {
      const [name, setName] = useState('初始模板');

      return (
        <DesignerCanvas
          schema={schema}
          templateName={name}
          selectedFieldKey={null}
          onTemplateNameChange={setName}
          onSelectField={() => undefined}
          onDuplicateField={() => undefined}
          onRemoveField={() => undefined}
        />
      );
    };

    render(<TemplateNameHarness />);

    const canvas = screen.getByRole('main', { name: '模板编辑区域' });
    const editButton = within(canvas).getByRole('button', { name: '编辑模板名称' });
    expect(editButton).toHaveTextContent('初始模板');
    expect(editButton.querySelector('.designer-canvas__template-name-icon')).not.toBeNull();
    expect(within(canvas).queryByRole('textbox', { name: '模板名称' })).not.toBeInTheDocument();

    await user.click(editButton);
    const input = within(canvas).getByRole('textbox', { name: '模板名称' });
    expect(input).toHaveValue('初始模板');
    await user.clear(input);
    await user.type(input, '确认后的模板');
    await user.keyboard('{Enter}');
    expect(within(canvas).queryByRole('textbox', { name: '模板名称' })).not.toBeInTheDocument();
    expect(within(canvas).getByRole('button', { name: '编辑模板名称' })).toHaveTextContent('确认后的模板');

    await user.click(within(canvas).getByRole('button', { name: '编辑模板名称' }));
    const cancelInput = within(canvas).getByRole('textbox', { name: '模板名称' });
    await user.clear(cancelInput);
    await user.type(cancelInput, '不应保存的模板名');
    await user.keyboard('{Escape}');
    expect(within(canvas).queryByRole('textbox', { name: '模板名称' })).not.toBeInTheDocument();
    expect(within(canvas).getByRole('button', { name: '编辑模板名称' })).toHaveTextContent('确认后的模板');
  });

  it('物料移出画布时占位先播放收起动画再移除', () => {
    vi.useFakeTimers();

    const schema = createLabelHubSchema({
      schemaVersion: 'draft',
      datasetKind: 'generic_json',
      fields: [
        { key: 'text_1', fieldKey: 'text_1', type: 'text', label: '单行输入' },
        { key: 'textarea_2', fieldKey: 'textarea_2', type: 'textarea', label: '多行文本' },
      ],
    });
    const canvasProps = {
      schema,
      selectedFieldKey: null,
      onSelectField: () => undefined,
      onDuplicateField: () => undefined,
      onRemoveField: () => undefined,
    };
    const { container, rerender } = render(
      <DesignerCanvas
        {...canvasProps}
        materialDropPreview={{ target: { kind: 'root', beforeFieldKey: 'textarea_2' }, type: 'checkbox' }}
      />,
    );

    expect(container.querySelector('.designer-drop-insertion-marker')).not.toBeNull();

    rerender(<DesignerCanvas {...canvasProps} materialDropPreview={null} />);

    expect(container.querySelector('.designer-drop-insertion-marker.is-exiting')).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(359);
    });
    expect(container.querySelector('.designer-drop-insertion-marker.is-exiting')).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(container.querySelector('.designer-drop-insertion-marker')).toBeNull();
  });

  it('画布高亮只由指针进入画布的状态控制', () => {
    const schema = createLabelHubSchema({
      schemaVersion: 'draft',
      datasetKind: 'generic_json',
      fields: [],
    });
    const { rerender } = render(
      <DesignerCanvas
        schema={schema}
        selectedFieldKey={null}
        isDropHighlighted={false}
        onSelectField={() => undefined}
        onDuplicateField={() => undefined}
        onRemoveField={() => undefined}
      />,
    );

    expect(screen.getByRole('main', { name: '模板编辑区域' })).not.toHaveClass('is-over');

    rerender(
      <DesignerCanvas
        schema={schema}
        selectedFieldKey={null}
        isDropHighlighted
        onSelectField={() => undefined}
        onDuplicateField={() => undefined}
        onRemoveField={() => undefined}
      />,
    );

    expect(screen.getByRole('main', { name: '模板编辑区域' })).toHaveClass('is-over');
  });

  it('拖拽物料浮层保留左侧拖拽按钮位置，避免光标和浮层错位', () => {
    const textMaterial = DESIGNER_MATERIALS.find((material) => material.type === 'text');
    expect(textMaterial).toBeDefined();

    render(<MaterialDragOverlay material={textMaterial!} isExpanded={false} expandedWidth={null} />);

    const overlay = document.querySelector('.designer-material-drag-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay?.querySelector('.designer-material-drag-overlay__handle')).not.toBeNull();
    expect(overlay?.querySelectorAll('.designer-material__handle-dot')).toHaveLength(6);
    expect(overlay?.querySelector('.designer-material-drag-overlay__body')).toHaveTextContent('单行输入');
  });

  it('拖拽物料松手后新增字段先播放落位过渡动画', () => {
    const schema = createLabelHubSchema({
      schemaVersion: 'draft',
      datasetKind: 'generic_json',
      fields: [
        { key: 'checkbox_3', fieldKey: 'checkbox_3', type: 'checkbox', label: '多选' },
      ],
    });
    render(
      <DesignerCanvas
        schema={schema}
        selectedFieldKey="checkbox_3"
        committingFieldKey="checkbox_3"
        onSelectField={() => undefined}
        onDuplicateField={() => undefined}
        onRemoveField={() => undefined}
      />,
    );

    expect(screen.getByRole('button', { name: '选择 多选' })).toHaveClass('is-drop-committing');
  });

  it('点击画布删除按钮后先播放收起动画再移除字段', () => {
    vi.useFakeTimers();

    const schema = createLabelHubSchema({
      schemaVersion: 'draft',
      datasetKind: 'generic_json',
      fields: [
        { key: 'text_1', fieldKey: 'text_1', type: 'text', label: '单行输入' },
      ],
    });
    const onRemoveField = vi.fn();

    render(
      <DesignerCanvas
        schema={schema}
        selectedFieldKey={null}
        onSelectField={() => undefined}
        onDuplicateField={() => undefined}
        onRemoveField={onRemoveField}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '删除 单行输入' }));

    expect(screen.getByRole('button', { name: '选择 单行输入' })).toHaveClass('is-removing');
    expect(onRemoveField).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(319);
    });
    expect(onRemoveField).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onRemoveField).toHaveBeenCalledWith('text_1');
  });

  it('删除字段后剩余画布卡片使用 transform 过渡到新位置', () => {
    vi.useFakeTimers();

    const layoutRects = new Map([
      ['text_1', createDomRect({ top: 0, height: 72 })],
      ['textarea_2', createDomRect({ top: 82, height: 72 })],
    ]);
    const animateMock = vi.fn(function (
      this: HTMLElement,
      keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
      options?: number | KeyframeAnimationOptions,
    ) {
      void keyframes;
      void options;

      return {
        cancel: vi.fn(),
        finished: Promise.resolve(),
      } as unknown as Animation;
    });
    const originalAnimate = HTMLElement.prototype.animate;

    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: animateMock,
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const fieldKey = this.getAttribute('data-designer-field-key');
      return fieldKey && layoutRects.has(fieldKey)
        ? layoutRects.get(fieldKey)!
        : createDomRect({ top: 0, height: 72 });
    });

    const schema = createLabelHubSchema({
      schemaVersion: 'draft',
      datasetKind: 'generic_json',
      fields: [
        { key: 'text_1', fieldKey: 'text_1', type: 'text', label: '单行输入' },
        { key: 'textarea_2', fieldKey: 'textarea_2', type: 'textarea', label: '多行文本' },
      ],
    });
    const onRemoveField = vi.fn();
    const StatefulCanvas = () => {
      const [currentSchema, setCurrentSchema] = useState(schema);

      return (
        <DesignerCanvas
          schema={currentSchema}
          selectedFieldKey={null}
          onSelectField={() => undefined}
          onDuplicateField={() => undefined}
          onRemoveField={(fieldKey) => {
            onRemoveField(fieldKey);
            setCurrentSchema(
              createLabelHubSchema({
                schemaVersion: 'draft',
                datasetKind: 'generic_json',
                fields: currentSchema.fields.filter((field) => field.key !== fieldKey),
              }),
            );
          }}
        />
      );
    };

    try {
      render(<StatefulCanvas />);

      fireEvent.click(screen.getByRole('button', { name: '删除 单行输入' }));
      layoutRects.set('textarea_2', createDomRect({ top: 0, height: 72 }));

      act(() => {
        vi.advanceTimersByTime(320);
      });

      expect(animateMock).toHaveBeenCalledWith(
        [{ transform: 'translate(0px, 82px)' }, { transform: 'translate(0, 0)' }],
        expect.objectContaining({
          duration: 360,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        }),
      );
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'animate', {
        configurable: true,
        value: originalAnimate,
      });
    }
  });

  it('选择字段时不会把抽屉入场动画留下的横向坐标变化误判为卡片位移', () => {
    const layoutRects = new Map([
      ['text_1', createDomRect({ left: 44, top: 0, height: 72 })],
      ['textarea_2', createDomRect({ left: 44, top: 82, height: 72 })],
    ]);
    const animateMock = vi.fn(function (
      this: HTMLElement,
      keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
      options?: number | KeyframeAnimationOptions,
    ) {
      void keyframes;
      void options;

      return {
        cancel: vi.fn(),
        finished: Promise.resolve(),
      } as unknown as Animation;
    });
    const originalAnimate = HTMLElement.prototype.animate;

    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: animateMock,
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const fieldKey = this.getAttribute('data-designer-field-key');
      return fieldKey && layoutRects.has(fieldKey)
        ? layoutRects.get(fieldKey)!
        : createDomRect({ top: 0, height: 72 });
    });

    const schema = createLabelHubSchema({
      schemaVersion: 'draft',
      datasetKind: 'generic_json',
      fields: [
        { key: 'text_1', fieldKey: 'text_1', type: 'text', label: '单行输入' },
        { key: 'textarea_2', fieldKey: 'textarea_2', type: 'textarea', label: '多行文本' },
      ],
    });
    const StatefulCanvas = () => {
      const [selectedFieldKey, setSelectedFieldKey] = useState<string | null>(null);

      return (
        <DesignerCanvas
          schema={schema}
          selectedFieldKey={selectedFieldKey}
          onSelectField={setSelectedFieldKey}
          onDuplicateField={() => undefined}
          onRemoveField={() => undefined}
        />
      );
    };

    try {
      render(<StatefulCanvas />);

      layoutRects.set('text_1', createDomRect({ left: 0, top: 0, height: 72 }));
      layoutRects.set('textarea_2', createDomRect({ left: 0, top: 82, height: 72 }));
      fireEvent.click(screen.getByRole('button', { name: '选择 单行输入' }));

      expect(animateMock).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'animate', {
        configurable: true,
        value: originalAnimate,
      });
    }
  });

  it('编辑字段属性时不触发画布卡片位移动画，避免输入抖动', () => {
    const layoutRects = new Map([
      ['text_1', createDomRect({ top: 0, height: 72 })],
      ['textarea_2', createDomRect({ top: 82, height: 72 })],
    ]);
    const animateMock = vi.fn(function (
      this: HTMLElement,
      keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
      options?: number | KeyframeAnimationOptions,
    ) {
      void keyframes;
      void options;

      return {
        cancel: vi.fn(),
        finished: Promise.resolve(),
      } as unknown as Animation;
    });
    const originalAnimate = HTMLElement.prototype.animate;

    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: animateMock,
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const fieldKey = this.getAttribute('data-designer-field-key');
      return fieldKey && layoutRects.has(fieldKey)
        ? layoutRects.get(fieldKey)!
        : createDomRect({ top: 0, height: 72 });
    });

    const schema = createLabelHubSchema({
      schemaVersion: 'draft',
      datasetKind: 'generic_json',
      fields: [
        { key: 'text_1', fieldKey: 'text_1', type: 'text', label: '单行输入' },
        { key: 'textarea_2', fieldKey: 'textarea_2', type: 'textarea', label: '多行文本' },
      ],
    });
    const { rerender } = render(
      <DesignerCanvas
        schema={schema}
        selectedFieldKey="text_1"
        onSelectField={() => undefined}
        onDuplicateField={() => undefined}
        onRemoveField={() => undefined}
      />,
    );

    try {
      layoutRects.set('textarea_2', createDomRect({ top: 116, height: 72 }));
      rerender(
        <DesignerCanvas
          schema={{
            ...schema,
            fields: [
              { ...schema.fields[0]!, label: '单行输入正在编辑一个更长的标题' },
              schema.fields[1]!,
            ],
          }}
          selectedFieldKey="text_1"
          onSelectField={() => undefined}
          onDuplicateField={() => undefined}
          onRemoveField={() => undefined}
        />,
      );

      expect(animateMock).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'animate', {
        configurable: true,
        value: originalAnimate,
      });
    }
  });

  it('单选和多选字段不预置选项，并通过气泡添加自定义选项', async () => {
    const user = userEvent.setup();

    render(<TemplateDesignerPage />);
    await openNewTemplate(user);

    addDesignerField('radio');

    expect(screen.queryByText('选项 A')).not.toBeInTheDocument();
    expect(screen.queryByText('选项 B')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(/选项 A/)).not.toBeInTheDocument();

    const properties = screen.getByRole('complementary', { name: '属性配置' });
    await user.click(within(properties).getByRole('button', { name: '新增选项' }));
    await user.type(within(properties).getByLabelText('新选项'), '通过{Enter}');

    const canvas = screen.getByRole('main', { name: '模板编辑区域' });
    expect(within(canvas).getByText('通过')).toBeInTheDocument();

    addDesignerField('checkbox');
    expect(screen.queryByText('选项 A')).not.toBeInTheDocument();
    await user.click(within(properties).getByRole('button', { name: '新增选项' }));
    await user.type(within(properties).getByLabelText('新选项'), '风险{Enter}');

    expect(within(canvas).getByText('风险')).toBeInTheDocument();
    const optionLabels = useTemplateDesignerStore
      .getState()
      .schema.fields.flatMap((field) => field.options?.map((option) => option.label) ?? []);
    expect(optionLabels).toContain('通过');
    expect(optionLabels).toContain('风险');
    expect(optionLabels).not.toContain('选项 A');
  });

  it('能配置上传字段的数量、大小和允许类型', async () => {
    const user = userEvent.setup();

    render(<TemplateDesignerPage />);
    await openNewTemplate(user);

    addDesignerField('image_upload');

    await user.clear(screen.getByLabelText('文件数量'));
    await user.type(screen.getByLabelText('文件数量'), '2');
    await user.clear(screen.getByLabelText('大小上限 MB'));
    await user.type(screen.getByLabelText('大小上限 MB'), '8');
    fireEvent.change(screen.getByLabelText('允许类型'), {
      target: { value: 'image/png\nimage/jpeg' },
    });

    expect(findDesignerField('image_upload_1')?.fileConstraints).toMatchObject({
      maxFiles: 2,
      maxSizeMb: 8,
      acceptedMimeTypes: ['image/png', 'image/jpeg'],
    });
  });

  it('点击模板配置抽屉外侧先确认是否保存草稿，确认保存后自动收起抽屉', async () => {
    const user = userEvent.setup();
    const savedDraftSchema = createLabelHubSchema({
      schemaVersion: 'draft',
      datasetKind: 'generic_json',
      fields: [
        {
          key: 'text_1',
          type: 'text',
          label: '单行输入',
        },
      ],
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: createTemplateDto({
            id: 'template_draft_keep_open',
            name: '单行输入',
            schema: savedDraftSchema,
            status: 'DRAFT',
          }),
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    render(<TemplateDesignerPage />);
    await openNewTemplate(user);
    addDesignerField('text');

    expect(screen.queryByRole('button', { name: '保存草稿' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '关闭模板配置' })).not.toBeInTheDocument();

    await user.click(screen.getByTestId('template-designer-backdrop'));

    expect(screen.getByText('需要保存成草稿吗？')).toBeInTheDocument();
    expect(screen.getByText('当前修改尚未发布，关闭后将丢失未保存内容')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('草稿已保存')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '模板配置' })).toBeInTheDocument();
    await waitFor(() =>
      expect(document.querySelector('.template-designer-drawer-shell')).toHaveClass('is-closing'),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: '模板配置' })).not.toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/templates',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"name":"单行输入"'),
      }),
    );
  });

  it('点击模板配置抽屉外侧时展示保存草稿确认弹窗', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse({ data: [] })));

    render(<TemplateDesignerPage />);
    await openNewTemplate(user);

    await user.click(screen.getByTestId('template-designer-backdrop'));

    expect(screen.getByText('需要保存成草稿吗？')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '关闭保存草稿确认弹窗' }));
    await waitFor(() => expect(screen.queryByText('需要保存成草稿吗？')).not.toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: '模板配置' })).toBeInTheDocument();
  });

  it('保存草稿并发布版本时调用模板 API', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            id: 'template_1',
            name: '客服问答质量模板',
            description: null,
            datasetKind: 'qa_quality',
            schemaVersion: '1.0.0',
            schema: qaQualitySampleSchema,
            status: 'DRAFT',
            version: 0,
            parentTemplateId: null,
            createdById: null,
            publishedAt: null,
            createdAt: '2026-05-21T00:00:00.000Z',
            updatedAt: '2026-05-21T00:00:00.000Z',
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            template: {
              id: 'template_1',
              name: '客服问答质量模板',
              description: null,
              datasetKind: 'qa_quality',
              schemaVersion: 'v1',
              schema: { ...qaQualitySampleSchema, schemaVersion: 'v1' },
              status: 'PUBLISHED',
              version: 1,
              parentTemplateId: null,
              createdById: null,
              publishedAt: '2026-05-21T00:00:00.000Z',
              createdAt: '2026-05-21T00:00:00.000Z',
              updatedAt: '2026-05-21T00:00:00.000Z',
            },
            compatibilityReport: {
              addedFieldKeys: [],
              removedFieldKeys: [],
              changedFieldTypes: [],
              compatible: true,
              riskMessages: [],
            },
          },
        }),
      );

    vi.stubGlobal('fetch', fetchMock);

    render(<TemplateDesignerPage />);
    await openNewTemplate(user);
    addDesignerField('text');

    await user.click(screen.getByRole('button', { name: '编辑模板名称' }));
    const templateNameInput = screen.getByRole('textbox', { name: '模板名称' });
    expect(templateNameInput).toHaveValue('单行输入');
    await user.clear(templateNameInput);
    await user.type(templateNameInput, '客服问答质量模板');
    await user.click(screen.getByRole('button', { name: '保存并发布版本 v1' }));

    expect(await screen.findByText('"客服问答质量模板" 模版已发布为v1')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/templates',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/templates',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"actorId":"user_owner_zhang_man"'),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/templates',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"name":"客服问答质量模板"'),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/templates/template_1/publish',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ versionName: 'v1', actorId: 'user_owner_zhang_man' }),
      }),
    );
  });

  it('模板正在被任务使用时，点击发布会提示另存为新模板且不调用发布接口', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = input.toString();
      const method = init?.method ?? 'GET';

      if (path === '/templates' && method === 'GET') {
        return jsonResponse({
          data: [
            createTemplateDto({
              id: 'template_locked',
              name: '锁定模板',
              schema: qaQualitySampleSchema,
              status: 'PUBLISHED',
              version: 1,
              rootTemplateId: 'template_locked',
              createdById: 'user_owner_zhang_man',
              activeUsageCount: 1,
            }),
          ],
        });
      }

      if (path === '/templates' && method === 'POST') {
        return jsonResponse({
          data: createTemplateDto({
            id: 'template_new',
            name: '锁定模板 - 新模板',
            schema: qaQualitySampleSchema,
            status: 'DRAFT',
            version: 0,
            createdById: 'user_owner_zhang_man',
          }),
        });
      }

      throw new Error(`Unexpected request: ${method} ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<TemplateDesignerPage />);
    await openTemplateByName(user, '锁定模板');
    await user.click(screen.getByRole('button', { name: '保存并发布版本 v2' }));

    const modal = await screen.findByRole('dialog', { name: '模板正在使用中' });
    expect(within(modal).getByText(/该模板当前正在被未完成任务使用，不能直接发布新版本。/)).toBeInTheDocument();
    expect(within(modal).getByText(/请先修改模板名后，另存为一个新模板继续编辑。/)).toBeInTheDocument();
    const templateNameInput = within(modal).getByRole('textbox', { name: '模板名称' });
    expect(templateNameInput).toHaveValue('锁定模板 副本');
    await user.clear(templateNameInput);
    await user.type(templateNameInput, '锁定模板 - 新模板');
    await user.click(within(modal).getByRole('button', { name: '另存为新模板' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: '模板正在使用中' })).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      '/templates',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"name":"锁定模板 - 新模板"'),
      }),
    );
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) => input.toString() === '/templates/template_locked/publish' && init?.method === 'POST',
      ),
    ).toBe(false);
  });

  it('发布现有模板的新版本后列表只展示版本链最新版本', async () => {
    const user = userEvent.setup();
    const originalTemplate = createTemplateDto({
      id: 'template_v1',
      name: '版本链模板',
      schema: createLabelHubSchema({
        schemaVersion: 'v1',
        datasetKind: 'generic_json',
        fields: [{ key: 'prompt', fieldKey: 'prompt', type: 'text', label: '题目' }],
      }),
      status: 'PUBLISHED',
      version: 1,
      rootTemplateId: 'template_v1',
      createdById: 'user_owner_zhang_man',
    });
    const draftTemplate = createTemplateDto({
      id: 'template_v2',
      name: '版本链模板',
      schema: {
        ...originalTemplate.schema,
        schemaVersion: 'draft',
      },
      status: 'DRAFT',
      version: 1,
      parentTemplateId: 'template_v1',
      rootTemplateId: 'template_v1',
      createdById: 'user_owner_zhang_man',
    });
    const publishedTemplate = createTemplateDto({
      ...draftTemplate,
      status: 'PUBLISHED',
      version: 2,
      schema: {
        ...draftTemplate.schema,
        schemaVersion: 'v2',
      },
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = input.toString();
      const method = init?.method ?? 'GET';

      if (path === '/templates' && method === 'GET') {
        return jsonResponse({ data: [originalTemplate] });
      }

      if (path === '/templates' && method === 'POST') {
        return jsonResponse({ data: draftTemplate });
      }

      if (path === '/templates/template_v2/publish' && method === 'POST') {
        return jsonResponse({
          data: {
            template: publishedTemplate,
            compatibilityReport: {
              addedFieldKeys: [],
              removedFieldKeys: [],
              changedFieldTypes: [],
              compatible: true,
              riskMessages: [],
            },
          },
        });
      }

      return jsonResponse({ data: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<TemplateDesignerPage />);
    await openTemplateByName(user, '版本链模板');
    await user.click(screen.getByRole('button', { name: '保存并发布版本 v2' }));

    expect(await screen.findByText('"版本链模板" 模版已发布为v2')).toBeInTheDocument();
    const templateTable = screen.getByRole('table', { name: '模板列表' });
    const templateRows = within(templateTable).getAllByRole('button', { name: '打开模板 版本链模板' });

    expect(templateRows).toHaveLength(1);
    expect(within(templateRows[0]).getByText('v2')).toBeInTheDocument();
    expect(within(templateTable).queryByText('v1')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/templates',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"parentTemplateId":"template_v1"'),
      }),
    );
  });

  it('刷新后不再展示最近草稿入口', async () => {
    localStorage.setItem(
      'labelhub.templateDesignerDraft',
      JSON.stringify({
        templateId: 'template_1',
        version: 0,
        schema: qaQualitySampleSchema,
      }),
    );

    render(<TemplateDesignerPage />);

    await waitFor(() => {
      expect(screen.queryByText('模板列表加载中...')).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /打开官方模板/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('本地草稿')).not.toBeInTheDocument();
    expect(screen.queryByText('问答质量模板')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '继续编辑最近草稿' })).not.toBeInTheDocument();
  });

  it('不会恢复已删除的商品标题清洗 v3 本地草稿', async () => {
    localStorage.setItem(
      'labelhub.templateDesignerDraft',
      JSON.stringify({
        templateId: 'template_legacy',
        version: 0,
        status: 'DRAFT',
        schema: titleCleanupSampleSchema,
      }),
    );

    render(<TemplateDesignerPage />);

    await waitFor(() => {
      expect(screen.queryByText('模板列表加载中...')).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /打开官方模板/ })).not.toBeInTheDocument();
    expect(screen.queryByText('商品标题清洗 v3')).not.toBeInTheDocument();
    expect(screen.queryByText('原始商品标题')).not.toBeInTheDocument();
    expect(localStorage.getItem('labelhub.templateDesignerDraft')).toBeNull();
  });
});

const jsonResponse = (body: unknown): Response =>
  ({
    ok: true,
    json: async () => body,
  }) as Response;

const openNewTemplate = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole('button', { name: '新增模板' }));
  expect(await screen.findByRole('dialog', { name: '模板配置' })).toBeInTheDocument();
};

const openTemplateByName = async (
  user: ReturnType<typeof userEvent.setup>,
  templateName: string,
) => {
  await user.click(await screen.findByRole('button', { name: new RegExp(`打开模板 ${templateName}`) }));
  expect(await screen.findByRole('dialog', { name: '模板配置' })).toBeInTheDocument();
};

const addDesignerField = (type: FieldType) => {
  act(() => {
    useTemplateDesignerStore.getState().addField(type);
  });
};

const topLevelDesignerFieldLabels = (): string[] =>
  Array.from(document.querySelectorAll('.designer-canvas__fields > .designer-field-card .designer-field-card__type-label'))
    .map((node) => node.textContent?.replace('*', '').trim() ?? '')
    .filter(Boolean);

const findDesignerField = (fieldKey: string) => {
  return useTemplateDesignerStore
    .getState()
    .schema.fields.find((field) => (field.fieldKey ?? field.key) === fieldKey);
};

const createTemplateDto = ({
  id = 'template_test',
  name = '自定义模板',
  schema = createLabelHubSchema({
    schemaVersion: 'draft',
    datasetKind: 'generic_json',
    fields: [],
  }),
  status = 'DRAFT',
  version = status === 'PUBLISHED' ? 1 : 0,
  parentTemplateId = null,
  rootTemplateId = null,
  archivedAt = null,
  restoredFromTemplateId = null,
  createdById = null,
  usageCount = 0,
  activeUsageCount = 0,
}: {
  id?: string;
  name?: string;
  schema?: ReturnType<typeof createLabelHubSchema>;
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  version?: number;
  parentTemplateId?: string | null;
  rootTemplateId?: string | null;
  archivedAt?: string | null;
  restoredFromTemplateId?: string | null;
  createdById?: string | null;
  usageCount?: number;
  activeUsageCount?: number;
}) => ({
  id,
  name,
  description: null,
  datasetKind: schema.datasetKind,
  schemaVersion: schema.schemaVersion,
  schema,
  status,
  version,
  parentTemplateId,
  rootTemplateId,
  archivedAt,
  restoredFromTemplateId,
  createdById,
  publishedAt: status === 'PUBLISHED' ? '2026-05-21T00:00:00.000Z' : null,
  createdAt: '2026-05-21T00:00:00.000Z',
  updatedAt: '2026-05-21T00:00:00.000Z',
  usageCount,
  activeUsageCount,
});

const createTemplateVersionDto = (
  template: ReturnType<typeof createTemplateDto>,
  overrides: Partial<{
    activeUsageCount: number;
    isArchived: boolean;
    isCurrent: boolean;
    usageCount: number;
  }> = {},
) => ({
  ...template,
  usageCount: overrides.usageCount ?? 0,
  activeUsageCount: overrides.activeUsageCount ?? 0,
  isCurrent: overrides.isCurrent ?? false,
  isArchived: overrides.isArchived ?? template.status === 'ARCHIVED',
});
