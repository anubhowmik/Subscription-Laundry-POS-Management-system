import { Request, Response } from "express";
import { getParam } from "../../utils/params";
import * as service from "./announcement.service";
import { sendPaginated, sendSuccess } from "../../utils/apiResponse";
import { writeAuditLog } from "../../utils/audit";

function allowedLocationIds(req: Request) {
  return req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
}

export async function list(req: Request, res: Response) {
  const { data, meta } = await service.list(req.query, req.user!.organizationId, allowedLocationIds(req));
  return sendPaginated(res, data, meta);
}

export async function listActive(req: Request, res: Response) {
  return sendSuccess(res, await service.listActive(req.user!.organizationId, allowedLocationIds(req)));
}

export async function getById(req: Request, res: Response) {
  return sendSuccess(res, await service.getById(getParam(req, "id"), req.user!.organizationId, allowedLocationIds(req)));
}

export async function create(req: Request, res: Response) {
  const announcement = await service.create(req.body, req.user!.organizationId, req.user!.id);
  await writeAuditLog({ req, action: "CREATE", module: "announcements", entityId: announcement.id, newValues: announcement });
  return sendSuccess(res, announcement, "Announcement created", 201);
}

export async function update(req: Request, res: Response) {
  const before = await service.getById(getParam(req, "id"), req.user!.organizationId, allowedLocationIds(req));
  const announcement = await service.update(getParam(req, "id"), req.body, req.user!.organizationId, allowedLocationIds(req));
  await writeAuditLog({ req, action: "UPDATE", module: "announcements", entityId: announcement.id, oldValues: before, newValues: announcement });
  return sendSuccess(res, announcement, "Announcement updated");
}

export async function remove(req: Request, res: Response) {
  await service.remove(getParam(req, "id"), req.user!.organizationId, allowedLocationIds(req));
  await writeAuditLog({ req, action: "DELETE", module: "announcements", entityId: getParam(req, "id") });
  return sendSuccess(res, null, "Announcement deleted");
}
