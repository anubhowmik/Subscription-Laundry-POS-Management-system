import { Request, Response } from "express";
import { getParam } from "../../utils/params";
import * as service from "./category.service";
import { sendPaginated, sendSuccess } from "../../utils/apiResponse";
import { writeAuditLog } from "../../utils/audit";

export async function list(req: Request, res: Response) {
  const { data, meta } = await service.list(req.query, req.user!.organizationId);
  return sendPaginated(res, data, meta);
}

export async function getById(req: Request, res: Response) {
  const category = await service.getById(getParam(req, "id"), req.user!.organizationId);
  return sendSuccess(res, category);
}

export async function create(req: Request, res: Response) {
  const category = await service.create(req.body, req.user!.organizationId);
  await writeAuditLog({ req, action: "CREATE", module: "categories", entityId: category.id, newValues: category });
  return sendSuccess(res, category, "Category created", 201);
}

export async function update(req: Request, res: Response) {
  const before = await service.getById(getParam(req, "id"), req.user!.organizationId);
  const category = await service.update(getParam(req, "id"), req.body, req.user!.organizationId);
  await writeAuditLog({ req, action: "UPDATE", module: "categories", entityId: category.id, oldValues: before, newValues: category });
  return sendSuccess(res, category, "Category updated");
}

export async function deactivate(req: Request, res: Response) {
  const category = await service.deactivate(getParam(req, "id"), req.user!.organizationId);
  await writeAuditLog({ req, action: "DEACTIVATE", module: "categories", entityId: category.id });
  return sendSuccess(res, category, "Category deactivated");
}
