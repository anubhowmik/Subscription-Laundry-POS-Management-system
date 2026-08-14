import { Request, Response } from "express";
import * as service from "./coupon.service";
import { sendSuccess } from "../../utils/apiResponse";
import { getParam } from "../../utils/params";

export async function list(req: Request, res: Response) {
  return sendSuccess(res, await service.list(req.user!.organizationId));
}

export async function create(req: Request, res: Response) {
  const coupon = await service.create(req.body, req.user!.organizationId);
  return sendSuccess(res, coupon, "Coupon created", 201);
}

export async function update(req: Request, res: Response) {
  const coupon = await service.update(getParam(req, "id"), req.body, req.user!.organizationId);
  return sendSuccess(res, coupon, "Coupon updated");
}

export async function deactivate(req: Request, res: Response) {
  const coupon = await service.deactivate(getParam(req, "id"), req.user!.organizationId);
  return sendSuccess(res, coupon, "Coupon deactivated");
}

export async function preview(req: Request, res: Response) {
  const code = String(req.query.code);
  const subtotal = Number(req.query.subtotal);
  const customerId = req.query.customerId ? String(req.query.customerId) : undefined;
  const businessLocationId = req.query.businessLocationId ? String(req.query.businessLocationId) : undefined;
  return sendSuccess(res, await service.previewCoupon(code, subtotal, req.user!.organizationId, customerId, businessLocationId));
}
