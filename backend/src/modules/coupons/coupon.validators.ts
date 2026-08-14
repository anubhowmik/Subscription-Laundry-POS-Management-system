import { z } from "zod";

export const createCouponSchema = z.object({
  code: z
    .string()
    .min(3)
    .max(30)
    .transform((v) => v.trim().toUpperCase()),
  discountMode: z.enum(["PERCENT", "FIXED"]),
  discountValue: z.number().positive(),
  minPurchaseAmount: z.number().min(0).default(0),
  maxUses: z.number().int().positive().optional().nullable(),
  validFrom: z.string().datetime().optional().nullable(),
  validUntil: z.string().datetime().optional().nullable(),
  isActive: z.boolean().default(true),
  businessLocationId: z.string().uuid().optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  customerGroupId: z.string().uuid().optional().nullable(),
  maxUsesPerCustomer: z.number().int().positive().optional().nullable(),
  maxDiscountAmount: z.number().positive().optional().nullable(),
});

export const updateCouponSchema = createCouponSchema.partial().omit({ code: true });

export const validateCouponQuerySchema = z.object({
  code: z.string().min(1),
  subtotal: z.string(),
  customerId: z.string().uuid().optional(),
  businessLocationId: z.string().uuid().optional(),
});
