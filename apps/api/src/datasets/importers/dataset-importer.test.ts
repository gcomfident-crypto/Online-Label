import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { parseDatasetImport, parseDatasetZipImport } from './dataset-importer.ts';

describe('Dataset importers', () => {
  it.each([
    ['json', async () => Buffer.from(JSON.stringify(createQaQualityRecords()))],
    ['jsonl', async () => Buffer.from(toJsonl(createQaQualityRecords()))],
    ['csv', async () => Buffer.from(toCsv(createQaQualityRecords()))],
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
    ['csv', async () => Buffer.from(toCsv(createPreferenceRecords()))],
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

  it('JSON 单对象按一条题目导入', async () => {
    const result = await parseDatasetImport({
      datasetKind: 'generic_json',
      format: 'json',
      fileName: 'generic_json.json',
      content: Buffer.from(JSON.stringify({ id: 'single_1', prompt: '单条题目' })),
    });

    expect(result.records).toHaveLength(1);
    expect(result.errors).toEqual([]);
    expect(result.records[0]).toMatchObject({
      externalId: 'single_1',
      rawData: {
        id: 'single_1',
        prompt: '单条题目',
      },
    });
  });

  it('CSV 支持带逗号、引号和换行的单元格', async () => {
    const result = await parseDatasetImport({
      datasetKind: 'generic_json',
      format: 'csv',
      fileName: 'generic_json.csv',
      content: Buffer.from('id,prompt,note\nC1,"包含,逗号","第一行\n第二行"\nC2,"包含""引号""",普通备注'),
    });

    expect(result.records).toHaveLength(2);
    expect(result.errors).toEqual([]);
    expect(result.records[0]?.rawData).toMatchObject({
      id: 'C1',
      prompt: '包含,逗号',
      note: '第一行\n第二行',
    });
    expect(result.records[1]?.rawData).toMatchObject({
      id: 'C2',
      prompt: '包含"引号"',
      note: '普通备注',
    });
  });

  it('导入时不再按数据集 profile 阻断缺失业务字段的题目', async () => {
    const result = await parseDatasetImport({
      datasetKind: 'qa_quality',
      format: 'jsonl',
      fileName: 'preference_compare.jsonl',
      content: Buffer.from(
        toJsonl([
          {
            id: 'P0001',
            prompt: '解释什么是过拟合',
            response_a: '回答 A',
            response_b: '回答 B',
          },
        ]),
      ),
    });

    expect(result.records).toHaveLength(1);
    expect(result.errors).toEqual([]);
    expect(result.records[0]).toMatchObject({
      externalId: 'P0001',
      datasetKind: 'qa_quality',
      rawData: {
        prompt: '解释什么是过拟合',
        response_a: '回答 A',
        response_b: '回答 B',
      },
    });
  });

  it('导入缺少 id 的题目时用文件位置生成 externalId', async () => {
    const result = await parseDatasetImport({
      datasetKind: 'qa_quality',
      format: 'jsonl',
      fileName: 'custom.jsonl',
      content: Buffer.from(toJsonl([{ prompt: '只有题干' }, { prompt: '第二条题干' }])),
    });

    expect(result.records).toHaveLength(2);
    expect(result.errors).toEqual([]);
    expect(result.records.map((record) => record.externalId)).toEqual([
      'custom.jsonl#line-1',
      'custom.jsonl#line-2',
    ]);
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

  it('单文件导入 Excel 临时锁文件时跳过且返回明确错误', async () => {
    const result = await parseDatasetImport({
      datasetKind: 'qa_quality',
      format: 'xlsx',
      fileName: '.~qa_quality.xlsx',
      content: Buffer.from(''),
    });

    expect(result.records).toEqual([]);
    expect(result.skippedFiles).toEqual(['.~qa_quality.xlsx']);
    expect(result.errors).toEqual([
      {
        fileName: '.~qa_quality.xlsx',
        message: '文件 .~qa_quality.xlsx 是系统或应用生成的临时文件，已跳过导入。',
      },
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

function toCsv(records: Record<string, unknown>[]): string {
  const headers = Object.keys(records[0] ?? {});
  const rows = records.map((record) => headers.map((header) => csvCell(record[header])).join(','));

  return [headers.join(','), ...rows].join('\n');
}

function csvCell(value: unknown): string {
  const text = String(value ?? '');

  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
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
