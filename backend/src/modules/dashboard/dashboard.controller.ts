import { Request, Response } from "express";
import * as service from "./dashboard.service";
import { sendSuccess } from "../../utils/apiResponse";

export async function getSummary(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  return sendSuccess(res, await service.getSummary(req.user!.organizationId, allowedLocationIds));
}
