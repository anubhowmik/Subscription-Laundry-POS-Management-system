import { Request, Response } from "express";
import { getParam } from "../../utils/params";
import * as service from "./inventoryPosting.service";
import { sendPaginated, sendSuccess } from "../../utils/apiResponse";
import { writeAuditLog } from "../../utils/audit";

function allowedLocationIds(req: Request) {
  return req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
}

export async function preview(req: Request, res: Response) {
  const businessLocationId = String(req.query.businessLocationId ?? "");
  const snapshot = await service.computeSnapshot(businessLocationId, req.user!.organizationId, new Date());
  return sendSuccess(res, snapshot);
}

export async function list(req: Request, res: Response) {
  const { data, meta } = await service.list(req.query, req.user!.organizationId, allowedLocationIds(req));
  return sendPaginated(res, data, meta);
}

export async function getById(req: Request, res: Response) {
  return sendSuccess(res, await service.getById(getParam(req, "id"), req.user!.organizationId, allowedLocationIds(req)));
}

export async function create(req: Request, res: Response) {
  const posting = await service.create(req.body, req.user!.organizationId, req.user!.id);
  await writeAuditLog({ req, action: "CREATE", module: "inventory_postings", entityId: posting.id, newValues: posting });
  return sendSuccess(res, posting, "Inventory posting created", 201);
}

export async function confirm(req: Request, res: Response) {
  const posting = await service.confirm(getParam(req, "id"), req.user!.organizationId, allowedLocationIds(req));
  await writeAuditLog({ req, action: "UPDATE", module: "inventory_postings", entityId: posting.id, newValues: posting });
  return sendSuccess(res, posting, "Inventory posting confirmed");
}
