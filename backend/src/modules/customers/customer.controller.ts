import { Request, Response } from "express";
import { getParam } from "../../utils/params";
import * as service from "./customer.service";
import { sendPaginated, sendSuccess } from "../../utils/apiResponse";
import { writeAuditLog } from "../../utils/audit";
import { parseSpreadsheetFile } from "../../utils/spreadsheet";
import { AppError } from "../../utils/AppError";

function accessScope(req: Request) {
  return req.user!.isSystemAdmin
    ? { allowedCustomerIds: null, allowedCustomerGroupIds: null }
    : { allowedCustomerIds: req.user!.allowedCustomerIds, allowedCustomerGroupIds: req.user!.allowedCustomerGroupIds };
}

export async function list(req: Request, res: Response) {
  const { data, meta } = await service.list(req.query, req.user!.organizationId, accessScope(req));
  return sendPaginated(res, data, meta);
}

export async function getById(req: Request, res: Response) {
  return sendSuccess(res, await service.getById(getParam(req, "id"), req.user!.organizationId, accessScope(req)));
}

export async function getProfile(req: Request, res: Response) {
  return sendSuccess(res, await service.getProfile(getParam(req, "id"), req.user!.organizationId));
}

export async function create(req: Request, res: Response) {
  const customer = await service.create(req.body, req.user!.organizationId);
  await writeAuditLog({ req, action: "CREATE", module: "customers", entityId: customer.id, newValues: customer });
  return sendSuccess(res, customer, "Customer created", 201);
}

export async function update(req: Request, res: Response) {
  const before = await service.getById(getParam(req, "id"), req.user!.organizationId);
  const customer = await service.update(getParam(req, "id"), req.body, req.user!.organizationId);
  await writeAuditLog({ req, action: "UPDATE", module: "customers", entityId: customer.id, oldValues: before, newValues: customer });
  return sendSuccess(res, customer, "Customer updated");
}

export async function deactivate(req: Request, res: Response) {
  const customer = await service.deactivate(getParam(req, "id"), req.user!.organizationId);
  await writeAuditLog({ req, action: "DEACTIVATE", module: "customers", entityId: customer.id });
  return sendSuccess(res, customer, "Customer deactivated");
}

export async function activate(req: Request, res: Response) {
  const customer = await service.activate(getParam(req, "id"), req.user!.organizationId);
  await writeAuditLog({ req, action: "ACTIVATE", module: "customers", entityId: customer.id });
  return sendSuccess(res, customer, "Customer activated");
}

export async function setApprovalStatus(req: Request, res: Response) {
  const customer = await service.setApprovalStatus(getParam(req, "id"), req.body.status, req.user!.organizationId);
  await writeAuditLog({ req, action: "UPDATE", module: "customer_approval", entityId: customer.id, newValues: customer });
  return sendSuccess(res, customer, "Customer approval status updated");
}

export async function importCustomers(req: Request, res: Response) {
  if (!req.file) throw new AppError(400, "No file was uploaded");
  const sheet = await parseSpreadsheetFile(req.file.buffer, req.file.originalname);
  const result = await service.importCustomers(sheet, req.user!.organizationId);
  if (result.imported > 0) {
    await writeAuditLog({ req, action: "CREATE", module: "customers_import", newValues: { imported: result.imported } });
  }
  return sendSuccess(res, result, result.errors.length > 0 ? "Import failed - fix the errors and try again" : "Customers imported");
}

export async function applyCreditToSale(req: Request, res: Response) {
  const sale = await service.applyCreditToSale(
    getParam(req, "id"),
    req.body.saleId,
    req.body.amount,
    req.user!.organizationId,
    req.user!.id,
  );
  await writeAuditLog({ req, action: "UPDATE", module: "customer_credit", entityId: sale.id, newValues: sale });
  return sendSuccess(res, sale, "Credit applied");
}
