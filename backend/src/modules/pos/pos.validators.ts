import { z } from "zod";

export const posSearchQuerySchema = z.object({
  query: z.string().optional(),
  businessLocationId: z.string().uuid(),
  customerId: z.string().uuid().optional(),
});

const cartItemSchema = z
  .object({
    productId: z.string().uuid().optional(),
    serviceId: z.string().uuid().optional(),
    quantity: z.number().positive("Quantity must be greater than zero"),
    discountAmount: z.number().min(0).optional(),
  })
  .refine((item) => Boolean(item.productId) !== Boolean(item.serviceId), {
    message: "Each cart item must reference exactly one of productId or serviceId",
  });

const paymentInputSchema = z.object({
  paymentMethodId: z.string().uuid(),
  amount: z.number().positive("Payment amount must be greater than zero"),
  referenceNumber: z.string().optional(),
});

export const checkoutSchema = z.object({
  businessLocationId: z.string().uuid(),
  customerId: z.string().uuid(),
  items: z.array(cartItemSchema).min(1, "Cart must contain at least one item"),
  payments: z.array(paymentInputSchema).default([]),
  notes: z.string().optional(),
  couponCode: z.string().optional(),
  invoiceDiscountMode: z.enum(["PERCENT", "FIXED"]).optional(),
  invoiceDiscountValue: z.number().min(0).optional(),
  shipping: z.number().min(0).optional(),
  redeemPoints: z.number().int().min(0).optional(),
  appliedCreditAmount: z.number().min(0).optional(),
  asDraft: z.boolean().optional(),
});

export const confirmQuoteSchema = z.object({
  payments: z.array(paymentInputSchema).default([]),
  appliedCreditAmount: z.number().min(0).optional(),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type ConfirmQuoteInput = z.infer<typeof confirmQuoteSchema>;

export const listQuotesQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  businessLocationId: z.string().uuid().optional(),
});

const heldItemSchema = z
  .object({
    productId: z.string().uuid().optional(),
    serviceId: z.string().uuid().optional(),
    descriptionEn: z.string().min(1),
    descriptionAr: z.string().optional(),
    quantity: z.number().positive(),
    unitPrice: z.number().min(0),
    taxPercent: z.number().min(0).default(0),
    taxType: z.enum(["INCLUSIVE", "EXCLUSIVE"]).default("EXCLUSIVE"),
    discountAmount: z.number().min(0).default(0),
  })
  .refine((item) => Boolean(item.productId) !== Boolean(item.serviceId), {
    message: "Each held item must reference exactly one of productId or serviceId",
  });

export const holdSaleSchema = z.object({
  businessLocationId: z.string().uuid(),
  customerId: z.string().uuid().optional(),
  label: z.string().min(1),
  note: z.string().optional(),
  items: z.array(heldItemSchema).min(1, "Cannot hold an empty cart"),
});

export type HoldSaleInput = z.infer<typeof holdSaleSchema>;

export const listHeldSalesQuerySchema = z.object({
  businessLocationId: z.string().uuid(),
});
