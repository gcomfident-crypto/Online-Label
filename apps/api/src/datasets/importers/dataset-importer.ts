import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {
  DATASET_KINDS,
  getDatasetProfile,
  normalizeDatasetRecord,
  shouldSkipImportFile,
  type DatasetImportFormat,
  type DatasetKind,
  type DatasetProfile,
  type DatasetRecord,
} from '@labelhub/shared';

export type DatasetImportInput = {
  datasetKind: DatasetKind;
  format: Exclude<DatasetImportFormat, 'zip'>;
  fileName: string;
  content: Buffer | Uint8Array | string;
};

export type ImportedDatasetRecord = {
  externalId: string;
  datasetKind: DatasetKind;
  rawData: DatasetRecord;
  source: {
    fileName: string;
    lineNumber?: number;
    rowNumber?: number;
  };
};

export type DatasetImportError = {
  fileName: string;
  lineNumber?: number;
  rowNumber?: number;
  field?: string;
  message: string;
};

export type DatasetImportResult = {
  datasetKind: DatasetKind;
  format: DatasetImportFormat;
  fileName: string;
  records: ImportedDatasetRecord[];
  errors: DatasetImportError[];
  skippedFiles: string[];
  fields: string[];
};

export type DatasetZipImportResult = {
  records: ImportedDatasetRecord[];
  errors: DatasetImportError[];
  skippedFiles: string[];
  files: DatasetImportResult[];
};

type RawRecordWithLocation = {
  record: DatasetRecord;
  lineNumber?: number;
  rowNumber?: number;
};

export async function parseDatasetImport(input: DatasetImportInput): Promise<DatasetImportResult> {
  const profile = getDatasetProfile(input.datasetKind);
  const parsed = await parseRawRecords(input, profile);
  const normalized = normalizeRecords(input, profile, parsed.records);

  return {
    datasetKind: input.datasetKind,
    format: input.format,
    fileName: input.fileName,
    records: normalized.records,
    errors: [...parsed.errors, ...normalized.errors],
    skippedFiles: [],
    fields: collectFields(normalized.records),
  };
}

export async function parseDatasetZipImport(content: Buffer | Uint8Array): Promise<DatasetZipImportResult> {
  const zip = await JSZip.loadAsync(content);
  const files: DatasetImportResult[] = [];
  const skippedFiles: string[] = [];
  const errors: DatasetImportError[] = [];

  for (const [path, file] of Object.entries(zip.files)) {
    if (file.dir) {
      continue;
    }

    if (shouldSkipImportFile(path)) {
      skippedFiles.push(path);
      continue;
    }

    const datasetKind = inferDatasetKind(path);
    const format = inferDatasetFormat(path);

    if (!datasetKind || !format) {
      skippedFiles.push(path);
      continue;
    }

    const fileContent =
      format === 'xlsx' ? await file.async('nodebuffer') : await file.async('string');
    const result = await parseDatasetImport({
      datasetKind,
      format,
      fileName: path,
      content: fileContent,
    });
    files.push(result);
    errors.push(...result.errors);
  }

  return {
    records: files.flatMap((file) => file.records),
    errors,
    skippedFiles,
    files,
  };
}

async function parseRawRecords(
  input: DatasetImportInput,
  profile: DatasetProfile,
): Promise<{ records: RawRecordWithLocation[]; errors: DatasetImportError[] }> {
  if (input.format === 'json') {
    return parseJsonRecords(input);
  }

  if (input.format === 'jsonl') {
    return parseJsonlRecords(input);
  }

  if (input.format === 'csv') {
    return parseCsvRecords(input);
  }

  return parseXlsxRecords(input, profile);
}

function parseJsonRecords(input: DatasetImportInput): { records: RawRecordWithLocation[]; errors: DatasetImportError[] } {
  try {
    const parsed = JSON.parse(contentToString(input.content)) as unknown;

    if (isDatasetRecord(parsed)) {
      return {
        records: [{ record: parsed, rowNumber: 1 }],
        errors: [],
      };
    }

    if (!Array.isArray(parsed)) {
      return {
        records: [],
        errors: [
          {
            fileName: input.fileName,
            message: 'JSON 内容必须是对象或对象数组。',
          },
        ],
      };
    }

    return {
      records: parsed
        .filter((record): record is DatasetRecord => isDatasetRecord(record))
        .map((record, index) => ({ record, rowNumber: index + 1 })),
      errors: parsed.flatMap((record, index) =>
        isDatasetRecord(record)
          ? []
          : [
              {
                fileName: input.fileName,
                rowNumber: index + 1,
                message: `JSON 第 ${index + 1} 条不是对象。`,
              },
            ],
      ),
    };
  } catch {
    return {
      records: [],
      errors: [
        {
          fileName: input.fileName,
          message: 'JSON 内容解析失败。',
        },
      ],
    };
  }
}

function parseJsonlRecords(input: DatasetImportInput): { records: RawRecordWithLocation[]; errors: DatasetImportError[] } {
  const records: RawRecordWithLocation[] = [];
  const errors: DatasetImportError[] = [];
  const lines = contentToString(input.content).split(/\r?\n/);

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    if (!line.trim()) {
      return;
    }

    try {
      const parsed = JSON.parse(line) as unknown;

      if (isDatasetRecord(parsed)) {
        records.push({ record: parsed, lineNumber });
      } else {
        errors.push({
          fileName: input.fileName,
          lineNumber,
          message: `JSONL 第 ${lineNumber} 行不是对象。`,
        });
      }
    } catch {
      errors.push({
        fileName: input.fileName,
        lineNumber,
        message: `JSONL 第 ${lineNumber} 行不是有效 JSON。`,
      });
    }
  });

  return { records, errors };
}

