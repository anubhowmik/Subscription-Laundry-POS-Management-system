import { Request, Response } from "express";
import { getParam } from "../../utils/params";
import * as service from "./brand.service";
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
  const brand = await service.create(req.body, req.user!.organizationId);
  await writeAuditLog({ req, action: "CREATE", module: "brands", entityId: brand.id, newValues: brand });
  return sendSuccess(res, brand, "Brand created", 201);
}

export async function update(req: Request, res: Response) {
  const before = await service.getById(getParam(req, "id"), req.user!.organizationId);
  const brand = await service.update(getParam(req, "id"), req.body, req.user!.organizationId);
  await writeAuditLog({ req, action: "UPDATE", module: "brands", entityId: brand.id, oldValues: before, newValues: brand });
  return sendSuccess(res, brand, "Brand updated");
}

export async function deactivate(req: Request, res: Response) {
  const brand = await service.deactivate(getParam(req, "id"), req.user!.organizationId);
  await writeAuditLog({ req, action: "DEACTIVATE", module: "brands", entityId: brand.id });
  return sendSuccess(res, brand, "Brand deactivated");
}
