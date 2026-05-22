import ExcelJS from 'exceljs';

export async function exportXlsx(
  rows: Array<Record<string, unknown>>,
  input: { sheetName: string },
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(safeSheetName(input.sheetName));
  const headers = collectHeaders(rows);
  worksheet.addRow(headers);

  for (const row of rows) {
    worksheet.addRow(headers.map((header) => serializeCellValue(row[header])));
  }
  worksheet.columns.forEach((column) => {
    column.width = Math.min(42, Math.max(12, String(column.header ?? '').length + 6));
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function collectHeaders(rows: Array<Record<string, unknown>>): string[] {
  const headers: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!headers.includes(key)) {
        headers.push(key);
      }
    }
  }

  return headers;
}

function serializeCellValue(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join(' | ');
  }

  return JSON.stringify(value);
}

function safeSheetName(value: string): string {
  const normalized = value.replace(/[\\/*?:[\]]/g, ' ').trim() || '导出数据';
  return normalized.slice(0, 31);
}
