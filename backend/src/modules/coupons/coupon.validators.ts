import { z } from "zod";
import { COUPON_DAYS } from "./couponEngine";

const ids = z.array(z.string().uuid()).default([]);
const keys = (prefix: RegExp) => z.array(z.string().regex(prefix, "Invalid item")).default([]);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm");
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const code = z
  .string()
  .trim()
  .min(3, "At least 3 characters")
  .max(40)
  .regex(/^[A-Za-z0-9_-]+$/, "Letters, numbers, - and _ only")
  .transform((v) => v.toUpperCase());

/** Everything the reference coupon form (coupon/create.blade.php) sends, except the code itself. */
const couponFields = {
  name: z.string().trim().min(1, "Required").max(200),
  // Reference sales_amount - minimum total (matching products' total when the coupon targets products).
  minPurchaseAmount: z.number().min(0).default(0),
  maxUsesPerCustomer: z.number().int().positive().nullable().optional(), // customer_limit
  maxUses: z.number().int().positive().nullable().optional(), // coupon_limit
  locationGroupIds: ids,
  businessLocationIds: ids,
  customerGroupIds: ids,
  customerIds: ids,
  excludeCustomerIds: ids,
  categoryKeys: keys(/^(pc|sc):[0-9a-f-]{36}$/),
  brandIds: ids,
  itemKeys: keys(/^(p|s):[0-9a-f-]{36}$/),
  validFrom: day.nullable().optional(),
  validUntil: day.nullable().optional(),
  days: z.array(z.enum(COUPON_DAYS)).default([]),
  periods: z.array(z.object({ from: time, to: time })).default([]),
  discountMode: z.enum(["PERCENT", "FIXED"]),
  discountValue: z.number().positive("Must be more than 0"),
  maxDiscountAmount: z.number().positive().nullable().optional(),
  isActive: z.boolean().default(true),
  addedDiscount: z.boolean().default(true),
  otp: z.boolean().default(false),
};

const couponRules = <T extends { discountMode: string; discountValue: number; validFrom?: string | null; validUntil?: string | null }>(v: T, ctx: z.RefinementCtx) => {
  if (v.discountMode === "PERCENT" && v.discountValue > 100) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["discountValue"], message: "A percentage can't be more than 100" });
  }
  if (v.validFrom && v.validUntil && v.validUntil < v.validFrom) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["validUntil"], message: "Ends At must be on or after Starts At" });
  }
};

export const createCouponSchema = z.object({ ...couponFields, code }).superRefine(couponRules);
export const updateCouponSchema = z.object({ ...couponFields, code }).superRefine(couponRules);

/** Reference "Add Bulk" (coupon/create_bulk.blade.php): N coupons with generated codes. */
export const bulkCouponSchema = z
  .object({
    ...couponFields,
    count: z.number().int().min(1, "At least 1").max(1000, "At most 1000 at a time"), // coupons_no
    prefix: z.string().trim().max(20).regex(/^[A-Za-z0-9_-]*$/, "Letters, numbers, - and _ only").default(""),
    digits: z.number().int().min(4).max(20).default(5), // digits_no
    digitsType: z.enum(["MIXED", "NUMBERS", "LETTERS"]).default("MIXED"), // digits_type
  })
  .superRefine(couponRules);

export const massCouponSchema = z.object({ ids: z.array(z.string().uuid()).min(1, "No row selected") });

