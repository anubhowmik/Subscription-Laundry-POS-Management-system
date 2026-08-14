import { z } from "zod";

export const createRoleSchema = z.object({
  nameEn: z.string().min(1, "English name is required"),
  nameAr: z.string().min(1, "Arabic name is required"),
  description: z.string().optional(),
  permissionCodes: z.array(z.string()).default([]),
});

export const updateRoleSchema = createRoleSchema.partial();
