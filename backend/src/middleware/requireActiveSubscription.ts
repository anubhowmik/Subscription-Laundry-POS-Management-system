import { NextFunction, Request, Response } from "express";
import { AuthenticationError, PaymentRequiredError } from "../utils/AppError";
import { getEntitlement } from "../modules/billing/entitlement.service";

const MESSAGES: Record<string, string> = {
  TRIAL_EXPIRED: "Your free trial has ended. Choose a plan to continue using the system.",
  SUBSCRIPTION_EXPIRED: "Your subscription has expired. Renew it to continue using the system.",
  NO_SUBSCRIPTION: "This organization does not have a subscription yet.",
  ORGANIZATION_INACTIVE: "This organization's account is not active.",
};

/**
 * Blocks every product route when the caller's organization has no active entitlement.
 * Must run after `authenticate`. Responds 402 with code SUBSCRIPTION_REQUIRED so the frontend
 * can route the user to the billing page without parsing error text.
 */
export async function requireActiveSubscription(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.user) return next(new AuthenticationError());

    const entitlement = await getEntitlement(req.user.organizationId);
    if (entitlement.hasAccess) return next();

    return next(new PaymentRequiredError(entitlement.reason, MESSAGES[entitlement.reason] ?? MESSAGES.NO_SUBSCRIPTION));
  } catch (err) {
    next(err);
  }
}
