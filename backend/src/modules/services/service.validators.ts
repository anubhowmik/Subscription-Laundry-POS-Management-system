import { z } from "zod";

export const createServiceSchema = z.object({
  nameEn: z.string().min(1, "English name is required"),
  nameAr: z.string().min(1, "Arabic name is required"),
  code: z.string().min(1, "Service code is required"),
  categoryId: z.string().uuid().optional().nullable(),
  unitId: z.string().uuid(),
  price: z.number().min(0),
  taxId: z.string().uuid().optional().nullable(),
  estimatedProcessingHours: z.number().int().min(0).optional(),
  descriptionEn: z.string().optional(),
  descriptionAr: z.string().optional(),
  businessLocationIds: z.array(z.string().uuid()).min(1, "Assign at least one business location"),
});

export const updateServiceSchema = createServiceSchema.partial();

export const listServiceQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.string().optional(),
  search: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  businessLocationId: z.string().uuid().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  customerId: z.string().uuid().optional(),
});
