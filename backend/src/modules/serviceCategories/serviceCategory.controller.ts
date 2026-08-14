import { Request, Response } from "express";
import * as service from "./serviceCategory.service";
import { sendSuccess } from "../../utils/apiResponse";

export async function list(req: Request, res: Response) {
  return sendSuccess(res, await service.list(req.user!.organizationId));
}

export async function create(req: Request, res: Response) {
  const row = await service.create(req.body, req.user!.organizationId);
  return sendSuccess(res, row, "Service category created", 201);
}
