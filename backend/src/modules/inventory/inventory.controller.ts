import { Request, Response } from "express";
import * as service from "./inventory.service";
import { sendPaginated, sendSuccess } from "../../utils/apiResponse";
import { writeAuditLog } from "../../utils/audit";
import { getParam } from "../../utils/params";

export async function adjustStock(req: Request, res: Response) {
  const txn = await service.adjustStock(req.body, req.user!.organizationId, req.user!.id);
  await writeAuditLog({ req, action: "CREATE", module: "inventory_adjustment", entityId: txn.id, newValues: txn });
  return sendSuccess(res, txn, "Stock adjusted", 201);
}

export async function shipTransfer(req: Request, res: Response) {
  const allowedFromLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedTransferFromLocationIds;
  const transfer = await service.shipTransfer(req.body, req.user!.organizationId, req.user!.id, allowedFromLocationIds);
  await writeAuditLog({ req, action: "CREATE", module: "stock_transfer", entityId: transfer.id, newValues: transfer });
  return sendSuccess(res, transfer, "Stock transfer shipped", 201);
}

export async function receiveTransfer(req: Request, res: Response) {
  const transfer = await service.receiveTransfer(getParam(req, "id"), req.body, req.user!.organizationId, req.user!.id);
  await writeAuditLog({ req, action: "UPDATE", module: "stock_transfer", entityId: transfer.id, newValues: transfer });
  return sendSuccess(res, transfer, "Stock transfer received");
}

export async function cancelTransfer(req: Request, res: Response) {
  const transfer = await service.cancelTransfer(getParam(req, "id"), req.user!.organizationId);
  await writeAuditLog({ req, action: "UPDATE", module: "stock_transfer", entityId: transfer.id, newValues: transfer });
  return sendSuccess(res, transfer, "Stock transfer cancelled");
}

export async function listTransfers(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  const { data, meta } = await service.listTransfers(req.query, req.user!.organizationId, allowedLocationIds);
  return sendPaginated(res, data, meta);
}

export async function listTransactions(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  const { data, meta } = await service.listTransactions(req.query, req.user!.organizationId, allowedLocationIds);
  return sendPaginated(res, data, meta);
}

export async function createStockAdjustment(req: Request, res: Response) {
  const adjustment = await service.createStockAdjustment(req.body, req.user!.organizationId, req.user!.id);
  await writeAuditLog({ req, action: "CREATE", module: "stock_adjustment", entityId: adjustment.id, newValues: adjustment });
  return sendSuccess(res, adjustment, "Stock adjustment created", 201);
}

export async function listStockAdjustments(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  const { data, meta } = await service.listStockAdjustments(req.query, req.user!.organizationId, allowedLocationIds);
  return sendPaginated(res, data, meta);
}

export async function reverseStockAdjustment(req: Request, res: Response) {
  const adjustment = await service.reverseStockAdjustment(getParam(req, "id"), req.user!.organizationId, req.user!.id);
  await writeAuditLog({ req, action: "UPDATE", module: "stock_adjustment", entityId: adjustment.id, newValues: adjustment });
  return sendSuccess(res, adjustment, "Stock adjustment reversed");
}
