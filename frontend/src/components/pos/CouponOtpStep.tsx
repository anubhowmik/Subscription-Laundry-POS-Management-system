import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { cn } from "../../lib/cn";
import { Button } from "../ui/Button";
import { inputSmClass } from "../ui/formClasses";
import type { useCouponApply } from "./useCouponApply";

/**
 * The OTP step for a coupon with "Send OTP" on (reference coupon_modal "Send OTP"): send the code to
 * the customer's mobile, type what they read back, then apply. Without an SMS provider set up the
 * code is only logged, so outside production it is shown here to finish the sale.
 */
export function CouponOtpStep({ flow, isAr, className }: { flow: ReturnType<typeof useCouponApply>; isAr: boolean; className?: string }) {
  const [code, setCode] = useState("");
  if (!flow.otpFor) return null;
  return (
    <div className={cn("space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900", className)}>
      <p className="flex items-center gap-1.5 font-medium">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
        {isAr ? `القسيمة ${flow.otpFor} تحتاج رمز التحقق` : `Coupon ${flow.otpFor} needs a verification code`}
      </p>
      <Button size="sm" variant="outline" fullWidth onClick={() => void flow.sendOtp()} disabled={flow.pending}>
        {flow.sentTo ? (isAr ? "إعادة إرسال رمز التحقق" : "Resend OTP") : isAr ? "إرسال رمز التحقق" : "Send OTP"}
      </Button>
      {flow.sentTo && (
        <p>
          {isAr ? "أُرسل إلى" : "Sent to"} <span className="ltr-nums">{flow.sentTo}</span>
          {flow.devOtp && (
            <span className="ms-1 text-amber-700">
              ({isAr ? "لا يوجد مزود رسائل - الرمز" : "no SMS provider - code"}: <span className="ltr-nums font-mono font-semibold">{flow.devOtp}</span>)
            </span>
          )}
        </p>
      )}
      <div className="flex gap-1">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          onKeyDown={(e) => e.key === "Enter" && code.length === 6 && void flow.apply(flow.otpFor!, code)}
          inputMode="numeric"
          placeholder={isAr ? "رمز التحقق" : "Verification code"}
          className={cn(inputSmClass, "ltr-nums flex-1 font-mono")}
        />
        <Button size="sm" onClick={() => void flow.apply(flow.otpFor!, code)} disabled={flow.pending || code.length !== 6}>
          {isAr ? "تطبيق" : "Apply"}
        </Button>
        <Button size="sm" variant="outline" onClick={flow.cancelOtp}>
          {isAr ? "إلغاء" : "Cancel"}
        </Button>
      </div>
    </div>
  );
}
