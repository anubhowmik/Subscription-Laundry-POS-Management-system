import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError, NotFoundError } from "../../utils/AppError";
import { parsePagination, parseSort } from "../../utils/pagination";
import { claimBusinessLocationNumber } from "../../utils/documentNumbering";
import { resolveBusinessLocationFilter } from "../../utils/locationScope";
import { syncDocumentAccountTransaction } from "../paymentAccounts/paymentAccountLink";
import { assertPaymentAccountUsable } from "../paymentAccounts/paymentAccount.service";

const { Decimal } = Prisma;

const EXPENSE_SORTABLE_FIELDS = ["expenseDate", "createdAt", "totalAmount", "paidAmount", "dueAmount", "expenseNumber"];

function computePaymentStatus(paidAmount: Prisma.Decimal, totalAmount: Prisma.Decimal): "PAID" | "PARTIAL" | "DUE" | "OVERPAID" {
  if (paidAmount.eq(0)) return "DUE";
  if (paidAmount.gt(totalAmount)) return "OVERPAID";
  if (paidAmount.eq(totalAmount)) return "PAID";
  return "PARTIAL";
}

// --- Categories ---

export async function listCategories(organizationId: string) {
  return prisma.expenseCategory.findMany({ where: { organizationId }, orderBy: { nameEn: "asc" } });
}

interface CreateExpenseCategoryInput {
  nameEn: string;
  nameAr: string;
  code?: string;
  description?: string;
}

export async function createCategory(input: CreateExpenseCategoryInput, organizationId: string) {
  return prisma.expenseCategory.create({ data: { ...input, organizationId } });
}

export async function updateCategory(id: string, input: { nameEn?: string; nameAr?: string; code?: string; description?: string }, organizationId: string) {
  const existing = await prisma.expenseCategory.findFirst({ where: { id, organizationId } });
  if (!existing) throw new NotFoundError("Expense category not found");
  return prisma.expenseCategory.update({ where: { id }, data: input });
}

// --- Expenses ---

interface CreateExpenseInput {
  categoryId: string;
  businessLocationId: string;
  supplierId?: string | null;
  expenseDate?: string;
  subtotal: number;
  taxPercent?: number;
  paidAmount?: number;
  paymentAccountId?: string | null;
  isRecurring?: boolean;
  recurringIntervalDays?: number;
  receiptUrl?: string;
  notes?: string;
}

export async function create(input: CreateExpenseInput, organizationId: string, createdBy: string) {
  const category = await prisma.expenseCategory.findFirst({ where: { id: input.categoryId, organizationId } });
  if (!category) throw new NotFoundError("Expense category not found");
  await assertPaymentAccountUsable(input.paymentAccountId, organizationId);

  const subtotal = new Decimal(input.subtotal).toDecimalPlaces(2);
  const taxPercent = new Decimal(input.taxPercent ?? 0);
  const taxAmount = subtotal.mul(taxPercent).div(100).toDecimalPlaces(2);
  const totalAmount = subtotal.add(taxAmount);
  const paidAmount = Decimal.min(new Decimal(input.paidAmount ?? 0), totalAmount).toDecimalPlaces(2);
  const dueAmount = totalAmount.sub(paidAmount);
  const paymentStatus = computePaymentStatus(paidAmount, totalAmount);

  const nextRecurrenceAt =
    input.isRecurring && input.recurringIntervalDays
      ? new Date(Date.now() + input.recurringIntervalDays * 24 * 60 * 60 * 1000)
      : undefined;

  return prisma.$transaction(async (tx) => {
    const expenseNumber = await claimBusinessLocationNumber(tx, input.businessLocationId, "expense");
    const created = await tx.expense.create({
      data: {
        organizationId,
        expenseNumber,
        categoryId: input.categoryId,
        businessLocationId: input.businessLocationId,
        supplierId: input.supplierId ?? undefined,
        expenseDate: input.expenseDate ? new Date(input.expenseDate) : undefined,
        subtotal,
        taxPercent,
        taxAmount,
        totalAmount,
        paidAmount,
        dueAmount,
        paymentStatus,
        paymentAccountId: input.paymentAccountId || null,
        isRecurring: input.isRecurring ?? false,
        recurringIntervalDays: input.recurringIntervalDays,
        nextRecurrenceAt,
        receiptUrl: input.receiptUrl,
        notes: input.notes,
        createdBy,
      },
    });
    await syncDocumentAccountTransaction(tx, "expense", {
      id: created.id,
      paymentAccountId: created.paymentAccountId,
      paidAmount: created.paidAmount,
      date: created.expenseDate,
      createdBy,
    });
    return created;
  });
}

