import { Request, Response } from "express";
import { getParam } from "../../utils/params";
import * as service from "./invoiceLayout.service";
import { sendSuccess } from "../../utils/apiResponse";
import { writeAuditLog } from "../../utils/audit";

export async function list(req: Request, res: Response) {
  return sendSuccess(res, await service.list(String(req.query.businessLocationId), req.user!.organizationId));
}

export async function getById(req: Request, res: Response) {
  return sendSuccess(res, await service.getById(getParam(req, "id"), req.user!.organizationId));
}

export async function create(req: Request, res: Response) {
  const layout = await service.create(req.body, req.user!.organizationId);
  await writeAuditLog({ req, action: "CREATE", module: "invoice_layouts", entityId: layout.id, newValues: layout });
  return sendSuccess(res, layout, "Invoice layout created", 201);
}

export async function update(req: Request, res: Response) {
  const layout = await service.update(getParam(req, "id"), req.body, req.user!.organizationId);
  await writeAuditLog({ req, action: "UPDATE", module: "invoice_layouts", entityId: layout.id, newValues: layout });
  return sendSuccess(res, layout, "Invoice layout updated");
}

export async function remove(req: Request, res: Response) {
  await service.remove(getParam(req, "id"), req.user!.organizationId);
  await writeAuditLog({ req, action: "DEACTIVATE", module: "invoice_layouts", entityId: getParam(req, "id") });
  return sendSuccess(res, null, "Invoice layout deleted");
}

export async function setDefault(req: Request, res: Response) {
  const layout = await service.setDefault(getParam(req, "id"), req.user!.organizationId);
  await writeAuditLog({ req, action: "UPDATE", module: "invoice_layouts", entityId: layout.id, newValues: layout });
  return sendSuccess(res, layout, "Default invoice layout updated");
}
