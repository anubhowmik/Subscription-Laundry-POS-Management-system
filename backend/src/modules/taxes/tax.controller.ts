import { Request, Response } from "express";
import { getParam } from "../../utils/params";
import * as service from "./tax.service";
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
  const tax = await service.create(req.body, req.user!.organizationId);
  await writeAuditLog({ req, action: "CREATE", module: "taxes", entityId: tax.id, newValues: tax });
  return sendSuccess(res, tax, "Tax created", 201);
}

export async function update(req: Request, res: Response) {
  const before = await service.getById(getParam(req, "id"), req.user!.organizationId);
  const tax = await service.update(getParam(req, "id"), req.body, req.user!.organizationId);
  await writeAuditLog({ req, action: "UPDATE", module: "taxes", entityId: tax.id, oldValues: before, newValues: tax });
  return sendSuccess(res, tax, "Tax updated");
}

export async function deactivate(req: Request, res: Response) {
  const tax = await service.deactivate(getParam(req, "id"), req.user!.organizationId);
  await writeAuditLog({ req, action: "DEACTIVATE", module: "taxes", entityId: tax.id });
  return sendSuccess(res, tax, "Tax deactivated");
}
