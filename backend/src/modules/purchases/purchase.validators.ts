import { z } from "zod";

const purchaseLineSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive(),
  unitCost: z.number().min(0),
});

export const createPurchaseSchema = z.object({
  supplierId: z.string().uuid(),
  businessLocationId: z.string().uuid(),
  items: z.array(purchaseLineSchema).min(1, "At least one item is required"),
  paidAmount: z.number().min(0).optional(),
  notes: z.string().optional(),
});

export const listPurchaseQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  businessLocationId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
});

const purchaseReturnLineSchema = z.object({
  purchaseItemId: z.string().uuid(),
  quantity: z.number().positive(),
  reason: z.enum(["DEFECTIVE", "WRONG_ITEM", "OVERSTOCK", "OTHER"]),
  note: z.string().optional(),
});

export const createPurchaseReturnSchema = z.object({
  purchaseId: z.string().uuid(),
  items: z.array(purchaseReturnLineSchema).min(1, "At least one item is required"),
  refundedAmount: z.number().min(0).optional(),
  notes: z.string().optional(),
});

export const listPurchaseReturnQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  businessLocationId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
});
