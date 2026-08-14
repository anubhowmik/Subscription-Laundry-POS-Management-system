import { z } from "zod";

export const createInventoryPostingSchema = z.object({
  businessLocationId: z.string().uuid(),
  cashInDrawer: z.number().min(0).optional(),
  status: z.enum(["PENDING", "CONFIRMED"]).optional(),
  notes: z.string().optional(),
});

export const listInventoryPostingQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  businessLocationId: z.string().uuid().optional(),
});
