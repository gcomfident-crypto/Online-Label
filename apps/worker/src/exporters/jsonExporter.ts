export function exportJson(rows: Array<Record<string, unknown>>): Buffer {
  return Buffer.from(JSON.stringify(rows, null, 2), 'utf8');
}
