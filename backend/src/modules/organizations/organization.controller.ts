import { Request, Response } from "express";
import * as service from "./organization.service";
import { toSafeUser } from "../users/user.mapper";
import { sendSuccess } from "../../utils/apiResponse";
import { writeAuditLog } from "../../utils/audit";

export async function register(req: Request, res: Response) {
  const { organization, adminUser } = await service.registerOrganization(req.body);

  // Deliberately no accessToken/refresh cookie here - a new signup must never be left in an
  // authenticated state before verifying their email. A verification code has already been
  // emailed (see registerOrganization()); the frontend routes to the verify-email screen next.
  return sendSuccess(
    res,
    { organization, user: toSafeUser(adminUser), verificationRequired: true },
    "Organization registered - check your email for a verification code",
    201,
  );
}

export async function getSettings(req: Request, res: Response) {
  return sendSuccess(res, await service.getSettings(req.user!.organizationId));
}

export async function updateSettings(req: Request, res: Response) {
  const before = await service.getSettings(req.user!.organizationId);
  const settings = await service.updateSettings(req.body, req.user!.organizationId);
  await writeAuditLog({ req, action: "UPDATE", module: "organization_settings", entityId: req.user!.organizationId, oldValues: before, newValues: settings });
  return sendSuccess(res, settings, "Settings updated");
}
