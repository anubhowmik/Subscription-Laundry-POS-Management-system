import { Request, Response } from "express";
import { getParam } from "../../utils/params";
import * as service from "./purchase.service";
import { sendPaginated, sendSuccess } from "../../utils/apiResponse";
import { writeAuditLog } from "../../utils/audit";

function allowedLocationIds(req: Request) {
  return req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
}

export async function list(req: Request, res: Response) {
  const { data, meta } = await service.list(req.query, req.user!.organizationId, allowedLocationIds(req));
  return sendPaginated(res, data, meta);
}

export async function getById(req: Request, res: Response) {
  return sendSuccess(res, await service.getById(getParam(req, "id"), req.user!.organizationId, allowedLocationIds(req)));
}

export async function create(req: Request, res: Response) {
  const purchase = await service.create(req.body, req.user!.organizationId, req.user!.id);
  await writeAuditLog({ req, action: "CREATE", module: "purchases", entityId: purchase.id, newValues: purchase });
  return sendSuccess(res, purchase, "Purchase recorded", 201);
}

export async function getReturnablePurchase(req: Request, res: Response) {
  return sendSuccess(res, await service.getReturnablePurchase(getParam(req, "purchaseId"), req.user!.organizationId, allowedLocationIds(req)));
}

export async function listReturns(req: Request, res: Response) {
  const { data, meta } = await service.listReturns(req.query, req.user!.organizationId, allowedLocationIds(req));
  return sendPaginated(res, data, meta);
}

export async function createReturn(req: Request, res: Response) {
  const purchaseReturn = await service.createReturn(req.body, req.user!.organizationId, req.user!.id);
  await writeAuditLog({ req, action: "CREATE", module: "purchase_returns", entityId: purchaseReturn.id, newValues: purchaseReturn });
  return sendSuccess(res, purchaseReturn, "Purchase return processed", 201);
}
