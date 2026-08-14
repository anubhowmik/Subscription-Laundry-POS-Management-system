import { Response } from "express";

export function sendSuccess<T>(res: Response, data: T, message = "OK", statusCode = 200, meta?: Record<string, unknown>) {
  return res.status(statusCode).json({ success: true, message, data, ...(meta ? { meta } : {}) });
}

export function sendPaginated<T>(
  res: Response,
  data: T[],
  meta: { page: number; limit: number; total: number },
  message = "OK",
) {
  return res.status(200).json({
    success: true,
    message,
    data,
    meta: { ...meta, totalPages: Math.max(1, Math.ceil(meta.total / meta.limit)) },
  });
}
