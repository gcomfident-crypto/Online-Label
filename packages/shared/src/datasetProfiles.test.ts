import { describe, expect, it } from 'vitest';

import {
  getDatasetProfile,
  normalizeDatasetRecord,
  shouldSkipImportFile,
  validateDatasetRecord,
} from '.';

describe('DatasetProfile 数据集协议', () => {
  it('导出 qa_quality 官方 profile 元数据', () => {
    expect(getDatasetProfile('qa_quality')).toEqual({
      kind: 'qa_quality',
      primaryKeyField: 'id',
      expectedCount: 30,
      supportedFormats: ['json', 'jsonl', 'xlsx'],
      excelSheetName: '标注题目',
      requiredFields: ['id', 'prompt', 'model_answer', 'expected_dimensions'],
      arrayFields: ['tags', 'expected_dimensions'],
      mediaFields: ['media_type', 'media_url', 'content_markdown'],
    });
  });

  it('导出 preference_compare 官方 profile 元数据', () => {
    expect(getDatasetProfile('preference_compare')).toEqual({
      kind: 'preference_compare',
      primaryKeyField: 'id',
      expectedCount: 12,
      supportedFormats: ['json', 'jsonl', 'xlsx'],
      excelSheetName: '偏好对比',
      requiredFields: ['id', 'prompt', 'response_a', 'response_b'],
      arrayFields: ['dimensions'],
      booleanFields: ['safety_flag'],
    });
  });

  it('导出 generic_json 兜底 profile 元数据', () => {
    expect(getDatasetProfile('generic_json')).toMatchObject({
      kind: 'generic_json',
      primaryKeyField: 'id',
      supportedFormats: ['json', 'jsonl'],
      requiredFields: [],
    });
  });

  it('校验必填字段存在且非空', () => {
    expect(
      validateDatasetRecord('qa_quality', {
        id: 'q1',
        prompt: '解释光合作用',
        model_answer: '植物利用光能合成有机物。',
        expected_dimensions: ['相关性'],
      }),
    ).toEqual({ ok: true, missingFields: [] });

    expect(
      validateDatasetRecord('preference_compare', {
        id: 'p1',
        prompt: '哪个回答更安全？',
        response_a: '',
        response_b: '回答 B',
      }),
    ).toEqual({ ok: false, missingFields: ['response_a'] });

    expect(
      validateDatasetRecord('qa_quality', {
        id: 'q2',
        prompt: '解释蒸腾作用',
        model_answer: '植物通过叶片散失水分。',
        expected_dimensions: ['   '],
      }),
    ).toEqual({ ok: false, missingFields: ['expected_dimensions'] });
  });

  it('归一化 Excel 字符串数组字段和中文布尔值', () => {
    const qaRecord = normalizeDatasetRecord('qa_quality', {
      id: 'q1',
      prompt: '解释光合作用',
      model_answer: '植物利用光能合成有机物。',
      tags: '生物 | 基础科学',
      expected_dimensions: '相关性 | 准确性',
    });

    expect(qaRecord.tags).toEqual(['生物', '基础科学']);
    expect(qaRecord.expected_dimensions).toEqual(['相关性', '准确性']);

    const preferenceRecord = normalizeDatasetRecord('preference_compare', {
      id: 'p1',
      prompt: '哪个回答更安全？',
      response_a: '回答 A',
      response_b: '回答 B',
      dimensions: '安全性 | 帮助性',
      safety_flag: ' 否 ',
    });

    expect(preferenceRecord.dimensions).toEqual(['安全性', '帮助性']);
    expect(preferenceRecord.safety_flag).toBe(false);
  });

  it('保持 JSON/JSONL 已归一化数组和布尔值不变', () => {
    const record = {
      id: 'p1',
      prompt: '哪个回答更安全？',
      response_a: '回答 A',
      response_b: '回答 B',
      dimensions: ['安全性', '帮助性'],
      safety_flag: true,
    };

    expect(normalizeDatasetRecord('preference_compare', record)).toEqual(record);
  });

  it('跳过压缩包和 Excel 临时文件', () => {
    expect(shouldSkipImportFile('__MACOSX/qa_quality.json')).toBe(true);
    expect(shouldSkipImportFile('archive/__MACOSX/qa_quality.json')).toBe(true);
    expect(shouldSkipImportFile('archive\\__MACOSX\\qa_quality.json')).toBe(true);
    expect(shouldSkipImportFile('.DS_Store')).toBe(true);
    expect(shouldSkipImportFile('._qa_quality.json')).toBe(true);
    expect(shouldSkipImportFile('.~qa_quality.xlsx')).toBe(true);
    expect(shouldSkipImportFile('normal.~qa_quality.xlsx')).toBe(false);
    expect(shouldSkipImportFile('foo/.__MACOSX/qa_quality.json')).toBe(false);
    expect(shouldSkipImportFile('qa_quality.json')).toBe(false);
  });

  it('返回的 profile 不会污染内部元数据', () => {
    const profile = getDatasetProfile('qa_quality');
    (profile.requiredFields as string[]).push('polluted_field');

    expect(getDatasetProfile('qa_quality').requiredFields).not.toContain('polluted_field');
  });
});
