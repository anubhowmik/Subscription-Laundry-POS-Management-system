export interface AuthUser {
  id: string;
  organizationId: string;
  username: string | null; // null for a non-login staff record (P8-5) - can never actually authenticate, so this is only ever seen via createdBy-style references
  roleId: string;
  isSystemAdmin: boolean; // full access WITHIN their organization only - never crosses tenant boundaries
  permissions: string[];
  allowedLocationIds: string[]; // empty array + isSystemAdmin === all locations WITHIN their organization
  maxDiscountPercent: string | null; // null = unlimited (P8-5b) - Prisma Decimal serialized as string, never enforced against isSystemAdmin
  // P8-5c/d - null = unrestricted (most users have zero restriction rows), non-null = limited to exactly this set
  allowedCustomerIds: string[] | null;
  allowedCustomerGroupIds: string[] | null;
  allowedTransferFromLocationIds: string[] | null;
}

/** The SaaS operator. Belongs to no Organization and never gains tenant data access. */
export interface PlatformAdminContext {
  id: string;
  username: string;
  fullName: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      platformAdmin?: PlatformAdminContext;
    }
  }
}

export {};
