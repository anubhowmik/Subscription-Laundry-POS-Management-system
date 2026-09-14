import ExcelJS from "exceljs";

export interface ExportColumn {
  key: string;
  label: string;
}

/** Builds an .xlsx workbook (one sheet, bold header row, auto-sized-ish columns) from a generic
 * {columns, rows} shape - shared by every list page's "Export to Excel" button (see
 * frontend/src/lib/tableExport.ts's exportToExcel()), so the format stays consistent across the
 * app rather than each page rolling its own. Data comes from the client's already-loaded,
 * already-authorized table rows - this only formats it, it doesn't query anything itself. */
export async function buildXlsxBuffer(columns: ExportColumn[], rows: Record<string, string | number | null>[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Export");

  sheet.columns = columns.map((c) => ({ header: c.label, key: c.key, width: Math.max(12, Math.min(40, c.label.length + 6)) }));
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) {
    sheet.addRow(columns.map((c) => row[c.key] ?? ""));
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
