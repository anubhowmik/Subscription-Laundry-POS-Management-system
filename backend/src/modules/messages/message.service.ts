import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { NotFoundError } from "../../utils/AppError";
import { parsePagination, parseSort } from "../../utils/pagination";

const SORTABLE_FIELDS = ["createdAt", "subject"];

export async function list(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null, userId: string) {
  const { page, limit, skip } = parsePagination(query);
  const orderBy = parseSort(query, SORTABLE_FIELDS, "createdAt");
  const where: Prisma.MessageWhereInput = {
    organizationId,
    ...(allowedLocationIds
      ? { OR: [{ fromBusinessLocationId: { in: allowedLocationIds } }, { toBusinessLocationId: { in: allowedLocationIds } }] }
      : {}),
    ...(query.search
      ? {
          OR: [
            { subject: { contains: String(query.search), mode: "insensitive" } },
            { content: { contains: String(query.search), mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.message.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: {
        fromBusinessLocation: { select: { branchName: true } },
        toBusinessLocation: { select: { branchName: true } },
        createdByUser: { select: { fullNameEn: true } },
        reads: { where: { userId }, select: { userId: true } },
      },
    }),
    prisma.message.count({ where }),
  ]);

  const data = rows.map(({ reads, ...rest }) => ({ ...rest, readByMe: reads.length > 0 }));

  return { data, meta: { page, limit, total } };
}

export async function getById(id: string, organizationId: string, allowedLocationIds: string[] | null) {
  const message = await prisma.message.findFirst({
    where: {
      id,
      organizationId,
      ...(allowedLocationIds
        ? { OR: [{ fromBusinessLocationId: { in: allowedLocationIds } }, { toBusinessLocationId: { in: allowedLocationIds } }] }
        : {}),
    },
    include: {
      fromBusinessLocation: { select: { branchName: true } },
      toBusinessLocation: { select: { branchName: true } },
      createdByUser: { select: { fullNameEn: true } },
      parentMessage: { select: { id: true, subject: true } },
    },
  });
  if (!message) throw new NotFoundError("Message not found");
  return message;
}

export async function markRead(messageId: string, userId: string) {
  await prisma.messageRead.upsert({
    where: { messageId_userId: { messageId, userId } },
    update: {},
    create: { messageId, userId },
  });
}

export async function getUnreadCount(organizationId: string, userId: string, allowedLocationIds: string[] | null) {
  return prisma.message.count({
    where: {
      organizationId,
      ...(allowedLocationIds
        ? { OR: [{ fromBusinessLocationId: { in: allowedLocationIds } }, { toBusinessLocationId: { in: allowedLocationIds } }] }
        : {}),
      reads: { none: { userId } },
    },
  });
}

interface CreateMessageInput {
  fromBusinessLocationId: string;
  toBusinessLocationId: string;
  subject: string;
  content: string;
  parentMessageId?: string;
}

export async function create(input: CreateMessageInput, organizationId: string, createdBy: string) {
  return prisma.message.create({
    data: { ...input, organizationId, createdBy },
    include: {
      fromBusinessLocation: { select: { branchName: true } },
      toBusinessLocation: { select: { branchName: true } },
      createdByUser: { select: { fullNameEn: true } },
    },
  });
}

export async function remove(id: string, organizationId: string, allowedLocationIds: string[] | null) {
  await getById(id, organizationId, allowedLocationIds);
  await prisma.message.delete({ where: { id } });
}
