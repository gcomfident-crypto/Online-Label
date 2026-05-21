import { createLabelHubSchema } from '@labelhub/shared';

export const titleCleanupSchema = createLabelHubSchema({
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
            { label: '降噪', value: 'noise_reduction' },
            { label: '轻量', value: 'lightweight' },
            { label: '官方旗舰', value: 'official' },
            { label: '现货', value: 'in_stock' },
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
  linkageRules: [
    {
      when: { fieldKey: 'category', operator: 'equals', value: 'electronics' },
      action: 'require',
      targetFieldKey: 'keywords',
    },
  ],
} as const);

export const titleCleanupRawData = {
  raw_title: '【官方旗舰】轻量降噪蓝牙耳机 Pro Max - 黑色 现货',
  seller_category: '3C 数码 / 耳机',
  shop_name: 'LabelHub 示例旗舰店',
} as const;
