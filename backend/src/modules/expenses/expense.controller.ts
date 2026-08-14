import { Request, Response } from "express";
import { getParam } from "../../utils/params";
import * as service from "./expense.service";
import { sendPaginated, sendSuccess } from "../../utils/apiResponse";
import { writeAuditLog } from "../../utils/audit";

function allowedLocationIds(req: Request) {
  return req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
}

export async function listCategories(req: Request, res: Response) {
  return sendSuccess(res, await service.listCategories(req.user!.organizationId));
}

export async function createCategory(req: Request, res: Response) {
  const category = await service.createCategory(req.body, req.user!.organizationId);
  await writeAuditLog({ req, action: "CREATE", module: "expense_categories", entityId: category.id, newValues: category });
  return sendSuccess(res, category, "Expense category created", 201);
}

export async function updateCategory(req: Request, res: Response) {
  const category = await service.updateCategory(getParam(req, "id"), req.body, req.user!.organizationId);
  await writeAuditLog({ req, action: "UPDATE", module: "expense_categories", entityId: category.id, newValues: category });
  return sendSuccess(res, category, "Expense category updated");
}

export async function list(req: Request, res: Response) {
  const { data, meta } = await service.list(req.query, req.user!.organizationId, allowedLocationIds(req));
  return sendPaginated(res, data, meta);
}

export async function getById(req: Request, res: Response) {
  return sendSuccess(res, await service.getById(getParam(req, "id"), req.user!.organizationId, allowedLocationIds(req)));
}

export async function create(req: Request, res: Response) {
  const expense = await service.create(req.body, req.user!.organizationId, req.user!.id);
  await writeAuditLog({ req, action: "CREATE", module: "expenses", entityId: expense.id, newValues: expense });
  return sendSuccess(res, expense, "Expense recorded", 201);
}

export async function update(req: Request, res: Response) {
  const before = await service.getById(getParam(req, "id"), req.user!.organizationId, allowedLocationIds(req));
  const expense = await service.update(getParam(req, "id"), req.body, req.user!.organizationId);
  await writeAuditLog({ req, action: "UPDATE", module: "expenses", entityId: expense.id, oldValues: before, newValues: expense });
  return sendSuccess(res, expense, "Expense updated");
}

export async function remove(req: Request, res: Response) {
  await service.remove(getParam(req, "id"), req.user!.organizationId);
  await writeAuditLog({ req, action: "DELETE", module: "expenses", entityId: getParam(req, "id") });
  return sendSuccess(res, null, "Expense deleted");
}
