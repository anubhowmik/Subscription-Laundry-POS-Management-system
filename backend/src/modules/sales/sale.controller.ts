import { Request, Response } from "express";
import { getParam } from "../../utils/params";
import * as service from "./sale.service";
import { sendPaginated, sendSuccess } from "../../utils/apiResponse";
import { submitInvoice } from "../zatca/invoiceSubmission.service";
import { writeAuditLog } from "../../utils/audit";

export async function list(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  const { data, meta } = await service.list(req.query, req.user!.organizationId, allowedLocationIds);
  return sendPaginated(res, data, meta);
}

export async function getById(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  return sendSuccess(res, await service.getById(getParam(req, "id"), req.user!.organizationId, allowedLocationIds));
}

export async function getQr(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  return sendSuccess(res, await service.getQrImage(getParam(req, "id"), req.user!.organizationId, allowedLocationIds));
}

export async function submitToZatca(req: Request, res: Response) {
  const saleId = getParam(req, "id");
  const sale = await submitInvoice(saleId, req.user!.organizationId);
  await writeAuditLog({ req, action: "UPDATE", module: "zatca_submission", entityId: sale.id, newValues: { clearanceStatus: sale.clearanceStatus } });
  return sendSuccess(res, sale, `Submitted to ZATCA (${sale.clearanceStatus})`);
}

export async function listBoardItems(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  return sendSuccess(res, await service.listBoardItems(req.query, req.user!.organizationId, allowedLocationIds));
}

export async function updateItemStatus(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  const { status, note } = req.body as { status: "PENDING" | "IN_PROGRESS" | "READY" | "DELIVERED" | "CANCELLED"; note?: string };
  const item = await service.updateItemStatus(
    getParam(req, "id"),
    getParam(req, "itemId"),
    status,
    note,
    req.user!.organizationId,
    allowedLocationIds,
    req.user!.id,
  );
  await writeAuditLog({ req, action: "UPDATE", module: "sale_item_status", entityId: item.id, newValues: { status } });
  return sendSuccess(res, item, "Item status updated");
}
