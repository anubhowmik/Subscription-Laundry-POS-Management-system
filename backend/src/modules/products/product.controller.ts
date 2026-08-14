import { Request, Response } from "express";
import { getParam } from "../../utils/params";
import * as service from "./product.service";
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
  const product = await service.create(req.body, req.user!.id, req.user!.organizationId);
  await writeAuditLog({ req, action: "CREATE", module: "products", entityId: product.id, newValues: product });
  return sendSuccess(res, product, "Product created", 201);
}

export async function update(req: Request, res: Response) {
  const before = await service.getById(getParam(req, "id"), req.user!.organizationId);
  const product = await service.update(getParam(req, "id"), req.body, req.user!.organizationId);
  await writeAuditLog({ req, action: "UPDATE", module: "products", entityId: product.id, oldValues: before, newValues: product });
  return sendSuccess(res, product, "Product updated");
}

export async function deactivate(req: Request, res: Response) {
  const product = await service.deactivate(getParam(req, "id"), req.user!.organizationId);
  await writeAuditLog({ req, action: "DEACTIVATE", module: "products", entityId: product.id });
  return sendSuccess(res, product, "Product deactivated");
}
