import { Request, Response } from "express";
import { getParam } from "../../utils/params";
import * as service from "./inventoryPosting.service";
import { sendPaginated, sendSuccess } from "../../utils/apiResponse";
import { writeAuditLog } from "../../utils/audit";

function allowedLocationIds(req: Request) {
  return req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
}

export async function searchReadySales(req: Request, res: Response) {
  return sendSuccess(res, await service.searchReadySales(req.query, req.user!.organizationId, allowedLocationIds(req)));
}

export async function listClassifiedSales(req: Request, res: Response) {
  const { data, meta } = await service.listClassifiedSales(req.query, req.user!.organizationId, allowedLocationIds(req));
  return sendPaginated(res, data, meta);
}

export async function list(req: Request, res: Response) {
  const { data, meta } = await service.list(req.query, req.user!.organizationId, allowedLocationIds(req));
  return sendPaginated(res, data, meta);
}

export async function getById(req: Request, res: Response) {
  return sendSuccess(res, await service.getById(getParam(req, "id"), req.user!.organizationId, allowedLocationIds(req)));
}

export async function create(req: Request, res: Response) {
  const posting = await service.create(req.body, req.user!.organizationId, req.user!.id, allowedLocationIds(req));
  await writeAuditLog({ req, action: "CREATE", module: "inventory_postings", entityId: posting.id, newValues: posting });
  return sendSuccess(res, posting, "Inventory posting created", 201);
}

export async function update(req: Request, res: Response) {
  const posting = await service.update(getParam(req, "id"), req.body, req.user!.organizationId, allowedLocationIds(req));
  await writeAuditLog({ req, action: "UPDATE", module: "inventory_postings", entityId: posting.id, newValues: posting });
  return sendSuccess(res, posting, "Inventory posting updated");
}

export async function confirm(req: Request, res: Response) {
  const posting = await service.confirm(getParam(req, "id"), req.user!.organizationId, allowedLocationIds(req));
  await writeAuditLog({ req, action: "UPDATE", module: "inventory_postings", entityId: posting.id, newValues: posting });
  return sendSuccess(res, posting, "Inventory posting confirmed");
}

export async function reconcile(req: Request, res: Response) {
  const posting = await service.reconcile(getParam(req, "id"), req.user!.organizationId, allowedLocationIds(req));
  await writeAuditLog({ req, action: "UPDATE", module: "inventory_postings", entityId: posting.id, newValues: posting });
  return sendSuccess(res, posting, "Inventory posting reconciled");
}

export async function remove(req: Request, res: Response) {
  const id = getParam(req, "id");
  await service.remove(id, req.user!.organizationId, allowedLocationIds(req));
  await writeAuditLog({ req, action: "DELETE", module: "inventory_postings", entityId: id });
  return sendSuccess(res, null, "Inventory posting deleted");
}
