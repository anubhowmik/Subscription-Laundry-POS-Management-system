import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { parsePagination, parseSort } from "../../utils/pagination";
import { AppError, AuthorizationError, NotFoundError } from "../../utils/AppError";
import { getEntitlement } from "../billing/entitlement.service";
import { InvoiceLayoutSettingsInput } from "./businessLocation.validators";

const SORTABLE_FIELDS = ["branchName", "createdAt"];

export async function list(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const { page, limit, skip } = parsePagination(query);
  const orderBy = parseSort(query, SORTABLE_FIELDS, "branchName");

  const where: Prisma.BusinessLocationWhereInput = {
    organizationId,
    ...(query.status ? { status: query.status as "ACTIVE" | "INACTIVE" } : {}),
    ...(allowedLocationIds ? { id: { in: allowedLocationIds } } : {}),
    ...(query.search
      ? {
          OR: [
            { branchName: { contains: String(query.search), mode: "insensitive" } },
            { branchCode: { contains: String(query.search), mode: "insensitive" } },
            { businessNameEn: { contains: String(query.search), mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [data, total] = await Promise.all([
    prisma.businessLocation.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: { group: { select: { nameEn: true, nameAr: true } }, defaultPriceList: { select: { nameEn: true, nameAr: true } } },
    }),
    prisma.businessLocation.count({ where }),
  ]);
  return { data, meta: { page, limit, total } };
}

export async function getById(id: string, organizationId: string) {
  const location = await prisma.businessLocation.findFirst({
    where: { id, organizationId },
    include: { group: { select: { nameEn: true, nameAr: true } }, defaultPriceList: { select: { nameEn: true, nameAr: true } } },
  });
  if (!location) throw new NotFoundError("Business location not found");
  return location;
}

/** Deactivating a branch frees its seat back up - only ACTIVE branches count against the plan's limit. */
export async function countBranchesTowardLimit(organizationId: string) {
  return prisma.businessLocation.count({ where: { organizationId, status: "ACTIVE" } });
}

export async function create(
  input: Omit<Prisma.BusinessLocationUncheckedCreateInput, "organizationId">,
  organizationId: string,
  createdByUserId: string,
  isSystemAdmin: boolean,
) {
  // SECURITY: the built-in "Admin" role gets business_locations.create via its blanket "ALL"
  // permission set, same as System Admin - but opening a brand-new branch is an org-expansion
  // decision, not something scoped to whichever branch(es) an Admin happens to be assigned to
  // manage. Without this, assigning someone Admin over a single branch would also hand them the
  // power to add entirely new branches to the company. Only isSystemAdmin may create branches;
  // editing/viewing an already-existing (assigned) branch is unaffected by this check.
  if (!isSystemAdmin) {
    throw new AuthorizationError("Only a system admin can add a new branch");
  }

  const { plan } = await getEntitlement(organizationId);
  const maxBranches = plan?.maxBranches;
  if (maxBranches != null) {
    const activeCount = await countBranchesTowardLimit(organizationId);
    if (activeCount >= maxBranches) {
      throw new AppError(
        403,
        `Your ${plan!.nameEn} plan allows up to ${maxBranches} branch${maxBranches === 1 ? "" : "es"}. Deactivate a branch or upgrade your plan to add another.`,
        undefined,
        "BRANCH_LIMIT_REACHED",
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    const location = await tx.businessLocation.create({ data: { ...input, organizationId } });
    // Without this, the branch exists but is invisible to its own creator: the switcher in the
    // top bar only shows branches explicitly assigned via UserBusinessLocation - isSystemAdmin
    // bypasses ACCESS checks, but never controls what shows up there. See LocationContext.tsx.
    await tx.userBusinessLocation.create({ data: { userId: createdByUserId, businessLocationId: location.id } });
    return location;
  });
}

export async function update(id: string, input: Prisma.BusinessLocationUncheckedUpdateInput, organizationId: string) {
  await getById(id, organizationId);
  return prisma.businessLocation.update({ where: { id }, data: input });
}

// SECURITY: deactivating (or reactivating) a branch is the same class of org-structural decision
// as creating one - a plain Admin (blanket "ALL" role permissions, not isSystemAdmin) must not be
// able to unilaterally take any branch in the company offline. Found live during a role-based
// security audit: a non-system-admin Admin could DELETE any branch with no restriction at all.
export async function deactivate(id: string, organizationId: string, isSystemAdmin: boolean) {
  if (!isSystemAdmin) {
    throw new AuthorizationError("Only a system admin can deactivate a branch");
  }
  await getById(id, organizationId);
  return prisma.businessLocation.update({ where: { id }, data: { status: "INACTIVE" } });
}

// The counterpart to deactivate() - previously had NO working path at all: the update schema
// never accepted a `status` field, so PUT .../:id with {"status":"ACTIVE"} silently dropped it
// and returned a false "success" (found live during the same audit - a branch deactivated in
// testing could not be brought back through any endpoint).
export async function reactivate(id: string, organizationId: string, isSystemAdmin: boolean) {
  if (!isSystemAdmin) {
    throw new AuthorizationError("Only a system admin can reactivate a branch");
  }
  await getById(id, organizationId);
  return prisma.businessLocation.update({ where: { id }, data: { status: "ACTIVE" } });
}

/** Gets/updates this branch's DEFAULT invoice layout - unchanged behavior for existing callers
 * (BusinessLocationsPage.tsx's per-branch modal) even though InvoiceLayoutSettings is now a real
 * named catalog with possibly several rows per branch (see the accounting/invoiceLayouts plan -
 * multiple named layouts, one flagged isDefault). See invoiceLayouts module for full CRUD across
 * every layout, not just the default one. Returns null when the branch hasn't customized
 * anything yet - the frontend already knows how to render a fully-default layout without a row. */
export async function getInvoiceLayout(id: string, organizationId: string) {
  await getById(id, organizationId);
  return prisma.invoiceLayoutSettings.findFirst({ where: { businessLocationId: id, isDefault: true } });
}

export async function upsertInvoiceLayout(id: string, input: InvoiceLayoutSettingsInput, organizationId: string) {
  await getById(id, organizationId);
  // Json columns need the Prisma.JsonNull sentinel to actually clear to DB null - plain `null`
  // would be ambiguous with "field not provided" for Prisma's typing here.
  const labelOverrides =
    input.labelOverrides === null ? Prisma.JsonNull : input.labelOverrides === undefined ? undefined : input.labelOverrides;
  const existing = await prisma.invoiceLayoutSettings.findFirst({ where: { businessLocationId: id, isDefault: true } });
  if (existing) {
    return prisma.invoiceLayoutSettings.update({ where: { id: existing.id }, data: { ...input, labelOverrides } });
  }
  return prisma.invoiceLayoutSettings.create({ data: { businessLocationId: id, isDefault: true, ...input, labelOverrides } });
}
