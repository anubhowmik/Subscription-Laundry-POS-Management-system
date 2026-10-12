import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import type { ApiSuccess } from "../types/api";

export type PromotionType = "TRADITIONAL_DISCOUNT" | "QUANTITY_DISCOUNT" | "PRICE_DISCOUNT" | "PRODUCT_GIFTS" | "BOUNCE" | "MULTIPLE_DISCOUNT" | "CASH_BACK";
export type PromotionDiscountType = "FIXED" | "PERCENTAGE";
export const PROMOTION_TYPES: PromotionType[] = ["TRADITIONAL_DISCOUNT", "QUANTITY_DISCOUNT", "PRICE_DISCOUNT", "PRODUCT_GIFTS", "BOUNCE", "MULTIPLE_DISCOUNT", "CASH_BACK"];
export const PROMOTION_DAYS = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"] as const;

/** Reference Promotion::types() - lang_v1.p_discount ... cash_back. */
export const PROMOTION_TYPE_LABELS: Record<PromotionType, { en: string; ar: string }> = {
  TRADITIONAL_DISCOUNT: { en: "Traditional Discount", ar: "الخصم التقليدي" },
  QUANTITY_DISCOUNT: { en: "Quantity Discount", ar: "خصم الكمية" },
  PRICE_DISCOUNT: { en: "Price Discount", ar: "خصم السعر" },
  PRODUCT_GIFTS: { en: "Product Gifts", ar: "هدايا المنتجات" },
  BOUNCE: { en: "Bonus", ar: "بونص" },
  MULTIPLE_DISCOUNT: { en: "Multiple Products Discount", ar: "خصم على منتجات متعددة" },
  CASH_BACK: { en: "Cash back", ar: "استرداد النقود" },
};

/** Reference Promotion::days(). */
export const PROMOTION_DAY_LABELS: Record<(typeof PROMOTION_DAYS)[number], { en: string; ar: string }> = {
  Sat: { en: "Saturday", ar: "السبت" },
  Sun: { en: "Sunday", ar: "الأحد" },
  Mon: { en: "Monday", ar: "الإثنين" },
  Tue: { en: "Tuesday", ar: "الثلاثاء" },
  Wed: { en: "Wednesday", ar: "الأربعاء" },
  Thu: { en: "Thursday", ar: "الخميس" },
  Fri: { en: "Friday", ar: "الجمعة" },
};

export interface PromotionLineRow {
  id?: string;
  itemKey: string;
  quantity: string;
  giftItemKey: string;
  giftQuantity: string;
  discountPercent: string;
}

export interface PromotionRow {
  id: string;
  name: string;
  type: PromotionType;
  salesQuantity: number | null;
  salesAmount: string | null;
  locationGroupIds: string[];
  businessLocationIds: string[];
  excludeBusinessLocationIds: string[];
  customerGroupIds: string[];
  priceListIds: string[];
  customerIds: string[];
  excludeCustomerIds: string[];
  categoryKeys: string[];
  excludeCategoryKeys: string[];
  brandIds: string[];
  itemKeys: string[];
  excludeItemKeys: string[];
  applyIfAllProductsExist: boolean;
  startsAt: string | null;
  endsAt: string | null;
  days: string[];
  periods: { from: string; to: string }[] | null;
  discountType: PromotionDiscountType | null;
  discountAmount: string | null;
  daQuantity: number | null;
  bounceQuantity: number | null;
  giftQuantity: number | null;
  giftItemKeys: string[];
  priority: number | null;
  isActive: boolean;
  autoApply: boolean;
  fullCash: boolean;
  expeditedDiscount: boolean;
  excludeCustomerGroup: boolean;
  cashBackValue: string | null;
  pointsForCashBack: string | null;
  cashBackExpirationDays: number | null;
  redeemAfterEnd: boolean;
  createdAt: string;
}

export interface PromotionDetail extends PromotionRow {
  lines: PromotionLineRow[];
  customers: { id: string; code: string; nameEn: string; nameAr: string | null; phone: string }[];
}

interface Named {
  id: string;
  nameEn: string;
  nameAr: string | null;
}
export interface PromotionFormOptions {
  locations: { id: string; branchName: string; branchNameAr: string | null; branchCode: string }[];
  locationGroups: Named[];
  customerGroups: Named[];
  priceLists: Named[];
  brands: Named[];
  categories: { key: string; nameEn: string; nameAr: string | null; kind: "PRODUCT" | "SERVICE" }[];
  items: { key: string; nameEn: string; nameAr: string | null; code: string | null; kind: "PRODUCT" | "SERVICE" }[];
}

export function usePromotionFormOptions(enabled = true) {
  return useQuery({
    queryKey: ["promotions", "options"],
    queryFn: async () => (await api.get<ApiSuccess<PromotionFormOptions>>("/promotions/options")).data.data,
    enabled,
    staleTime: 60_000,
  });
}

// --- POS -----------------------------------------------------------------------------------

export interface ActivePromotion {
  id: string;
  name: string;
  type: PromotionType;
  autoApply: boolean;
  fullCash: boolean;
}

/** Reference POS "Promotion" dropdown (getActivePromotions) + the cash back redeem lock. */
export function useActivePromotions(enabled = true) {
  return useQuery({
    queryKey: ["pos", "promotions"],
    queryFn: async () => (await api.get<ApiSuccess<{ promotions: ActivePromotion[]; cashbackRedeemBlocked: boolean }>>("/pos/promotions")).data.data,
    enabled,
    staleTime: 30_000,
  });
}

export interface PromotionApplyItem {
  sourceIndex: number;
  quantity: number;
  discountAmount: number;
  promoted: boolean;
  free: boolean;
}

export type PromotionApplyResult =
  | { applied: false; message: string }
  | {
      applied: true;
      message: string;
      promotion: { id: string; name: string; type: PromotionType; fullCash: boolean; discountType: PromotionDiscountType | null; discountAmount: string | null };
      items: PromotionApplyItem[];
      cashBack: number | null;
    };

/** The cart rows sent to /pos/promotions/apply and /pos/checkout - the cart as the cashier built it. */
export function promotionCartItems(lines: import("../stores/posStore").PosLine[]) {
  return lines.map((l) => ({
    ...(l.type === "PRODUCT" ? { productId: l.id } : { serviceId: l.id }),
    quantity: l.quantity,
    discountAmount: l.discountAmount,
    unitPriceOverride: l.unitPriceOverride,
    taxId: l.taxOverrideId,
    widthM: l.widthM,
    heightM: l.heightM,
    discountId: l.autoDiscount?.id,
  }));
}

/** Reference SellPosController@applyPromotion - `promotionId` omitted tries the auto-apply ones. */
export async function requestPromotion(body: {
  businessLocationId: string;
  customerId: string;
  items: ReturnType<typeof promotionCartItems>;
  promotionId?: string;
  priceListId?: string;
  mode?: "SERVICE" | "PRODUCT";
}) {
  return (await api.post<ApiSuccess<PromotionApplyResult>>("/pos/promotions/apply", body)).data.data;
}
