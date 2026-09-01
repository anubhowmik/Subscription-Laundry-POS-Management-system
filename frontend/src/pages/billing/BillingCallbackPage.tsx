import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { api } from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Spinner } from "../../components/ui/Spinner";
import { Header } from "../../components/layout/Header";
import { Footer } from "../../components/layout/Footer";

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
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Header />
      <main className="mx-auto flex w-full max-w-5xl flex-1 items-center justify-center px-4 pb-24 pt-16 sm:pb-32 sm:pt-20">
      <Card className="w-full max-w-sm p-8 text-center">
        {state === "verifying" && (
          <>
            <div className="mb-3 flex justify-center text-sky-600">
              <Spinner className="h-8 w-8" />
            </div>
            <p className="text-sm text-slate-600">{isAr ? "جارٍ التحقق من الدفع..." : "Verifying your payment…"}</p>
          </>
        )}
        {state === "success" && (
          <>
            <CheckCircle2 className="mx-auto mb-3 h-9 w-9 text-emerald-500" strokeWidth={1.5} aria-hidden />
            <h1 className="text-lg font-semibold text-slate-800">{isAr ? "تم تفعيل الاشتراك" : "Subscription active"}</h1>
            <p className="mt-1 text-sm text-slate-500">{isAr ? "جارٍ توجيهك إلى لوحة التحكم..." : "Taking you to your dashboard…"}</p>
          </>
        )}
        {state === "failed" && (
          <>
            <AlertTriangle className="mx-auto mb-3 h-9 w-9 text-amber-500" strokeWidth={1.5} aria-hidden />
            <h1 className="text-lg font-semibold text-slate-800">{isAr ? "لم يكتمل الدفع" : "Payment not completed"}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {isAr ? "لم نتمكن من تأكيد دفعتك." : "We couldn't confirm your payment."}
            </p>
            <Button onClick={() => navigate("/billing", { replace: true })} className="mt-4" fullWidth>
              {t("common.retry", isAr ? "حاول مرة أخرى" : "Try again")}
            </Button>
          </>
        )}
      </Card>
      </main>
      <Footer />
    </div>
  );
}
