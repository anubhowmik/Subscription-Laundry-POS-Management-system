import { Request, Response } from "express";
import * as service from "./pos.service";
import { sendPaginated, sendSuccess } from "../../utils/apiResponse";
import { writeAuditLog } from "../../utils/audit";
import { AuthorizationError } from "../../utils/AppError";
import { getParam } from "../../utils/params";

function assertLocationAccess(req: Request, businessLocationId: string) {
  if (req.user!.isSystemAdmin) return;
  if (!req.user!.allowedLocationIds.includes(businessLocationId)) {
    throw new AuthorizationError("You do not have access to this business location");
  }
}

export async function search(req: Request, res: Response) {
  const businessLocationId = String(req.query.businessLocationId);
  assertLocationAccess(req, businessLocationId);
  const results = await service.search(
    businessLocationId,
    req.query.query as string | undefined,
    req.user!.organizationId,
    req.query.customerId as string | undefined,
    req.query.mode as "SERVICE" | "PRODUCT" | undefined,
  );
  return sendSuccess(res, results);
}

export async function listActiveTaxes(req: Request, res: Response) {
  return sendSuccess(res, await service.listActiveTaxes(req.user!.organizationId));
}

export async function checkout(req: Request, res: Response) {
  assertLocationAccess(req, req.body.businessLocationId);
  const sale = await service.checkout(req.body, req.user!.id, req.user!.organizationId, req.user!.permissions);
  await writeAuditLog({ req, action: "CREATE", module: "pos", entityId: sale.id, newValues: sale });
  return sendSuccess(res, sale, "Sale completed", 201);
}

export async function holdSale(req: Request, res: Response) {
  assertLocationAccess(req, req.body.businessLocationId);
  const held = await service.holdSale(req.body, req.user!.id, req.user!.organizationId);
  return sendSuccess(res, held, "Sale held", 201);
}

export async function listHeldSales(req: Request, res: Response) {
  const businessLocationId = String(req.query.businessLocationId);
  assertLocationAccess(req, businessLocationId);
  const mode = req.query.mode as "SERVICE" | "PRODUCT" | undefined;
  return sendSuccess(res, await service.listHeldSales(businessLocationId, req.user!.organizationId, mode));
}

export async function getHeldSale(req: Request, res: Response) {
  const held = await service.getHeldSale(getParam(req, "id"), req.user!.organizationId);
  assertLocationAccess(req, held.businessLocationId);
  return sendSuccess(res, held);
}

export async function discardHeldSale(req: Request, res: Response) {
  await service.discardHeldSale(getParam(req, "id"), req.user!.organizationId);
  return sendSuccess(res, null, "Held sale discarded");
}

export async function createQuote(req: Request, res: Response) {
  assertLocationAccess(req, req.body.businessLocationId);
  const quote = await service.checkout({ ...req.body, asDraft: true }, req.user!.id, req.user!.organizationId);
  await writeAuditLog({ req, action: "CREATE", module: "pos_quote", entityId: quote.id, newValues: quote });
  return sendSuccess(res, quote, "Quote created", 201);
}

// Reference's own "Edit" action on a draft/quotation - reopens the create-sale pipeline against
// the SAME row (see checkout()'s existingDraftId param), same location-access check as
// createQuote (checked before the mutation runs, not after).
export async function updateQuote(req: Request, res: Response) {
  assertLocationAccess(req, req.body.businessLocationId);
  const quote = await service.checkout({ ...req.body, asDraft: true }, req.user!.id, req.user!.organizationId, req.user!.permissions, getParam(req, "id"));
  await writeAuditLog({ req, action: "UPDATE", module: "pos_quote", entityId: quote.id, newValues: quote });
  return sendSuccess(res, quote, "Quote updated");
}

export async function confirmQuote(req: Request, res: Response) {
  const sale = await service.confirmQuote(getParam(req, "id"), req.body, req.user!.organizationId, req.user!.id);
  assertLocationAccess(req, sale.businessLocationId);
  await writeAuditLog({ req, action: "UPDATE", module: "pos_quote", entityId: sale.id, newValues: sale });
  return sendSuccess(res, sale, "Quote confirmed");
}

export async function voidQuote(req: Request, res: Response) {
  const sale = await service.voidQuote(getParam(req, "id"), req.user!.organizationId);
  await writeAuditLog({ req, action: "DELETE", module: "pos_quote", entityId: sale.id });
  return sendSuccess(res, sale, "Quote voided");
}

export async function deleteQuote(req: Request, res: Response) {
  const id = getParam(req, "id");
  await service.deleteQuote(id, req.user!.organizationId);
  await writeAuditLog({ req, action: "DELETE", module: "pos_quote", entityId: id });
  return sendSuccess(res, null, "Deleted");
}

// Reference's action-dropdown "View Quote URL" - authenticated (only someone who can already see
// this quote gets to mint/see its public link); the link itself, once handed out, needs no auth.
export async function getShareUrl(req: Request, res: Response) {
  const token = await service.getOrCreateShareToken(getParam(req, "id"), req.user!.organizationId);
  return sendSuccess(res, { token }, "OK");
}

export async function sendQuoteNotification(req: Request, res: Response) {
  const id = getParam(req, "id");
  await service.sendQuoteNotification(id, req.user!.organizationId, req.body);
  await writeAuditLog({ req, action: "UPDATE", module: "pos_quote", entityId: id });
  return sendSuccess(res, null, "Notification sent");
}

export async function listQuotes(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  const { data, meta } = await service.listQuotes(req.query, req.user!.organizationId, allowedLocationIds, true);
  return sendPaginated(res, data, meta);
}

// Reference's own "Add Delivery"/"List Deliveries" (`SellController@create?status=draft` /
// `getDrafts`) - the exact same DRAFT-sale mechanism as a Quote, just with isQuotation forced
// false (see pos.service.ts's Sale.isQuotation comment). Confirming/voiding a delivery reuses
// confirmQuote()/voidQuote() unchanged - neither cares which DRAFT sub-type it's promoting.
export async function createDelivery(req: Request, res: Response) {
  assertLocationAccess(req, req.body.businessLocationId);
  const delivery = await service.checkout({ ...req.body, asDraft: true, isQuotation: false }, req.user!.id, req.user!.organizationId);
  await writeAuditLog({ req, action: "CREATE", module: "pos_delivery", entityId: delivery.id, newValues: delivery });
  return sendSuccess(res, delivery, "Delivery created", 201);
}

export async function listDeliveries(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  const { data, meta } = await service.listQuotes(req.query, req.user!.organizationId, allowedLocationIds, false);
  return sendPaginated(res, data, meta);
}
