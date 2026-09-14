import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { NotFoundError, ValidationError } from "../../utils/AppError";

/** Every InvoiceLayoutSettings query in this module is scoped to the organization via a join on
 * BusinessLocation, since the layout row itself has no organizationId column of its own. */
async function assertLocationOwnership(businessLocationId: string, organizationId: string) {
  const location = await prisma.businessLocation.findFirst({ where: { id: businessLocationId, organizationId } });
  if (!location) throw new NotFoundError("Business location not found");
}

export async function list(businessLocationId: string, organizationId: string) {
  await assertLocationOwnership(businessLocationId, organizationId);
  return prisma.invoiceLayoutSettings.findMany({ where: { businessLocationId }, orderBy: { name: "asc" } });
}

export async function getById(id: string, organizationId: string) {
  const layout = await prisma.invoiceLayoutSettings.findFirst({
    where: { id, businessLocation: { organizationId } },
  });
  if (!layout) throw new NotFoundError("Invoice layout not found");
  return layout;
}

function normalizeLabelOverrides(labelOverrides: unknown) {
  return labelOverrides === null ? Prisma.JsonNull : labelOverrides === undefined ? undefined : (labelOverrides as Prisma.InputJsonValue);
}

export async function create(input: Prisma.InvoiceLayoutSettingsUncheckedCreateInput, organizationId: string) {
  await assertLocationOwnership(input.businessLocationId, organizationId);
  const labelOverrides = normalizeLabelOverrides(input.labelOverrides);
  const isFirst = (await prisma.invoiceLayoutSettings.count({ where: { businessLocationId: input.businessLocationId } })) === 0;
  return prisma.invoiceLayoutSettings.create({
    // The location's very first layout is automatically the default - a branch should never end
    // up with zero default layouts.
    data: { ...input, labelOverrides, isDefault: isFirst },
  });
}

export async function update(id: string, input: Prisma.InvoiceLayoutSettingsUncheckedUpdateInput, organizationId: string) {
  await getById(id, organizationId);
  const labelOverrides = normalizeLabelOverrides(input.labelOverrides);
  return prisma.invoiceLayoutSettings.update({ where: { id }, data: { ...input, labelOverrides } });
}

export async function remove(id: string, organizationId: string) {
  const layout = await getById(id, organizationId);
  const siblingCount = await prisma.invoiceLayoutSettings.count({ where: { businessLocationId: layout.businessLocationId } });
  if (siblingCount <= 1) throw new ValidationError([{ field: "id", message: "A branch must keep at least one invoice layout" }]);
  if (layout.isDefault) {
    throw new ValidationError([{ field: "id", message: "Set another layout as default before deleting this one" }]);
  }
  await prisma.invoiceLayoutSettings.delete({ where: { id } });
}

export async function setDefault(id: string, organizationId: string) {
  const layout = await getById(id, organizationId);
  return prisma.$transaction(async (tx) => {
    await tx.invoiceLayoutSettings.updateMany({ where: { businessLocationId: layout.businessLocationId, isDefault: true }, data: { isDefault: false } });
    return tx.invoiceLayoutSettings.update({ where: { id }, data: { isDefault: true } });
  });
}
