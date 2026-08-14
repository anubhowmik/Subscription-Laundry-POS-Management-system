import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";

/**
 * Where the payment gateway returns the customer after paying. It reads OUR billing-payment id
 * from the URL and asks the backend to verify it server-side. The URL itself is never trusted
 * as proof of payment - the backend re-checks with the gateway.
 */
export default function BillingCallbackPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [state, setState] = useState<"verifying" | "success" | "failed">("verifying");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // guard against React StrictMode double-invoke
    ran.current = true;

    const billingPaymentId = params.get("bp");
    if (!billingPaymentId) {
      setState("failed");
      return;
    }

    api
      .post("/billing/verify", { billingPaymentId })
      .then(async () => {
        await refreshUser(); // pull the now-active subscription into the session
        setState("success");
        setTimeout(() => navigate("/", { replace: true }), 1500);
      })
      .catch(() => setState("failed"));
  }, [params, navigate, refreshUser]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        {state === "verifying" && (
          <>
            <div className="mb-3 text-3xl">⏳</div>
            <p className="text-sm text-slate-600">{isAr ? "جارٍ التحقق من الدفع..." : "Verifying your payment…"}</p>
          </>
        )}
        {state === "success" && (
          <>
            <div className="mb-3 text-3xl">✅</div>
            <h1 className="text-lg font-semibold text-slate-800">{isAr ? "تم تفعيل الاشتراك" : "Subscription active"}</h1>
            <p className="mt-1 text-sm text-slate-500">{isAr ? "جارٍ توجيهك إلى لوحة التحكم..." : "Taking you to your dashboard…"}</p>
          </>
        )}
        {state === "failed" && (
          <>
            <div className="mb-3 text-3xl">⚠️</div>
            <h1 className="text-lg font-semibold text-slate-800">{isAr ? "لم يكتمل الدفع" : "Payment not completed"}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {isAr ? "لم نتمكن من تأكيد دفعتك." : "We couldn't confirm your payment."}
            </p>
            <button
              onClick={() => navigate("/billing", { replace: true })}
              className="mt-4 rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
            >
              {t("common.retry", isAr ? "حاول مرة أخرى" : "Try again")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
