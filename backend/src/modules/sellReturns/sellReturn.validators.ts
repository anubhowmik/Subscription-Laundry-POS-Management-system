import { z } from "zod";

const returnLineSchema = z.object({
  saleItemId: z.string().uuid(),
  quantity: z.number().positive(),
  reason: z.enum(["NOT_WASHABLE", "DAMAGED", "NOT_FOUND", "OTHER"]),
  note: z.string().optional(),
});

export const createSellReturnSchema = z
  .object({
    saleId: z.string().uuid(),
    items: z.array(returnLineSchema).min(1, "At least one item is required"),
    refundedAmount: z.number().min(0).optional(),
    paymentMethodId: z.string().uuid().optional(),
    notes: z.string().optional(),
  })
  .refine((v) => !v.refundedAmount || v.paymentMethodId, {
    message: "A payment method is required to record a cash refund",
    path: ["paymentMethodId"],
  });

export const listSellReturnQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  businessLocationId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
});
