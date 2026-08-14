import { Request, Response } from "express";
import { getParam } from "../../utils/params";
import * as service from "./supplier.service";
import { sendPaginated, sendSuccess } from "../../utils/apiResponse";
import { writeAuditLog } from "../../utils/audit";

export async function list(req: Request, res: Response) {
  const { data, meta } = await service.list(req.query, req.user!.organizationId);
  return sendPaginated(res, data, meta);
}

export async function getById(req: Request, res: Response) {
  return sendSuccess(res, await service.getById(getParam(req, "id"), req.user!.organizationId));
}

export async function getProfile(req: Request, res: Response) {
  return sendSuccess(res, await service.getProfile(getParam(req, "id"), req.user!.organizationId));
}

export async function create(req: Request, res: Response) {
  const supplier = await service.create(req.body, req.user!.organizationId);
  await writeAuditLog({ req, action: "CREATE", module: "suppliers", entityId: supplier.id, newValues: supplier });
  return sendSuccess(res, supplier, "Supplier created", 201);
}

export async function update(req: Request, res: Response) {
  const before = await service.getById(getParam(req, "id"), req.user!.organizationId);
  const supplier = await service.update(getParam(req, "id"), req.body, req.user!.organizationId);
  await writeAuditLog({ req, action: "UPDATE", module: "suppliers", entityId: supplier.id, oldValues: before, newValues: supplier });
  return sendSuccess(res, supplier, "Supplier updated");
}

export async function deactivate(req: Request, res: Response) {
  const supplier = await service.deactivate(getParam(req, "id"), req.user!.organizationId);
  await writeAuditLog({ req, action: "DEACTIVATE", module: "suppliers", entityId: supplier.id });
  return sendSuccess(res, supplier, "Supplier deactivated");
}
