import { z } from "zod";

export const createExpenseCategorySchema = z.object({
  nameEn: z.string().min(1),
  nameAr: z.string().min(1),
  code: z.string().optional(),
  description: z.string().optional(),
});

export const updateExpenseCategorySchema = createExpenseCategorySchema.partial();

export const createExpenseSchema = z.object({
  categoryId: z.string().uuid(),
  businessLocationId: z.string().uuid(),
  supplierId: z.string().uuid().optional().nullable(),
  expenseDate: z.string().datetime().optional(),
  subtotal: z.number().min(0),
  taxPercent: z.number().min(0).max(100).optional(),
  paidAmount: z.number().min(0).optional(),
  isRecurring: z.boolean().optional(),
  recurringIntervalDays: z.number().int().positive().optional(),
  receiptUrl: z.string().optional(),
  notes: z.string().optional(),
});

export const updateExpenseSchema = z.object({
  paidAmount: z.number().min(0).optional(),
  notes: z.string().optional(),
  receiptUrl: z.string().optional(),
});

export const listExpenseQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.string().optional(),
  businessLocationId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  paymentStatus: z.enum(["PAID", "PARTIAL", "DUE", "OVERPAID"]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});
