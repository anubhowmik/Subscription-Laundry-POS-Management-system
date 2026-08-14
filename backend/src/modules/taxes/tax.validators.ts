import { z } from "zod";

export const createTaxSchema = z.object({
  nameEn: z.string().min(1, "English name is required"),
  nameAr: z.string().min(1, "Arabic name is required"),
  percentage: z.number().min(0).max(100),
  taxType: z.string().default("VAT"),
  isActive: z.boolean().optional(),
  effectiveDate: z.coerce.date().optional(),
});

export const updateTaxSchema = createTaxSchema.partial();

export const listTaxQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.string().optional(),
  search: z.string().optional(),
  isActive: z.string().optional(),
});
