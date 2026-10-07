import { Request, Response } from "express";
import { getParam } from "../../utils/params";
import { sendPaginated, sendSuccess } from "../../utils/apiResponse";
import { writeAuditLog } from "../../utils/audit";
import * as service from "./paymentAccount.service";
import * as reports from "./paymentAccountReports.service";

function allowedLocationIds(req: Request) {
  return req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
}
const orgId = (req: Request) => req.user!.organizationId;
const pageMeta = (meta: { page: number; limit: number; total: number }) => ({ ...meta, totalPages: Math.max(1, Math.ceil(meta.total / meta.limit)) });

// --- filter dropdown options ---
export async function filterOptions(req: Request, res: Response) {
  return sendSuccess(res, await service.filterOptions(orgId(req)));
}
export async function customerSearch(req: Request, res: Response) {
  return sendSuccess(res, await service.customerSearch(String(req.query.search ?? ""), orgId(req)));
}

// --- account types ---
export async function listTypes(req: Request, res: Response) {
  return sendSuccess(res, await service.listTypes(orgId(req)));
}
export async function createType(req: Request, res: Response) {
  const type = await service.createType(req.body, orgId(req));
  await writeAuditLog({ req, action: "CREATE", module: "payment_account_types", entityId: type.id, newValues: type });
  return sendSuccess(res, type, "Account type added", 201);
}
export async function updateType(req: Request, res: Response) {
  const type = await service.updateType(getParam(req, "id"), req.body, orgId(req));
  await writeAuditLog({ req, action: "UPDATE", module: "payment_account_types", entityId: type.id, newValues: type });
  return sendSuccess(res, type, "Account type updated");
}
export async function deleteType(req: Request, res: Response) {
  await service.deleteType(getParam(req, "id"), orgId(req));
  await writeAuditLog({ req, action: "DELETE", module: "payment_account_types", entityId: getParam(req, "id") });
  return sendSuccess(res, null, "Account type deleted");
}

// --- accounts ---
export async function list(req: Request, res: Response) {
  const [accounts, notLinkedPayments] = await Promise.all([
    service.list(req.query, orgId(req), allowedLocationIds(req)),
    service.notLinkedPaymentsCount(orgId(req), allowedLocationIds(req)),
  ]);
  return sendSuccess(res, accounts, "OK", 200, { notLinkedPayments });
}
export async function dropdown(req: Request, res: Response) {
  return sendSuccess(res, await service.dropdown(req.query, orgId(req), allowedLocationIds(req)));
}
export async function getById(req: Request, res: Response) {
  return sendSuccess(res, await service.getById(getParam(req, "id"), orgId(req), allowedLocationIds(req)));
}
export async function create(req: Request, res: Response) {
  const account = await service.create(req.body, orgId(req), req.user!.id);
  await writeAuditLog({ req, action: "CREATE", module: "payment_accounts", entityId: account.id, newValues: account });
  return sendSuccess(res, account, "Account created successfully", 201);
}
export async function update(req: Request, res: Response) {
  const account = await service.update(getParam(req, "id"), req.body, orgId(req), allowedLocationIds(req));
  await writeAuditLog({ req, action: "UPDATE", module: "payment_accounts", entityId: account.id, newValues: account });
  return sendSuccess(res, account, "Account updated successfully");
}
export async function close(req: Request, res: Response) {
  const account = await service.setClosed(getParam(req, "id"), true, orgId(req), allowedLocationIds(req));
  await writeAuditLog({ req, action: "UPDATE", module: "payment_accounts", entityId: account.id, newValues: { isClosed: true } });
  return sendSuccess(res, account, "Account closed successfully");
}
export async function activate(req: Request, res: Response) {
  const account = await service.setClosed(getParam(req, "id"), false, orgId(req), allowedLocationIds(req));
  await writeAuditLog({ req, action: "UPDATE", module: "payment_accounts", entityId: account.id, newValues: { isClosed: false } });
  return sendSuccess(res, account, "Account activated");
}
export async function accountBook(req: Request, res: Response) {
  return sendSuccess(res, await service.accountBook(getParam(req, "id"), req.query, orgId(req), allowedLocationIds(req)));
}

