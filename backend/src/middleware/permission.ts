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
 * Runs after `validate(...)` on a POS route whose body may carry a `mode: "SERVICE" | "PRODUCT"`
 * field (checkout, quote creation, hold-sale). If a mode is declared, the caller must hold the
 * matching pos.access.service/pos.access.product permission - otherwise a user restricted to one
 * POS mode could bypass that restriction simply by calling the API directly with the other
 * mode's value, since the item/mode consistency check in pos.service.ts only verifies the cart
 * matches the claimed mode, not that the caller was allowed to claim it. A request with no
 * `mode` field (the legacy /pos screen, or any caller predating this concept) is unaffected.
 */
export function requireModePermission() {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AuthenticationError());
    if (req.user.isSystemAdmin) return next();
    const mode = req.body?.mode as "SERVICE" | "PRODUCT" | undefined;
    if (!mode) return next();
    const requiredCode = mode === "SERVICE" ? "pos.access.service" : "pos.access.product";
    if (!req.user.permissions.includes(requiredCode)) return next(new AuthorizationError());
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
