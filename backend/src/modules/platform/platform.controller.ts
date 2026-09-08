import { Request, Response } from "express";
import * as service from "./platform.service";
import { sendSuccess } from "../../utils/apiResponse";
import { getParam } from "../../utils/params";
import { logger } from "../../config/logger";

export async function listOrganizations(req: Request, res: Response) {
  return sendSuccess(res, await service.listOrganizations(req.query));
}

export async function listOrganizationUsers(req: Request, res: Response) {
  const organizationId = getParam(req, "id");
  return sendSuccess(res, await service.listOrganizationUsers(organizationId));
}

export async function setOrganizationStatus(req: Request, res: Response) {
  const organizationId = getParam(req, "id");
  const { status } = req.body as { status: "ACTIVE" | "SUSPENDED" };
  const updated = await service.setOrganizationStatus(organizationId, status);

  // Suspending a paying customer is high-impact and rare - record who did it.
  logger.warn(
    { platformAdmin: req.platformAdmin?.username, organizationId, slug: updated.slug, status },
    "Platform operator changed organization status",
  );

  return sendSuccess(res, updated, status === "SUSPENDED" ? "Organization suspended" : "Organization reactivated");
}

export async function listPayments(req: Request, res: Response) {
  return sendSuccess(res, await service.listPayments(req.query));
}

export async function getStats(_req: Request, res: Response) {
  return sendSuccess(res, await service.getStats());
}

export async function listAdmins(_req: Request, res: Response) {
  return sendSuccess(res, await service.listAdmins());
}

export async function createAdmin(req: Request, res: Response) {
  const admin = await service.createAdmin(req.body);
  logger.warn({ actingAdmin: req.platformAdmin?.username, newAdmin: admin.username }, "Platform operator created a new platform admin");
  return sendSuccess(res, admin, "Platform admin created", 201);
}

export async function setAdminStatus(req: Request, res: Response) {
  const id = getParam(req, "id");
  const { status } = req.body as { status: "ACTIVE" | "INACTIVE" };
  const updated = await service.setAdminStatus(id, status, req.platformAdmin!.id);

  logger.warn(
    { actingAdmin: req.platformAdmin?.username, targetAdmin: updated.username, status },
    "Platform operator changed another platform admin's status",
  );

  return sendSuccess(res, updated, status === "INACTIVE" ? "Platform admin deactivated" : "Platform admin reactivated");
}

export async function resetAdminPassword(req: Request, res: Response) {
  const id = getParam(req, "id");
  const { newPassword, currentPassword } = req.body as { newPassword: string; currentPassword?: string };
  await service.resetAdminPassword(id, newPassword, req.platformAdmin!.id, currentPassword);
  logger.warn({ actingAdmin: req.platformAdmin?.username, targetAdminId: id }, "Platform operator reset another platform admin's password");
  return sendSuccess(res, null, "Password reset");
}
