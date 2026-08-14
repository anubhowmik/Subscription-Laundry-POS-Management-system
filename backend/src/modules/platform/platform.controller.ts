import { Request, Response } from "express";
import * as service from "./platform.service";
import { sendSuccess } from "../../utils/apiResponse";
import { getParam } from "../../utils/params";
import { logger } from "../../config/logger";

export async function listOrganizations(req: Request, res: Response) {
  return sendSuccess(res, await service.listOrganizations(req.query));
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
