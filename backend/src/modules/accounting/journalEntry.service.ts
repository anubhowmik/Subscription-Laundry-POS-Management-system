import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { NotFoundError, ValidationError } from "../../utils/AppError";
import { parsePagination, parseSort } from "../../utils/pagination";

const SORTABLE_FIELDS = ["entryDate", "createdAt", "reference"];

interface JournalLineInput {
  accountId: string;
  debit?: number;
  credit?: number;
  memo?: string;
}

interface JournalEntryInput {
  entryDate: string;
  reference?: string;
  memo?: string;
  lines: JournalLineInput[];
}

function assertBalanced(lines: JournalLineInput[]) {
  const totalDebit = lines.reduce((sum, l) => sum + (l.debit ?? 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (l.credit ?? 0), 0);
  // Compare in cents to avoid float drift on a plain sum of two-decimal amounts.
  if (Math.round(totalDebit * 100) !== Math.round(totalCredit * 100)) {
    throw new ValidationError([{ field: "lines", message: `Debits (${totalDebit.toFixed(2)}) must equal credits (${totalCredit.toFixed(2)})` }]);
  }
  for (const line of lines) {
    const debit = line.debit ?? 0;
    const credit = line.credit ?? 0;
    if (debit > 0 && credit > 0) {
      throw new ValidationError([{ field: "lines", message: "A line cannot have both a debit and a credit" }]);
    }
    if (debit === 0 && credit === 0) {
      throw new ValidationError([{ field: "lines", message: "A line must have a debit or a credit" }]);
    }
  }
}

export async function list(query: Record<string, unknown>, organizationId: string) {
  const { page, limit, skip } = parsePagination(query);
  const orderBy = parseSort(query, SORTABLE_FIELDS, "entryDate");

  const where: Prisma.JournalEntryWhereInput = {
    organizationId,
    ...(query.status === "draft" ? { postedAt: null } : {}),
    ...(query.status === "posted" ? { postedAt: { not: null } } : {}),
    ...(query.fromDate || query.toDate
      ? {
          entryDate: {
            ...(query.fromDate ? { gte: new Date(String(query.fromDate)) } : {}),
            ...(query.toDate ? { lte: new Date(String(query.toDate)) } : {}),
          },
        }
      : {}),
  };

  const [data, total] = await Promise.all([
    prisma.journalEntry.findMany({ where, include: { lines: { include: { account: true } } }, orderBy, skip, take: limit }),
    prisma.journalEntry.count({ where }),
  ]);
  return { data, meta: { page, limit, total } };
}

export async function getById(id: string, organizationId: string) {
  const entry = await prisma.journalEntry.findFirst({
    where: { id, organizationId },
    include: { lines: { include: { account: true } } },
  });
  if (!entry) throw new NotFoundError("Journal entry not found");
  return entry;
}

export async function create(input: JournalEntryInput, organizationId: string, userId: string) {
  assertBalanced(input.lines);
  return prisma.journalEntry.create({
    data: {
      organizationId,
      entryDate: new Date(input.entryDate),
      reference: input.reference,
      memo: input.memo,
      createdBy: userId,
      lines: { create: input.lines.map((l) => ({ accountId: l.accountId, debit: l.debit ?? 0, credit: l.credit ?? 0, memo: l.memo })) },
    },
    include: { lines: { include: { account: true } } },
  });
}

export async function update(id: string, input: JournalEntryInput, organizationId: string) {
  const existing = await getById(id, organizationId);
  if (existing.postedAt) throw new ValidationError([{ field: "id", message: "A posted journal entry cannot be edited - reverse it instead" }]);
  assertBalanced(input.lines);
  return prisma.$transaction(async (tx) => {
    await tx.journalLine.deleteMany({ where: { journalEntryId: id } });
    return tx.journalEntry.update({
      where: { id },
      data: {
        entryDate: new Date(input.entryDate),
        reference: input.reference,
        memo: input.memo,
        lines: { create: input.lines.map((l) => ({ accountId: l.accountId, debit: l.debit ?? 0, credit: l.credit ?? 0, memo: l.memo })) },
      },
      include: { lines: { include: { account: true } } },
    });
  });
}

export async function remove(id: string, organizationId: string) {
  const existing = await getById(id, organizationId);
  if (existing.postedAt) throw new ValidationError([{ field: "id", message: "A posted journal entry cannot be deleted - reverse it instead" }]);
  await prisma.journalEntry.delete({ where: { id } });
}

/** Once posted, a journal entry is immutable - correct it only via reverse(), matching the
 * "full system of record" bookkeeping guarantee (no silently editing history). */
export async function post(id: string, organizationId: string) {
  const existing = await getById(id, organizationId);
  if (existing.postedAt) throw new ValidationError([{ field: "id", message: "Already posted" }]);
  return prisma.journalEntry.update({ where: { id }, data: { postedAt: new Date() }, include: { lines: { include: { account: true } } } });
}

export async function reverse(id: string, organizationId: string, userId: string) {
  const existing = await getById(id, organizationId);
  if (!existing.postedAt) throw new ValidationError([{ field: "id", message: "Only a posted entry can be reversed" }]);
  return prisma.journalEntry.create({
    data: {
      organizationId,
      entryDate: new Date(),
      reference: existing.reference ? `Reversal of ${existing.reference}` : "Reversal",
      memo: existing.memo,
      createdBy: userId,
      postedAt: new Date(),
      reversalOfId: existing.id,
      lines: { create: existing.lines.map((l) => ({ accountId: l.accountId, debit: l.credit, credit: l.debit, memo: l.memo })) },
    },
    include: { lines: { include: { account: true } } },
  });
}
