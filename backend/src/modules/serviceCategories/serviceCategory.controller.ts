import { Request, Response } from "express";
import { getParam } from "../../utils/params";
import * as service from "./serviceCategory.service";
import { sendSuccess } from "../../utils/apiResponse";
import { writeAuditLog } from "../../utils/audit";

export async function list(req: Request, res: Response) {
  return sendSuccess(res, await service.list(req.user!.organizationId, req.query.includeInactive === "true"));
}

export async function create(req: Request, res: Response) {
  const row = await service.create(req.body, req.user!.organizationId);
  await writeAuditLog({ req, action: "CREATE", module: "service_categories", entityId: row.id, newValues: row });
  return sendSuccess(res, row, "Service category created", 201);
}

export async function update(req: Request, res: Response) {
  const before = await service.getById(getParam(req, "id"), req.user!.organizationId);
  const row = await service.update(getParam(req, "id"), req.body, req.user!.organizationId);
  await writeAuditLog({ req, action: "UPDATE", module: "service_categories", entityId: row.id, oldValues: before, newValues: row });
  return sendSuccess(res, row, "Service category updated");
}
