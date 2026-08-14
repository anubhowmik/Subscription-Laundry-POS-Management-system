import { Request, Response } from "express";
import { getParam } from "../../utils/params";
import * as service from "./cashback.service";
import { sendSuccess } from "../../utils/apiResponse";
import { writeAuditLog } from "../../utils/audit";

export async function getLedger(req: Request, res: Response) {
  return sendSuccess(res, await service.getLedger(getParam(req, "customerId"), req.user!.organizationId));
}

export async function adjustCashback(req: Request, res: Response) {
  const { amount, note } = req.body as { amount: number; note: string };
  const txn = await service.adjustCashback(getParam(req, "customerId"), amount, "ADJUSTMENT", note, req.user!.organizationId, req.user!.id);
  await writeAuditLog({ req, action: "CREATE", module: "cashback_adjustment", entityId: txn.id, newValues: txn });
  return sendSuccess(res, txn, "Cashback adjusted", 201);
}