// --- movements ---
export async function deposit(req: Request, res: Response) {
  const txn = await service.deposit(req.body, orgId(req), req.user!.id, allowedLocationIds(req));
  await writeAuditLog({ req, action: "CREATE", module: "payment_account_transactions", entityId: txn.id, newValues: txn });
  return sendSuccess(res, txn, "Deposited successfully", 201);
}
export async function fundTransfer(req: Request, res: Response) {
  const txn = await service.fundTransfer(req.body, orgId(req), req.user!.id, allowedLocationIds(req));
  await writeAuditLog({ req, action: "CREATE", module: "payment_account_transactions", entityId: txn.id, newValues: txn });
  return sendSuccess(res, txn, "Fund transferred successfully", 201);
}
export async function getTransaction(req: Request, res: Response) {
  return sendSuccess(res, await service.getTransaction(getParam(req, "id"), orgId(req), allowedLocationIds(req)));
}
export async function updateTransaction(req: Request, res: Response) {
  const txn = await service.updateTransaction(getParam(req, "id"), req.body, orgId(req), allowedLocationIds(req));
  await writeAuditLog({ req, action: "UPDATE", module: "payment_account_transactions", entityId: txn.id, newValues: txn });
  return sendSuccess(res, txn, "Transaction updated");
}
export async function deleteTransaction(req: Request, res: Response) {
  await service.deleteTransaction(getParam(req, "id"), orgId(req), allowedLocationIds(req));
  await writeAuditLog({ req, action: "DELETE", module: "payment_account_transactions", entityId: getParam(req, "id") });
  return sendSuccess(res, null, "Deleted successfully");
}

// --- reports ---
export async function cashFlow(req: Request, res: Response) {
  const { data, meta, totals } = await reports.cashFlow(req.query, orgId(req), allowedLocationIds(req));
  return sendSuccess(res, data, "OK", 200, { ...pageMeta(meta), totals });
}
export async function balanceSheet(req: Request, res: Response) {
  return sendSuccess(res, await reports.balanceSheet(req.query, orgId(req), allowedLocationIds(req)));
}
export async function trialBalance(req: Request, res: Response) {
  return sendSuccess(res, await reports.trialBalance(req.query, orgId(req), allowedLocationIds(req)));
}
export async function paymentAccountReport(req: Request, res: Response) {
  const { data, meta } = await reports.paymentAccountReport(req.query, orgId(req), allowedLocationIds(req));
  return sendPaginated(res, data, meta);
}
export async function linkAccount(req: Request, res: Response) {
  const payment = await reports.linkAccount(getParam(req, "paymentId"), req.body.paymentAccountId, orgId(req), allowedLocationIds(req));
  await writeAuditLog({ req, action: "UPDATE", module: "payments", entityId: payment.id, newValues: { paymentAccountId: payment.paymentAccountId } });
  return sendSuccess(res, payment, "Account linked successfully");
}
export async function sellPayments(req: Request, res: Response) {
  const { data, meta, totals } = await reports.sellPayments(req.query, orgId(req), allowedLocationIds(req));
  return sendSuccess(res, data, "OK", 200, { ...pageMeta(meta), totals });
}

// --- branch default payment accounts ---
export async function getLocationDefaults(req: Request, res: Response) {
  return sendSuccess(res, await service.getLocationDefaults(getParam(req, "locationId"), orgId(req)));
}
export async function setLocationDefaults(req: Request, res: Response) {
  const result = await service.setLocationDefaults(getParam(req, "locationId"), req.body.items, orgId(req));
  await writeAuditLog({ req, action: "UPDATE", module: "business_locations", entityId: getParam(req, "locationId"), newValues: { defaultPaymentAccounts: req.body.items } });
  return sendSuccess(res, result, "Payment accounts updated");
}
