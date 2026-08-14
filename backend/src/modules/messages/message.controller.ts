import { Request, Response } from "express";
import { getParam } from "../../utils/params";
import * as service from "./message.service";
import { sendPaginated, sendSuccess } from "../../utils/apiResponse";
import { writeAuditLog } from "../../utils/audit";

function allowedLocationIds(req: Request) {
  return req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
}

export async function list(req: Request, res: Response) {
  const { data, meta } = await service.list(req.query, req.user!.organizationId, allowedLocationIds(req), req.user!.id);
  return sendPaginated(res, data, meta);
}

export async function getById(req: Request, res: Response) {
  const message = await service.getById(getParam(req, "id"), req.user!.organizationId, allowedLocationIds(req));
  await service.markRead(message.id, req.user!.id);
  return sendSuccess(res, message);
}

export async function unreadCount(req: Request, res: Response) {
  const count = await service.getUnreadCount(req.user!.organizationId, req.user!.id, allowedLocationIds(req));
  return sendSuccess(res, { count });
}

export async function create(req: Request, res: Response) {
  const message = await service.create(req.body, req.user!.organizationId, req.user!.id);
  await writeAuditLog({ req, action: "CREATE", module: "messages", entityId: message.id, newValues: message });
  return sendSuccess(res, message, "Message sent", 201);
}

export async function remove(req: Request, res: Response) {
  await service.remove(getParam(req, "id"), req.user!.organizationId, allowedLocationIds(req));
  await writeAuditLog({ req, action: "DELETE", module: "messages", entityId: getParam(req, "id") });
  return sendSuccess(res, null, "Message deleted");
}
