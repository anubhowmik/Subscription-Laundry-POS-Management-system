import { Request, Response } from "express";
import * as service from "./organization.service";
import { issueTokens } from "../auth/auth.service";
import { toSafeUser } from "../users/user.mapper";
import { sendSuccess } from "../../utils/apiResponse";
import { REFRESH_COOKIE, refreshCookieOptions } from "../../utils/authCookie";
import { writeAuditLog } from "../../utils/audit";

export async function register(req: Request, res: Response) {
  const { organization, adminUser } = await service.registerOrganization(req.body);

  const { accessToken, refreshToken } = await issueTokens(adminUser.id, {
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
  });

  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());

  return sendSuccess(res, { organization, accessToken, user: toSafeUser(adminUser) }, "Organization registered", 201);
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
