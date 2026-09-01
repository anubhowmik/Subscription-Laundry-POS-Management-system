import { Request, Response } from "express";
import { getParam } from "../../utils/params";
import * as service from "./compensation.service";
import { sendPaginated, sendSuccess } from "../../utils/apiResponse";
import { writeAuditLog } from "../../utils/audit";

export async function list(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  const canViewAll = req.user!.isSystemAdmin || req.user!.permissions.includes("compensations.view_all");
  const { data, meta } = await service.list(req.query, req.user!.organizationId, allowedLocationIds, {
    canViewAll,
    userId: req.user!.id,
  });
  return sendPaginated(res, data, meta);
}

export async function create(req: Request, res: Response) {
  const compensation = await service.create(req.body, req.user!.organizationId, req.user!.id);
  await writeAuditLog({ req, action: "CREATE", module: "compensations", entityId: compensation.id, newValues: compensation });
  return sendSuccess(res, compensation, "Compensation claim created", 201);
}

export async function resolve(req: Request, res: Response) {
  const compensation = await service.resolve(getParam(req, "id"), req.body, req.user!.organizationId, req.user!.id, {
    isSystemAdmin: req.user!.isSystemAdmin,
    permissions: req.user!.permissions,
    allowedLocationIds: req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds,
  });
  await writeAuditLog({ req, action: "UPDATE", module: "compensations", entityId: compensation.id, newValues: compensation });
  return sendSuccess(res, compensation, "Compensation updated");
}

export async function remove(req: Request, res: Response) {
  await service.remove(getParam(req, "id"), req.user!.organizationId, {
    isSystemAdmin: req.user!.isSystemAdmin,
    permissions: req.user!.permissions,
    allowedLocationIds: req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds,
    userId: req.user!.id,
  });
  await writeAuditLog({ req, action: "DELETE", module: "compensations", entityId: getParam(req, "id") });
  return sendSuccess(res, null, "Compensation deleted");
}
