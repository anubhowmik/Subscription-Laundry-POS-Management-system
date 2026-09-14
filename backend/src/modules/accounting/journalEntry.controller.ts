import { Request, Response } from "express";
import { getParam } from "../../utils/params";
import * as service from "./journalEntry.service";
import { sendPaginated, sendSuccess } from "../../utils/apiResponse";
import { writeAuditLog } from "../../utils/audit";

export async function list(req: Request, res: Response) {
  const { data, meta } = await service.list(req.query, req.user!.organizationId);
  return sendPaginated(res, data, meta);
}

export async function getById(req: Request, res: Response) {
  return sendSuccess(res, await service.getById(getParam(req, "id"), req.user!.organizationId));
}

export async function create(req: Request, res: Response) {
  const entry = await service.create(req.body, req.user!.organizationId, req.user!.id);
  await writeAuditLog({ req, action: "CREATE", module: "journal_entries", entityId: entry.id, newValues: entry });
  return sendSuccess(res, entry, "Journal entry created", 201);
}

export async function update(req: Request, res: Response) {
  const entry = await service.update(getParam(req, "id"), req.body, req.user!.organizationId);
  await writeAuditLog({ req, action: "UPDATE", module: "journal_entries", entityId: entry.id, newValues: entry });
  return sendSuccess(res, entry, "Journal entry updated");
}

export async function remove(req: Request, res: Response) {
  await service.remove(getParam(req, "id"), req.user!.organizationId);
  await writeAuditLog({ req, action: "DEACTIVATE", module: "journal_entries", entityId: getParam(req, "id") });
  return sendSuccess(res, null, "Journal entry deleted");
}

export async function post(req: Request, res: Response) {
  const entry = await service.post(getParam(req, "id"), req.user!.organizationId);
  await writeAuditLog({ req, action: "UPDATE", module: "journal_entries", entityId: entry.id, newValues: entry });
  return sendSuccess(res, entry, "Journal entry posted");
}

export async function reverse(req: Request, res: Response) {
  const entry = await service.reverse(getParam(req, "id"), req.user!.organizationId, req.user!.id);
  await writeAuditLog({ req, action: "CREATE", module: "journal_entries", entityId: entry.id, newValues: entry });
  return sendSuccess(res, entry, "Reversal entry created", 201);
}
