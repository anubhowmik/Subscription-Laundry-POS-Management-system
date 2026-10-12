import { z } from "zod";

export const PROMOTION_TYPES = [
  "TRADITIONAL_DISCOUNT",
  "QUANTITY_DISCOUNT",
  "PRICE_DISCOUNT",
  "PRODUCT_GIFTS",
  "BOUNCE",
  "MULTIPLE_DISCOUNT",
  "CASH_BACK",
] as const;
export const PROMOTION_DAYS = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"] as const;

const uuidList = z.array(z.string().uuid()).default([]);
const itemKey = z.string().regex(/^[ps]:[0-9a-f-]{36}$/i, "Invalid item");
const categoryKey = z.string().regex(/^(pc|sc):[0-9a-f-]{36}$/i, "Invalid category");
const time = z.string().regex(/^\d{2}:\d{2}$/, "Use HH:mm");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const positiveInt = z.number().int().min(1);

const lineSchema = z.object({
  itemKey,
  quantity: z.number().positive(),
  giftItemKey: itemKey,
  giftQuantity: z.number().positive(),
  discountPercent: z.number().positive().max(100),
});

/**
 * Reference promotions/create.blade.php. Which fields are required depends on the type, exactly
 * as the reference's `#p_type` change handler toggles them - see the superRefine below.
 */
export const promotionSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    type: z.enum(PROMOTION_TYPES),
    // Product Gifts only: the reference's Amount Role / Quantity Role radio.
    checkCondition: z.enum(["amount", "quantity"]).optional(),
    salesQuantity: positiveInt.nullable().optional(),
    salesAmount: z.number().positive().nullable().optional(),
    locationGroupIds: uuidList,
    businessLocationIds: uuidList,
    excludeBusinessLocationIds: uuidList,
    customerGroupIds: uuidList,
    priceListIds: uuidList,
    customerIds: uuidList,
    excludeCustomerIds: uuidList,
    categoryKeys: z.array(categoryKey).default([]),
    excludeCategoryKeys: z.array(categoryKey).default([]),
    brandIds: uuidList,
    itemKeys: z.array(itemKey).default([]),
    excludeItemKeys: z.array(itemKey).default([]),
    applyIfAllProductsExist: z.boolean().default(false),
    startsAt: date.nullable().optional(),
    endsAt: date.nullable().optional(),
    days: z.array(z.enum(PROMOTION_DAYS)).default([]),
    periods: z.array(z.object({ from: time, to: time })).default([]),
    discountType: z.enum(["FIXED", "PERCENTAGE"]).nullable().optional(),
    discountAmount: z.number().positive().nullable().optional(),
    daQuantity: positiveInt.nullable().optional(),
    bounceQuantity: positiveInt.nullable().optional(),
    giftQuantity: positiveInt.nullable().optional(),
    giftItemKeys: z.array(itemKey).default([]),
    lines: z.array(lineSchema).default([]),
    priority: z.number().int().nullable().optional(),
    isActive: z.boolean().default(true),
    autoApply: z.boolean().default(true),
    fullCash: z.boolean().default(false),
    expeditedDiscount: z.boolean().default(true),
    excludeCustomerGroup: z.boolean().default(true),
    cashBackValue: z.number().positive("Cash Back Value must be greater than 0.").nullable().optional(),
    pointsForCashBack: z.number().positive("Points for Cash Back must be greater than 0.").nullable().optional(),
    cashBackExpirationDays: z.number().int().min(1, "Expiration days must be greater than 0").nullable().optional(),
    redeemAfterEnd: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    const need = (field: keyof typeof v, ok: boolean) => {
      if (!ok) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: "This field is required" });
    };
    const discount = () => {
      need("discountType", v.discountType != null);
      need("discountAmount", v.discountAmount != null);
      if (v.discountType === "PERCENTAGE" && v.discountAmount != null && v.discountAmount > 100) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["discountAmount"], message: "A percentage can't be more than 100" });
      }
    };
    switch (v.type) {
      case "TRADITIONAL_DISCOUNT":
        discount();
        break;
      case "QUANTITY_DISCOUNT":
        need("salesQuantity", v.salesQuantity != null);
        need("daQuantity", v.daQuantity != null);
        discount();
        break;
      case "PRICE_DISCOUNT":
        need("salesAmount", v.salesAmount != null);
        discount();
        break;
      case "PRODUCT_GIFTS":
        if ((v.checkCondition ?? "amount") === "quantity") need("salesQuantity", v.salesQuantity != null);
        else need("salesAmount", v.salesAmount != null);
        need("giftQuantity", v.giftQuantity != null);
        need("giftItemKeys", v.giftItemKeys.length > 0);
        break;
      case "BOUNCE":
        need("salesQuantity", v.salesQuantity != null);
        need("bounceQuantity", v.bounceQuantity != null);
        break;
      case "MULTIPLE_DISCOUNT":
        need("lines", v.lines.length > 0);
        break;
      case "CASH_BACK":
        need("cashBackValue", v.cashBackValue != null);
        need("pointsForCashBack", v.pointsForCashBack != null);
        need("cashBackExpirationDays", v.cashBackExpirationDays != null);
        break;
    }
    if (v.startsAt && v.endsAt && v.endsAt < v.startsAt) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "Ends At can't be before Starts At" });
    }
  });

export type PromotionInput = z.infer<typeof promotionSchema>;

export const massDeactivateSchema = z.object({ ids: z.array(z.string().uuid()).min(1, "No row selected") });

const cartItemSchema = z
  .object({
    productId: z.string().uuid().optional(),
    serviceId: z.string().uuid().optional(),
    quantity: z.number().positive(),
    discountAmount: z.number().min(0).optional(),
    unitPriceOverride: z.number().min(0).optional(),
    taxId: z.string().uuid().optional(),
    widthM: z.number().positive().optional(),
    heightM: z.number().positive().optional(),
    discountId: z.string().uuid().optional(),
  })
  .refine((item) => Boolean(item.productId) !== Boolean(item.serviceId), { message: "Each cart item must reference exactly one of productId or serviceId" });

/** POS "Apply promotion" - the cart as the cashier has it, before any promotion split. */
export const applyPromotionSchema = z.object({
  businessLocationId: z.string().uuid(),
  customerId: z.string().uuid(),
  items: z.array(cartItemSchema).min(1, "No products found"),
  promotionId: z.string().uuid().optional(),
  couponCode: z.string().optional(),
  priceListId: z.string().uuid().optional(),
  mode: z.enum(["SERVICE", "PRODUCT"]).optional(),
});

/** POS "Apply coupon" preview (reference SellPosController@applyCoupon): the cart as it would be checked out. */
export const applyCouponSchema = applyPromotionSchema.extend({
  code: z.string().trim().min(1, "Coupon field is empty!"),
  // The customer's verification code, for a coupon with OTP on.
  otp: z.string().trim().max(10).optional(),
});
export const couponOtpSchema = z.object({
  code: z.string().trim().min(1, "Coupon field is empty!"),
  businessLocationId: z.string().uuid(),
  customerId: z.string().uuid(),
});

export const activePromotionsQuerySchema = z.object({ businessLocationId: z.string().uuid().optional() });
