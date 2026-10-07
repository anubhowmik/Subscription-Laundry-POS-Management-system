import { prisma } from "../../config/prisma";
import { NotFoundError } from "../../utils/AppError";

type ServiceCategoryInput = { nameEn?: string; nameAr?: string; description?: string; target?: number | null; targetMtd?: number | null; status?: "ACTIVE" | "INACTIVE" };

/** Service categories group laundry services (e.g. Wash & Iron, Dry Clean) for POS filtering. */
export async function list(organizationId: string, includeInactive = false) {
  return prisma.serviceCategory.findMany({
    where: { organizationId, ...(includeInactive ? {} : { status: "ACTIVE" as const }) },
    orderBy: { nameEn: "asc" },
    include: { _count: { select: { services: true } } },
  });
}

export async function create(input: ServiceCategoryInput & { nameEn: string; nameAr: string }, organizationId: string) {
  return prisma.serviceCategory.create({ data: { ...input, organizationId } });
}

export async function getById(id: string, organizationId: string) {
  const row = await prisma.serviceCategory.findFirst({ where: { id, organizationId } });
  if (!row) throw new NotFoundError("Service category not found");
  return row;
}

export async function update(id: string, input: ServiceCategoryInput, organizationId: string) {
  await getById(id, organizationId);
  return prisma.serviceCategory.update({ where: { id }, data: input });
}
