import { Request, Response } from "express";
import * as service from "./notifications.service";
import { sendSuccess } from "../../utils/apiResponse";
import { writeAuditLog } from "../../utils/audit";
import { getParam } from "../../utils/params";

export async function getSettings(req: Request, res: Response) {
  return sendSuccess(res, await service.getSettings(req.user!.organizationId));
}

export async function updateSettings(req: Request, res: Response) {
  const settings = await service.updateSettings(req.body, req.user!.organizationId);
  await writeAuditLog({ req, action: "UPDATE", module: "notification_settings", entityId: req.user!.organizationId, newValues: { ...settings, appSid: undefined } });
  return sendSuccess(res, settings, "Notification settings updated");
}

export async function listLogs(req: Request, res: Response) {
  return sendSuccess(res, await service.listRecentLogs(req.user!.organizationId));
}

export async function listTemplates(req: Request, res: Response) {
  return sendSuccess(res, await service.listTemplates(req.user!.organizationId));
}

export async function updateTemplate(req: Request, res: Response) {
  const trigger = getParam(req, "trigger") as Parameters<typeof service.updateTemplate>[0];
  const template = await service.updateTemplate(trigger, req.body, req.user!.organizationId);
  await writeAuditLog({ req, action: "UPDATE", module: "notification_templates", entityId: template.id, newValues: template });
  return sendSuccess(res, template, "Template updated");
}
