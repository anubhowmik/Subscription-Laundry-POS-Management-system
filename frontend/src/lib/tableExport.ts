import { api } from "../api/client";

export interface ExportColumn {
  key: string;
  label: string;
}

export type ExportRow = Record<string, string | number | null>;

/** Walks every page of a paginated list endpoint (using its own current filters/sort, just
 * without a page cap) and returns every matching row, not just whatever page is currently loaded
 * in the table. Sequential (not `Promise.all`) on purpose - export isn't a hot path, and this
 * avoids firing a burst of concurrent requests at the backend for a list with many pages. */
export async function fetchAllRows<T>(fetchPage: (page: number, limit: number) => Promise<{ data: T[]; meta: { total: number } }>): Promise<T[]> {
  const pageSize = 100;
  const first = await fetchPage(1, pageSize);
  const all = [...first.data];
  const totalPages = Math.ceil(first.meta.total / pageSize);
  for (let p = 2; p <= totalPages; p++) {
    const res = await fetchPage(p, pageSize);
    all.push(...res.data);
  }
  return all;
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Matches the reference's "Export to Excel" DataTable button - generates the .xlsx server-side
 * (via exceljs, the same library the backend already trusts for spreadsheet import) rather than
 * pulling a client-side xlsx-writing library into the frontend bundle. */
export async function exportToExcel(filename: string, columns: ExportColumn[], rows: ExportRow[]) {
  const res = await api.post("/exports/xlsx", { filename, columns, rows }, { responseType: "blob" });
  triggerDownload(res.data as Blob, `${filename}.xlsx`);
}

/** Matches the reference's "Export to PDF" DataTable button - built client-side with jspdf +
 * jspdf-autotable (a lightweight, actively-maintained pair with no known vulnerabilities, unlike
 * the abandoned npm "xlsx" package - see this feature's Excel export, which avoids that entirely
 * by generating server-side instead). */
export async function exportToPdf(filename: string, columns: ExportColumn[], rows: ExportRow[]) {
  const [{ default: jsPDF }, autoTable] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation: "landscape" });
  autoTable.default(doc, {
    head: [columns.map((c) => c.label)],
    body: rows.map((row) => columns.map((c) => String(row[c.key] ?? ""))),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [38, 59, 170] },
  });
  doc.save(`${filename}.pdf`);
}

/** Matches the reference's "Print" DataTable button - opens a plain, separately-styled window
 * with just the table (not the whole app chrome) and triggers the browser's print dialog on it,
 * rather than fighting global `@media print` rules across every page that might use this. */
function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function printTable(title: string, columns: ExportColumn[], rows: ExportRow[]) {
  const win = window.open("", "_blank");
  if (!win) return;
  const headHtml = columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("");
  const bodyHtml = rows
    .map((row) => `<tr>${columns.map((c) => `<td>${escapeHtml(String(row[c.key] ?? ""))}</td>`).join("")}</tr>`)
    .join("");
  win.document.write(`
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          body { font-family: sans-serif; padding: 16px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: start; }
          th { background: #f1f5f9; }
          h1 { font-size: 16px; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        <table><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>
      </body>
    </html>
  `);
  win.document.close();
  win.focus();
  win.print();
}
