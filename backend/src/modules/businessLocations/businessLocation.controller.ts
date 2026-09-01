import { Request, Response } from "express";
import { getParam } from "../../utils/params";
import * as service from "./businessLocation.service";
import { sendPaginated, sendSuccess } from "../../utils/apiResponse";
import { writeAuditLog } from "../../utils/audit";

export async function list(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  const { data, meta } = await service.list(req.query, req.user!.organizationId, allowedLocationIds);
  return sendPaginated(res, data, meta);
}

export async function getById(req: Request, res: Response) {
  return sendSuccess(res, await service.getById(getParam(req, "id"), req.user!.organizationId));
}

export async function create(req: Request, res: Response) {
  const location = await service.create(req.body, req.user!.organizationId, req.user!.id, req.user!.isSystemAdmin);
  await writeAuditLog({ req, action: "CREATE", module: "business_locations", entityId: location.id, newValues: location });
  return sendSuccess(res, location, "Business location created", 201);
}

export async function update(req: Request, res: Response) {
  const before = await service.getById(getParam(req, "id"), req.user!.organizationId);
  const location = await service.update(getParam(req, "id"), req.body, req.user!.organizationId);
  await writeAuditLog({ req, action: "UPDATE", module: "business_locations", entityId: location.id, oldValues: before, newValues: location });
  return sendSuccess(res, location, "Business location updated");
}

export async function deactivate(req: Request, res: Response) {
  const location = await service.deactivate(getParam(req, "id"), req.user!.organizationId, req.user!.isSystemAdmin);
  await writeAuditLog({ req, action: "DEACTIVATE", module: "business_locations", entityId: location.id });
  return sendSuccess(res, location, "Business location deactivated");
}

export async function reactivate(req: Request, res: Response) {
  const location = await service.reactivate(getParam(req, "id"), req.user!.organizationId, req.user!.isSystemAdmin);
  await writeAuditLog({ req, action: "ACTIVATE", module: "business_locations", entityId: location.id });
  return sendSuccess(res, location, "Business location reactivated");
}

export async function getInvoiceLayout(req: Request, res: Response) {
  return sendSuccess(res, await service.getInvoiceLayout(getParam(req, "id"), req.user!.organizationId));
}

export async function updateInvoiceLayout(req: Request, res: Response) {
  const layout = await service.upsertInvoiceLayout(getParam(req, "id"), req.body, req.user!.organizationId);
  await writeAuditLog({ req, action: "UPDATE", module: "business_locations", entityId: layout.businessLocationId, newValues: layout });
  return sendSuccess(res, layout, "Invoice layout updated");
}
