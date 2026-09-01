import { AuthorizationError } from "./AppError";

/**
 * Combines a caller's branch-assignment restriction (`allowedLocationIds`, null for
 * isSystemAdmin/unrestricted) with an optional client-requested `businessLocationId` filter.
 *
 * SECURITY: naively spreading both onto the same Prisma where-object key
 * (`...(allowedLocationIds ? {...} : {}), ...(query.businessLocationId ? {...} : {})`) is a real
 * bug, not a style choice - the second spread silently OVERWRITES the first, so any authenticated
 * non-admin user can pass a businessLocationId they are not assigned to and read/list data for a
 * branch they have no access to. This was found live across sale.service.ts, booking.service.ts,
 * expense.service.ts, inventory.service.ts, inventoryPosting.service.ts, compensation.service.ts,
 * purchase.service.ts, and pos.service.ts (listQuotes) during a role-based security audit.
 *
 * Use this everywhere a list/query endpoint accepts both an access-scoping list AND a specific
 * requested businessLocationId, instead of spreading them separately.
 */
/**
 * The write-side counterpart: for a create/mutate action against a single specific branch (not a
 * list query), reject outright if the caller isn't assigned to it. Mirrors pos.controller.ts's
 * long-standing assertLocationAccess, generalized so non-POS write paths (inventory adjustments,
 * etc.) get the same guarantee instead of only checking the branch belongs to the org.
 */
export function assertLocationAllowed(businessLocationId: string, allowedLocationIds: string[] | null) {
  if (allowedLocationIds && !allowedLocationIds.includes(businessLocationId)) {
    throw new AuthorizationError("You do not have access to this business location");
  }
}

export function resolveBusinessLocationFilter(
  requestedId: string | undefined,
  allowedLocationIds: string[] | null,
): { businessLocationId?: string | { in: string[] } } {
  if (requestedId) {
    if (allowedLocationIds && !allowedLocationIds.includes(requestedId)) {
      throw new AuthorizationError("You do not have access to this business location");
    }
    return { businessLocationId: requestedId };
  }
  if (allowedLocationIds) return { businessLocationId: { in: allowedLocationIds } };
  return {};
}
