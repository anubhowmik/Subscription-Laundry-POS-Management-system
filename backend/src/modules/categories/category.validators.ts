import { z } from "zod";

export const createCategorySchema = z.object({
  nameEn: z.string().min(1, "English name is required"),
  nameAr: z.string().min(1, "Arabic name is required"),
  code: z.string().optional(),
  descriptionEn: z.string().optional(),
  descriptionAr: z.string().optional(),
  parentId: z.string().uuid().optional().nullable(),
  // Reference's category target / target_mtd (sales targets read by Sales Reports > Sales Performance).
  target: z.number().min(0).optional().nullable(),
  targetMtd: z.number().min(0).optional().nullable(),
});

export const updateCategorySchema = createCategorySchema.partial().extend({ status: z.enum(["ACTIVE", "INACTIVE"]).optional() });

export const listCategoryQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.string().optional(),
  search: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  parentId: z.string().uuid().optional(),
});
