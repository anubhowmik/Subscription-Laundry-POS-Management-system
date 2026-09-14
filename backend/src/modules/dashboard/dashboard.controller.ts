import { Request, Response } from "express";
import * as service from "./dashboard.service";
import { sendSuccess } from "../../utils/apiResponse";

export async function getSummary(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  return sendSuccess(res, await service.getSummary(req.user!.organizationId, allowedLocationIds));
}

export async function getSalesOverview(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  const period = typeof req.query.period === "string" ? req.query.period : "7d";
  return sendSuccess(res, await service.getSalesOverview(period, req.user!.organizationId, allowedLocationIds));
}
