import { Request, Response } from "express";
import { getParam } from "../../utils/params";
import * as service from "./account.service";
import * as reportsService from "./accountingReports.service";
import { sendSuccess } from "../../utils/apiResponse";
import { writeAuditLog } from "../../utils/audit";
import { ValidationError } from "../../utils/AppError";

export async function list(req: Request, res: Response) {
  return sendSuccess(res, await service.list(req.user!.organizationId));
}

export async function getById(req: Request, res: Response) {
  return sendSuccess(res, await service.getById(getParam(req, "id"), req.user!.organizationId));
}

export async function create(req: Request, res: Response) {
  const account = await service.create(req.body, req.user!.organizationId);
  await writeAuditLog({ req, action: "CREATE", module: "accounting_accounts", entityId: account.id, newValues: account });
  return sendSuccess(res, account, "Account created", 201);
}

export async function update(req: Request, res: Response) {
  const before = await service.getById(getParam(req, "id"), req.user!.organizationId);
  const account = await service.update(getParam(req, "id"), req.body, req.user!.organizationId);
  await writeAuditLog({ req, action: "UPDATE", module: "accounting_accounts", entityId: account.id, oldValues: before, newValues: account });
  return sendSuccess(res, account, "Account updated");
}

export async function deactivate(req: Request, res: Response) {
  const account = await service.deactivate(getParam(req, "id"), req.user!.organizationId);
  await writeAuditLog({ req, action: "DEACTIVATE", module: "accounting_accounts", entityId: account.id });
  return sendSuccess(res, account, "Account deactivated");
}

export async function trialBalance(req: Request, res: Response) {
  return sendSuccess(res, await reportsService.trialBalanceReport(req.user!.organizationId, req.query.asOfDate as string | undefined));
}

export async function balanceSheet(req: Request, res: Response) {
  return sendSuccess(res, await reportsService.balanceSheetReport(req.user!.organizationId, req.query.asOfDate as string | undefined));
}

export async function generalLedger(req: Request, res: Response) {
  const accountId = req.query.accountId as string | undefined;
  if (!accountId) throw new ValidationError([{ field: "accountId", message: "accountId is required" }]);
  return sendSuccess(
    res,
    await reportsService.generalLedgerReport(
      req.user!.organizationId,
      accountId,
      req.query.fromDate as string | undefined,
      req.query.toDate as string | undefined,
    ),
  );
}
