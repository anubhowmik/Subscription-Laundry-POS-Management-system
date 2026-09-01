import { Request, Response } from "express";
import { getParam } from "../../utils/params";
import * as service from "./user.service";
import { sendPaginated, sendSuccess } from "../../utils/apiResponse";
import { writeAuditLog } from "../../utils/audit";

export async function list(req: Request, res: Response) {
  const { data, meta } = await service.list(req.query, req.user!.organizationId);
  return sendPaginated(res, data, meta);
}

export async function getById(req: Request, res: Response) {
  return sendSuccess(res, await service.getById(getParam(req, "id"), req.user!.organizationId));
}

function actorFrom(req: Request): service.Actor {
  return { id: req.user!.id, isSystemAdmin: req.user!.isSystemAdmin };
}

export async function create(req: Request, res: Response) {
  const user = await service.create(req.body, req.user!.organizationId, actorFrom(req));
  await writeAuditLog({ req, action: "CREATE", module: "users", entityId: user.id, newValues: user });
  return sendSuccess(res, user, "User created", 201);
}

export async function update(req: Request, res: Response) {
  const before = await service.getById(getParam(req, "id"), req.user!.organizationId);
  const user = await service.update(getParam(req, "id"), req.body, req.user!.organizationId, actorFrom(req));
  await writeAuditLog({ req, action: "UPDATE", module: "users", entityId: user.id, oldValues: before, newValues: user });
  return sendSuccess(res, user, "User updated");
}

export async function activate(req: Request, res: Response) {
  const user = await service.setStatus(getParam(req, "id"), "ACTIVE", req.user!.organizationId, actorFrom(req));
  await writeAuditLog({ req, action: "ACTIVATE", module: "users", entityId: user.id });
  return sendSuccess(res, user, "User activated");
}

export async function deactivate(req: Request, res: Response) {
  const user = await service.setStatus(getParam(req, "id"), "INACTIVE", req.user!.organizationId, actorFrom(req));
  await writeAuditLog({ req, action: "DEACTIVATE", module: "users", entityId: user.id });
  return sendSuccess(res, user, "User deactivated");
}

export async function setAppAccess(req: Request, res: Response) {
  const before = await service.getById(getParam(req, "id"), req.user!.organizationId);
  const user = await service.setAppAccess(getParam(req, "id"), req.body, req.user!.organizationId, actorFrom(req));
  await writeAuditLog({ req, action: "UPDATE", module: "application_access", entityId: user.id, oldValues: before, newValues: user });
  return sendSuccess(res, user, "Application access updated");
}

export async function resetPassword(req: Request, res: Response) {
  await service.resetPassword(getParam(req, "id"), req.body.newPassword, req.user!.organizationId, actorFrom(req));
  await writeAuditLog({ req, action: "RESET_PASSWORD", module: "users", entityId: getParam(req, "id") });
  return sendSuccess(res, null, "Password reset successfully");
}
