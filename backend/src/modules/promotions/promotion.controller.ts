import { Request, Response } from "express";
import * as service from "./promotion.service";
import { sendPaginated, sendSuccess } from "../../utils/apiResponse";
import { getParam } from "../../utils/params";
import { writeAuditLog } from "../../utils/audit";

export async function list(req: Request, res: Response) {
  const { data, meta } = await service.list(req.query, req.user!.organizationId);
  return sendPaginated(res, data, meta);
}

export async function getById(req: Request, res: Response) {
  return sendSuccess(res, await service.getById(getParam(req, "id"), req.user!.organizationId));
}

export async function options(req: Request, res: Response) {
  return sendSuccess(res, await service.formOptions(req.user!.organizationId));
}

export async function create(req: Request, res: Response) {
  const row = await service.create(req.body, req.user!.organizationId, req.user!.id);
  await writeAuditLog({ req, action: "CREATE", module: "promotions", entityId: row.id, newValues: row });
  return sendSuccess(res, row, "Added Successfully", 201);
}

export async function update(req: Request, res: Response) {
  const before = await service.getById(getParam(req, "id"), req.user!.organizationId);
  const row = await service.update(getParam(req, "id"), req.body, req.user!.organizationId);
  await writeAuditLog({ req, action: "UPDATE", module: "promotions", entityId: row.id, oldValues: before, newValues: row });
  return sendSuccess(res, row, "Updated Successfully");
}

export async function remove(req: Request, res: Response) {
  const row = await service.remove(getParam(req, "id"), req.user!.organizationId);
  await writeAuditLog({ req, action: "DELETE", module: "promotions", entityId: row.id, oldValues: row });
  return sendSuccess(res, row, "Deleted Successfully");
}

export async function activate(req: Request, res: Response) {
  const row = await service.activate(getParam(req, "id"), req.user!.organizationId);
  await writeAuditLog({ req, action: "UPDATE", module: "promotions", entityId: row.id, newValues: { isActive: true } });
  return sendSuccess(res, row, "Updated Successfully");
}

export async function massDeactivate(req: Request, res: Response) {
  const result = await service.massDeactivate(req.body.ids, req.user!.organizationId);
  await writeAuditLog({ req, action: "UPDATE", module: "promotions", newValues: { deactivated: req.body.ids } });
  return sendSuccess(res, result, "Deactivated successfully");
}
