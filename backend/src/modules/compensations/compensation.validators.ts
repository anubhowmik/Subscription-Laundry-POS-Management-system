import { z } from "zod";

export const createCompensationSchema = z.object({
  saleId: z.string().uuid(),
  description: z.string().optional(),
  items: z
    .array(
      z.object({
        saleItemId: z.string().uuid(),
        quantity: z.number().positive(),
        reason: z.enum(["LOST", "DAMAGED", "DELAYED", "OTHER"]),
        claimedAmount: z.number().min(0),
      }),
    )
    .min(1, "At least one item is required"),
});

export const resolveCompensationSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "PAID"]),
  resolutionType: z.enum(["CASH", "POINTS", "COUPON", "CASHBACK"]).optional(),
  resolutionValue: z.number().positive().optional(),
});

export const listCompensationQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "PAID"]).optional(),
  businessLocationId: z.string().uuid().optional(),
});
