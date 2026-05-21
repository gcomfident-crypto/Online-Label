import { createLabelHubSchema, type LabelHubSchema } from './schema.ts';

export type RendererSampleSchemaResponse = {
  schemas: {
    qa_quality: LabelHubSchema;
    preference_compare: LabelHubSchema;
    title_cleanup: LabelHubSchema;
  };
};

export const qaQualitySampleSchema = createLabelHubSchema({
  schemaVersion: '1.0.0',
  datasetKind: 'qa_quality',
  fields: [
    {
      key: 'qa_material',
      type: 'show_item',
      label: '题目原始数据',
      sourceKeys: [
        'prompt',
        'model_answer',
        'reference',
        'media_type',
        'media_url',
        'content_markdown',
      ],
    },
    {
      key: 'relevance_score_field',
      fieldKey: 'relevance_score',
      type: 'radio',
      label: '相关性评分',
      validation: { required: true },
      options: [
        { label: '1 分', value: '1' },
        { label: '2 分', value: '2' },
        { label: '3 分', value: '3' },
        { label: '4 分', value: '4' },
        { label: '5 分', value: '5' },
      ],
    },
    {
      key: 'summary_field',
      fieldKey: 'summary',
      type: 'text',
      label: '一句话总评',
      validation: { required: true, maxLength: 60 },
    },
    {
      key: 'structured_note_field',
      fieldKey: 'structured_note',
      type: 'json_editor',
      label: '修正后的标准答案 / 评分明细',
    },
    {
      key: 'qa_llm_assist',
      type: 'llm_assist',
      label: 'AI 预评分参考',
      targetFieldKey: 'structured_note',
      promptTemplate: '请根据题目、模型回答、参考答案和标注员评分给出结构化预审建议。',
    },
  ],
} as const);

export const preferenceCompareSampleSchema = createLabelHubSchema({
  schemaVersion: '1.0.0',
  datasetKind: 'preference_compare',
  fields: [
    {
      key: 'preference_material',
      type: 'show_item',
      label: '偏好对比材料',
      sourceKeys: [
        'prompt',
        'media_type',
        'media_url',
        'response_a',
        'response_b',
        'model_a',
        'model_b',
      ],
    },
    {
      key: 'preferred_field',
      fieldKey: 'preferred',
      type: 'radio',
      label: '偏好选择',
      validation: { required: true },
      options: [
        { label: '回答 A', value: 'A' },
        { label: '回答 B', value: 'B' },
        { label: '平局', value: 'tie' },
      ],
    },
    {
      key: 'dimensions_field',
      fieldKey: 'dimensions',
      type: 'tag_select',
      label: '判断维度',
      options: [
        { label: '有用性', value: 'helpfulness' },
        { label: '准确性', value: 'accuracy' },
        { label: '完整性', value: 'completeness' },
        { label: '安全性', value: 'safety' },
        { label: '表达质量', value: 'style' },
      ],
    },
    {
      key: 'evidence_file_field',
      fieldKey: 'evidence_file',
      type: 'file_upload',
      label: '证据附件',
    },
    {
      key: 'evidence_image_field',
      fieldKey: 'evidence_image',
      type: 'image_upload',
      label: '证据截图',
    },
    {
      key: 'structured_annotation_field',
      fieldKey: 'structured_annotation',
      type: 'json_editor',
      label: '结构化标注',
    },
    {
      key: 'preference_llm_assist',
      type: 'llm_assist',
      label: 'AI 偏好预判',
      targetFieldKey: 'structured_annotation',
      promptTemplate: '请根据用户问题和 A/B 回答输出偏好预判、原因和风险点。',
    },
  ],
} as const);

export const titleCleanupSampleSchema = createLabelHubSchema({
  schemaVersion: '1.0.0',
  datasetKind: 'generic_json',
  fields: [
    {
      key: 'title_cleanup_group',
      type: 'group',
      label: '商品标题清洗 v3',
      fields: [
        {
          key: 'title_material',
          type: 'show_item',
          label: '原始商品标题',
          sourceKeys: ['raw_title', 'seller_category', 'shop_name'],
        },
        {
          key: 'cleaned_title_field',
          fieldKey: 'cleaned_title',
          type: 'text',
          label: '清洗后标题',
          placeholder: '保留核心商品名、规格和颜色',
          validation: { required: true, maxLength: 35 },
        },
        {
          key: 'category_field',
          fieldKey: 'category',
          type: 'radio',
          label: '主类目',
          validation: { required: true },
          options: [
            { label: '数码配件', value: 'electronics' },
            { label: '服饰鞋包', value: 'fashion' },
            { label: '家居日用', value: 'home' },
          ],
        },
        {
          key: 'cleanup_llm_assist',
          type: 'llm_assist',
          label: 'AI 标题清洗建议',
          targetFieldKey: 'cleaned_title',
          promptTemplate: '请去除营销词和噪声，保留商品核心标题。',
        },
      ],
    },
  ],
} as const);

export const getRendererSampleSchemas = (): RendererSampleSchemaResponse => ({
  schemas: {
    qa_quality: qaQualitySampleSchema,
    preference_compare: preferenceCompareSampleSchema,
    title_cleanup: titleCleanupSampleSchema,
  },
});
