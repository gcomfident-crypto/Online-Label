export function exportCsv(rows: Array<Record<string, unknown>>): Buffer {
  const headers = collectHeaders(rows);
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escapeCsvValue(row[header])).join(',')),
  ];

  return Buffer.from(`${lines.join('\n')}\n`, 'utf8');
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

function escapeCsvValue(value: unknown): string {
  const text = serializeValue(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

function serializeValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join(' | ');
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}
