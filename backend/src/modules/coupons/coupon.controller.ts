import { Request, Response } from "express";
import * as service from "./coupon.service";
import { sendPaginated, sendSuccess } from "../../utils/apiResponse";
import { getParam } from "../../utils/params";
import { AppError } from "../../utils/AppError";
import { parseSpreadsheetFile } from "../../utils/spreadsheet";
import { writeAuditLog } from "../../utils/audit";

export async function list(req: Request, res: Response) {
  const { data, meta } = await service.list(req.query, req.user!.organizationId);
  return sendPaginated(res, data, meta);
}

export async function options(req: Request, res: Response) {
  return sendSuccess(res, await service.formOptions(req.user!.organizationId));
}

export async function getById(req: Request, res: Response) {
  return sendSuccess(res, await service.getById(getParam(req, "id"), req.user!.organizationId));
}

export async function create(req: Request, res: Response) {
  const coupon = await service.create(req.body, req.user!.organizationId, req.user!.id);
  await writeAuditLog({ req, action: "CREATE", module: "coupons", entityId: coupon.id, newValues: coupon });
  return sendSuccess(res, coupon, "Added successfully", 201);
}

export async function createBulk(req: Request, res: Response) {
  const result = await service.createBulk(req.body, req.user!.organizationId, req.user!.id);
  await writeAuditLog({ req, action: "CREATE", module: "coupons", newValues: { bulk: result.created } });
  return sendSuccess(res, result, `${result.created} coupons added`, 201);
}

export async function importCoupons(req: Request, res: Response) {
  if (!req.file) throw new AppError(400, "No file was uploaded");
  const sheet = await parseSpreadsheetFile(req.file.buffer, req.file.originalname);
  const result = await service.importCoupons(sheet, req.user!.organizationId, req.user!.id);
  if (result.imported > 0) await writeAuditLog({ req, action: "CREATE", module: "coupons_import", newValues: { imported: result.imported } });
  return sendSuccess(res, result, result.errors.length ? "Import failed - fix the errors and try again" : "File imported successfully");
}

export async function update(req: Request, res: Response) {
  const coupon = await service.update(getParam(req, "id"), req.body, req.user!.organizationId);
  await writeAuditLog({ req, action: "UPDATE", module: "coupons", entityId: coupon.id, newValues: coupon });
  return sendSuccess(res, coupon, "Updated successfully");
}

export async function activate(req: Request, res: Response) {
  const coupon = await service.activate(getParam(req, "id"), req.user!.organizationId);
  return sendSuccess(res, coupon, "Updated successfully");
}

export async function massDeactivate(req: Request, res: Response) {
  return sendSuccess(res, await service.massDeactivate(req.body.ids, req.user!.organizationId), "Deactivated successfully");
}

export async function remove(req: Request, res: Response) {
  const coupon = await service.remove(getParam(req, "id"), req.user!.organizationId);
  await writeAuditLog({ req, action: "DELETE", module: "coupons", entityId: coupon.id });
  return sendSuccess(res, null, "Deleted successfully");
}
