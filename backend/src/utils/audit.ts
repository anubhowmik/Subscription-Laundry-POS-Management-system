import { Request } from "express";
import { prisma } from "../config/prisma";

interface AuditParams {
  req: Request;
  action: string;
  module: string;
  entityId?: string;
  oldValues?: unknown;
  newValues?: unknown;
}

export async function writeAuditLog({ req, action, module, entityId, oldValues, newValues }: AuditParams) {
  await prisma.auditLog.create({
    data: {
      userId: req.user?.id,
      action,
      module,
      entityId,
      oldValues: oldValues === undefined ? undefined : (JSON.parse(JSON.stringify(oldValues)) as object),
      newValues: newValues === undefined ? undefined : (JSON.parse(JSON.stringify(newValues)) as object),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    },
  });
}
