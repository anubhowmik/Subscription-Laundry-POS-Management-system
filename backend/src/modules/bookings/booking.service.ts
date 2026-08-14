import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { NotFoundError } from "../../utils/AppError";

interface CreateBookingInput {
  businessLocationId: string;
  customerId: string;
  type: "PICKUP" | "DELIVERY";
  scheduledAt: string;
  address?: string;
  notes?: string;
}

export async function create(input: CreateBookingInput, organizationId: string, createdBy: string) {
  const [location, customer] = await Promise.all([
    prisma.businessLocation.findFirst({ where: { id: input.businessLocationId, organizationId } }),
    prisma.customer.findFirst({ where: { id: input.customerId, organizationId, deletedAt: null } }),
  ]);
  if (!location) throw new NotFoundError("Business location not found");
  if (!customer) throw new NotFoundError("Customer not found");

  return prisma.booking.create({
    data: {
      organizationId,
      businessLocationId: input.businessLocationId,
      customerId: input.customerId,
      type: input.type,
      scheduledAt: new Date(input.scheduledAt),
      address: input.address,
      notes: input.notes,
      createdBy,
    },
  });
}

export async function list(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const where: Prisma.BookingWhereInput = {
    organizationId,
    ...(allowedLocationIds ? { businessLocationId: { in: allowedLocationIds } } : {}),
    ...(query.businessLocationId ? { businessLocationId: String(query.businessLocationId) } : {}),
    ...(query.status ? { status: query.status as "REQUESTED" | "CONFIRMED" | "COMPLETED" | "CANCELLED" } : {}),
    ...(query.type ? { type: query.type as "PICKUP" | "DELIVERY" } : {}),
    ...(query.from || query.to
      ? {
          scheduledAt: {
            ...(query.from ? { gte: new Date(String(query.from)) } : {}),
            ...(query.to ? { lte: new Date(String(query.to)) } : {}),
          },
        }
      : {}),
  };

  return prisma.booking.findMany({
    where,
    orderBy: { scheduledAt: "asc" },
    take: 300,
    include: {
      customer: { select: { nameEn: true, nameAr: true, phone: true } },
      businessLocation: { select: { branchName: true } },
    },
  });
}

export async function updateStatus(id: string, status: "REQUESTED" | "CONFIRMED" | "COMPLETED" | "CANCELLED", organizationId: string) {
  const booking = await prisma.booking.findFirst({ where: { id, organizationId } });
  if (!booking) throw new NotFoundError("Booking not found");
  return prisma.booking.update({ where: { id }, data: { status } });
}
