import { z } from "zod";

export const createBusinessLocationGroupSchema = z.object({
  nameEn: z.string().min(1, "English name is required"),
  nameAr: z.string().optional(),
});

export const updateBusinessLocationGroupSchema = createBusinessLocationGroupSchema.partial();

export const listBusinessLocationGroupQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().optional(),
});
