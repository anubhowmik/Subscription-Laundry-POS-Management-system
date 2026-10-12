import { z } from "zod";

const itemKey = z.string().regex(/^[ps]:[0-9a-f-]{36}$/i, "Invalid item");
const categoryKey = z.string().regex(/^(pc|sc):[0-9a-f-]{36}$/i, "Invalid category");
const dateTime = z.string().datetime({ offset: true, message: "Use an ISO date-time" });

/** Reference discount/create.blade.php. */
export const discountSchema = z
  .object({
    name: z.string().trim().min(1).max(191),
    // Reference: picked products win - brand / category are cleared when products are chosen.
    itemKeys: z.array(itemKey).default([]),
    brandId: z.string().uuid().nullable().optional(),
    categoryKey: categoryKey.nullable().optional(),
    businessLocationId: z.string().uuid(),
    priority: z.number().int().nullable().optional(),
    discountType: z.enum(["FIXED", "PERCENTAGE"]),
    discountAmount: z.number().positive(),
    startsAt: dateTime,
    endsAt: dateTime,
    priceListId: z.string().uuid().nullable().optional(),
    applicableInCg: z.boolean().default(false),
    isActive: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.discountType === "PERCENTAGE" && v.discountAmount > 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["discountAmount"], message: "A percentage can't be more than 100" });
    }
    if (new Date(v.endsAt) < new Date(v.startsAt)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "Ends At can't be before Starts At" });
    }
    if (v.itemKeys.length === 0 && !v.brandId && !v.categoryKey) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["itemKeys"], message: "Choose products, a brand or a category" });
    }
  });

export type DiscountInput = z.infer<typeof discountSchema>;

export const massDeactivateDiscountsSchema = z.object({ ids: z.array(z.string().uuid()).min(1, "No row selected") });

/** POS: which discount each cart item gets (reference getProductDiscount per added row). */
export const matchDiscountsSchema = z.object({
  businessLocationId: z.string().uuid(),
  customerId: z.string().uuid(),
  priceListId: z.string().uuid().optional(),
  itemKeys: z.array(itemKey).max(500),
});
