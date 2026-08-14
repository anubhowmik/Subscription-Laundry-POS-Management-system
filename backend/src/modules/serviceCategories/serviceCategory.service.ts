import { prisma } from "../../config/prisma";

/** Service categories group laundry services (e.g. Wash & Iron, Dry Clean) for POS filtering. */
export async function list(organizationId: string) {
  return prisma.serviceCategory.findMany({
    where: { organizationId, status: "ACTIVE" },
    orderBy: { nameEn: "asc" },
  });
}

export async function create(input: { nameEn: string; nameAr: string; description?: string }, organizationId: string) {
  return prisma.serviceCategory.create({ data: { ...input, organizationId } });
}
