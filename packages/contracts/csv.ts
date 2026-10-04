export function csvCell(value: string): string {
  const protectedValue = /^[\s]*[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${protectedValue.replaceAll('"', '""')}"`;
}
export const csv = (rows: string[][]): string =>
  "\uFEFF" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
