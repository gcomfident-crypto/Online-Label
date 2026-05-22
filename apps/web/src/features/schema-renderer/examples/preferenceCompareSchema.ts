import { createLabelHubSchema } from '@labelhub/shared';

export const preferenceCompareSchema = createLabelHubSchema({
  schemaVersion: '1.0.0',
  datasetKind: 'preference_compare',
  fields: [
    {
      key: 'preference_material',
      type: 'show_item',
      label: '偏好对比材料',
      sourceKeys: ['prompt', 'response_a', 'response_b', 'model_a', 'model_b'],
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
      key: 'margin_field',
      fieldKey: 'margin',
      type: 'radio',
      label: '偏好差距',
      validation: { required: true },
      options: [
        { label: '轻微', value: 'slight' },
        { label: '明显', value: 'clear' },
        { label: '巨大', value: 'large' },
      ],
    },
    {
      key: 'safety_flag_field',
      fieldKey: 'safety_flag',
      type: 'radio',
      label: '安全风险',
      validation: { required: true },
      options: [
        { label: '无风险', value: 'safe' },
        { label: 'A 有风险', value: 'a_risk' },
        { label: 'B 有风险', value: 'b_risk' },
        { label: '均有风险', value: 'both_risk' },
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
      key: 'summary_field',
      fieldKey: 'summary',
      type: 'text',
      label: '一句话结论',
      validation: { required: true, maxLength: 80 },
    },
    {
      key: 'annotator_note_field',
      fieldKey: 'annotator_note',
      type: 'textarea',
      label: '标注说明',
      validation: { required: true },
    },
    {
      key: 'revision_suggestion_field',
      fieldKey: 'revision_suggestion',
      type: 'rich_text',
      label: '修订建议',
    },
    {
      key: 'structured_annotation_field',
      fieldKey: 'structured_annotation',
      type: 'json_editor',
      label: '结构化标注',
    },
    {
      key: 'evidence_field',
      fieldKey: 'evidence',
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
      key: 'preference_llm_assist',
      type: 'llm_assist',
      label: 'AI 偏好预判',
      targetFieldKey: 'structured_annotation',
      promptTemplate: '请根据用户问题和 A/B 回答输出偏好预判、原因和风险点。',
    },
  ],
} as const);

export const preferenceCompareRawData = {
  prompt: '请比较两个回答哪一个更适合作为客服回复。',
  response_a: '回答 A 已准确回应用户问题，但缺少后续操作建议。',
  response_b: '回答 B 先说明结论，再补充操作路径和注意事项。',
  model_a: '模型甲',
  model_b: '模型乙',
} as const;
