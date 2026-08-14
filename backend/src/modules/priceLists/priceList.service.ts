import { prisma } from "../../config/prisma";
import { ConflictError, NotFoundError } from "../../utils/AppError";

export async function list(organizationId: string) {
  return prisma.priceList.findMany({ where: { organizationId, isActive: true }, orderBy: { nameEn: "asc" } });
}

export async function getById(id: string, organizationId: string) {
  const priceList = await prisma.priceList.findFirst({
    where: { id, organizationId },
    include: {
      items: {
        include: { product: { select: { nameEn: true } }, service: { select: { nameEn: true } } },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!priceList) throw new NotFoundError("Price list not found");
  return priceList;
}

export async function create(input: { nameEn: string; nameAr: string }, organizationId: string) {
  const existing = await prisma.priceList.findFirst({ where: { organizationId, nameEn: input.nameEn } });
  if (existing) throw new ConflictError("A price list with this name already exists");
  return prisma.priceList.create({ data: { ...input, organizationId } });
}

export async function update(id: string, input: { nameEn?: string; nameAr?: string; isActive?: boolean }, organizationId: string) {
  const existing = await prisma.priceList.findFirst({ where: { id, organizationId } });
  if (!existing) throw new NotFoundError("Price list not found");
  return prisma.priceList.update({ where: { id }, data: input });
}

export async function deactivate(id: string, organizationId: string) {
  const existing = await prisma.priceList.findFirst({ where: { id, organizationId } });
  if (!existing) throw new NotFoundError("Price list not found");
  return prisma.priceList.update({ where: { id }, data: { isActive: false } });
}

interface PriceListItemInput {
  productId?: string;
  serviceId?: string;
  price: number;
}

/** Replaces all price overrides on a list in one call - simplest correct semantics for an admin form that submits the whole table at once. */
export async function setItems(id: string, items: PriceListItemInput[], organizationId: string) {
  const priceList = await prisma.priceList.findFirst({ where: { id, organizationId } });
  if (!priceList) throw new NotFoundError("Price list not found");

  return prisma.$transaction(async (tx) => {
    await tx.priceListItem.deleteMany({ where: { priceListId: id } });
    if (items.length > 0) {
      await tx.priceListItem.createMany({
        data: items.map((item) => ({ priceListId: id, productId: item.productId, serviceId: item.serviceId, price: item.price })),
      });
    }
    return tx.priceListItem.findMany({ where: { priceListId: id } });
  });
}
