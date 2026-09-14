import { z } from "zod";

const returnLineSchema = z.object({
  saleItemId: z.string().uuid(),
  quantity: z.number().positive(),
  reason: z.enum(["NOT_WASHABLE", "DAMAGED", "NOT_FOUND"]),
  note: z.string().optional(),
});

// Reference's own discount_type/discount_amount on the return form - same PERCENT/FIXED shape
// already used for the POS checkout's invoice-level discount (see pos.validators.ts).
const discountFields = {
  discountMode: z.enum(["PERCENT", "FIXED"]).optional(),
  discountValue: z.number().min(0).optional(),
};

export const createSellReturnSchema = z
  .object({
    saleId: z.string().uuid(),
    items: z.array(returnLineSchema).min(1, "At least one item is required"),
    ...discountFields,
    refundedAmount: z.number().min(0).optional(),
    paymentMethodId: z.string().uuid().optional(),
    notes: z.string().optional(),
  })
  .refine((v) => !v.refundedAmount || v.paymentMethodId, {
    message: "A payment method is required to record a cash refund",
    path: ["paymentMethodId"],
  });

// Edit (reference's SellReturnController@add reopening an existing return) only ever touches
// which items/quantities are being returned, plus the return-level discount and notes - never the
// refund/payment side, which is its own dedicated "Add Payment" action (see addSellReturnPaymentSchema).
export const updateSellReturnSchema = z.object({
  items: z.array(returnLineSchema).min(1, "At least one item is required"),
  ...discountFields,
  notes: z.string().optional(),
});

// No `referenceNumber` field here - unlike Sale's Payment rows, a sell return's refund Payment
// reuses `referenceNumber` internally to link back to the SellReturn (it has no dedicated FK
// column for that), so it isn't free for user-supplied reference-number text the way Sale's is.
export const addSellReturnPaymentSchema = z.object({
  amount: z.number().positive(),
  paymentMethodId: z.string().uuid(),
  notes: z.string().optional(),
});

export const listSellReturnQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.string().optional(),
  businessLocationId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  createdBy: z.string().uuid().optional(),
  paymentStatus: z.enum(["PAID", "PARTIAL", "DUE", "OVERPAID"]).optional(),
  reason: z.enum(["NOT_WASHABLE", "DAMAGED", "NOT_FOUND"]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const getReturnableSaleQuerySchema = z.object({
  excludeSellReturnId: z.string().uuid().optional(),
});
