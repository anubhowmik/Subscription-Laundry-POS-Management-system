import ExcelJS from "exceljs";
import { Readable } from "stream";
import { AppError } from "./AppError";

export interface ParsedSheet {
  /** Lowercased, trimmed header cells, in file order. */
  headers: string[];
  /** Every row after the header, cells as trimmed strings ("" for empty cells). */
  rows: string[][];
}

/** Reads an uploaded .csv or .xlsx file into a plain header+rows shape - shared by every
 * "Import ..." feature (contacts today, more likely later) so each one only has to deal with
 * matching its own expected column names, not spreadsheet-format parsing. */
export async function parseSpreadsheetFile(buffer: Buffer, originalName: string): Promise<ParsedSheet> {
  const workbook = new ExcelJS.Workbook();
  const isCsv = /\.csv$/i.test(originalName);

  let worksheet: ExcelJS.Worksheet | undefined;
  if (isCsv) {
    // exceljs's default CSV cell mapper runs every value through `Number(datum)` and silently
    // swaps in the parsed number whenever that succeeds - which mangles anything that looks
    // numeric but isn't meant to be one (a phone number like "0512345678" becomes 512345678,
    // silently dropping the leading zero). A CSV cell has no type information at all, so there's
    // nothing to lose by keeping every cell as the exact raw string it was.
    worksheet = await workbook.csv.read(Readable.from(buffer), { map: (datum: string) => datum });
  } else {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    worksheet = workbook.worksheets[0];
  }
  if (!worksheet) throw new AppError(400, "The uploaded file has no readable sheet");

  const allRows: string[][] = [];
  worksheet.eachRow((row) => {
    // exceljs's row.values is 1-indexed with index 0 always undefined - drop it so column 0 of
    // our own arrays lines up with the file's first (leftmost) column.
    const cells = (row.values as ExcelJS.CellValue[]).slice(1);
    allRows.push(cells.map((cell) => (cell == null ? "" : String(cell).trim())));
  });

  if (allRows.length === 0) throw new AppError(400, "The uploaded file is empty");
  const [headerRow, ...dataRows] = allRows;
  const nonEmptyDataRows = dataRows.filter((row) => row.some((cell) => cell !== ""));
  return { headers: headerRow.map((h) => h.toLowerCase().trim()), rows: nonEmptyDataRows };
}

/** Builds a `{ columnKey: value }` lookup per row from a canonical `{ header label: columnKey }`
 * map, so import logic reads `row.phone` instead of tracking column indexes by hand. Header
 * matching is case-insensitive/trimmed (already done by parseSpreadsheetFile) - column ORDER in
 * the uploaded file doesn't matter, only which headers are present. */
export function mapSheetRows(sheet: ParsedSheet, headerToKey: Record<string, string>): Record<string, string>[] {
  const indexToKey = sheet.headers.map((h) => headerToKey[h]);
  return sheet.rows.map((row) => {
    const record: Record<string, string> = {};
    row.forEach((value, i) => {
      const key = indexToKey[i];
      if (key) record[key] = value;
    });
    return record;
  });
}
