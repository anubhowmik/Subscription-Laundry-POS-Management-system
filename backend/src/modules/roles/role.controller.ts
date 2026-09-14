import { Request, Response } from "express";
import * as service from "./role.service";
import { sendPaginated, sendSuccess } from "../../utils/apiResponse";
import { getParam } from "../../utils/params";
import { writeAuditLog } from "../../utils/audit";

export async function list(req: Request, res: Response) {
  const { data, meta } = await service.list(req.query, req.user!.organizationId);
  return sendPaginated(res, data, meta);
}

export async function getById(req: Request, res: Response) {
  return sendSuccess(res, await service.getById(getParam(req, "id"), req.user!.organizationId));
}

export async function create(req: Request, res: Response) {
  const role = await service.create(req.body, req.user!.organizationId);
  await writeAuditLog({ req, action: "CREATE", module: "roles", entityId: role.id, newValues: role });
  return sendSuccess(res, role, "Role created", 201);
}

export async function update(req: Request, res: Response) {
  const before = await service.getById(getParam(req, "id"), req.user!.organizationId);
  const role = await service.update(getParam(req, "id"), req.body, req.user!.organizationId);
  await writeAuditLog({ req, action: "UPDATE", module: "roles", entityId: role.id, oldValues: before, newValues: role });
  return sendSuccess(res, role, "Role updated");
}

export async function remove(req: Request, res: Response) {
  await service.remove(getParam(req, "id"), req.user!.organizationId);
  await writeAuditLog({ req, action: "DELETE", module: "roles", entityId: getParam(req, "id") });
  return sendSuccess(res, null, "Role deleted");
}
