import { Request, Response } from "express";
import { getParam } from "../../utils/params";
import * as service from "./service.service";
import { sendPaginated, sendSuccess } from "../../utils/apiResponse";
import { writeAuditLog } from "../../utils/audit";

export async function list(req: Request, res: Response) {
  const { data, meta } = await service.list(req.query, req.user!.organizationId);
  return sendPaginated(res, data, meta);
}

export async function getById(req: Request, res: Response) {
  return sendSuccess(res, await service.getById(getParam(req, "id"), req.user!.organizationId));
}

export async function create(req: Request, res: Response) {
  const created = await service.create(req.body, req.user!.organizationId);
  await writeAuditLog({ req, action: "CREATE", module: "services", entityId: created.id, newValues: created });
  return sendSuccess(res, created, "Service created", 201);
}

export async function update(req: Request, res: Response) {
  const before = await service.getById(getParam(req, "id"), req.user!.organizationId);
  const updated = await service.update(getParam(req, "id"), req.body, req.user!.organizationId);
  await writeAuditLog({ req, action: "UPDATE", module: "services", entityId: updated.id, oldValues: before, newValues: updated });
  return sendSuccess(res, updated, "Service updated");
}

export async function deactivate(req: Request, res: Response) {
  const deactivated = await service.deactivate(getParam(req, "id"), req.user!.organizationId);
  await writeAuditLog({ req, action: "DEACTIVATE", module: "services", entityId: deactivated.id });
  return sendSuccess(res, deactivated, "Service deactivated");
}
