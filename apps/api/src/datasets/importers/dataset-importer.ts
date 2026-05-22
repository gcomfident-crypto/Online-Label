import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {
  DATASET_KINDS,
  getDatasetProfile,
  normalizeDatasetRecord,
  shouldSkipImportFile,
  validateDatasetRecord,
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

  return parseXlsxRecords(input, profile);
}

function parseJsonRecords(input: DatasetImportInput): { records: RawRecordWithLocation[]; errors: DatasetImportError[] } {
  try {
    const parsed = JSON.parse(contentToString(input.content)) as unknown;

    if (!Array.isArray(parsed)) {
      return {
        records: [],
        errors: [
          {
            fileName: input.fileName,
            message: 'JSON 内容必须是对象数组。',
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
  const errors: DatasetImportError[] = [];

  for (const recordWithLocation of records) {
    const rawData = normalizeDatasetRecord(profile, recordWithLocation.record);
    const validation = validateDatasetRecord(profile, rawData);
    const mediaErrors = validateMediaFields(input.datasetKind, rawData);
    const missingFields = [...validation.missingFields, ...mediaErrors];

    if (missingFields.length > 0) {
      errors.push(
        ...missingFields.map((field) => ({
          fileName: input.fileName,
          lineNumber: recordWithLocation.lineNumber,
          rowNumber: recordWithLocation.rowNumber,
          field,
          message: `缺少必填字段：${field}。`,
        })),
      );
      continue;
    }

    importedRecords.push({
      externalId: String(rawData[profile.primaryKeyField]),
      datasetKind: input.datasetKind,
      rawData,
      source: {
        fileName: input.fileName,
        lineNumber: recordWithLocation.lineNumber,
        rowNumber: recordWithLocation.rowNumber,
      },
    });
  }

  return { records: importedRecords, errors };
}

function validateMediaFields(datasetKind: DatasetKind, record: DatasetRecord): string[] {
  if (datasetKind !== 'qa_quality') {
    return [];
  }

  const mediaType = typeof record.media_type === 'string' ? record.media_type.trim() : 'text';

  if (mediaType === 'text' || mediaType.length === 0) {
    return [];
  }

  if (mediaType === 'markdown') {
    return isBlankCell(record.content_markdown) ? ['content_markdown'] : [];
  }

  if (mediaType === 'image' || mediaType === 'video') {
    return isBlankCell(record.media_url) ? ['media_url'] : [];
  }

  return [];
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

  if (normalized.endsWith('.xlsx')) {
    return 'xlsx';
  }

  return null;
}
