import { Request, Response } from "express";
import * as service from "./certificate.service";
import { sendSuccess } from "../../utils/apiResponse";
import { writeAuditLog } from "../../utils/audit";
import { getParam } from "../../utils/params";

export async function generate(req: Request, res: Response) {
  const locationId = getParam(req, "locationId");
  const cert = await service.generateForLocation(locationId, req.user!.organizationId);
  await writeAuditLog({ req, action: "CREATE", module: "zatca_certificates", entityId: cert.id, newValues: { businessLocationId: locationId } });
  return sendSuccess(res, cert, "ZATCA key pair and CSR generated", 201);
}

export async function getStatus(req: Request, res: Response) {
  const cert = await service.getStatus(getParam(req, "locationId"), req.user!.organizationId);
  return sendSuccess(res, cert);
}

export async function complianceCsid(req: Request, res: Response) {
  const locationId = getParam(req, "locationId");
  const cert = await service.exchangeComplianceCsid(locationId, req.body.otp, req.user!.organizationId);
  await writeAuditLog({ req, action: "UPDATE", module: "zatca_certificates", entityId: cert.id, newValues: { status: cert.status } });
  return sendSuccess(res, cert, "Compliance CSID obtained");
}

export async function productionCsid(req: Request, res: Response) {
  const locationId = getParam(req, "locationId");
  const cert = await service.exchangeProductionCsid(locationId, req.user!.organizationId);
  await writeAuditLog({ req, action: "UPDATE", module: "zatca_certificates", entityId: cert.id, newValues: { status: cert.status } });
  return sendSuccess(res, cert, "Production CSID obtained");
}
