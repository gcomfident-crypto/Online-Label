import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { parseDatasetImport, parseDatasetZipImport } from './dataset-importer.ts';

describe('Dataset importers', () => {
  it.each([
    ['json', async () => Buffer.from(JSON.stringify(createQaQualityRecords()))],
    ['jsonl', async () => Buffer.from(toJsonl(createQaQualityRecords()))],
    ['xlsx', async () => createWorkbookBuffer('标注题目', createQaQualityRecords())],
  ] as const)('导入 qa_quality.%s 得到 30 条有效题目', async (format, contentFactory) => {
    const result = await parseDatasetImport({
      datasetKind: 'qa_quality',
      format,
      fileName: `qa_quality.${format}`,
      content: await contentFactory(),
    });

    expect(result.records).toHaveLength(30);
    expect(result.errors).toEqual([]);
    expect(result.records[0]).toMatchObject({
      externalId: 'qa_quality_01',
      datasetKind: 'qa_quality',
      rawData: {
        id: 'qa_quality_01',
        expected_dimensions: ['事实准确', '信息完整'],
      },
    });
  });

  it.each([
    ['json', async () => Buffer.from(JSON.stringify(createPreferenceRecords()))],
    ['jsonl', async () => Buffer.from(toJsonl(createPreferenceRecords()))],
    ['xlsx', async () => createWorkbookBuffer('偏好对比', createPreferenceRecords())],
  ] as const)('导入 preference_compare.%s 得到 12 条有效题目', async (format, contentFactory) => {
    const result = await parseDatasetImport({
      datasetKind: 'preference_compare',
      format,
      fileName: `preference_compare.${format}`,
      content: await contentFactory(),
    });

    expect(result.records).toHaveLength(12);
    expect(result.errors).toEqual([]);
    expect(result.records[0]?.rawData).toMatchObject({
      dimensions: ['准确性', '安全性'],
      safety_flag: false,
    });
  });

  it('JSONL 非法行返回具体行号且不写入错误行', async () => {
    const result = await parseDatasetImport({
      datasetKind: 'qa_quality',
      format: 'jsonl',
      fileName: 'qa_quality.jsonl',
      content: Buffer.from(`${JSON.stringify(createQaQualityRecords()[0])}\n{bad json}\n`),
    });

    expect(result.records).toHaveLength(1);
    expect(result.errors).toEqual([
      expect.objectContaining({
        lineNumber: 2,
        message: 'JSONL 第 2 行不是有效 JSON。',
      }),
    ]);
  });

  it('zip 导入跳过 macOS 和 Excel 临时文件', async () => {
    const zip = new JSZip();
    zip.file('qa_quality.json', JSON.stringify(createQaQualityRecords()));
    zip.file('preference_compare.jsonl', toJsonl(createPreferenceRecords()));
    zip.file('__MACOSX/qa_quality.json', JSON.stringify([{ id: 'skip_1' }]));
    zip.file('.DS_Store', '');
    zip.file('._preference_compare.json', '');
    zip.file('.~qa_quality.xlsx', '');

    const result = await parseDatasetZipImport(await zip.generateAsync({ type: 'nodebuffer' }));

    expect(result.records.filter((record) => record.datasetKind === 'qa_quality')).toHaveLength(30);
    expect(result.records.filter((record) => record.datasetKind === 'preference_compare')).toHaveLength(12);
    expect(result.skippedFiles).toEqual([
      '__MACOSX/qa_quality.json',
      '.DS_Store',
      '._preference_compare.json',
      '.~qa_quality.xlsx',
    ]);
  });
});

function createQaQualityRecords() {
  return Array.from({ length: 30 }, (_, index) => {
    const itemNumber = index + 1;

    return {
      id: `qa_quality_${String(itemNumber).padStart(2, '0')}`,
      prompt: `用户问题 ${itemNumber}`,
      model_answer: `模型回答 ${itemNumber}`,
      expected_dimensions: '事实准确 | 信息完整',
      tags: '问答质量 | 演示数据',
      media_type: 'text',
    };
  });
}

function createPreferenceRecords() {
  return Array.from({ length: 12 }, (_, index) => {
    const itemNumber = index + 1;

    return {
      id: `preference_compare_${String(itemNumber).padStart(2, '0')}`,
      prompt: `对比题 ${itemNumber}`,
      response_a: `回答 A-${itemNumber}`,
      response_b: `回答 B-${itemNumber}`,
      dimensions: '准确性 | 安全性',
      safety_flag: '否',
    };
  });
}

function toJsonl(records: Record<string, unknown>[]): string {
  return records.map((record) => JSON.stringify(record)).join('\n');
}

async function createWorkbookBuffer(sheetName: string, records: Record<string, unknown>[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);
  const headers = Object.keys(records[0] ?? {});

  worksheet.addRow(headers);
  for (const record of records) {
    worksheet.addRow(headers.map((header) => record[header]));
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
