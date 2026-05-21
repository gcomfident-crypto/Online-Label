import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { exportCsv } from './csvExporter.ts';
import { exportJson } from './jsonExporter.ts';
import { exportJsonl } from './jsonlExporter.ts';
import { exportXlsx } from './xlsxExporter.ts';

const rows = [
  {
    id: 'qa_001',
    prompt: '如何判断回答质量？',
    issue_tags: ['complete', 'grounded'],
    score: 92,
  },
  {
    id: 'qa_002',
    prompt: '如何处理安全风险？',
    issue_tags: ['safety'],
    score: 88,
  },
];

describe('导出文件生成器', () => {
  it('生成 JSON 数组文件', () => {
    expect(JSON.parse(exportJson(rows).toString('utf8'))).toEqual(rows);
  });

  it('生成 JSONL 文件，每行一个对象', () => {
    expect(exportJsonl(rows).toString('utf8')).toBe(`${JSON.stringify(rows[0])}\n${JSON.stringify(rows[1])}\n`);
  });

  it('生成稳定表头 CSV，并用竖线拼接数组字段', () => {
    expect(exportCsv(rows).toString('utf8')).toBe(
      'id,prompt,issue_tags,score\nqa_001,如何判断回答质量？,complete | grounded,92\nqa_002,如何处理安全风险？,safety,88\n',
    );
  });

  it('生成可打开的 Excel 文件，sheet 名包含任务名', async () => {
    const buffer = await exportXlsx(rows, { sheetName: '问答质量标注' });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

    expect(workbook.worksheets[0].name).toContain('问答质量');
    expect(workbook.worksheets[0].getRow(1).values).toEqual([undefined, 'id', 'prompt', 'issue_tags', 'score']);
    expect(workbook.worksheets[0].getCell('B2').value).toBe('如何判断回答质量？');
  });
});