function parseCsvRecords(
  input: DatasetImportInput,
): { records: RawRecordWithLocation[]; errors: DatasetImportError[] } {
  const rows = parseCsvRows(contentToString(input.content));
  const headers = rows[0]?.map((value) => value.trim()) ?? [];
  const records: RawRecordWithLocation[] = [];

  rows.slice(1).forEach((row, index) => {
    if (row.every(isBlankCell)) {
      return;
    }

    const record: DatasetRecord = {};
    const columnCount = Math.max(headers.length, row.length);

    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      const header = headers[columnIndex]?.trim() || `field_${columnIndex + 1}`;
      const value = row[columnIndex] ?? '';

      if (!isBlankCell(value)) {
        record[header] = value.trim();
      }
    }

    records.push({ record, rowNumber: index + 2 });
  });

  return { records, errors: [] };
}

function parseCsvRows(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    const nextCharacter = content[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((character === '\n' || character === '\r') && !inQuotes) {
      if (character === '\r' && nextCharacter === '\n') {
        index += 1;
      }

      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += character;
  }

  row.push(cell);
  rows.push(row);

  return rows.filter((currentRow, index) =>
    index < rows.length - 1 || currentRow.some((value) => value.trim().length > 0),
  );
}

async function parseXlsxRecords(
  input: DatasetImportInput,
  profile: DatasetProfile,
): Promise<{ records: RawRecordWithLocation[]; errors: DatasetImportError[] }> {
  const workbook = new ExcelJS.Workbook();
  const workbookBuffer = contentToBuffer(input.content) as unknown as Parameters<
    typeof workbook.xlsx.load
  >[0];
  await workbook.xlsx.load(workbookBuffer);
  const worksheet =
    (profile.excelSheetName ? workbook.getWorksheet(profile.excelSheetName) : undefined) ??
    workbook.worksheets[0];

  if (!worksheet) {
    return {
      records: [],
      errors: [{ fileName: input.fileName, message: 'Excel 文件没有可读取的工作表。' }],
    };
  }

  const headers = rowValues(worksheet.getRow(1)).map((value) => String(value ?? '').trim());
  const records: RawRecordWithLocation[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }

    const values = rowValues(row);

    if (values.every(isBlankCell)) {
      return;
    }

    const record: DatasetRecord = {};
    headers.forEach((header, index) => {
      if (header) {
        record[header] = cellValue(values[index]);
      }
    });
    records.push({ record, rowNumber });
  });

  return { records, errors: [] };
}

function normalizeRecords(
  input: DatasetImportInput,
  profile: DatasetProfile,
  records: RawRecordWithLocation[],
): { records: ImportedDatasetRecord[]; errors: DatasetImportError[] } {
  const importedRecords: ImportedDatasetRecord[] = [];

  records.forEach((recordWithLocation, index) => {
    const rawData = normalizeDatasetRecord(profile, recordWithLocation.record);

    importedRecords.push({
      externalId: resolveExternalId(input.fileName, profile, rawData, recordWithLocation, index),
      datasetKind: input.datasetKind,
      rawData,
      source: {
        fileName: input.fileName,
        lineNumber: recordWithLocation.lineNumber,
        rowNumber: recordWithLocation.rowNumber,
      },
    });
  });

  return { records: importedRecords, errors: [] };
}

function resolveExternalId(
  fileName: string,
  profile: DatasetProfile,
  rawData: DatasetRecord,
  location: RawRecordWithLocation,
  index: number,
): string {
  const primaryValue = rawData[profile.primaryKeyField];

  if (!isBlankCell(primaryValue)) {
    return String(primaryValue);
  }

  if (location.lineNumber) {
    return `${fileName}#line-${location.lineNumber}`;
  }

  if (location.rowNumber) {
    return `${fileName}#row-${location.rowNumber}`;
  }

  return `${fileName}#record-${index + 1}`;
}

function contentToString(content: Buffer | Uint8Array | string): string {
  return typeof content === 'string' ? content : Buffer.from(content).toString('utf8');
}

function contentToBuffer(content: Buffer | Uint8Array | string): Buffer {
  return typeof content === 'string' ? Buffer.from(content) : Buffer.from(content);
}

function rowValues(row: ExcelJS.Row): unknown[] {
  return Array.isArray(row.values) ? row.values.slice(1) : [];
}

function cellValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object' && value !== null && 'text' in value) {
    const richValue = value as { text?: unknown };
    return richValue.text;
  }

  return value;
}

function isBlankCell(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }

  return typeof value === 'string' ? value.trim().length === 0 : false;
}

function isDatasetRecord(value: unknown): value is DatasetRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function collectFields(records: ImportedDatasetRecord[]): string[] {
  return [...new Set(records.flatMap((record) => Object.keys(record.rawData)))];
}

function inferDatasetKind(path: string): DatasetKind | null {
  const normalized = path.toLowerCase();

  return DATASET_KINDS.find((kind) => normalized.includes(kind)) ?? null;
}

function inferDatasetFormat(path: string): Exclude<DatasetImportFormat, 'zip'> | null {
  const normalized = path.toLowerCase();

  if (normalized.endsWith('.json')) {
    return 'json';
  }

  if (normalized.endsWith('.jsonl')) {
    return 'jsonl';
  }

  if (normalized.endsWith('.csv')) {
    return 'csv';
  }

  if (normalized.endsWith('.xlsx')) {
    return 'xlsx';
  }

  return null;
}
