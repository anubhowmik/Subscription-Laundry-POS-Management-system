import { Request, Response } from "express";
import * as service from "./reports.service";
import { sendSuccess } from "../../utils/apiResponse";

export async function salesReport(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  return sendSuccess(res, await service.salesReport(req.query, req.user!.organizationId, allowedLocationIds));
}

export async function accountingReport(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  return sendSuccess(res, await service.accountingReport(req.query, req.user!.organizationId, allowedLocationIds));
}

export async function inventoryReport(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  return sendSuccess(res, await service.inventoryReport(req.query, req.user!.organizationId, allowedLocationIds));
}

export async function salesByServiceReport(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  return sendSuccess(res, await service.salesByServiceReport(req.query, req.user!.organizationId, allowedLocationIds));
}

export async function arAgingReport(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  return sendSuccess(res, await service.arAgingReport(req.query, req.user!.organizationId, allowedLocationIds));
}

export async function apAgingReport(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  return sendSuccess(res, await service.apAgingReport(req.query, req.user!.organizationId, allowedLocationIds));
}

export async function staffProductivityReport(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  return sendSuccess(res, await service.staffProductivityReport(req.query, req.user!.organizationId, allowedLocationIds));
}

export async function vatBreakdownReport(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  return sendSuccess(res, await service.vatBreakdownReport(req.query, req.user!.organizationId, allowedLocationIds));
}
