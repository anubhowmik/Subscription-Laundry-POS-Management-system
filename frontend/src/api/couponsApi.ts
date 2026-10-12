import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import type { ApiSuccess } from "../types/api";
import type { PromotionFormOptions } from "./promotionsApi";
import { promotionCartItems } from "./promotionsApi";

/** Reference Coupon::days() - same day codes and labels as promotions. */
export const COUPON_DAYS = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"] as const;

export interface CouponRow {
  id: string;
  name: string;
  code: string;
  discountMode: "PERCENT" | "FIXED";
  discountValue: string;
  minPurchaseAmount: string;
  maxUses: number | null;
  maxUsesPerCustomer: number | null;
  maxDiscountAmount: string | null;
  usedCount: number;
  validFrom: string | null;
  validUntil: string | null;
  days: string[];
  periods: { from: string; to: string }[] | null;
  locationGroupIds: string[];
  businessLocationIds: string[];
  customerGroupIds: string[];
  customerIds: string[];
  excludeCustomerIds: string[];
  categoryKeys: string[];
  brandIds: string[];
  itemKeys: string[];
  isActive: boolean;
  addedDiscount: boolean;
  otp: boolean;
  addedBy: "SINGLE" | "BULK" | "EXCEL";
  createdAt: string;
}

export interface CouponDetail extends CouponRow {
  customers: { id: string; code: string; nameEn: string; nameAr: string | null; phone: string }[];
}

export type CouponFormOptions = Omit<PromotionFormOptions, "priceLists">;

export function useCouponFormOptions(enabled = true) {
  return useQuery({
    queryKey: ["coupons", "options"],
    queryFn: async () => (await api.get<ApiSuccess<CouponFormOptions>>("/coupons/options")).data.data,
    enabled,
    staleTime: 60_000,
  });
}

// --- POS -----------------------------------------------------------------------------------

type AppliedCouponInfo = { id: string; code: string; name: string; discountMode: "PERCENT" | "FIXED"; discountValue: string; addedDiscount: boolean; otp: boolean };

export type CouponApplyResult =
  /** A coupon with OTP on, before the customer's verification code was given. */
  | { otpRequired: true; message: string; coupon: AppliedCouponInfo }
  | {
      otpRequired: false;
      message: string;
      coupon: AppliedCouponInfo;
      /** Reference applyCouponSuccess: without "Added Discount" the promotion and every line discount go first. */
      clearsOtherDiscounts: boolean;
      /** One per cart line (the promotion's split rows when a promotion is on the cart). */
      lines: { couponDiscount: number; matched: boolean }[];
      discountAmount: number;
    };

/** Reference SellPosController@applyCoupon - the coupon fitted to the cart exactly as checkout will. */
export async function requestCoupon(body: {
  code: string;
  businessLocationId: string;
  customerId: string;
  items: ReturnType<typeof promotionCartItems>;
  promotionId?: string;
  priceListId?: string;
  mode?: "SERVICE" | "PRODUCT";
  otp?: string;
}) {
  return (await api.post<ApiSuccess<CouponApplyResult>>("/pos/coupons/apply", body)).data.data;
}

/** The reference's Arabic for the coupon messages the server sends (messages.php / custom). */
const COUPON_MESSAGES_AR: Record<string, string> = {
  "Coupon code invalid": "قسيمة الشراء غير صالحة",
  "Conditions do not match": "الشروط غير مطابقة",
  "Coupon reached max usage limit": "قسيمة الشراء وصلت لحد الاستخدام الاعلي",
  "Customer reached max usage limit": "العميل وصل لحد الاستخدام الاعلي",
  "This coupon is not active yet": "قسيمة الشراء لم تبدأ بعد",
  "This coupon has expired": "انتهت صلاحية قسيمة الشراء",
  "This coupon can't be used today": "لا يمكن استخدام قسيمة الشراء اليوم",
  "This coupon can't be used at this time": "لا يمكن استخدام قسيمة الشراء في هذا الوقت",
  "Coupon field is empty!": "حقل القسيمة فارغ!",
  "No products found": "لا توجد منتجات",
  "Coupon applied successfully": "تم تطبيق القسيمة",
};

export function couponMessage(message: string | undefined, isAr: boolean) {
  const text = message ?? "Coupon code invalid";
  if (!isAr) return text;
  if (COUPON_MESSAGES_AR[text]) return COUPON_MESSAGES_AR[text];
  const min = text.match(/^This coupon requires a minimum purchase of ([\d.]+)$/);
  return min ? `تتطلب قسيمة الشراء حداً أدنى للشراء قدره ${min[1]}` : text;
}
