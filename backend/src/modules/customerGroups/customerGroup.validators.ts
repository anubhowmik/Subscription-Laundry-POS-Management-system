import { z } from "zod";

export const createCustomerGroupSchema = z.object({
  nameEn: z.string().min(1, "English name is required"),
  nameAr: z.string().min(1, "Arabic name is required"),
  description: z.string().optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  creditLimit: z.number().min(0).optional(),
  paymentTermsDays: z.number().int().min(0).optional(),
  priceListId: z.string().uuid().optional().nullable(),
  maxAmountPerMonth: z.number().min(0).optional().nullable(),
  maxInvoicesPerMonth: z.number().int().positive().optional().nullable(),
  maxQtyPerMonth: z.number().min(0).optional().nullable(),
});

export const updateCustomerGroupSchema = createCustomerGroupSchema.partial();

export const listCustomerGroupQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.string().optional(),
  search: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});
