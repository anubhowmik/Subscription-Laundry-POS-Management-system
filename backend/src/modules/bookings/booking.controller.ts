import { Request, Response } from "express";
import { getParam } from "../../utils/params";
import * as service from "./booking.service";
import { sendPaginated, sendSuccess } from "../../utils/apiResponse";
import { writeAuditLog } from "../../utils/audit";

export async function list(req: Request, res: Response) {
  const allowedLocationIds = req.user!.isSystemAdmin ? null : req.user!.allowedLocationIds;
  const { data, meta } = await service.list(req.query, req.user!.organizationId, allowedLocationIds);
  return sendPaginated(res, data, meta);
}

export async function create(req: Request, res: Response) {
  const booking = await service.create(req.body, req.user!.organizationId, req.user!.id);
  await writeAuditLog({ req, action: "CREATE", module: "bookings", entityId: booking.id, newValues: booking });
  return sendSuccess(res, booking, "Booking created", 201);
}

export async function updateStatus(req: Request, res: Response) {
  const { status } = req.body as { status: "REQUESTED" | "CONFIRMED" | "COMPLETED" | "CANCELLED" };
  const booking = await service.updateStatus(getParam(req, "id"), status, req.user!.organizationId);
  await writeAuditLog({ req, action: "UPDATE", module: "bookings", entityId: booking.id, newValues: { status } });
  return sendSuccess(res, booking, "Booking updated");
}
