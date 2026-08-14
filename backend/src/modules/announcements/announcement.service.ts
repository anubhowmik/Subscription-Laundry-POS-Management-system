import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { NotFoundError } from "../../utils/AppError";
import { parsePagination } from "../../utils/pagination";

const locationsInclude = { locations: { include: { businessLocation: { select: { branchName: true } } } } };

// No AnnouncementLocation rows = targets every location, matching the reference site's
// "empty locations_id = all locations" behavior.
function visibilityFilter(allowedLocationIds: string[] | null): Prisma.AnnouncementWhereInput {
  if (!allowedLocationIds) return {};
  return {
    OR: [{ locations: { none: {} } }, { locations: { some: { businessLocationId: { in: allowedLocationIds } } } }],
  };
}

export async function list(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const { page, limit, skip } = parsePagination(query);
  const where: Prisma.AnnouncementWhereInput = {
    organizationId,
    ...visibilityFilter(allowedLocationIds),
    ...(query.businessLocationId ? { locations: { some: { businessLocationId: String(query.businessLocationId) } } } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.announcement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: { ...locationsInclude, createdByUser: { select: { fullNameEn: true } } },
    }),
    prisma.announcement.count({ where }),
  ]);

  return { data, meta: { page, limit, total } };
}

/**
 * Currently-active announcements for a user - filtered against their FULL permitted-location set
 * (allowedLocationIds), not just whichever branch happens to be selected in the UI switcher right
 * now. A user with access to multiple branches must see announcements for any of them.
 */
export async function listActive(organizationId: string, allowedLocationIds: string[] | null) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return prisma.announcement.findMany({
    where: {
      organizationId,
      isPublished: true,
      fromDate: { lte: now },
      // toDate is stored as midnight of the last valid day (date-only input), so it must stay
      // active through that whole day - comparing against the instant `now` would make every
      // announcement expire right after midnight on its last day.
      toDate: { gte: startOfToday },
      ...visibilityFilter(allowedLocationIds),
    },
    orderBy: { fromDate: "desc" },
    include: locationsInclude,
  });
}

export async function getById(id: string, organizationId: string, allowedLocationIds: string[] | null) {
  const announcement = await prisma.announcement.findFirst({
    where: { id, organizationId, ...visibilityFilter(allowedLocationIds) },
    include: { ...locationsInclude, createdByUser: { select: { fullNameEn: true } } },
  });
  if (!announcement) throw new NotFoundError("Announcement not found");
  return announcement;
}

interface AnnouncementInput {
  businessLocationIds?: string[];
  fromDate: Date;
  toDate: Date;
  content: string;
  isPublished?: boolean;
}

export async function create(input: AnnouncementInput, organizationId: string, createdBy: string) {
  const { businessLocationIds, ...rest } = input;
  return prisma.announcement.create({
    data: {
      ...rest,
      organizationId,
      createdBy,
      locations: { create: (businessLocationIds ?? []).map((businessLocationId) => ({ businessLocationId })) },
    },
    include: { ...locationsInclude, createdByUser: { select: { fullNameEn: true } } },
  });
}

export async function update(id: string, input: Partial<AnnouncementInput>, organizationId: string, allowedLocationIds: string[] | null) {
  await getById(id, organizationId, allowedLocationIds);
  const { businessLocationIds, ...rest } = input;

  return prisma.$transaction(async (tx) => {
    if (businessLocationIds !== undefined) {
      await tx.announcementLocation.deleteMany({ where: { announcementId: id } });
      if (businessLocationIds.length > 0) {
        await tx.announcementLocation.createMany({ data: businessLocationIds.map((businessLocationId) => ({ announcementId: id, businessLocationId })) });
      }
    }
    return tx.announcement.update({
      where: { id },
      data: rest,
      include: { ...locationsInclude, createdByUser: { select: { fullNameEn: true } } },
    });
  });
}

export async function remove(id: string, organizationId: string, allowedLocationIds: string[] | null) {
  await getById(id, organizationId, allowedLocationIds);
  await prisma.announcement.delete({ where: { id } });
}
