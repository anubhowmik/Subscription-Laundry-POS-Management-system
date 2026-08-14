import { Request, Response } from "express";
import { getParam } from "../../utils/params";
import * as service from "./loyalty.service";
import { sendSuccess } from "../../utils/apiResponse";
import { writeAuditLog } from "../../utils/audit";

export async function getLedger(req: Request, res: Response) {
  return sendSuccess(res, await service.getLedger(getParam(req, "customerId"), req.user!.organizationId));
}

export async function adjustPoints(req: Request, res: Response) {
  const { points, note } = req.body as { points: number; note: string };
  const txn = await service.adjustPoints(getParam(req, "customerId"), points, note, req.user!.organizationId, req.user!.id);
  await writeAuditLog({ req, action: "CREATE", module: "loyalty_adjustment", entityId: txn.id, newValues: txn });
  return sendSuccess(res, txn, "Points adjusted", 201);
}
