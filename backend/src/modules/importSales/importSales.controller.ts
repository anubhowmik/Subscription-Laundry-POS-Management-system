import { Request, Response } from "express";
import * as service from "./importSales.service";
import { sendSuccess } from "../../utils/apiResponse";
import { writeAuditLog } from "../../utils/audit";
import { parseSpreadsheetFile } from "../../utils/spreadsheet";
import { AppError } from "../../utils/AppError";
import { getParam } from "../../utils/params";

export async function listBatches(req: Request, res: Response) {
  return sendSuccess(res, await service.listBatches(req.user!.organizationId));
}

export async function importSales(req: Request, res: Response) {
  if (!req.file) throw new AppError(400, "No file was uploaded");
  const sheet = await parseSpreadsheetFile(req.file.buffer, req.file.originalname);
  const result = await service.importSales(sheet, req.user!.organizationId, req.user!.id);
  if (result.imported > 0) {
    await writeAuditLog({ req, action: "CREATE", module: "sales_import", newValues: { imported: result.imported } });
  }
  return sendSuccess(res, result);
}

export async function revertBatch(req: Request, res: Response) {
  const batch = Number(getParam(req, "batch"));
  if (!Number.isInteger(batch)) throw new AppError(400, "Invalid batch number");
  const result = await service.revertBatch(batch, req.user!.organizationId);
  await writeAuditLog({ req, action: "DELETE", module: "sales_import", newValues: { batch, reverted: result.reverted } });
  return sendSuccess(res, result, "Import reverted");
}
