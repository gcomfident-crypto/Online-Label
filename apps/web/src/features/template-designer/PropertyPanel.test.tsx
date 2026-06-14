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
    const schemaFields: SchemaField[] = [
      {
        key: 'category',
        type: 'text',
        label: '类目',
      },
      {
        key: 'size_table',
        type: 'text',
        label: '尺寸表',
      },
      {
        key: 'cleaned_title',
        fieldKey: 'cleaned_title',
        type: 'text',
        label: '商品标题清洗结果',
      },
    ];
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
        schemaFields={schemaFields}
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
    expect(screen.getByLabelText('字段名').closest('.designer-property-row')).toHaveClass(
      'designer-property-row--metadata',
    );
    expect(screen.getByLabelText('标题').closest('.designer-property-row')).toHaveClass(
      'designer-property-row--metadata',
    );
    expect(screen.getByLabelText('字段说明').closest('.designer-property-row')).toHaveClass(
      'designer-property-row--metadata',
    );
    expect(screen.getByLabelText('字段说明').closest('.designer-property-row')).toHaveClass(
      'designer-property-row--field-description',
    );
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
    expect(screen.getByLabelText('审核要求')).toHaveClass('designer-ai-review-requirement');
    expect(screen.queryByText('问题严重程度')).not.toBeInTheDocument();
    expect(screen.getByText('校验规则')).toBeInTheDocument();
    const validationSwitch = screen.getByLabelText('隐藏校验规则');
    expect(validationSwitch.closest('.designer-section-switch')).not.toBeNull();
    expect(validationSwitch).toHaveAttribute('aria-expanded', 'true');
    expect(validationSwitch).toBeChecked();
    expect(screen.getByTestId('designer-validation-collapse')).toHaveAttribute('aria-hidden', 'false');
    const lengthLimitEditor = screen.getByRole('group', { name: '长度限制' });
    expect(screen.getByText('长度限制')).toHaveClass('designer-property-row__label');
    expect(within(lengthLimitEditor).queryByRole('combobox')).not.toBeInTheDocument();
    expect(within(lengthLimitEditor).getByRole('button', { name: '最多' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('最大长度')).toHaveValue(35);
    expect(within(lengthLimitEditor).getByText('字符')).toBeInTheDocument();
    expect(screen.getByLabelText('正则')).toHaveValue('/^[^@#$]+$/');
    expect(screen.queryByLabelText('预置校验')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('自定义函数')).not.toBeInTheDocument();
    expect(screen.getByText('字段联动')).toBeInTheDocument();
    const linkageSwitch = screen.getByLabelText('隐藏字段联动');
    expect(linkageSwitch.closest('.designer-section-switch')).not.toBeNull();
    expect(linkageSwitch).toHaveAttribute('aria-expanded', 'true');
    expect(linkageSwitch).toBeChecked();
    expect(screen.getByTestId('designer-linkage-collapse')).toHaveAttribute('aria-hidden', 'false');
    const conditionBlock = screen.getByRole('group', { name: '联动 1 条件' });
    expect(conditionBlock).toBeInTheDocument();
    expect(within(conditionBlock).queryByText('当')).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: '联动 1 动作' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '规则 1 条件字段 1' })).toHaveTextContent('类目');
    expect(screen.getByRole('button', { name: '规则 1 条件字段 1' })).not.toHaveTextContent('#类目');
    expect(screen.getByRole('button', { name: '规则 1 动作字段 1' })).toHaveTextContent('尺寸表');
    expect(screen.getByRole('button', { name: '规则 1 动作字段 1' })).not.toHaveTextContent('#尺寸表');
    expect(screen.getByRole('button', { name: '规则 1 动作 1 类型' })).toHaveTextContent('隐藏');
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

    const requirementInput = screen.getByLabelText('审核要求') as HTMLTextAreaElement;
    Object.defineProperty(requirementInput, 'scrollHeight', { configurable: true, value: 148 });
    fireEvent.change(requirementInput, { target: { value: '第一行审核要求\n第二行审核要求\n第三行审核要求' } });
    expect(requirementInput.style.height).toBe('148px');
    expect(onUpdateField).toHaveBeenLastCalledWith({
      aiReview: {
        enabled: true,
        role: 'annotation_answer',
        requirement: '第一行审核要求\n第二行审核要求\n第三行审核要求',
      },
    });

    fireEvent.change(screen.getByLabelText('字段说明'), { target: { value: '说明怎么填写' } });
    expect(onUpdateField).toHaveBeenLastCalledWith({ description: '说明怎么填写' });

    fireEvent.change(screen.getByLabelText('最大长度'), { target: { value: '40' } });
    expect(onUpdateValidation).toHaveBeenLastCalledWith({ maxLength: 40 });
    fireEvent.click(within(lengthLimitEditor).getByRole('button', { name: '最少' }));
    expect(onUpdateValidation).toHaveBeenLastCalledWith({ minLength: 35, maxLength: undefined });

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

  it('AI 预审支持配置 Rubric 审核维度、权重和判断标准', () => {
    const onUpdateField = vi.fn();
    const field: SchemaField = {
      key: 'comment',
      fieldKey: 'comment',
      type: 'textarea',
      label: '对比说明',
      aiReview: {
        enabled: true,
        requirement: '说明必须支撑偏好选择。',
        rubric: {
          dimensions: [
            {
              key: 'preference_consistency',
              label: '偏好一致性',
              weight: 40,
              criteria: '偏好选择必须能被 A/B 回答的质量差异支撑。',
            },
            {
              key: 'evidence_grounding',
              label: '证据依据',
              weight: 60,
              criteria: '说明必须引用 A/B 回答中的具体差异。',
            },
          ],
        },
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

    expect(screen.getByText('审核维度')).toBeInTheDocument();
    expect(screen.getByText('总权重：100 / 100')).toBeInTheDocument();
    expect(screen.getByLabelText('维度 1 名称')).toHaveValue('偏好一致性');
    expect(screen.getByLabelText('维度 1 权重')).toHaveValue(40);
    const firstCriteriaTextarea = screen.getByLabelText('维度 1 判断标准');
    expect(firstCriteriaTextarea).toHaveValue('偏好选择必须能被 A/B 回答的质量差异支撑。');
    expect(firstCriteriaTextarea).toHaveClass('designer-auto-resize-textarea');

    Object.defineProperty(firstCriteriaTextarea, 'scrollHeight', {
      configurable: true,
      value: 132,
    });
    fireEvent.change(firstCriteriaTextarea, {
      target: {
        value: '偏好选择必须能被 A/B 回答的质量差异支撑，并且需要结合任务问题、回答完整性和事实一致性说明。',
      },
    });
    expect(firstCriteriaTextarea).toHaveStyle({ height: '132px' });

    fireEvent.change(screen.getByLabelText('维度 1 权重'), { target: { value: '30' } });
    expect(onUpdateField).toHaveBeenLastCalledWith({
      aiReview: {
        enabled: true,
        role: 'annotation_answer',
        requirement: '说明必须支撑偏好选择。',
        rubric: {
          dimensions: [
            {
              key: 'preference_consistency',
              label: '偏好一致性',
              weight: 30,
              criteria: '偏好选择必须能被 A/B 回答的质量差异支撑。',
            },
            {
              key: 'evidence_grounding',
              label: '证据依据',
              weight: 60,
              criteria: '说明必须引用 A/B 回答中的具体差异。',
            },
          ],
        },
      },
    });

    fireEvent.click(screen.getByRole('button', { name: '新增审核维度' }));
    expect(onUpdateField).toHaveBeenLastCalledWith({
      aiReview: {
        enabled: true,
        role: 'annotation_answer',
        requirement: '说明必须支撑偏好选择。',
        rubric: {
          dimensions: [
            {
              key: 'preference_consistency',
              label: '偏好一致性',
              weight: 40,
              criteria: '偏好选择必须能被 A/B 回答的质量差异支撑。',
            },
            {
              key: 'evidence_grounding',
              label: '证据依据',
              weight: 60,
              criteria: '说明必须引用 A/B 回答中的具体差异。',
            },
            {
              key: expect.stringMatching(/^rubric_dimension_/),
              label: '',
              weight: 0,
              criteria: '',
            },
          ],
        },
      },
    });
  });

  it('长度限制使用分段控件并支持区间和不限制模式', () => {
    const onUpdateValidation = vi.fn();
    const baseProps = {
      onAddLinkageRule: vi.fn(),
      onUpdateField: vi.fn(),
      onUpdateValidation,
    };

    const { rerender } = render(
      <PropertyPanel
        {...baseProps}
        field={{
          key: 'summary',
          type: 'text',
          label: '一句话总评',
          validation: {
            minLength: 2,
            maxLength: 20,
          },
        }}
      />,
    );

    const lengthLimitEditor = screen.getByRole('group', { name: '长度限制' });
    expect(within(lengthLimitEditor).getByRole('button', { name: '区间' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(lengthLimitEditor).getByLabelText('最小长度')).toHaveValue(2);
    expect(within(lengthLimitEditor).getByLabelText('最大长度')).toHaveValue(20);
    expect(within(lengthLimitEditor).getByText('字符')).toBeInTheDocument();
    expect(within(lengthLimitEditor).getByRole('button', { name: '不限制' })).toHaveClass(
      'designer-length-limit-mode__button--none',
    );

    fireEvent.change(within(lengthLimitEditor).getByLabelText('最小长度'), { target: { value: '3' } });
    expect(onUpdateValidation).toHaveBeenLastCalledWith({ minLength: 3 });
    fireEvent.change(within(lengthLimitEditor).getByLabelText('最大长度'), { target: { value: '18' } });
    expect(onUpdateValidation).toHaveBeenLastCalledWith({ maxLength: 18 });

    fireEvent.click(within(lengthLimitEditor).getByRole('button', { name: '不限制' }));
    expect(onUpdateValidation).toHaveBeenLastCalledWith({ minLength: undefined, maxLength: undefined });

    rerender(
      <PropertyPanel
        {...baseProps}
        field={{
          key: 'email',
          type: 'text',
          label: '邮箱',
          validation: {
            maxLength: 20,
          },
        }}
      />,
    );

    const maxLengthEditor = screen.getByRole('group', { name: '长度限制' });
    expect(within(maxLengthEditor).queryByRole('combobox')).not.toBeInTheDocument();
    expect(within(maxLengthEditor).getByRole('button', { name: '最多' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('最大长度')).toHaveValue(20);
    expect(screen.queryByLabelText('预置校验')).not.toBeInTheDocument();

    fireEvent.click(within(maxLengthEditor).getByRole('button', { name: '最少' }));
    expect(onUpdateValidation).toHaveBeenLastCalledWith({ minLength: 20, maxLength: undefined });

    rerender(
      <PropertyPanel
        {...baseProps}
        field={{
          key: 'email',
          type: 'text',
          label: '邮箱',
          validation: {
            minLength: 3,
          },
        }}
      />,
    );
    const minLengthEditor = screen.getByRole('group', { name: '长度限制' });
    expect(within(minLengthEditor).getByRole('button', { name: '最少' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('最小长度')).toHaveValue(3);

    fireEvent.change(screen.getByLabelText('最小长度'), { target: { value: '4' } });
    expect(onUpdateValidation).toHaveBeenLastCalledWith({ minLength: 4 });

    rerender(
      <PropertyPanel
        {...baseProps}
        field={{
          key: 'note',
          type: 'textarea',
          label: '备注',
        }}
      />,
    );
    fireEvent.click(screen.getByLabelText('显示校验规则'));
    const emptyLengthLimitEditor = screen.getByRole('group', { name: '长度限制' });
    expect(within(emptyLengthLimitEditor).getByRole('button', { name: '不限制' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(within(emptyLengthLimitEditor).getByRole('button', { name: '最少' }));
    expect(onUpdateValidation).toHaveBeenLastCalledWith({ minLength: 1, maxLength: undefined });

    rerender(
      <PropertyPanel
        {...baseProps}
        field={{
          key: 'preferred',
          type: 'radio',
          label: '偏好选择',
          options: [{ label: 'A', value: 'A' }],
        }}
      />,
    );
    expect(screen.queryByRole('group', { name: '长度限制' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('最大长度')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('最小长度')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('预置校验')).not.toBeInTheDocument();
  });

  it('字段联动可以自然配置控制显隐规则', () => {
    const onUpdateField = vi.fn();
    const schemaFields: SchemaField[] = [
      {
        key: 'status',
        type: 'radio',
        label: '状态',
        options: [
          { label: '通过', value: 'ok' },
          { label: '拒绝', value: 'reject' },
        ],
      },
      {
        key: 'answer',
        type: 'text',
        label: '答案',
      },
    ];

    render(
      <PropertyPanel
        field={{
          key: 'answer',
          type: 'text',
          label: '答案',
          linkageRules: [
            {
              when: { fieldKey: 'status', operator: 'equals', value: 'ok' },
              action: 'show',
              targetFieldKey: 'answer',
            },
          ],
        }}
        schemaFields={schemaFields}
        onAddLinkageRule={vi.fn()}
        onUpdateField={onUpdateField}
        onUpdateValidation={vi.fn()}
      />,
    );

    expect(screen.getByRole('group', { name: '联动 1 条件' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '联动 1 动作' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '规则 1 条件字段 1' })).toHaveTextContent('状态');
    expect(screen.getByRole('button', { name: '规则 1 条件字段 1' })).not.toHaveTextContent('#状态');
    expect(screen.getByRole('button', { name: '规则 1 动作字段 1' })).toHaveTextContent('答案');
    expect(screen.getByRole('button', { name: '规则 1 动作字段 1' })).not.toHaveTextContent('#答案');
    expect(screen.getByRole('button', { name: '规则 1 动作 1 类型' })).toHaveTextContent('显示');

    fireEvent.click(screen.getByRole('button', { name: '规则 1 条件 1 值' }));
    fireEvent.click(screen.getByRole('option', { name: '拒绝' }));
    expect(onUpdateField.mock.lastCall?.[0]).toMatchObject({
      linkageRules: [
        {
          combinator: 'and',
          conditions: [{ fieldKey: 'status', operator: 'equals', value: 'reject' }],
          actions: [{ type: 'show', targetFieldKey: 'answer' }],
        },
      ],
    });
  });

  it('字段联动支持在属性配置中配置自动赋值规则', () => {
    const onUpdateField = vi.fn();
    const schemaFields: SchemaField[] = [
      {
        key: 'status',
        type: 'radio',
        label: '状态',
        options: [
          { label: '通过', value: 'ok' },
          { label: '拒绝', value: 'reject' },
        ],
      },
      {
        key: 'answer',
        type: 'radio',
        label: '答案',
        options: [
          { label: '合格', value: 'pass' },
          { label: '不合格', value: 'fail' },
        ],
      },
    ];

    render(
      <PropertyPanel
        field={{
          key: 'answer',
          type: 'radio',
          label: '答案',
          options: schemaFields[1].options,
          linkageRules: [
            {
              id: 'rule_set_value',
              combinator: 'and',
              conditions: [{ fieldKey: 'status', operator: 'equals', value: 'ok' }],
              actions: [{ type: 'setValue', targetFieldKey: 'answer', value: 'pass' }],
            },
          ],
        }}
        schemaFields={schemaFields}
        onAddLinkageRule={vi.fn()}
        onUpdateField={onUpdateField}
        onUpdateValidation={vi.fn()}
      />,
    );

    expect(screen.getByRole('group', { name: '联动 1 条件' })).toBeInTheDocument();
    const actionBlock = screen.getByRole('group', { name: '联动 1 动作' });
    expect(actionBlock).toBeInTheDocument();
    expect(within(actionBlock).queryByText('将')).not.toBeInTheDocument();
    const actionTypeButton = screen.getByRole('button', { name: '规则 1 动作 1 类型' });
    const actionFieldButton = screen.getByRole('button', { name: '规则 1 动作字段 1' });
    const actionValueButton = screen.getByRole('button', { name: '规则 1 动作 1 值' });
    const actionValueConnector = within(actionBlock).getByText('为');
    expect(actionTypeButton).toHaveTextContent('设置');
    expect(actionFieldButton).toHaveTextContent('答案');
    expect(actionValueConnector).toHaveClass(
      'designer-linkage-rule-editor__keyword',
      'designer-linkage-rule-editor__keyword--action',
    );
    expect(actionValueButton).toHaveTextContent('合格');
    expect(actionTypeButton.compareDocumentPosition(actionFieldButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(actionFieldButton.compareDocumentPosition(actionValueConnector) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(actionValueConnector.compareDocumentPosition(actionValueButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(actionFieldButton.compareDocumentPosition(actionValueButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '规则 1 动作 1 值' }));
    fireEvent.click(screen.getByRole('option', { name: '不合格' }));

    expect(onUpdateField.mock.lastCall?.[0]).toMatchObject({
      linkageRules: [
        {
          id: 'rule_set_value',
          conditions: [{ fieldKey: 'status', operator: 'equals', value: 'ok' }],
          actions: [{ type: 'setValue', targetFieldKey: 'answer', value: 'fail' }],
        },
      ],
    });
  });

  it('结构化联动规则支持在同一条规则里追加多个动作', () => {
    const onUpdateField = vi.fn();

    render(
      <PropertyPanel
        field={{
          key: 'answer',
          type: 'text',
          label: '答案',
          linkageRules: [
            {
              id: 'rule_multi_action',
              combinator: 'and',
              conditions: [{ fieldKey: 'status', operator: 'equals', value: 'ok' }],
              actions: [{ type: 'hide', targetFieldKey: 'answer' }],
            },
          ],
        }}
        schemaFields={[
          {
            key: 'status',
            type: 'radio',
            label: '状态',
            options: [
              { label: '通过', value: 'ok' },
              { label: '拒绝', value: 'reject' },
            ],
          },
          {
            key: 'answer',
            type: 'text',
            label: '答案',
          },
        ]}
        onAddLinkageRule={vi.fn()}
        onUpdateField={onUpdateField}
        onUpdateValidation={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '添加动作' }));
    expect(onUpdateField.mock.lastCall?.[0]).toMatchObject({
      linkageRules: [
        {
          id: 'rule_multi_action',
          combinator: 'and',
          conditions: [{ fieldKey: 'status', operator: 'equals', value: 'ok' }],
          actions: [
            { type: 'hide', targetFieldKey: 'answer' },
            { type: 'show', targetFieldKey: '' },
          ],
        },
      ],
    });
  });

  it('字段联动把条件和动作拆成两个色块并支持添加', () => {
    const onUpdateField = vi.fn();
    const schemaFields: SchemaField[] = [
      {
        key: 'preferred',
        type: 'radio',
        label: '偏好选择',
        options: [
          { label: 'A', value: 'A' },
          { label: 'B', value: 'B' },
        ],
      },
      {
        key: 'margin',
        type: 'radio',
        label: '优劣程度',
        options: [
          { label: '明显优于', value: '明显优于' },
          { label: '略优于', value: '略优于' },
        ],
      },
      {
        key: 'note',
        type: 'textarea',
        label: '备注',
      },
    ];

    render(
      <PropertyPanel
        field={{
          key: 'margin',
          type: 'radio',
          label: '优劣程度',
          options: schemaFields[1].options,
          linkageRules: [
            {
              id: 'rule_blocks',
              combinator: 'and',
              conditions: [{ fieldKey: 'preferred', operator: 'equals', value: 'A' }],
              actions: [{ type: 'setValue', targetFieldKey: 'margin', value: '明显优于' }],
            },
          ],
        }}
        schemaFields={schemaFields}
        onAddLinkageRule={vi.fn()}
        onUpdateField={onUpdateField}
        onUpdateValidation={vi.fn()}
      />,
    );

    expect(screen.getByRole('group', { name: '联动 1 条件' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '联动 1 动作' })).toBeInTheDocument();
    expect(screen.getByText('条件')).toBeInTheDocument();
    expect(screen.getByText('动作')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '添加条件' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '添加动作' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '添加条件' }));
    expect(onUpdateField.mock.lastCall?.[0]).toMatchObject({
      linkageRules: [
        {
          id: 'rule_blocks',
          combinator: 'and',
          conditions: [
            { fieldKey: 'preferred', operator: 'equals', value: 'A' },
            { fieldKey: '', operator: 'equals', value: '' },
          ],
          actions: [{ type: 'setValue', targetFieldKey: 'margin', value: '明显优于' }],
        },
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: '添加动作' }));
    expect(onUpdateField.mock.lastCall?.[0]).toMatchObject({
      linkageRules: [
        {
          id: 'rule_blocks',
          actions: [
            { type: 'setValue', targetFieldKey: 'margin', value: '明显优于' },
            { type: 'show', targetFieldKey: '' },
          ],
        },
      ],
    });
  });

  it('多条件左侧提供且或切换并更新 combinator', () => {
    const onUpdateField = vi.fn();

    render(
      <PropertyPanel
        field={{
          key: 'note',
          type: 'textarea',
          label: '备注',
          linkageRules: [
            {
              id: 'rule_combinator',
              combinator: 'and',
              conditions: [
                { fieldKey: 'preferred', operator: 'equals', value: 'A' },
                { fieldKey: 'margin', operator: 'equals', value: '明显优于' },
                { fieldKey: 'note', operator: 'contains', value: '需要复核' },
              ],
              actions: [{ type: 'show', targetFieldKey: 'note' }],
            },
          ],
        }}
        schemaFields={[
          {
            key: 'preferred',
            type: 'radio',
            label: '偏好选择',
            options: [{ label: 'A', value: 'A' }],
          },
          {
            key: 'margin',
            type: 'radio',
            label: '优劣程度',
            options: [{ label: '明显优于', value: '明显优于' }],
          },
          { key: 'note', type: 'textarea', label: '备注' },
        ]}
        onAddLinkageRule={vi.fn()}
        onUpdateField={onUpdateField}
        onUpdateValidation={vi.fn()}
      />,
    );

    const toggle = screen.getByRole('button', { name: '条件组合：且，点击切换为或' });
    expect(screen.getAllByRole('button', { name: /条件组合：/ })).toHaveLength(1);
    expect(toggle).toHaveTextContent('且');

    fireEvent.click(toggle);

    expect(onUpdateField.mock.lastCall?.[0]).toMatchObject({
      linkageRules: [
        {
          id: 'rule_combinator',
          combinator: 'or',
        },
      ],
    });
  });

  it('条件和动作行右侧圆形叉号可以删除当前行且保留最后一行', () => {
    const onUpdateField = vi.fn();

    render(
      <PropertyPanel
        field={{
          key: 'note',
          type: 'textarea',
          label: '备注',
          linkageRules: [
            {
              id: 'rule_remove_rows',
              combinator: 'and',
              conditions: [
                { fieldKey: 'preferred', operator: 'equals', value: 'A' },
                { fieldKey: 'margin', operator: 'equals', value: '明显优于' },
              ],
              actions: [
                { type: 'show', targetFieldKey: 'note' },
                { type: 'hide', targetFieldKey: 'margin' },
              ],
            },
          ],
        }}
        schemaFields={[
          { key: 'preferred', type: 'radio', label: '偏好选择', options: [{ label: 'A', value: 'A' }] },
          { key: 'margin', type: 'radio', label: '优劣程度', options: [{ label: '明显优于', value: '明显优于' }] },
          { key: 'note', type: 'textarea', label: '备注' },
        ]}
        onAddLinkageRule={vi.fn()}
        onUpdateField={onUpdateField}
        onUpdateValidation={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '删除条件 2' }));
    expect(onUpdateField.mock.lastCall?.[0]).toMatchObject({
      linkageRules: [
        {
          id: 'rule_remove_rows',
          conditions: [{ fieldKey: 'preferred', operator: 'equals', value: 'A' }],
        },
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: '删除动作 2' }));
    expect(onUpdateField.mock.lastCall?.[0]).toMatchObject({
      linkageRules: [
        {
          id: 'rule_remove_rows',
          actions: [{ type: 'show', targetFieldKey: 'note' }],
        },
      ],
    });
  });

  it('旧限制选项规则会展开成结构化规则并继续可编辑', () => {
    const onUpdateField = vi.fn();
    const schemaFields: SchemaField[] = [
      {
        key: 'preferred',
        type: 'radio',
        label: '偏好选择',
        options: [
          { label: 'A', value: 'A' },
          { label: 'B', value: 'B' },
          { label: 'tie', value: 'tie' },
        ],
      },
      {
        key: 'margin',
        type: 'radio',
        label: '优劣程度',
        options: [
          { label: '明显优于', value: '明显优于' },
          { label: '略优于', value: '略优于' },
          { label: '明显逊于', value: '明显逊于' },
          { label: '略逊于', value: '略逊于' },
          { label: '相当', value: '相当' },
        ],
      },
    ];
    const rule = {
      when: { fieldKey: 'preferred', operator: 'exists' as const },
      action: 'limitOptions' as const,
      targetFieldKey: 'margin',
      cases: [
        { value: 'A', optionValues: ['明显优于'] },
        { value: 'B', optionValues: ['明显逊于', '略逊于'] },
        { value: 'tie', optionValues: ['相当'] },
      ],
    };

    render(
      <PropertyPanel
        field={{
          key: 'margin',
          type: 'radio',
          label: '优劣程度',
          options: schemaFields[1].options,
          linkageRules: [rule],
        }}
        schemaFields={schemaFields}
        onAddLinkageRule={vi.fn()}
        onUpdateField={onUpdateField}
        onUpdateValidation={vi.fn()}
      />,
    );

    expect(screen.getByText('联动 1')).toBeInTheDocument();
    expect(screen.getByText('联动 2')).toBeInTheDocument();
    expect(screen.getByText('联动 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '规则 1 条件字段 1' })).toHaveTextContent('偏好选择');
    expect(screen.getByRole('button', { name: '规则 1 动作字段 1' })).toHaveTextContent('优劣程度');
    expect(screen.getByRole('button', { name: '规则 1 动作 1 类型' })).toHaveTextContent('限制');
    expect(screen.getByLabelText('规则 1 动作 1 双向约束')).toBeChecked();

    fireEvent.click(screen.getByLabelText('规则 1 动作 1 双向约束'));
    expect(onUpdateField.mock.lastCall?.[0].linkageRules?.[0]).toMatchObject({
      conditions: [{ fieldKey: 'preferred', operator: 'equals', value: 'A' }],
      actions: [{ type: 'limitOptions', targetFieldKey: 'margin', bidirectional: false }],
    });

    fireEvent.click(within(screen.getByRole('group', { name: '规则 1 限制选项' })).getByRole('button', { name: '略优于' }));
    expect(onUpdateField.mock.lastCall?.[0]).toMatchObject({
      linkageRules: [
        {
          conditions: [{ fieldKey: 'preferred', operator: 'equals', value: 'A' }],
          actions: [{ type: 'limitOptions', targetFieldKey: 'margin', optionValues: ['明显优于', '略优于'] }],
        },
        {
          conditions: [{ fieldKey: 'preferred', operator: 'equals', value: 'B' }],
          actions: [{ type: 'limitOptions', targetFieldKey: 'margin', optionValues: ['明显逊于', '略逊于'] }],
        },
        {
          conditions: [{ fieldKey: 'preferred', operator: 'equals', value: 'tie' }],
          actions: [{ type: 'limitOptions', targetFieldKey: 'margin', optionValues: ['相当'] }],
        },
      ],
    });
  });

  it('字段联动字段选择使用下拉菜单，并过滤非法字段类型', () => {
    const onUpdateField = vi.fn();
    const schemaFields: SchemaField[] = [
      {
        key: 'show_item',
        type: 'show_item',
        label: '题目展示',
        sourceKey: 'prompt',
      },
      {
        key: 'status',
        type: 'text',
        label: '状态',
      },
      {
        key: 'answer',
        type: 'text',
        label: '答案',
      },
    ];

    render(
      <PropertyPanel
        field={{
          key: 'answer',
          type: 'text',
          label: '答案',
          linkageRules: [
            {
              when: { fieldKey: '', operator: 'equals', value: 'ok' },
              action: 'show',
              targetFieldKey: 'status',
            },
          ],
        }}
        schemaFields={schemaFields}
        onAddLinkageRule={vi.fn()}
        onUpdateField={onUpdateField}
        onUpdateValidation={vi.fn()}
      />,
    );

    expect(screen.getByText('未完成')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '规则 1 条件字段 1' })).not.toBeInTheDocument();
    const fieldSelect = screen.getByRole('button', { name: '规则 1 条件字段 1' });
    expect(fieldSelect).toHaveTextContent('选择字段');
    fireEvent.click(fieldSelect);
    const conditionFieldMenu = screen.getByRole('listbox', { name: '规则 1 条件字段 1选项' });
    expect(conditionFieldMenu.parentElement).toBe(document.body);
    expect(conditionFieldMenu).toHaveClass('designer-linkage-rule-editor__inline-choice-menu--portal');
    expect(conditionFieldMenu.style.top).toMatch(/px$/);
    expect(conditionFieldMenu.style.left).toMatch(/px$/);
    expect(within(conditionFieldMenu).queryByRole('option', { name: '题目展示 · show_item' })).not.toBeInTheDocument();
    expect(within(conditionFieldMenu).getByRole('option', { name: '状态 · status' })).toBeInTheDocument();

    fireEvent.click(within(conditionFieldMenu).getByRole('option', { name: '状态 · status' }));
    expect(screen.queryByLabelText('规则 1 条件值输入')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '规则 1 条件 1 值' })).toHaveTextContent('填写值');
    expect(onUpdateField.mock.lastCall?.[0]).toMatchObject({
      linkageRules: [
        {
          combinator: 'and',
          conditions: [{ fieldKey: 'status', operator: 'equals', value: 'ok' }],
          actions: [{ type: 'show', targetFieldKey: 'status' }],
        },
      ],
    });
  });

  it('字段联动未选择字段时不展示空字段占位错误', () => {
    render(
      <PropertyPanel
        field={{
          key: 'answer',
          type: 'text',
          label: '答案',
          linkageRules: [
            {
              id: 'rule_empty',
              combinator: 'and',
              conditions: [{ fieldKey: '', operator: 'equals', value: '' }],
              actions: [{ type: 'show', targetFieldKey: '' }],
            },
          ],
        }}
        schemaFields={[
          {
            key: 'status',
            type: 'text',
            label: '状态',
          },
          {
            key: 'answer',
            type: 'text',
            label: '答案',
          },
        ]}
        onAddLinkageRule={vi.fn()}
        onUpdateField={vi.fn()}
        onUpdateValidation={vi.fn()}
      />,
    );

    expect(screen.queryByText('条件字段未设置。')).not.toBeInTheDocument();
    expect(screen.queryByText('动作目标字段未设置。')).not.toBeInTheDocument();
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
    const requirementInput = screen.getByLabelText('审核要求');
    expect(requirementInput).toHaveAttribute(
      'placeholder',
      '例如：必须保留商品核心信息，不得新增不存在的信息。',
    );
    fireEvent.focus(requirementInput);
    expect(requirementInput).toHaveAttribute('placeholder', '');
    fireEvent.blur(requirementInput);
    expect(requirementInput).toHaveAttribute(
      'placeholder',
      '例如：必须保留商品核心信息，不得新增不存在的信息。',
    );
  });

  it('单行输入、多行文本和标签选择支持配置 LLM 提示且不展示 ShowItem 引用胶囊', () => {
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
    const llmPromptTextarea = screen.getByLabelText('LLM提示内容') as HTMLTextAreaElement;
    expect(llmPromptTextarea).toHaveValue('请根据 #prompt 输出清洗标题。');
    expect(llmPromptTextarea).toHaveClass('designer-llm-prompt-textarea');
    expect(llmPromptTextarea.closest('.designer-property-row')).not.toHaveClass(
      'designer-property-row--metadata',
    );
    expect(screen.queryByLabelText('可引用展示字段')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '#Prompt' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '#回答 A' })).not.toBeInTheDocument();

    Object.defineProperty(llmPromptTextarea, 'scrollHeight', {
      configurable: true,
      value: 132,
    });
    fireEvent.change(llmPromptTextarea, {
      target: { value: '请根据 #prompt 输出标签。' },
    });
    expect(llmPromptTextarea.style.height).toBe('132px');
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
    expect(screen.getByText('选项')).toBeInTheDocument();
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
    expect(screen.getByLabelText('标题').closest('.designer-property-row')).toHaveClass(
      'designer-property-row--metadata',
    );
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
    expect(screen.getByLabelText('标题')).toHaveValue('分步标注');
    expect(screen.getByLabelText('标题').closest('.designer-property-row')).toHaveClass(
      'designer-property-row--metadata',
    );
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

  it('选项字段向右拖拽时不受拖拽标签自身位移影响，右侧标签会及时让位', () => {
    vi.useFakeTimers();
    const onUpdateField = vi.fn();

    try {
      render(
        <PropertyPanel
          field={{
            key: 'preferred_field',
            fieldKey: 'preferred',
            type: 'checkbox',
            label: '评估维度',
            options: [
              { label: '准确性', value: 'accuracy' },
              { label: '完整性', value: 'coverage' },
              { label: '安全性', value: 'safety' },
            ],
          }}
          onAddLinkageRule={vi.fn()}
          onUpdateField={onUpdateField}
          onUpdateValidation={vi.fn()}
        />,
      );

      const optionA = screen.getByText('准确性').closest('.designer-option-bubble') as HTMLElement;
      const optionB = screen.getByText('完整性').closest('.designer-option-bubble') as HTMLElement;
      const optionC = screen.getByText('安全性').closest('.designer-option-bubble') as HTMLElement;

      mockOptionRect(optionA, { left: 44, width: 80 });
      mockOptionRect(optionB, { left: 132, width: 80 });
      mockOptionRect(optionC, { left: 220, width: 80 });

      const optionASurface = optionA.querySelector('.designer-option-bubble__surface') as HTMLElement;

      fireEvent(optionASurface, createPointerTestEvent('pointerdown', { button: 0, clientX: 50, pointerId: 1 }));

      act(() => {
        vi.advanceTimersByTime(160);
      });

      // Browser layout includes the active tag's transform during dragging. The sorter must use
      // the initial centers captured at drag start, otherwise rightward dragging stalls.
      mockOptionRect(optionA, { left: 174, width: 80 });
      fireEvent(optionASurface, createPointerTestEvent('pointermove', { clientX: 180, pointerId: 1 }));

      expect(optionB).toHaveClass('designer-option-bubble--drag-shifted');
      expect(optionC).not.toHaveClass('designer-option-bubble--drag-shifted');

      fireEvent(optionASurface, createPointerTestEvent('pointerup', { clientX: 180, pointerId: 1 }));

      expect(onUpdateField).toHaveBeenLastCalledWith({
        options: [
          { label: '完整性', value: 'coverage' },
          { label: '准确性', value: 'accuracy' },
          { label: '安全性', value: 'safety' },
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

  it('ShowItem 字段同时绑定待标注字段时提示模型不会读取上传演示值', () => {
    const field: SchemaField = {
      key: 'show_item_1',
      type: 'show_item',
      label: '评测样本',
      displayConfig: {
        layout: 'table',
        fields: [
          { sourceKey: 'prompt', label: '问题' },
          { sourceKey: 'dimensions', label: '演示维度' },
        ],
      },
    };

    render(
      <PropertyPanel
        field={field}
        schemaFields={[
          field,
          {
            key: 'dimensions_field',
            fieldKey: 'dimensions',
            sourceKey: 'dimensions',
            type: 'checkbox',
            label: '评价维度',
          },
        ]}
        onAddLinkageRule={vi.fn()}
        onUpdateField={vi.fn()}
        onUpdateValidation={vi.fn()}
      />,
    );

    const warning = screen.getByRole('alert');

    expect(warning).toHaveTextContent('评价维度（dimensions）同时作为题目展示字段和待标注字段使用');
    expect(warning).toHaveTextContent('模型不会读取上传文件里的演示值');
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
