import { z } from "zod";

export const adjustStockSchema = z.object({
  productId: z.string().uuid(),
  businessLocationId: z.string().uuid(),
  quantityChange: z.number().refine((v) => v !== 0, "Quantity change cannot be zero"),
  reason: z.string().min(1, "Reason is required"),
});

export const shipTransferSchema = z
  .object({
    productId: z.string().uuid(),
    fromBusinessLocationId: z.string().uuid(),
    toBusinessLocationId: z.string().uuid(),
    quantity: z.number().positive("Quantity must be greater than zero"),
    driverName: z.string().optional(),
    vehicleNumber: z.string().optional(),
    shipNote: z.string().optional(),
  })
  .refine((v) => v.fromBusinessLocationId !== v.toBusinessLocationId, {
    message: "Source and destination locations must be different",
    path: ["toBusinessLocationId"],
  });

export const receiveTransferSchema = z.object({
  quantityReceived: z.number().nonnegative("Quantity received cannot be negative").optional(),
  receiveNote: z.string().optional(),
});

export const listTransfersQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  status: z.enum(["IN_TRANSIT", "RECEIVED", "CANCELLED"]).optional(),
  productId: z.string().uuid().optional(),
  fromBusinessLocationId: z.string().uuid().optional(),
  toBusinessLocationId: z.string().uuid().optional(),
  createdBy: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const listTransactionsQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.string().optional(),
  productId: z.string().uuid().optional(),
  businessLocationId: z.string().uuid().optional(),
  type: z.enum(["STOCK_IN", "STOCK_OUT", "SALE", "SALE_RETURN", "ADJUSTMENT", "TRANSFER_IN", "TRANSFER_OUT"]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const createStockAdjustmentSchema = z.object({
  businessLocationId: z.string().uuid(),
  refNo: z.string().optional(),
  lossType: z.enum(["NORMAL", "ABNORMAL"]).optional(),
  totalAmountRecovered: z.number().min(0).optional(),
  notes: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantityChange: z.number().refine((v) => v !== 0, "Quantity change cannot be zero"),
        note: z.string().optional(),
      }),
    )
    .min(1, "At least one item is required"),
});

export const listStockAdjustmentsQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  status: z.enum(["CONFIRMED", "REVERSED"]).optional(),
  businessLocationId: z.string().uuid().optional(),
});
