export function exportJsonl(rows: Array<Record<string, unknown>>): Buffer {
  return Buffer.from(`${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
}
