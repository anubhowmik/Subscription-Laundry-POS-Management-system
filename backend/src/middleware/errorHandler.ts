import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { AppError, PaymentRequiredError } from "../utils/AppError";
import { logger } from "../config/logger";
import { env } from "../config/env";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}`, errors: [] });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) logger.error({ err, path: req.originalUrl }, err.message);
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      errors: err.errors ?? [],
      ...(err.code ? { code: err.code } : {}),
      ...(err instanceof PaymentRequiredError ? { reason: err.reason } : {}),
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      const target = (err.meta?.target as string[] | undefined)?.join(", ") ?? "field";
      return res.status(409).json({ success: false, message: `Duplicate value for: ${target}`, errors: [] });
    }
    if (err.code === "P2025") {
      return res.status(404).json({ success: false, message: "Record not found", errors: [] });
    }
    logger.error({ err, path: req.originalUrl }, "Prisma error");
    return res.status(400).json({ success: false, message: "Database request failed", errors: [] });
  }

  logger.error({ err, path: req.originalUrl }, "Unhandled error");
  return res.status(500).json({
    success: false,
    message: env.isProduction ? "Internal server error" : (err as Error)?.message ?? "Internal server error",
    errors: [],
  });
}
