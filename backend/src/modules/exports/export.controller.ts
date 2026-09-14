import { Request, Response } from "express";
import { buildXlsxBuffer } from "../../utils/tableExport";

export async function exportXlsx(req: Request, res: Response) {
  const { filename, columns, rows } = req.body;
  const buffer = await buildXlsxBuffer(columns, rows);
  // Strip anything but safe filename characters before it goes into a response header - filename
  // is client-supplied (see export.validators.ts).
  const safeFilename = filename.replace(/[^a-zA-Z0-9 _-]/g, "").trim() || "export";
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}.xlsx"`);
  res.send(buffer);
}
