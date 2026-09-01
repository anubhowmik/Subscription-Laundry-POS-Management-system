import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prisma";
import { AuthenticationError } from "../utils/AppError";
import { verifyAccessToken } from "../utils/jwt";

const APP_ACCESS_OVERRIDES = [
  { code: "app.pos_laundry", field: "appAccessPosLaundry" as const },
  { code: "app.users_rules", field: "appAccessUsersRules" as const },
  { code: "app.zatca", field: "appAccessZatca" as const },
];

/**
 * Folds each user's per-app "Application Access" override on top of the role-derived
 * permission codes: null inherits the role's grant, true force-grants the app.* code even if
 * the role lacks it, false force-revokes it even if the role has it. See the "Application
 * Access" page in the Users & Rules application, and User.appAccessPosLaundry/etc. in the schema.
 */
function applyAppAccessOverrides(
  rolePermissionCodes: string[],
  user: { appAccessPosLaundry: boolean | null; appAccessUsersRules: boolean | null; appAccessZatca: boolean | null },
): string[] {
  const codes = new Set(rolePermissionCodes);
  for (const { code, field } of APP_ACCESS_OVERRIDES) {
    const override = user[field];
    if (override === true) codes.add(code);
    else if (override === false) codes.delete(code);
  }
  return [...codes];
}

/**
 * Verifies the JWT access token and loads the user's current permissions and
 * business-location scope from the database on every request. This is
 * slightly more expensive than trusting token claims, but guarantees a
 * revoked/deactivated user or a changed role takes effect immediately
 * instead of waiting for token expiry.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    // routes/index.ts mounts this once centrally, and each feature router also mounts it so it
    // stays safe in isolation. Only this function ever assigns req.user, so if it is already
    // populated the work was done earlier in this same chain - skip the duplicate DB round-trip.
    if (req.user) return next();

    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new AuthenticationError();
    }
    const token = header.slice("Bearer ".length);
    const payload = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        role: { include: { rolePermissions: { include: { permission: true } } } },
        businessLocations: { select: { businessLocationId: true } },
        organization: { select: { status: true } },
        customerRestrictions: { select: { customerId: true } },
        customerGroupRestrictions: { select: { customerGroupId: true } },
        transferFromLocationRestrictions: { select: { businessLocationId: true } },
      },
    });

    if (!user || user.status !== "ACTIVE" || user.deletedAt) {
      throw new AuthenticationError("Account is inactive or no longer exists");
    }
    if (user.organization.status === "SUSPENDED" || user.organization.status === "CANCELLED") {
      throw new AuthenticationError("This organization's account is not active");
    }

    req.user = {
      id: user.id,
      organizationId: user.organizationId,
      username: user.username,
      roleId: user.roleId,
      isSystemAdmin: user.isSystemAdmin,
      permissions: applyAppAccessOverrides(user.role.rolePermissions.map((rp) => rp.permission.code), user),
      allowedLocationIds: user.businessLocations.map((bl) => bl.businessLocationId),
      maxDiscountPercent: user.maxDiscountPercent?.toString() ?? null,
      allowedCustomerIds: user.customerRestrictions.length > 0 ? user.customerRestrictions.map((r) => r.customerId) : null,
      allowedCustomerGroupIds:
        user.customerGroupRestrictions.length > 0 ? user.customerGroupRestrictions.map((r) => r.customerGroupId) : null,
      allowedTransferFromLocationIds:
        user.transferFromLocationRestrictions.length > 0
          ? user.transferFromLocationRestrictions.map((r) => r.businessLocationId)
          : null,
    };
    next();
  } catch (err) {
    if (err instanceof AuthenticationError) return next(err);
    next(new AuthenticationError("Invalid or expired token"));
  }
}
