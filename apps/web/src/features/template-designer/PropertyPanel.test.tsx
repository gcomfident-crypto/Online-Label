import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SchemaField } from '@labelhub/shared';

import { PropertyPanel } from './PropertyPanel';

describe('PropertyPanel', () => {
  it('未选择字段时只保留属性配置标题，不展示空状态提示文案', () => {
    render(
      <PropertyPanel
        field={null}
        onAddLinkageRule={vi.fn()}
        onUpdateField={vi.fn()}
        onUpdateValidation={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: '属性配置' })).toBeInTheDocument();
    expect(screen.queryByText('选择画布中的物料后配置字段属性')).not.toBeInTheDocument();
  });

  it('普通字段在单页侧边栏同时配置基础、校验和联动属性', () => {
    const onUpdateValidation = vi.fn();
    const onAddLinkageRule = vi.fn();
    const onUpdateField = vi.fn();
    const field: SchemaField = {
      key: 'cleaned_title',
      fieldKey: 'cleaned_title',
      type: 'text',
      label: '商品标题清洗结果',
      description: '填写最终清洗标题',
      placeholder: '请填写清洗后的标题...',
      validation: {
        required: true,
        maxLength: 35,
        pattern: '/^[^@#$]+$/',
        customValidatorKey: 'valid_json',
      },
      linkageRules: [
        {
          when: { fieldKey: 'category', operator: 'equals', value: '食品生鲜' },
          action: 'hide',
          targetFieldKey: 'size_table',
        },
      ],
      aiReview: {
        enabled: true,
        role: 'annotation_answer',
        requirement: '必须保留商品核心信息，不得新增不存在的信息。',
      },
    };

    render(
      <PropertyPanel
        field={field}
        onAddLinkageRule={onAddLinkageRule}
        onUpdateField={onUpdateField}
        onUpdateValidation={onUpdateValidation}
      />,
    );

    expect(screen.getByRole('heading', { name: '属性配置' })).toBeInTheDocument();
    expect(screen.queryByText('属性配置 · cleaned_title')).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist', { name: '属性配置分组' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('字段名')).toHaveValue('cleaned_title');
    expect(screen.getByLabelText('标题')).toHaveValue('商品标题清洗结果');
    expect(screen.getByLabelText('字段说明')).toHaveValue('填写最终清洗标题');
    expect(screen.getByLabelText('字段说明')).toHaveAttribute('maxlength', '20');
    expect(screen.getByLabelText('必填')).toBeChecked();
    expect(screen.getByLabelText('占位符')).toHaveValue('请填写清洗后的标题...');
    expect(screen.getByText('AI 预审')).toBeInTheDocument();
    const aiReviewSwitch = screen.getByLabelText('关闭 AI 预审');
    expect(aiReviewSwitch.closest('.designer-ai-review-switch')).not.toBeNull();
    expect(aiReviewSwitch).toHaveAttribute('aria-expanded', 'true');
    expect(aiReviewSwitch).toBeChecked();
    expect(screen.queryByRole('button', { name: /AI 预审配置/ })).not.toBeInTheDocument();
    expect(screen.queryByText('配置')).not.toBeInTheDocument();
    expect(screen.queryByText('预审')).not.toBeInTheDocument();
    expect(screen.queryByText('参与 AI 预审')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('字段作用')).not.toBeInTheDocument();
    expect(screen.queryByText('标注结果')).not.toBeInTheDocument();
    expect(screen.getByLabelText('审核要求')).toHaveValue('必须保留商品核心信息，不得新增不存在的信息。');
    expect(screen.queryByText('问题严重程度')).not.toBeInTheDocument();
    expect(screen.getByText('校验规则')).toBeInTheDocument();
    const validationSwitch = screen.getByLabelText('隐藏校验规则');
    expect(validationSwitch.closest('.designer-section-switch')).not.toBeNull();
    expect(validationSwitch).toHaveAttribute('aria-expanded', 'true');
    expect(validationSwitch).toBeChecked();
    expect(screen.getByTestId('designer-validation-collapse')).toHaveAttribute('aria-hidden', 'false');
    expect(screen.getByLabelText('最大长度')).toHaveValue(35);
    expect(screen.getByLabelText('正则')).toHaveValue('/^[^@#$]+$/');
    expect(screen.getByLabelText('自定义函数')).toHaveValue('valid_json');
    expect(screen.getByText('字段联动')).toBeInTheDocument();
    const linkageSwitch = screen.getByLabelText('隐藏字段联动');
    expect(linkageSwitch.closest('.designer-section-switch')).not.toBeNull();
    expect(linkageSwitch).toHaveAttribute('aria-expanded', 'true');
    expect(linkageSwitch).toBeChecked();
    expect(screen.getByTestId('designer-linkage-collapse')).toHaveAttribute('aria-hidden', 'false');
    expect(screen.getByText('category')).toBeInTheDocument();
    expect(screen.getByText('size_table')).toBeInTheDocument();
    const deleteLinkageRuleButton = screen.getByRole('button', { name: '删除联动规则 1' });
    expect(deleteLinkageRuleButton).toHaveClass(
      'template-manager-row-action',
      'template-manager-row-action--delete',
      'designer-linkage__delete',
    );
    expect(deleteLinkageRuleButton.querySelector('.template-manager-row-action__icon')).not.toBeNull();

    fireEvent.change(screen.getByLabelText('审核要求'), { target: { value: '作为原始标题供 AI 对照。' } });
    expect(onUpdateField).toHaveBeenLastCalledWith({
      aiReview: {
        enabled: true,
        role: 'annotation_answer',
        requirement: '作为原始标题供 AI 对照。',
      },
    });

    fireEvent.change(screen.getByLabelText('字段说明'), { target: { value: '说明怎么填写' } });
    expect(onUpdateField).toHaveBeenLastCalledWith({ description: '说明怎么填写' });

    fireEvent.change(screen.getByLabelText('最大长度'), { target: { value: '40' } });
    expect(onUpdateValidation).toHaveBeenLastCalledWith({ maxLength: 40 });

    fireEvent.click(validationSwitch);
    expect(screen.getByLabelText('显示校验规则')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByLabelText('显示校验规则')).not.toBeChecked();
    expect(screen.getByTestId('designer-validation-collapse')).toHaveAttribute('aria-hidden', 'true');

    fireEvent.click(screen.getByLabelText('显示校验规则'));
    expect(screen.getByLabelText('隐藏校验规则')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('designer-validation-collapse')).toHaveAttribute('aria-hidden', 'false');

    fireEvent.click(screen.getByRole('button', { name: '新增联动规则' }));
    expect(onAddLinkageRule).toHaveBeenCalledTimes(1);

    fireEvent.click(deleteLinkageRuleButton);
    expect(onUpdateField).toHaveBeenLastCalledWith({ linkageRules: [] });

    fireEvent.click(linkageSwitch);
    expect(screen.getByLabelText('显示字段联动')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByLabelText('显示字段联动')).not.toBeChecked();
    expect(screen.getByTestId('designer-linkage-collapse')).toHaveAttribute('aria-hidden', 'true');

    fireEvent.click(screen.getByLabelText('关闭 AI 预审'));
    expect(onUpdateField).toHaveBeenLastCalledWith({
      aiReview: {
        enabled: false,
        role: 'annotation_answer',
        requirement: '必须保留商品核心信息，不得新增不存在的信息。',
      },
    });
    expect(screen.getByLabelText('启用 AI 预审')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByLabelText('启用 AI 预审')).not.toBeChecked();
    expect(screen.getByTestId('designer-ai-review-collapse')).toHaveAttribute('aria-hidden', 'true');

    fireEvent.click(screen.getByLabelText('启用 AI 预审'));
    expect(onUpdateField).toHaveBeenLastCalledWith({
      aiReview: {
        enabled: true,
        role: 'annotation_answer',
        requirement: '必须保留商品核心信息，不得新增不存在的信息。',
      },
    });
    expect(screen.getByLabelText('审核要求')).toHaveValue('必须保留商品核心信息，不得新增不存在的信息。');
  });

  it('AI 预审默认关闭，点击胶囊开关后展开配置内容', () => {
    const onUpdateField = vi.fn();
    const field: SchemaField = {
      key: 'answer_quality',
      fieldKey: 'answer_quality',
      type: 'text',
      label: '回答质量',
      validation: { required: true },
    };

    render(
      <PropertyPanel
        field={field}
        onAddLinkageRule={vi.fn()}
        onUpdateField={onUpdateField}
        onUpdateValidation={vi.fn()}
      />,
    );

    const aiReviewSwitch = screen.getByLabelText('启用 AI 预审');
    expect(aiReviewSwitch.closest('.designer-ai-review-switch')).not.toBeNull();
    expect(aiReviewSwitch).toHaveAttribute('aria-expanded', 'false');
    expect(aiReviewSwitch).not.toBeChecked();
    expect(screen.getByTestId('designer-ai-review-collapse')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByLabelText('显示校验规则')).not.toBeChecked();
    expect(screen.getByLabelText('显示校验规则')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('designer-validation-collapse')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByLabelText('显示字段联动')).not.toBeChecked();
    expect(screen.getByLabelText('显示字段联动')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('designer-linkage-collapse')).toHaveAttribute('aria-hidden', 'true');

    fireEvent.click(screen.getByLabelText('显示校验规则'));
    expect(screen.getByLabelText('隐藏校验规则')).toBeChecked();
    expect(screen.getByTestId('designer-validation-collapse')).toHaveAttribute('aria-hidden', 'false');

    fireEvent.click(screen.getByLabelText('显示字段联动'));
    expect(screen.getByLabelText('隐藏字段联动')).toBeChecked();
    expect(screen.getByTestId('designer-linkage-collapse')).toHaveAttribute('aria-hidden', 'false');

    fireEvent.click(aiReviewSwitch);
    expect(onUpdateField).toHaveBeenLastCalledWith({
      aiReview: {
        enabled: true,
        role: 'annotation_answer',
        requirement: '',
      },
    });
    expect(screen.getByLabelText('关闭 AI 预审')).toBeChecked();
    expect(screen.getByTestId('designer-ai-review-collapse')).toHaveAttribute('aria-hidden', 'false');
  });

  it('单行输入、多行文本和标签选择支持配置 LLM 提示并引用 ShowItem 字段', () => {
    const onUpdateField = vi.fn();
    const schemaFields: SchemaField[] = [
      {
        key: 'show_item',
        type: 'show_item',
        label: '题目展示',
        displayConfig: {
          layout: 'table',
          fields: [
            { sourceKey: 'prompt', label: 'Prompt', format: 'long_text' },
            { sourceKey: 'response_a', label: '回答 A', format: 'text' },
          ],
        },
      },
      {
        key: 'title',
        fieldKey: 'cleaned_title',
        type: 'text',
        label: '清洗标题',
        promptTemplate: '请根据 #prompt 输出清洗标题。',
      },
    ];

    const { rerender } = render(
      <PropertyPanel
        field={schemaFields[1] ?? null}
        schemaFields={schemaFields}
        onAddLinkageRule={vi.fn()}
        onUpdateField={onUpdateField}
        onUpdateValidation={vi.fn()}
      />,
    );

    const llmSectionTitle = screen.getByText('LLM提示');
    expect(llmSectionTitle).toBeInTheDocument();
    expect(
      llmSectionTitle.compareDocumentPosition(screen.getByText('AI 预审')) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByLabelText('关闭 LLM 提示')).toBeChecked();
    expect(screen.getByTestId('designer-llm-prompt-collapse')).toHaveAttribute('aria-hidden', 'false');
    expect(screen.getByLabelText('LLM提示内容')).toHaveValue('请根据 #prompt 输出清洗标题。');
    expect(screen.getByRole('button', { name: '#Prompt' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '#回答 A' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '#回答 A' }));
    expect(onUpdateField).toHaveBeenLastCalledWith({ promptTemplate: '请根据 #prompt 输出清洗标题。 #response_a' });

    fireEvent.change(screen.getByLabelText('LLM提示内容'), {
      target: { value: '请根据 #prompt 输出标签。' },
    });
    expect(onUpdateField).toHaveBeenLastCalledWith({ promptTemplate: '请根据 #prompt 输出标签。' });

    fireEvent.click(screen.getByLabelText('关闭 LLM 提示'));
    expect(onUpdateField).toHaveBeenLastCalledWith({ promptTemplate: undefined });

    rerender(
      <PropertyPanel
        field={{
          key: 'tags',
          fieldKey: 'tags',
          type: 'tag_select',
          label: '标签选择',
          options: [{ label: '准确性', value: 'accuracy' }],
        }}
        schemaFields={schemaFields}
        onAddLinkageRule={vi.fn()}
        onUpdateField={onUpdateField}
        onUpdateValidation={vi.fn()}
      />,
    );

    expect(screen.getByText('LLM提示')).toBeInTheDocument();
    expect(screen.getByLabelText('启用 LLM 提示')).not.toBeChecked();
  });

  it('分组容器只配置标题、说明、默认展开和布局列数', () => {
    const onUpdateField = vi.fn();

    render(
      <PropertyPanel
        field={{
          key: 'group_1',
          type: 'group',
          label: '基础信息',
          description: '先填写上下文',
          layout: 'single_column',
          defaultCollapsed: false,
          fields: [],
        }}
        onAddLinkageRule={vi.fn()}
        onUpdateField={onUpdateField}
        onUpdateValidation={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: '属性配置' })).toBeInTheDocument();
    expect(screen.queryByLabelText('字段名')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('必填')).not.toBeInTheDocument();
    expect(screen.queryByText('AI 预审')).not.toBeInTheDocument();
    expect(screen.getByLabelText('标题')).toHaveValue('基础信息');
    expect(screen.getByLabelText('字段说明')).toHaveValue('先填写上下文');
    expect(screen.getByLabelText('默认展开')).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: '双列' }));
    expect(onUpdateField).toHaveBeenLastCalledWith({ layout: 'two_columns' });

    fireEvent.click(screen.getByLabelText('默认展开'));
    expect(onUpdateField).toHaveBeenLastCalledWith({ defaultCollapsed: true });
  });

  it('多 Tab 布局支持新增、删除、重命名、排序和切换当前编辑 Tab', () => {
    const onUpdateField = vi.fn();
    const onActivateTab = vi.fn();
    const field: SchemaField = {
      key: 'tabs_1',
      type: 'tabs',
      label: '分步标注',
      description: '按步骤填写',
      tabs: [
        { key: 'tab_1', label: '题目信息', fields: [] },
        { key: 'tab_2', label: '标注结果', fields: [] },
      ],
    };

    render(
      <PropertyPanel
        activeTabKey="tab_2"
        field={field}
        onActivateTab={onActivateTab}
        onAddLinkageRule={vi.fn()}
        onUpdateField={onUpdateField}
        onUpdateValidation={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText('字段名')).not.toBeInTheDocument();
    expect(screen.queryByText('AI 预审')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Tab 管理列表')).toBeInTheDocument();
    expect(screen.getByLabelText('Tab 2 名称')).toHaveValue('标注结果');
    expect(screen.getByLabelText('Tab 2 名称').closest('.designer-tab-manager__item')).toHaveClass('is-active');
    expect(screen.queryByRole('group', { name: '布局列数' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '自动' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '三列' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Tab 2 名称'), { target: { value: '人工审核' } });
    expect(onUpdateField).toHaveBeenLastCalledWith({
      tabs: [
        { key: 'tab_1', label: '题目信息', fields: [] },
        { key: 'tab_2', label: '人工审核', fields: [] },
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: '编辑 题目信息' }));
    expect(onActivateTab).toHaveBeenLastCalledWith('tab_1');

    fireEvent.click(screen.getByRole('button', { name: '新增 Tab' }));
    expect(onUpdateField).toHaveBeenLastCalledWith({
      tabs: [
        { key: 'tab_1', label: '题目信息', fields: [] },
        { key: 'tab_2', label: '标注结果', fields: [] },
        { key: 'tab_3', label: 'Tab 3', fields: [] },
      ],
    });
    expect(onActivateTab).toHaveBeenLastCalledWith('tab_3');

    fireEvent.click(screen.getByRole('button', { name: '上移 标注结果' }));
    expect(onUpdateField).toHaveBeenLastCalledWith({
      tabs: [
        { key: 'tab_2', label: '标注结果', fields: [] },
        { key: 'tab_1', label: '题目信息', fields: [] },
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: '删除 题目信息' }));
    expect(onUpdateField).toHaveBeenLastCalledWith({
      tabs: [{ key: 'tab_2', label: '标注结果', fields: [] }],
    });
  });

  it('ShowItem 使用专属展示配置面板，不显示普通字段的校验和联动配置', () => {
    const onUpdateField = vi.fn();
    const field: SchemaField = {
      key: 'show_item_1',
      type: 'show_item',
      label: '评测样本',
      displayConfig: {
        layout: 'table',
        fields: [
          { sourceKey: 'prompt', label: '问题' },
          { sourceKey: 'response_a', label: '回答 A' },
        ],
      },
    };

    render(
      <PropertyPanel
        field={field}
        onAddLinkageRule={vi.fn()}
        onUpdateField={onUpdateField}
        onUpdateValidation={vi.fn()}
      />,
    );

    const editor = screen.getByLabelText('ShowItem 展示字段配置');
    expect(screen.getByRole('heading', { name: '题目展示字段' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '属性配置' })).not.toBeInTheDocument();
    expect(screen.queryByText('属性配置 · ShowItem')).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist', { name: '属性配置分组' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('字段名')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('标题')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('必填')).not.toBeInTheDocument();
    expect(screen.queryByText('校验规则')).not.toBeInTheDocument();
    expect(screen.queryByText('字段联动')).not.toBeInTheDocument();
    expect(screen.queryByText('原始字段')).not.toBeInTheDocument();
    expect(within(editor).queryByText('展示模式')).not.toBeInTheDocument();
    expect(screen.queryByText('AI 预审')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('启用 AI 预审')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('关闭 AI 预审')).not.toBeInTheDocument();
    expect(screen.queryByTestId('designer-ai-review-collapse')).not.toBeInTheDocument();
    expect(screen.queryByTestId('designer-validation-collapse')).not.toBeInTheDocument();
    expect(screen.queryByTestId('designer-linkage-collapse')).not.toBeInTheDocument();
    expect(screen.queryByText('问题严重程度')).not.toBeInTheDocument();
    expect(within(editor).queryByRole('button', { name: '表格' })).not.toBeInTheDocument();
    expect(within(editor).getByLabelText('总字段 2')).toBeInTheDocument();
    expect(within(editor).getByLabelText('展示字段 2')).toBeInTheDocument();
    expect(within(editor).getByLabelText('待标注字段 0')).toBeInTheDocument();
    expect(within(editor).getByRole('button', { name: '新增字段' })).toHaveClass(
      'designer-show-item-config__add',
    );
    expect(within(editor).getByRole('button', { name: '新增字段' }).querySelector('svg')).not.toBeNull();
    expect(within(editor).getByLabelText('展示字段 prompt')).toHaveClass('designer-show-item-field');
    const deleteFieldButton = screen.getByRole('button', { name: '删除展示字段 1' });
    expect(deleteFieldButton).toHaveClass('template-manager-row-action', 'designer-show-item-field__delete');
    expect(deleteFieldButton).not.toHaveTextContent('×');
    expect(deleteFieldButton.querySelector('.template-manager-row-action__icon')).not.toBeNull();
    expect(deleteFieldButton.querySelector('path')).toHaveAttribute('fill', 'currentColor');
    expect(within(editor).getByText('prompt')).toHaveClass('designer-show-item-field__source');
    expect(screen.queryByLabelText('展示字段 1 原始字段')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('展示字段 1 展示区域')).not.toBeInTheDocument();
    expect(within(editor).queryByText('展示区域')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('问题')).toBeInTheDocument();
    expect(screen.queryByLabelText('展示字段 1 宽度')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Labeler 预览')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('展示字段 1 显示名'), { target: { value: '用户问题' } });
    expect(onUpdateField).toHaveBeenLastCalledWith({
      displayConfig: {
        layout: 'table',
        fields: [
          { sourceKey: 'prompt', label: '用户问题', area: 'content' },
          { sourceKey: 'response_a', label: '回答 A', area: 'content' },
        ],
      },
      sourceKeys: ['prompt', 'response_a'],
    });

    onUpdateField.mockClear();
    fireEvent.click(screen.getByRole('button', { name: '删除展示字段 1' }));
    expect(onUpdateField).toHaveBeenLastCalledWith({
      displayConfig: {
        layout: 'table',
        fields: [
          { sourceKey: 'response_a', label: '回答 A', area: 'content' },
        ],
      },
      sourceKeys: ['response_a'],
    });
    expect(screen.queryByRole('button', { name: '确认删除展示字段 1' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '新增字段' }));
    expect(onUpdateField).toHaveBeenLastCalledWith({
      displayConfig: {
        layout: 'table',
        fields: [
          { sourceKey: 'prompt', label: '问题', area: 'content' },
          { sourceKey: 'response_a', label: '回答 A', area: 'content' },
          { sourceKey: '', label: '', area: 'content' },
        ],
      },
      sourceKeys: ['prompt', 'response_a'],
    });

    expect(screen.queryByLabelText('启用 AI 预审')).not.toBeInTheDocument();
  });

  it('选项字段的加号放在选项下方，并展开为胶囊输入框', () => {
    const onUpdateField = vi.fn();
    render(
      <PropertyPanel
        field={{
          key: 'preferred_field',
          fieldKey: 'preferred',
          type: 'radio',
          label: '偏好选择',
          options: [
            { label: '回答 A', value: 'A' },
            { label: '回答 B', value: 'B' },
          ],
        }}
        onAddLinkageRule={vi.fn()}
        onUpdateField={onUpdateField}
        onUpdateValidation={vi.fn()}
      />,
    );

    expect(screen.getByText('选项')).toHaveClass('designer-property-row__label');
    const optionEditor = screen.getByText('选项').closest('.designer-option-editor');
    const optionBubbles = optionEditor?.querySelector('.designer-option-editor__bubbles');
    expect(optionBubbles?.firstElementChild).toHaveClass('designer-option-editor__action');
    const addOptionButton = screen.getByRole('button', { name: '新增选项' });
    expect(addOptionButton).toHaveClass('task-tag-bubble--add', 'designer-option-bubble--add');
    expect(addOptionButton.closest('.designer-option-editor__action')).toBe(optionBubbles?.firstElementChild);
    const removeOptionButton = screen.getByRole('button', { name: '删除选项 回答 A' });
    expect(removeOptionButton).toHaveClass('task-tag-bubble__remove', 'designer-option-bubble__delete');
    expect(removeOptionButton).not.toHaveTextContent('×');
    expect(removeOptionButton.querySelector('.template-manager-row-action__icon')).toBeNull();
    fireEvent.click(removeOptionButton);
    const removingOption = screen.getByText('回答 A').closest('.designer-option-bubble');
    expect(removingOption).toHaveClass('task-tag-bubble--removing');
    expect(removingOption?.querySelector('.designer-option-bubble__surface')).toHaveClass(
      'task-tag-bubble__surface--removing',
    );
    fireEvent.animationEnd(removingOption as Element);
    expect(onUpdateField).toHaveBeenCalledWith({
      options: [{ label: '回答 B', value: 'B' }],
    });

    fireEvent.click(addOptionButton);

    const optionComposer = screen.getByRole('form', { name: '新选项输入' });
    expect(optionComposer).toHaveClass('task-tag-composer', 'designer-option-composer');
    expect(optionComposer.closest('.designer-option-editor__action')).toBe(optionBubbles?.firstElementChild);
    expect(screen.getByLabelText('新选项')).toHaveClass('task-tag-composer__input', 'designer-option-composer__input');
    expect(screen.getByLabelText('新选项')).toHaveFocus();
    expect(screen.getByRole('button', { name: '确认新增选项' })).toHaveClass(
      'task-tag-composer__confirm',
      'designer-option-composer__confirm',
    );

    fireEvent.change(screen.getByLabelText('新选项'), { target: { value: '回答 C' } });
    fireEvent.click(screen.getByRole('button', { name: '确认新增选项' }));

    expect(onUpdateField).toHaveBeenCalledWith({
      options: [
        { label: '回答 A', value: 'A' },
        { label: '回答 B', value: 'B' },
        { label: '回答 C', value: '_c' },
      ],
    });
  });

  it('选项字段支持长按左右拖拽调整顺序', () => {
    vi.useFakeTimers();
    const onUpdateField = vi.fn();

    try {
      render(
        <PropertyPanel
          field={{
            key: 'preferred_field',
            fieldKey: 'preferred',
            type: 'radio',
            label: '偏好选择',
            options: [
              { label: '回答 A', value: 'A' },
              { label: '回答 B', value: 'B' },
              { label: '回答 C', value: 'C' },
            ],
          }}
          onAddLinkageRule={vi.fn()}
          onUpdateField={onUpdateField}
          onUpdateValidation={vi.fn()}
        />,
      );

      const optionA = screen.getByText('回答 A').closest('.designer-option-bubble') as HTMLElement;
      const optionB = screen.getByText('回答 B').closest('.designer-option-bubble') as HTMLElement;
      const optionC = screen.getByText('回答 C').closest('.designer-option-bubble') as HTMLElement;

      mockOptionRect(optionA, { left: 44, width: 80 });
      mockOptionRect(optionB, { left: 132, width: 80 });
      mockOptionRect(optionC, { left: 220, width: 80 });

      const optionASurface = optionA.querySelector('.designer-option-bubble__surface') as HTMLElement;

      fireEvent(optionASurface, createPointerTestEvent('pointerdown', { button: 0, clientX: 84, pointerId: 1 }));

      act(() => {
        vi.advanceTimersByTime(160);
      });

      expect(optionA).toHaveClass('designer-option-bubble--dragging');
      expect(optionA.closest('.designer-option-editor__option-list')).toHaveClass(
        'designer-option-editor__option-list--dragging',
      );

      fireEvent(optionASurface, createPointerTestEvent('pointermove', { clientX: 280, pointerId: 1 }));

      expect(optionA).toHaveStyle({ transform: 'translateX(196px)' });
      expect(optionB).toHaveClass('designer-option-bubble--drag-shifted');
      expect(optionC).toHaveClass('designer-option-bubble--drag-shifted');

      fireEvent(optionASurface, createPointerTestEvent('pointerup', { clientX: 280, pointerId: 1 }));

      expect(onUpdateField).toHaveBeenLastCalledWith({
        options: [
          { label: '回答 B', value: 'B' },
          { label: '回答 C', value: 'C' },
          { label: '回答 A', value: 'A' },
        ],
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('ShowItem 固定使用表格布局，隐藏展示区域配置并默认使用内容区', () => {
    const onUpdateField = vi.fn();
    const field: SchemaField = {
      key: 'show_item_1',
      type: 'show_item',
      label: '评测样本',
      displayConfig: {
        layout: 'table',
        fields: [
          { sourceKey: 'prompt', label: '问题' },
          { sourceKey: 'task_type', label: '任务类型' },
        ],
      },
    };

    render(
      <PropertyPanel
        field={field}
        onAddLinkageRule={vi.fn()}
        onUpdateField={onUpdateField}
        onUpdateValidation={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: '字段列表' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('展示字段 1 展示区域')).not.toBeInTheDocument();
    expect(screen.queryByText('展示区域')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '展示字段 2 展示格式' }));
    const formatListbox = screen.getByRole('listbox', { name: '展示字段 2 展示格式选项' });

    expect(within(formatListbox).getByRole('option', { name: '文本' })).toBeInTheDocument();
    expect(within(formatListbox).getByRole('option', { name: '代码' })).toBeInTheDocument();
    expect(within(formatListbox).queryByRole('option', { name: '长文本' })).not.toBeInTheDocument();
    expect(within(formatListbox).queryByRole('option', { name: '标签' })).not.toBeInTheDocument();
    expect(within(formatListbox).queryByRole('option', { name: 'JSON' })).not.toBeInTheDocument();

    fireEvent.click(within(formatListbox).getByRole('option', { name: '代码' }));
    expect(onUpdateField).toHaveBeenLastCalledWith({
      displayConfig: {
        layout: 'table',
        fields: [
          { sourceKey: 'prompt', label: '问题', area: 'content' },
          { sourceKey: 'task_type', label: '任务类型', area: 'content', format: 'code' },
        ],
      },
      sourceKeys: ['prompt', 'task_type'],
    });
  });

  it('ShowItem 以字段配置加摘要信息的方式配置偏好对比题目展示', () => {
    const onUpdateField = vi.fn();
    const field: SchemaField = {
      key: 'show_item_1',
      type: 'show_item',
      label: '偏好对比题目',
      displayConfig: {
        layout: 'comparison',
        fields: [
          { sourceKey: 'id', label: '题目ID', area: 'meta', format: 'badge' },
          { sourceKey: 'task_type', label: '任务类型', area: 'meta', format: 'badge' },
          { sourceKey: 'lang', label: '语言', area: 'meta', format: 'badge' },
          { sourceKey: 'prompt', label: '问题', area: 'primary', format: 'long_text' },
          { sourceKey: 'response_a', label: '回答 A', area: 'content', format: 'long_text' },
          { sourceKey: 'model_a', label: '模型 A', area: 'meta', format: 'badge' },
          { sourceKey: 'response_b', label: '回答 B', area: 'content', format: 'long_text' },
          { sourceKey: 'model_b', label: '模型 B', area: 'meta', format: 'badge' },
          { sourceKey: 'preferred', label: '参考答案', visible: false },
        ],
      },
    };

    render(
      <PropertyPanel
        field={field}
        schemaFields={[
          field,
          { key: 'preferred', fieldKey: 'preferred', sourceKey: 'preferred', type: 'radio', label: '偏好选择' },
          { key: 'margin', fieldKey: 'margin', sourceKey: 'margin', type: 'text', label: '优劣差距' },
          { key: 'dimensions', fieldKey: 'dimensions', sourceKey: 'dimensions', type: 'checkbox', label: '评价维度' },
          { key: 'safety_flag', fieldKey: 'safety_flag', sourceKey: 'safety_flag', type: 'radio', label: '安全标记' },
          { key: 'annotator_note', fieldKey: 'annotator_note', sourceKey: 'annotator_note', type: 'textarea', label: '标注备注' },
        ]}
        onAddLinkageRule={vi.fn()}
        onUpdateField={onUpdateField}
        onUpdateValidation={vi.fn()}
      />,
    );

    const editor = screen.getByLabelText('ShowItem 展示字段配置');
    expect(within(editor).getByText('题目展示字段')).toBeInTheDocument();
    expect(within(editor).getByLabelText('总字段 13')).toBeInTheDocument();
    expect(within(editor).getByLabelText('展示字段 8')).toBeInTheDocument();
    expect(within(editor).getByLabelText('待标注字段 5')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'A/B 对比' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('是否展示 preferred')).not.toBeChecked();

    fireEvent.click(screen.getByLabelText('是否展示 preferred'));
    expect(onUpdateField).toHaveBeenLastCalledWith({
      displayConfig: {
        layout: 'table',
        fields: [
          { sourceKey: 'id', label: '题目ID', area: 'content', format: 'badge' },
          { sourceKey: 'task_type', label: '任务类型', area: 'content', format: 'badge' },
          { sourceKey: 'lang', label: '语言', area: 'content', format: 'badge' },
          { sourceKey: 'prompt', label: '问题', area: 'content', format: 'long_text' },
          { sourceKey: 'response_a', label: '回答 A', area: 'content', format: 'long_text' },
          { sourceKey: 'model_a', label: '模型 A', area: 'content', format: 'badge' },
          { sourceKey: 'response_b', label: '回答 B', area: 'content', format: 'long_text' },
          { sourceKey: 'model_b', label: '模型 B', area: 'content', format: 'badge' },
          { sourceKey: 'preferred', label: '参考答案', area: 'content', visible: true },
        ],
      },
      sourceKeys: ['id', 'task_type', 'lang', 'prompt', 'response_a', 'model_a', 'response_b', 'model_b', 'preferred'],
    });
  });
});

function mockOptionRect(element: HTMLElement, rect: { left: number; width: number }) {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      bottom: 34,
      height: 34,
      left: rect.left,
      right: rect.left + rect.width,
      top: 0,
      width: rect.width,
      x: rect.left,
      y: 0,
      toJSON: () => undefined,
    }),
  });
}

function createPointerTestEvent(
  type: string,
  options: { button?: number; clientX: number; pointerId: number },
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });

  Object.defineProperties(event, {
    button: { value: options.button ?? 0 },
    clientX: { value: options.clientX },
    pointerId: { value: options.pointerId },
  });

  return event;
}
