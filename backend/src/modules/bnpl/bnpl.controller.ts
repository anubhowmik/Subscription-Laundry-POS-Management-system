import { Request, Response } from "express";
import type { BnplProvider } from "@prisma/client";
import * as sessionService from "./bnpl.service";
import * as settingsService from "./bnplSettings.service";
import { sendSuccess } from "../../utils/apiResponse";
import { writeAuditLog } from "../../utils/audit";
import { AuthorizationError } from "../../utils/AppError";
import { getParam } from "../../utils/params";

function assertLocationAccess(req: Request, businessLocationId: string) {
  if (req.user!.isSystemAdmin) return;
  if (!req.user!.allowedLocationIds.includes(businessLocationId)) {
    throw new AuthorizationError("You do not have access to this business location");
  }
}

export async function createSession(req: Request, res: Response) {
  assertLocationAccess(req, req.body.businessLocationId);
  const session = await sessionService.createSession({ ...req.body, organizationId: req.user!.organizationId, createdBy: req.user!.id });
  return sendSuccess(res, session, "BNPL session created", 201);
}

export async function getSessionStatus(req: Request, res: Response) {
  const session = await sessionService.getSessionStatus(getParam(req, "id"), req.user!.organizationId);
  return sendSuccess(res, session);
}

export async function captureSession(req: Request, res: Response) {
  const session = await sessionService.captureSession(getParam(req, "id"), req.user!.organizationId);
  await writeAuditLog({ req, action: "UPDATE", module: "bnpl_session", entityId: session.id, newValues: session });
  return sendSuccess(res, session, "BNPL session captured");
}

export async function listSettings(req: Request, res: Response) {
  return sendSuccess(res, await settingsService.listSettings(req.user!.organizationId));
}

export async function updateProviderSettings(req: Request, res: Response) {
  const provider = getParam(req, "provider") as BnplProvider;
  const settings = await settingsService.updateProviderSettings(provider, req.body, req.user!.organizationId);
  await writeAuditLog({ req, action: "UPDATE", module: "bnpl_settings", entityId: `${req.user!.organizationId}:${provider}`, newValues: { ...settings, merchantToken: undefined } });
  return sendSuccess(res, settings, "BNPL provider settings updated");
}
