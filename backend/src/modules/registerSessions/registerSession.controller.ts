import { Request, Response } from "express";
import * as service from "./registerSession.service";
import { sendPaginated, sendSuccess } from "../../utils/apiResponse";
import { getParam } from "../../utils/params";
import { parsePagination } from "../../utils/pagination";

function allowedLocationIds(req: Request) {
  return req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
}

export async function open(req: Request, res: Response) {
  const { businessLocationId, openingCashAmount } = req.body as { businessLocationId: string; openingCashAmount: number };
  const session = await service.openSession(
    businessLocationId,
    openingCashAmount,
    req.user!.organizationId,
    req.user!.id,
    allowedLocationIds(req),
  );
  return sendSuccess(res, session, "Register opened", 201);
}

export async function close(req: Request, res: Response) {
  const { countedCashAmount, notes, denominations } = req.body as {
    countedCashAmount: number;
    notes?: string;
    denominations?: Record<string, number>;
  };
  const session = await service.closeSession(
    getParam(req, "id"),
    countedCashAmount,
    notes,
    req.user!.organizationId,
    req.user!.id,
    allowedLocationIds(req),
    denominations,
  );
  return sendSuccess(res, session, "Register closed");
}

export async function ledger(req: Request, res: Response) {
  const rows = await service.getLedger(getParam(req, "id"), req.user!.organizationId, allowedLocationIds(req));
  return sendSuccess(res, rows);
}

export async function current(req: Request, res: Response) {
  const businessLocationId = String(req.query.businessLocationId);
  return sendSuccess(res, await service.getCurrentSession(businessLocationId, req.user!.organizationId, allowedLocationIds(req)));
}

export async function list(req: Request, res: Response) {
  const businessLocationId = String(req.query.businessLocationId);
  const { page, limit } = parsePagination(req.query);
  const { data, meta } = await service.listSessions(businessLocationId, req.user!.organizationId, page, limit, allowedLocationIds(req));
  return sendPaginated(res, data, meta);
}
