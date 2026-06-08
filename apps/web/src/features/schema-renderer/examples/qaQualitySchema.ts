import { createLabelHubSchema } from '@labelhub/shared';

const demoImageUrl =
  'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20640%20360%22%3E%3Crect%20width%3D%22640%22%20height%3D%22360%22%20fill%3D%22%23f7f4ed%22%2F%3E%3Crect%20x%3D%22104%22%20y%3D%2284%22%20width%3D%22432%22%20height%3D%22192%22%20rx%3D%2224%22%20fill%3D%22%23fffaf1%22%20stroke%3D%22%239d513f%22%20stroke-width%3D%226%22%2F%3E%3Cpath%20d%3D%22M166%20224%20260%20142%20332%20204%20392%20156%20478%20224%22%20fill%3D%22none%22%20stroke%3D%22%237b5e2e%22%20stroke-width%3D%2214%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Ccircle%20cx%3D%22458%22%20cy%3D%22118%22%20r%3D%2222%22%20fill%3D%22%239d513f%22%2F%3E%3Ctext%20x%3D%22320%22%20y%3D%22316%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2C%20sans-serif%22%20font-size%3D%2228%22%20fill%3D%22%2317211b%22%3ELabelHub%20%E7%A4%BA%E4%BE%8B%E5%9B%BE%E7%89%87%3C%2Ftext%3E%3C%2Fsvg%3E';

const demoVideoUrl = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';

const fivePointScoreOptions = [
  { label: '1 分', value: '1' },
  { label: '2 分', value: '2' },
  { label: '3 分', value: '3' },
  { label: '4 分', value: '4' },
  { label: '5 分', value: '5' },
] as const;

export const qaQualitySchema = createLabelHubSchema({
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

export const qaQualityRawDataSamples = [
  {
    prompt: '请说明光合作用的主要过程。',
    model_answer: '光合作用会吸收二氧化碳并释放氧气。',
    reference: '应包含光能转化、二氧化碳和水生成有机物、释放氧气。',
    media_type: 'text',
  },
  {
    prompt: '请根据图片判断设备是否存在明显损坏。',
    model_answer: '设备外壳有裂纹，建议维修。',
    reference: '需要指出外壳裂纹并建议暂停使用。',
    media_type: 'image',
    media_url: demoImageUrl,
  },
  {
    prompt: '请根据视频总结客服是否完整说明退款步骤。',
    model_answer: '客服说明了申请入口，但未说明审核时效。',
    reference: '应包含申请入口、材料要求、审核时效和到账方式。',
    media_type: 'video',
    media_url: demoVideoUrl,
  },
  {
    prompt: '请阅读 Markdown 材料后判断回答是否完整。',
    model_answer: '回答覆盖了基础信息。',
    reference: '需要覆盖条款、例外情况和操作路径。',
    media_type: 'markdown',
    content_markdown: '# 售后规则\n\n- 七天内可申请退货\n- 特价商品需人工审核',
  },
] as const;
