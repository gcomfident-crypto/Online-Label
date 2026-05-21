import { createLabelHubSchema } from '@labelhub/shared';

const demoImageUrl =
  'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20320%20180%22%3E%3Crect%20width%3D%22320%22%20height%3D%22180%22%20fill%3D%22%23fffaf1%22%2F%3E%3Cpath%20d%3D%22M54%20122%20114%2064%20170%20112%20212%2080%20268%20122%22%20fill%3D%22none%22%20stroke%3D%22%23194c3f%22%20stroke-width%3D%2210%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Ccircle%20cx%3D%22246%22%20cy%3D%2254%22%20r%3D%2214%22%20fill%3D%22%239d513f%22%2F%3E%3Ctext%20x%3D%22160%22%20y%3D%22158%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2C%20sans-serif%22%20font-size%3D%2218%22%20fill%3D%22%2317211b%22%3E%E5%85%A8%E9%83%A8%E7%89%A9%E6%96%99%3C%2Ftext%3E%3C%2Fsvg%3E';

export const allMaterialsSchema = createLabelHubSchema({
  schemaVersion: '1.0.0',
  datasetKind: 'generic_json',
  fields: [
    {
      key: 'material',
      type: 'show_item',
      label: '全部物料原始数据',
      sourceKeys: ['prompt', 'media_type', 'media_url'],
    },
    {
      key: 'basic_group',
      type: 'group',
      label: '基础物料',
      fields: [
        {
          key: 'text_field',
          fieldKey: 'text_answer',
          type: 'text',
          label: '单行输入示例',
          validation: { required: true, maxLength: 20 },
        },
        {
          key: 'textarea_field',
          fieldKey: 'textarea_answer',
          type: 'textarea',
          label: '多行文本示例',
          validation: { minLength: 2, maxLength: 80 },
        },
        {
          key: 'radio_field',
          fieldKey: 'radio_answer',
          type: 'radio',
          label: '单选示例',
          options: [
            { label: '通过', value: 'pass' },
            { label: '打回', value: 'reject' },
          ],
        },
        {
          key: 'checkbox_field',
          fieldKey: 'checkbox_answer',
          type: 'checkbox',
          label: '多选示例',
          options: [
            { label: '事实核查', value: 'fact_check' },
            { label: '格式核查', value: 'format_check' },
          ],
        },
        {
          key: 'tag_field',
          fieldKey: 'tag_answer',
          type: 'tag_select',
          label: '标签多选示例',
          options: [
            { label: '高优先级', value: 'high_priority' },
            { label: '需复核', value: 'needs_review' },
          ],
        },
      ],
    },
    {
      key: 'advanced_tabs',
      type: 'tabs',
      label: '多 Tab 布局',
      tabs: [
        {
          key: 'content',
          label: '内容字段',
          fields: [
            {
              key: 'rich_text_field',
              fieldKey: 'rich_text_answer',
              type: 'rich_text',
              label: '富文本示例',
            },
            {
              key: 'json_field',
              fieldKey: 'json_answer',
              type: 'json_editor',
              label: 'JSON 编辑器示例',
            },
          ],
        },
        {
          key: 'upload',
          label: '上传字段',
          fields: [
            {
              key: 'file_field',
              fieldKey: 'file_answer',
              type: 'file_upload',
              label: '文件上传示例',
            },
            {
              key: 'image_field',
              fieldKey: 'image_answer',
              type: 'image_upload',
              label: '图片上传示例',
            },
          ],
        },
      ],
    },
    {
      key: 'all_materials_llm',
      type: 'llm_assist',
      label: 'AI 全物料建议',
      targetFieldKey: 'json_answer',
      promptTemplate: '请根据全部物料输出结构化调试建议。',
    },
  ],
} as const);

export const allMaterialsRawData = {
  prompt: '请检查全部 Renderer 物料是否能正常渲染。',
  media_type: 'image',
  media_url: demoImageUrl,
} as const;