export async function list(query: Record<string, unknown>, organizationId: string, allowedLocationIds: string[] | null) {
  const { page, limit, skip } = parsePagination(query);
  const orderBy = parseSort(query, EXPENSE_SORTABLE_FIELDS, "expenseDate");
  const where: Prisma.ExpenseWhereInput = {
    organizationId,
    ...resolveBusinessLocationFilter(query.businessLocationId ? String(query.businessLocationId) : undefined, allowedLocationIds),
    ...(query.categoryId ? { categoryId: String(query.categoryId) } : {}),
    ...(query.paymentStatus ? { paymentStatus: query.paymentStatus as "PAID" | "PARTIAL" | "DUE" | "OVERPAID" } : {}),
    ...(query.from || query.to
      ? {
          expenseDate: {
            ...(query.from ? { gte: new Date(String(query.from)) } : {}),
            ...(query.to ? { lte: new Date(String(query.to)) } : {}),
          },
        }
      : {}),
  };

  const [data, total] = await Promise.all([
    prisma.expense.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: {
        category: { select: { nameEn: true, nameAr: true } },
        businessLocation: { select: { branchName: true } },
        supplier: { select: { nameEn: true, nameAr: true } },
        createdByUser: { select: { fullNameEn: true } },
        paymentAccount: { select: { name: true } },
      },
    }),
    prisma.expense.count({ where }),
  ]);

  return { data, meta: { page, limit, total } };
}

export async function getById(id: string, organizationId: string, allowedLocationIds: string[] | null) {
  const expense = await prisma.expense.findFirst({
    where: { id, organizationId, ...(allowedLocationIds ? { businessLocationId: { in: allowedLocationIds } } : {}) },
    include: {
      category: { select: { nameEn: true, nameAr: true } },
      businessLocation: { select: { branchName: true } },
      supplier: { select: { nameEn: true, nameAr: true } },
      createdByUser: { select: { fullNameEn: true } },
    },
  });
  if (!expense) throw new NotFoundError("Expense not found");
  return expense;
}

interface UpdateExpenseInput {
  paidAmount?: number;
  paymentAccountId?: string | null;
  notes?: string;
  receiptUrl?: string;
}

export async function update(id: string, input: UpdateExpenseInput, organizationId: string) {
  const expense = await prisma.expense.findFirst({ where: { id, organizationId } });
  if (!expense) throw new NotFoundError("Expense not found");

  const paidAmount = input.paidAmount != null ? Decimal.min(new Decimal(input.paidAmount), expense.totalAmount).toDecimalPlaces(2) : expense.paidAmount;
  const dueAmount = expense.totalAmount.sub(paidAmount);
  const paymentStatus = computePaymentStatus(paidAmount, expense.totalAmount);
  if (input.paymentAccountId !== undefined) await assertPaymentAccountUsable(input.paymentAccountId, organizationId);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.expense.update({
      where: { id },
      data: {
        paidAmount,
        dueAmount,
        paymentStatus,
        ...(input.paymentAccountId !== undefined ? { paymentAccountId: input.paymentAccountId || null } : {}),
        notes: input.notes ?? expense.notes,
        receiptUrl: input.receiptUrl ?? expense.receiptUrl,
      },
    });
    await syncDocumentAccountTransaction(tx, "expense", {
      id: updated.id,
      paymentAccountId: updated.paymentAccountId,
      paidAmount: updated.paidAmount,
      date: updated.expenseDate,
      createdBy: updated.createdBy,
    });
    return updated;
  });
}

// Mirrors Compensation's "blocked once PAID" guard - a settled expense shouldn't quietly vanish.
export async function remove(id: string, organizationId: string) {
  const expense = await prisma.expense.findFirst({ where: { id, organizationId } });
  if (!expense) throw new NotFoundError("Expense not found");
  if (expense.paidAmount.gt(0)) {
    throw new AppError(409, "Cannot delete an expense that has already been paid against");
  }
  await prisma.expense.delete({ where: { id } });
}
