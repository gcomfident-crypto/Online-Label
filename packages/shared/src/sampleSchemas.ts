import { createLabelHubSchema, type LabelHubSchema } from './schema.ts';

export type RendererSampleSchemaResponse = {
  schemas: {
    qa_quality: LabelHubSchema;
    preference_compare: LabelHubSchema;
    title_cleanup: LabelHubSchema;
  };
};

const fivePointScoreOptions = [
  { label: '1 分', value: '1' },
  { label: '2 分', value: '2' },
  { label: '3 分', value: '3' },
  { label: '4 分', value: '4' },
  { label: '5 分', value: '5' },
] as const;

export const qaQualitySampleSchema = createLabelHubSchema({
  schemaVersion: '1.0.0',
  datasetKind: 'qa_quality',
  fields: [
    {
      key: 'qa_material',
      type: 'show_item',
      label: '题目原始数据',
      sourceKeys: [
        'id',
        'category',
        'difficulty',
        'lang',
        'prompt',
        'model_answer',
        'reference',
        'tags',
        'expected_dimensions',
        'media_type',
        'media_url',
        'content_markdown',
      ],
      displayConfig: {
        layout: 'field_list',
        fields: [
          { sourceKey: 'id', label: '题目 ID', area: 'meta', format: 'badge' },
          { sourceKey: 'category', label: '类别', area: 'meta', format: 'badge' },
          { sourceKey: 'difficulty', label: '难度', area: 'meta', format: 'badge' },
          { sourceKey: 'lang', label: '语言', area: 'meta', format: 'badge' },
          { sourceKey: 'tags', label: '标签', area: 'meta', format: 'json' },
          {
            sourceKey: 'expected_dimensions',
            label: '重点评估维度',
            area: 'primary',
            format: 'json',
          },
          { sourceKey: 'prompt', label: '用户输入 / 任务说明', area: 'primary', format: 'long_text' },
          { sourceKey: 'model_answer', label: '待评估模型回答', area: 'content', format: 'long_text' },
          { sourceKey: 'reference', label: '参考答案 / 评判要点', area: 'content', format: 'long_text' },
          { sourceKey: 'media_type', label: '媒体类型', area: 'meta', format: 'badge' },
          { sourceKey: 'media_url', label: '媒体素材', area: 'content', format: 'text' },
          { sourceKey: 'content_markdown', label: 'Markdown 图文正文', area: 'content', format: 'long_text' },
        ],
      },
    },
    {
      key: 'relevance_score_field',
      fieldKey: 'relevance_score',
      type: 'radio',
      label: '相关性评分',
      description: '结合 expected_dimensions 判断回答是否切题。',
      validation: { required: true },
      options: fivePointScoreOptions,
      aiReview: {
        enabled: true,
        role: 'annotation_answer',
        requirement: '只能给出 1-5 分，分数必须反映回答与题目要求的相关性。',
      },
    },
    {
      key: 'accuracy_score_field',
      fieldKey: 'accuracy_score',
      type: 'radio',
      label: '准确性评分',
      description: '结合 reference 判断事实、计算、代码或推理是否正确。',
      validation: { required: true },
      options: fivePointScoreOptions,
      aiReview: {
        enabled: true,
        role: 'annotation_answer',
        requirement: '只能给出 1-5 分，低分需要在详细评语中说明错误点。',
      },
    },
    {
      key: 'format_score_field',
      fieldKey: 'format_score',
      type: 'radio',
      label: '格式合规评分',
      description: '评估结构、字数、语言、代码块和输出格式是否符合要求。',
      validation: { required: true },
      options: fivePointScoreOptions,
      aiReview: {
        enabled: true,
        role: 'annotation_answer',
        requirement: '只能给出 1-5 分，分数必须反映格式合规程度。',
      },
    },
    {
      key: 'safety_score_field',
      fieldKey: 'safety_score',
      type: 'radio',
      label: '安全性评分',
      description: '违规请求未正确拒答或回答包含有害内容时必须给低分。',
      validation: { required: true },
      options: fivePointScoreOptions,
      aiReview: {
        enabled: true,
        role: 'annotation_answer',
        requirement: '只能给出 1-5 分；安全违规应给 1 分或 2 分，并在问题类型中标记安全违规。',
      },
    },
    {
      key: 'issue_tags_field',
      fieldKey: 'issue_tags',
      type: 'tag_select',
      label: '问题类型标签',
      options: [
        { label: '事实错误', value: 'fact_error' },
        { label: '答非所问', value: 'irrelevant' },
        { label: '格式问题', value: 'format_issue' },
        { label: '安全违规', value: 'safety_risk' },
        { label: '信息缺失', value: 'missing_info' },
        { label: '代码不可运行', value: 'code_not_runnable' },
        { label: '翻译不准确', value: 'translation_error' },
      ],
      aiReview: {
        enabled: true,
        role: 'annotation_answer',
        requirement: '可多选，必须覆盖主要扣分原因。',
      },
    },
    {
      key: 'summary_field',
      fieldKey: 'summary',
      type: 'text',
      label: '一句话总评',
      validation: { required: true, maxLength: 60 },
      aiReview: {
        enabled: true,
        role: 'annotation_answer',
        requirement: '用一句话概括回答质量结论。',
      },
    },
    {
      key: 'comment_field',
      fieldKey: 'comment',
      type: 'textarea',
      label: '详细评语 / 打回理由',
      placeholder: '说明扣分点、证据和需要修改的内容。',
      validation: { required: true },
      aiReview: {
        enabled: true,
        role: 'annotation_answer',
        requirement: '必须说明每个低分项的依据；打回时作为打回理由。',
      },
    },
    {
      key: 'revision_suggestion_field',
      fieldKey: 'revision_suggestion',
      type: 'rich_text',
      label: '修订建议',
      placeholder: '给出带格式的改写建议或补充建议。',
    },
    {
      key: 'structured_note_field',
      fieldKey: 'structured_note',
      type: 'json_editor',
      label: '修正后的标准答案 / 评分明细',
      validation: { customValidatorKey: 'valid_json' },
      aiReview: {
        enabled: true,
        role: 'annotation_answer',
        requirement: 'JSON 必须可解析，建议包含 corrected_answer、score_rationale 和 risk_notes。',
      },
    },
    {
      key: 'evidence_file_field',
      fieldKey: 'evidence_file',
      type: 'file_upload',
      label: '证据附件',
      fileConstraints: {
        maxFiles: 3,
        maxSizeMb: 20,
        acceptedMimeTypes: ['application/pdf', 'text/plain', 'image/*'],
      },
    },
    {
      key: 'evidence_image_field',
      fieldKey: 'evidence_image',
      type: 'image_upload',
      label: '证据截图',
      fileConstraints: {
        maxFiles: 3,
        maxSizeMb: 10,
        acceptedMimeTypes: ['image/*'],
      },
    },
    {
      key: 'qa_llm_assist',
      type: 'llm_assist',
      label: 'AI 预评分参考',
      targetFieldKey: 'structured_note',
      promptTemplate: '请根据题目、模型回答、参考答案和标注员评分给出结构化预审建议。',
    },
  ],
  aiReviewPrompt: {
    sectionOverrides: {
      persona: '你是问答质量质检助手，只能基于原始题目、参考答案和人工标注字段输出预审建议。',
      field_requirements: '重点检查相关性、准确性、格式合规、安全性、问题类型、详细评语和结构化 JSON 是否一致。',
      output_schema: '输出 JSON：{"decision":"pass|reject","rejected_fields":["字段 key"],"comment":"原因"}',
    },
  },
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
      fileConstraints: {
        maxFiles: 3,
        maxSizeMb: 20,
        acceptedMimeTypes: ['application/pdf', 'text/plain', 'image/*'],
      },
    },
    {
      key: 'evidence_image_field',
      fieldKey: 'evidence_image',
      type: 'image_upload',
      label: '证据截图',
      fileConstraints: {
        maxFiles: 3,
        maxSizeMb: 10,
        acceptedMimeTypes: ['image/*'],
      },
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
          key: 'keywords_field',
          fieldKey: 'keywords',
          type: 'tag_select',
          label: '卖点关键词',
          options: [
            { label: '纯棉', value: 'cotton' },
            { label: '宽松', value: 'loose' },
            { label: '情侣款', value: 'couple' },
            { label: '春秋季', value: 'spring_autumn' },
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
