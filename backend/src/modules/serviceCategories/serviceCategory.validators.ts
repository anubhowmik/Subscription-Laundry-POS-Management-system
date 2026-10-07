import { z } from "zod";

export const createServiceCategorySchema = z.object({
  nameEn: z.string().min(1, "English name is required"),
  nameAr: z.string().min(1, "Arabic name is required"),
  description: z.string().optional(),
  // Sales targets, as on product categories (Sales Reports > Sales Performance).
  target: z.number().min(0).optional().nullable(),
  targetMtd: z.number().min(0).optional().nullable(),
});

export const updateServiceCategorySchema = createServiceCategorySchema.partial().extend({ status: z.enum(["ACTIVE", "INACTIVE"]).optional() });

export const listServiceCategoryQuerySchema = z.object({
  // The Categories page lists inactive ones too; the POS catalog keeps the active-only default.
  includeInactive: z.enum(["true", "false"]).optional(),
});
