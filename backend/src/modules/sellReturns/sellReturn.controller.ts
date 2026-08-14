import { Request, Response } from "express";
import { getParam } from "../../utils/params";
import * as service from "./sellReturn.service";
import { sendPaginated, sendSuccess } from "../../utils/apiResponse";
import { writeAuditLog } from "../../utils/audit";

export async function getReturnableSale(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  return sendSuccess(res, await service.getReturnableSale(getParam(req, "saleId"), req.user!.organizationId, allowedLocationIds));
}

export async function list(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  const { data, meta } = await service.list(req.query, req.user!.organizationId, allowedLocationIds);
  return sendPaginated(res, data, meta);
}

export async function create(req: Request, res: Response) {
  const sellReturn = await service.create(req.body, req.user!.organizationId, req.user!.id);
  await writeAuditLog({ req, action: "CREATE", module: "sell_returns", entityId: sellReturn.id, newValues: sellReturn });
  return sendSuccess(res, sellReturn, "Return processed", 201);
}

export async function remove(req: Request, res: Response) {
  await service.remove(getParam(req, "id"), req.user!.organizationId);
  await writeAuditLog({ req, action: "DELETE", module: "sell_returns", entityId: getParam(req, "id") });
  return sendSuccess(res, null, "Return voided");
}
