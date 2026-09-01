import { Request, Response } from "express";
import * as service from "./billing.service";
import { sendSuccess } from "../../utils/apiResponse";
import { writeAuditLog } from "../../utils/audit";

export async function listPlans(_req: Request, res: Response) {
  return sendSuccess(res, await service.listPlans());
}

export async function getSubscription(req: Request, res: Response) {
  return sendSuccess(res, await service.getCurrentSubscription(req.user!.organizationId));
}

export async function checkout(req: Request, res: Response) {
  const { planCode, interval } = req.body as { planCode: string; interval: service.PurchaseInterval };
  const result = await service.createCheckout(req.user!.organizationId, planCode, interval);
  await writeAuditLog({ req, action: "CREATE", module: "billing", entityId: result.billingPaymentId, newValues: { planCode, interval } });
  return sendSuccess(res, result, "Checkout created");
}

export async function checkoutSeats(req: Request, res: Response) {
  const { quantity } = req.body as { quantity: number };
  const result = await service.createSeatCheckout(req.user!.organizationId, quantity);
  await writeAuditLog({ req, action: "CREATE", module: "licenses", entityId: result.billingPaymentId, newValues: { quantity } });
  return sendSuccess(res, result, "Seat checkout created");
}

export async function getSeats(req: Request, res: Response) {
  return sendSuccess(res, await service.getSeatSummary(req.user!.organizationId));
}

export async function verify(req: Request, res: Response) {
  const { billingPaymentId } = req.body as { billingPaymentId: string };
  const result = await service.verifyPayment(billingPaymentId, req.user!.organizationId);
  if (!result.alreadyProcessed) {
    await writeAuditLog({ req, action: "UPDATE", module: "billing", entityId: billingPaymentId, newValues: { status: "PAID" } });
  }
  return sendSuccess(res, result, "Payment verified");
}
