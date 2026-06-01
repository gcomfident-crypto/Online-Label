import { describe, expect, it } from 'vitest';

import {
  createAutoShowItemPreviewRecords,
  createAutoShowItemTemplateSchema,
  createAutoTemplateClassificationRequest,
} from './autoShowItemTemplate';

describe('autoShowItemTemplate', () => {
  it('JSON 文件只把第一个完整对象交给大模型字段分类', () => {
    const request = createAutoTemplateClassificationRequest(
      [
        {
          id: 'P0001',
          prompt: '解释什么是过拟合',
          response_a: '回答 A',
          preferred: 'A',
          dimensions: ['accuracy', 'safety'],
        },
        {
          id: 'P0002',
          prompt: '',
          response_b: '回答 B',
          preferred: '',
          annotator_note: '需要人工确认',
        },
      ],
      'preference_compare.json',
    );

    expect(request).toMatchObject({
      fileName: 'preference_compare.json',
      fields: [
        {
          sourceKey: 'id',
          samples: ['P0001'],
          valueTypes: ['string'],
          filledCount: 1,
          totalCount: 1,
        },
        {
          sourceKey: 'prompt',
          samples: ['解释什么是过拟合'],
          valueTypes: ['string'],
          filledCount: 1,
          totalCount: 1,
        },
        {
          sourceKey: 'response_a',
          samples: ['回答 A'],
          valueTypes: ['string'],
          filledCount: 1,
          totalCount: 1,
        },
        {
          sourceKey: 'preferred',
          samples: ['A'],
          valueTypes: ['string'],
          filledCount: 1,
          totalCount: 1,
        },
        {
          sourceKey: 'dimensions',
          samples: [['accuracy', 'safety']],
          valueTypes: ['array'],
          filledCount: 1,
          totalCount: 1,
        },
      ],
      records: [
        {
          id: 'P0001',
          prompt: '解释什么是过拟合',
          response_a: '回答 A',
          preferred: 'A',
          dimensions: ['accuracy', 'safety'],
        },
      ],
    });
    expect(request.fieldStats?.map((stats) => stats.sourceKey)).toEqual([
      'id',
      'prompt',
      'response_a',
      'preferred',
      'dimensions',
      'response_b',
      'annotator_note',
    ]);
    expect(request.fieldStats?.find((stats) => stats.sourceKey === 'dimensions')).toMatchObject({
      optionCandidates: [
        { label: 'accuracy', value: 'accuracy' },
        { label: 'safety', value: 'safety' },
      ],
      hasMultiValue: true,
      distinctCount: 2,
    });
  });

  it('按照大模型分类结果生成 ShowItem 和需要用户打标的画布物料', () => {
    const schema = createAutoShowItemTemplateSchema(
      [
        {
          id: 'P0001',
          task_type: '知识问答',
          lang: 'zh',
          prompt: '解释什么是过拟合，并给一个通俗例子。',
          response_a: '过拟合指模型在训练集表现很好但泛化差。',
          model_a: 'doubao-pro',
          response_b: '过拟合就是模型训练得太好了。',
          model_b: 'baseline-7b',
          preferred: 'A',
          margin: '明显优于',
          dimensions: '准确性 | 完整性 | 可读性',
          safety_flag: '否',
          annotator_note: 'A 含定义+类比，B 过于笼统。',
        },
      ],
      'preference_compare.xlsx',
      {
        layout: 'comparison',
        displayFields: [
          { sourceKey: 'id', label: '题目ID', area: 'meta', format: 'badge' },
          { sourceKey: 'task_type', label: '任务类型', area: 'meta', format: 'badge' },
          { sourceKey: 'lang', label: '语言', area: 'meta', format: 'badge' },
          { sourceKey: 'prompt', label: '问题', area: 'primary', format: 'long_text', maxLines: 8 },
          { sourceKey: 'response_a', label: '回答 A', area: 'content', format: 'long_text', maxLines: 12 },
          { sourceKey: 'model_a', label: '模型 A', area: 'meta', format: 'badge' },
          { sourceKey: 'response_b', label: '回答 B', area: 'content', format: 'long_text', maxLines: 12 },
          { sourceKey: 'model_b', label: '模型 B', area: 'meta', format: 'badge' },
        ],
        annotationFields: [
          {
            sourceKey: 'preferred',
            label: '偏好选择',
            type: 'radio',
            options: [
              { label: 'A', value: 'A' },
              { label: 'B', value: 'B' },
            ],
            required: true,
          },
          { sourceKey: 'margin', label: '优劣差距', type: 'text' },
          {
            sourceKey: 'dimensions',
            label: '评价维度',
            type: 'checkbox',
            description: '选择所有适用的评价维度标签',
            options: [
              { label: '准确性', value: 'accuracy' },
              { label: '完整性', value: 'completeness' },
            ],
          },
          { sourceKey: 'safety_flag', label: '安全标记', type: 'radio' },
          { sourceKey: 'annotator_note', label: '标注备注', type: 'textarea' },
        ],
      },
    );

    expect(schema).toEqual({
      schemaVersion: 'auto-draft',
      datasetKind: 'generic_json',
      fields: [
        {
          key: 'auto_show_item',
          type: 'show_item',
          label: 'preference_compare.xlsx',
          sourceKeys: ['id', 'task_type', 'lang', 'prompt', 'response_a', 'model_a', 'response_b', 'model_b'],
          displayConfig: {
            layout: 'table',
            fields: [
              { sourceKey: 'id', label: '题目ID', area: 'meta', format: 'badge' },
              { sourceKey: 'task_type', label: '任务类型', area: 'meta', format: 'badge' },
              { sourceKey: 'lang', label: '语言', area: 'meta', format: 'badge' },
              { sourceKey: 'prompt', label: '问题', area: 'primary', format: 'long_text', maxLines: 8 },
              { sourceKey: 'response_a', label: '回答 A', area: 'content', format: 'long_text', maxLines: 12 },
              { sourceKey: 'model_a', label: '模型 A', area: 'meta', format: 'badge' },
              { sourceKey: 'response_b', label: '回答 B', area: 'content', format: 'long_text', maxLines: 12 },
              { sourceKey: 'model_b', label: '模型 B', area: 'meta', format: 'badge' },
            ],
          },
        },
        {
          key: 'preferred',
          fieldKey: 'preferred',
          sourceKey: 'preferred',
          type: 'radio',
          label: '偏好选择',
          options: [
            { label: 'A', value: 'A' },
            { label: 'B', value: 'B' },
          ],
          validation: { required: true },
        },
        {
          key: 'margin',
          fieldKey: 'margin',
          sourceKey: 'margin',
          type: 'text',
          label: '优劣差距',
          validation: { required: true },
        },
        {
          key: 'dimensions',
          fieldKey: 'dimensions',
          sourceKey: 'dimensions',
          type: 'checkbox',
          label: '评价维度',
          description: '选择所有适用的评价维度标签',
          options: [
            { label: '准确性', value: '准确性' },
            { label: '完整性', value: '完整性' },
            { label: '可读性', value: '可读性' },
          ],
          validation: { required: true },
        },
        {
          key: 'safety_flag',
          fieldKey: 'safety_flag',
          sourceKey: 'safety_flag',
          type: 'radio',
          label: '安全标记',
          options: [{ label: '否', value: '否' }],
          validation: { required: true },
        },
        {
          key: 'annotator_note',
          fieldKey: 'annotator_note',
          sourceKey: 'annotator_note',
          type: 'textarea',
          label: '标注备注',
          validation: { required: true },
        },
      ],
    });
  });

  it('自动解析模板时把图片和视频 URL 字段保留为 ShowItem 展示字段', () => {
    const schema = createAutoShowItemTemplateSchema(
      [
        {
          prompt: '请根据素材判断商品标题是否合适。',
          image_url: 'https://www.w3schools.com/w3css/img_lights.jpg',
          video_url: 'http://vjs.zencdn.net/v/oceans.mp4',
          preferred: 'A',
        },
      ],
      'media.jsonl',
      {
        displayFields: [{ sourceKey: 'prompt', label: '题目', format: 'long_text' }],
        annotationFields: [
          { sourceKey: 'image_url', label: '图片链接', type: 'text' },
          { sourceKey: 'video_url', label: '视频链接', type: 'text' },
          { sourceKey: 'preferred', label: '偏好选择', type: 'radio' },
        ],
      },
    );

    expect(schema.fields[0]).toEqual({
      key: 'auto_show_item',
      type: 'show_item',
      label: 'media.jsonl',
      sourceKeys: ['prompt', 'image_url', 'video_url'],
      displayConfig: {
        layout: 'table',
        fields: [
          { sourceKey: 'prompt', label: '题目', format: 'long_text' },
          { sourceKey: 'image_url', label: 'image_url', area: 'content', format: 'text' },
          { sourceKey: 'video_url', label: 'video_url', area: 'content', format: 'text' },
        ],
      },
    });
    expect(schema.fields.map((field) => field.key)).not.toContain('image_url');
    expect(schema.fields.map((field) => field.key)).not.toContain('video_url');
    expect(schema.fields.find((field) => field.key === 'preferred')).toMatchObject({
      type: 'radio',
      label: '偏好选择',
      validation: { required: true },
    });
  });

  it('自动解析模板时 ShowItem 展示字段按输入文件原始字段顺序排列', () => {
    const schema = createAutoShowItemTemplateSchema(
      [
        {
          id: 'V0001',
          category: '视频审核',
          difficulty: '中等',
          lang: 'zh',
          media_type: 'video',
          media_url: 'http://vjs.zencdn.net/v/oceans.mp4',
          content_markdown: '',
          prompt: '请观看视频，判断是否包含违规或不适画面。',
          model_answer: '视频为海洋生态画面，未发现违规内容。',
          reference: '海洋题材纪录短片，安全合规。',
          tags: '视频 | 内容审核 | 海洋',
          source: 'media_seed',
          expected_dimensions: '安全性 | 相关性',
          answer_quality: '',
        },
      ],
      'qa_quality.xlsx',
      {
        displayFields: [
          { sourceKey: 'id', label: 'ID', format: 'badge' },
          { sourceKey: 'category', label: '分类', format: 'badge' },
          { sourceKey: 'difficulty', label: '难度', format: 'badge' },
          { sourceKey: 'lang', label: '语言', format: 'badge' },
          { sourceKey: 'prompt', label: '题目', format: 'long_text' },
          { sourceKey: 'model_answer', label: '模型回答', format: 'long_text' },
          { sourceKey: 'reference', label: '参考答案', format: 'long_text' },
          { sourceKey: 'tags', label: '标签', format: 'text' },
          { sourceKey: 'source', label: '来源', format: 'text' },
          { sourceKey: 'expected_dimensions', label: '预期维度', format: 'text' },
          { sourceKey: 'media_type', label: '媒体类型', format: 'text' },
          { sourceKey: 'media_url', label: '媒体链接', format: 'text' },
          { sourceKey: 'content_markdown', label: 'Markdown 内容', format: 'long_text' },
        ],
        annotationFields: [{ sourceKey: 'answer_quality', label: '回答质量', type: 'textarea' }],
      },
    );

    expect(schema.fields[0]).toMatchObject({
      key: 'auto_show_item',
      sourceKeys: [
        'id',
        'category',
        'difficulty',
        'lang',
        'media_type',
        'media_url',
        'content_markdown',
        'prompt',
        'model_answer',
        'reference',
        'tags',
        'source',
        'expected_dimensions',
      ],
    });
    expect(
      schema.fields[0]?.type === 'show_item'
        ? schema.fields[0].displayConfig?.fields?.map((field) => field.sourceKey)
        : [],
    ).toEqual([
      'id',
      'category',
      'difficulty',
      'lang',
      'media_type',
      'media_url',
      'content_markdown',
      'prompt',
      'model_answer',
      'reference',
      'tags',
      'source',
      'expected_dimensions',
    ]);
  });

  it('模型漏判或无法判断的字段默认归为需要用户打标的物料', () => {
    const schema = createAutoShowItemTemplateSchema(
      [
        {
          prompt: '题目',
          response: '回答',
          reviewer_decision: '',
        },
      ],
      'mixed.json',
      {
        displayFields: [{ sourceKey: 'prompt', label: '题目', format: 'long_text' }],
        annotationFields: [{ sourceKey: 'response', label: '模型判断为打标字段', type: 'unknown' }],
      },
    );

    expect(schema.fields).toEqual([
      {
        key: 'auto_show_item',
        type: 'show_item',
        label: 'mixed.json',
        sourceKeys: ['prompt'],
        displayConfig: {
          layout: 'table',
          fields: [{ sourceKey: 'prompt', label: '题目', format: 'long_text' }],
        },
      },
      {
        key: 'response',
        fieldKey: 'response',
        sourceKey: 'response',
        type: 'text',
        label: '模型判断为打标字段',
        validation: { required: true },
      },
      {
        key: 'reviewer_decision',
        fieldKey: 'reviewer_decision',
        sourceKey: 'reviewer_decision',
        type: 'text',
        label: 'reviewer_decision',
        validation: { required: true },
      },
    ]);
  });

  it('生成模板时使用完整字段统计补全打标物料选项', () => {
    const schema = createAutoShowItemTemplateSchema(
      [{ prompt: '问题 1', dimensions: '准确性' }],
      'preference_compare.json',
      {
        displayFields: [{ sourceKey: 'prompt', label: '问题', format: 'long_text' }],
        annotationFields: [{ sourceKey: 'dimensions', label: '评测维度', type: 'checkbox', options: [] }],
      },
      [
        {
          sourceKey: 'prompt',
          totalCount: 3,
          filledCount: 3,
          valueTypes: ['string'],
          samples: ['问题 1', '问题 2', '问题 3'],
          uniqueValues: ['问题 1', '问题 2', '问题 3'],
          optionCandidates: [],
          hasMultiValue: false,
          distinctCount: 0,
        },
        {
          sourceKey: 'dimensions',
          totalCount: 3,
          filledCount: 3,
          valueTypes: ['string'],
          samples: ['准确性 | 完整性', '安全性 | 合规性'],
          uniqueValues: ['准确性 | 完整性', '安全性 | 合规性'],
          optionCandidates: [
            { label: '准确性', value: '准确性' },
            { label: '完整性', value: '完整性' },
            { label: '安全性', value: '安全性' },
            { label: '合规性', value: '合规性' },
          ],
          hasMultiValue: true,
          distinctCount: 4,
        },
      ],
    );

    expect(schema.fields.find((field) => field.key === 'dimensions')).toMatchObject({
      type: 'checkbox',
      label: '评测维度',
      options: [
        { label: '准确性', value: '准确性' },
        { label: '完整性', value: '完整性' },
        { label: '安全性', value: '安全性' },
        { label: '合规性', value: '合规性' },
      ],
      validation: { required: true },
    });
  });

  it('没有展示字段时只生成打标物料，不强行创建空 ShowItem', () => {
    const schema = createAutoShowItemTemplateSchema(
      [{ preferred: '', note: '' }],
      'labels_only.json',
      {
        annotationFields: [
          {
            sourceKey: 'preferred',
            label: '选择更优回答',
            type: 'radio',
            description: '比较AB后选更优',
          },
        ],
      },
    );

    expect(schema.fields).toEqual([
      {
        key: 'preferred',
        fieldKey: 'preferred',
        sourceKey: 'preferred',
          type: 'radio',
          label: '更优回答',
          description: '比较AB后选更优',
          options: [
            { label: 'A', value: 'A' },
            { label: 'B', value: 'B' },
          ],
          validation: { required: true },
        },
      {
        key: 'note',
          fieldKey: 'note',
          sourceKey: 'note',
          type: 'textarea',
          label: 'note',
          validation: { required: true },
        },
    ]);
  });

  it('空文件数据回退为 id 字段，保证模板可保存', () => {
    const schema = createAutoShowItemTemplateSchema([], 'empty.json');

    expect(schema.fields).toEqual([
      {
        key: 'id',
        fieldKey: 'id',
        sourceKey: 'id',
        type: 'text',
        label: 'id',
        validation: { required: true },
      },
    ]);
  });

  it('字段解析只扫描原始顺序前 20 条记录并保留首次出现顺序', () => {
    const request = createAutoTemplateClassificationRequest(
      [
        {},
        ...Array.from({ length: 19 }, (_, index) => ({
          [`within_limit_${index + 1}`]: `值 ${index + 1}`,
        })),
        { after_limit: '不参与字段解析', prompt: '不应用作样例值' },
      ],
      'sparse.jsonl',
    );

    expect(request.fields.map((field) => field.sourceKey)).toEqual([
      ...Array.from({ length: 19 }, (_, index) => `within_limit_${index + 1}`),
    ]);
    expect(request.fields.map((field) => field.sourceKey)).not.toContain('after_limit');
    expect(request.fields.map((field) => field.sourceKey)).not.toContain('prompt');
  });

  it('字段分类请求保留超过预览数量的记录，供后端提取打标字段选项', () => {
    const dimensionValues = [
      '准确性 | 完整性 | 可读性',
      '准确性 | 可执行性',
      '简洁性 | 相关性',
      '准确性 | 地道性',
      '创意性 | 感染力',
      '准确性',
      '相关性 | 上下文一致',
      '安全性 | 合规性',
      '准确性 | 安全提示',
      '完整性 | 相关性',
      '创意性 | 贴合度',
      ...Array.from({ length: 190 }, () => '准确性'),
      '跨样本覆盖',
    ];
    const request = createAutoTemplateClassificationRequest(
      dimensionValues.map((dimensions, index) => ({
        id: `P${index + 1}`,
        prompt: `问题 ${index + 1}`,
        response_a: `回答 A${index + 1}`,
        response_b: `回答 B${index + 1}`,
        dimensions,
      })),
      'preference_compare.jsonl',
    );

    expect(request.records).toHaveLength(dimensionValues.length);
    expect(request.records.at(-1)).toMatchObject({ dimensions: '跨样本覆盖' });
    expect(request.fieldStats?.find((stats) => stats.sourceKey === 'dimensions')).toMatchObject({
      optionCandidates: [
        { label: '准确性', value: '准确性' },
        { label: '完整性', value: '完整性' },
        { label: '可读性', value: '可读性' },
        { label: '可执行性', value: '可执行性' },
        { label: '简洁性', value: '简洁性' },
        { label: '相关性', value: '相关性' },
        { label: '地道性', value: '地道性' },
        { label: '创意性', value: '创意性' },
        { label: '感染力', value: '感染力' },
        { label: '上下文一致', value: '上下文一致' },
        { label: '安全性', value: '安全性' },
        { label: '合规性', value: '合规性' },
        { label: '安全提示', value: '安全提示' },
        { label: '贴合度', value: '贴合度' },
        { label: '跨样本覆盖', value: '跨样本覆盖' },
      ],
      hasMultiValue: true,
      distinctCount: 15,
    });
  });

  it('导出上传文件 ShowItem 预览样例，保留全部非空记录', () => {
    expect(
      createAutoShowItemPreviewRecords([
        {},
        { id: '1', prompt: '第一题' },
        { id: '2', prompt: '第二题' },
        { id: '3', prompt: '第三题' },
        { id: '4', prompt: '第四题' },
      ]),
    ).toEqual([
      { id: '1', prompt: '第一题' },
      { id: '2', prompt: '第二题' },
      { id: '3', prompt: '第三题' },
      { id: '4', prompt: '第四题' },
    ]);
  });
});
