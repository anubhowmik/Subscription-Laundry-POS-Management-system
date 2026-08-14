import { z } from "zod";

export const updateItemStatusSchema = z.object({
  status: z.enum(["PENDING", "IN_PROGRESS", "READY", "DELIVERED", "CANCELLED"]),
  note: z.string().optional(),
});

export const listBoardItemsQuerySchema = z.object({
  businessLocationId: z.string().uuid().optional(),
  status: z.enum(["PENDING", "IN_PROGRESS", "READY", "DELIVERED", "CANCELLED"]).optional(),
  search: z.string().optional(),
});
