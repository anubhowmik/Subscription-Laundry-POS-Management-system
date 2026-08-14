import { z } from "zod";

export const createUnitSchema = z.object({
  nameEn: z.string().min(1, "English name is required"),
  nameAr: z.string().min(1, "Arabic name is required"),
  shortName: z.string().min(1, "Short name is required"),
  baseUnitId: z.string().uuid().optional().nullable(),
  conversionRatio: z.number().positive().optional(),
});

export const updateUnitSchema = createUnitSchema.partial();

export const listUnitQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.string().optional(),
  search: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});
