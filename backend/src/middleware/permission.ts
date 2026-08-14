import { NextFunction, Request, Response } from "express";
import { AuthenticationError, AuthorizationError } from "../utils/AppError";

export function requirePermission(...codes: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AuthenticationError());
    if (req.user.isSystemAdmin) return next();
    const hasAny = codes.some((code) => req.user!.permissions.includes(code));
    if (!hasAny) return next(new AuthorizationError());
    next();
  };
}

/**
 * Ensures the business location referenced by the request (route param,
 * body, or query - checked in that order) is within the user's assigned
 * locations. System Admins bypass this check. Must run after `authenticate`.
 */
export function requireLocationAccess(paramSource: "params" | "body" | "query" = "body", field = "businessLocationId") {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AuthenticationError());
    if (req.user.isSystemAdmin) return next();

    const locationId = (req[paramSource] as Record<string, unknown>)?.[field];
    if (!locationId) return next(); // nothing to scope yet (e.g. list endpoints scope via query filter instead)

    if (!req.user.allowedLocationIds.includes(String(locationId))) {
      return next(new AuthorizationError("You do not have access to this business location"));
    }
    next();
  };
}
