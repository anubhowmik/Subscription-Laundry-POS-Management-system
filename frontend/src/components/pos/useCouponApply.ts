import { useState } from "react";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { usePosStore } from "../../stores/posStore";
import { promotionCartItems } from "../../api/promotionsApi";
import { couponMessage, requestCoupon } from "../../api/couponsApi";

/**
 * The POS "Apply Coupon" flow shared by the touch-grid coupon button and Add Sale's totals panel
 * (reference pos.js #apply_coupon + the Send OTP step): asks the server to fit the coupon to the
 * cart exactly as checkout will, then puts its per-line amounts on the cart. A coupon with OTP on
 * first needs the code sent to the customer's mobile.
 */
export function useCouponApply({ isAr, businessLocationId, mode, notify }: { isAr: boolean; businessLocationId: string | undefined; mode?: "SERVICE" | "PRODUCT"; notify: (msg: string) => void }) {
  const [pending, setPending] = useState(false);
  /** The coupon code waiting for the customer's verification code, if any. */
  const [otpFor, setOtpFor] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [devOtp, setDevOtp] = useState<string | null>(null);

  const serverMessage = (err: unknown) => (isAxiosError(err) ? (err.response?.data as { message?: string } | undefined)?.message : undefined);

  async function apply(code: string, otp?: string): Promise<boolean> {
    const state = usePosStore.getState();
    if (!code.trim()) return notify(couponMessage("Coupon field is empty!", isAr)), false;
    if (!state.customer) return notify(isAr ? "اختر عميلاً" : "Select a customer"), false;
    if (state.lines.length === 0 || !businessLocationId) return notify(couponMessage("No products found", isAr)), false;
    setPending(true);
    try {
      const result = await requestCoupon({
        code: code.trim(),
        businessLocationId,
        customerId: state.customer.id,
        items: promotionCartItems(state.promotion?.originalLines ?? state.lines),
        promotionId: state.promotion?.id,
        priceListId: state.priceListId ?? undefined,
        mode,
        ...(otp ? { otp } : {}),
      });
      if (result.otpRequired) {
        setOtpFor(result.coupon.code);
        notify(isAr ? "هذه القسيمة تحتاج رمز التحقق المرسل إلى جوال العميل" : "This coupon needs the verification code sent to the customer's mobile");
        return false;
      }
      state.applyCoupon({
        code: result.coupon.code,
        name: result.coupon.name,
        addedDiscount: result.coupon.addedDiscount,
        discountAmount: result.discountAmount,
        lineDiscounts: result.lines.map((l) => l.couponDiscount),
        ...(otp ? { otp } : {}),
      });
      setOtpFor(null);
      setSentTo(null);
      setDevOtp(null);
      notify(`${couponMessage(result.message, isAr)} - ${isAr ? "خصم" : "discount"} ${result.discountAmount.toFixed(2)}`);
      return true;
    } catch (err) {
      const message = serverMessage(err);
      notify(message === "Invalid verification code" ? (isAr ? "رمز التحقق غير صحيح" : "Invalid verification code") : couponMessage(message, isAr));
      return false;
    } finally {
      setPending(false);
    }
  }

  async function sendOtp() {
    const state = usePosStore.getState();
    if (!otpFor || !state.customer || !businessLocationId) return;
    setPending(true);
    try {
      const res = await api.post<ApiSuccess<{ sentTo: string; devOtp?: string }>>("/pos/coupons/send-otp", { code: otpFor, businessLocationId, customerId: state.customer.id });
      setSentTo(res.data.data.sentTo);
      setDevOtp(res.data.data.devOtp ?? null);
      notify(isAr ? `تم إرسال رمز التحقق إلى ${res.data.data.sentTo}` : `Verification code sent to ${res.data.data.sentTo}`);
    } catch (err) {
      notify(couponMessage(serverMessage(err), isAr));
    } finally {
      setPending(false);
    }
  }

  const cancelOtp = () => {
    setOtpFor(null);
    setSentTo(null);
    setDevOtp(null);
  };

  return { apply, sendOtp, cancelOtp, pending, otpFor, sentTo, devOtp };
}
