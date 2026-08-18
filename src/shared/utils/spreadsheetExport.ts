export type SpreadsheetRow = Record<string, unknown>;
export interface SpreadsheetSheet { name: string; rows: SpreadsheetRow[] }

const safeCell = (value: unknown) => {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
};

const escapeXml = (value: unknown) => safeCell(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const xmlCell = (value: unknown) => `<Cell><Data ss:Type="${typeof value === "number" && Number.isFinite(value) ? "Number" : "String"}">${escapeXml(value)}</Data></Cell>`;

export function createSpreadsheetXml(sheets: SpreadsheetSheet[]) {
  const worksheets = sheets.map(({ name, rows }) => {
    const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
    const table = [headers.map(xmlCell).join(""), ...rows.map((row) => headers.map((header) => xmlCell(row[header])).join(""))]
      .map((cells) => `<Row>${cells}</Row>`).join("");
    return `<Worksheet ss:Name="${escapeXml(name).slice(0, 31)}"><Table>${table}</Table></Worksheet>`;
  }).join("");
  return `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${worksheets}</Workbook>`;
}

export function toCsv(rows: SpreadsheetRow[]) {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const csvCell = (value: unknown) => `"${safeCell(value).replace(/"/g, '""')}"`;
  return [headers.map(csvCell), ...rows.map((row) => headers.map((header) => csvCell(row[header])))].map((row) => row.join(";")).join("\r\n");
}

function download(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export const downloadSpreadsheet = (sheets: SpreadsheetSheet[], filename: string) => download(createSpreadsheetXml(sheets), filename.replace(/\.xlsx?$/i, "") + ".xls", "application/vnd.ms-excel;charset=utf-8");
export const downloadCsv = (rows: SpreadsheetRow[], filename: string) => download(`\uFEFF${toCsv(rows)}`, filename.replace(/\.csv$/i, "") + ".csv", "text/csv;charset=utf-8");
