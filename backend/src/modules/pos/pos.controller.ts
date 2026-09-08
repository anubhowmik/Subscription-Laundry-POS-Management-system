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

export async function checkout(req: Request, res: Response) {
  assertLocationAccess(req, req.body.businessLocationId);
  const sale = await service.checkout(req.body, req.user!.id, req.user!.organizationId);
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

export async function listQuotes(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  const { data, meta } = await service.listQuotes(req.query, req.user!.organizationId, allowedLocationIds);
  return sendPaginated(res, data, meta);
}
