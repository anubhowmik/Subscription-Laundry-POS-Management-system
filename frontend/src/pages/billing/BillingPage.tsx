import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";

type Interval = "MONTHLY" | "ANNUAL" | "LIFETIME";

interface Plan {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  priceMonthly: string;
  priceAnnual: string;
  priceLifetime: string | null;
  currency: string;
}

interface SubscriptionInfo {
  hasAccess: boolean;
  reason: string;
  isTrial: boolean;
  trialDaysLeft: number | null;
  expiresAt: string | null;
  organizationStatus: string;
  subscription: { status: string; billingInterval: string } | null;
}

export default function BillingPage() {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const isAr = i18n.resolvedLanguage === "ar";
  const [plan, setPlan] = useState<Plan | null>(null);
  const [info, setInfo] = useState<SubscriptionInfo | null>(null);
  const [busy, setBusy] = useState<Interval | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<ApiSuccess<Plan[]>>("/billing/plans"),
      api.get<ApiSuccess<SubscriptionInfo>>("/billing/subscription"),
    ])
      .then(([p, s]) => {
        setPlan(p.data.data[0] ?? null);
        setInfo(s.data.data);
      })
      .catch(() => setError("Failed to load subscription details"));
  }, []);

  async function subscribe(interval: Interval) {
    if (!plan) return;
    setBusy(interval);
    setError(null);
    try {
      const res = await api.post<ApiSuccess<{ redirectUrl: string }>>("/billing/checkout", {
        planCode: plan.code,
        interval,
      });
      // Hand off to the payment provider's hosted page.
      window.location.href = res.data.data.redirectUrl;
    } catch {
      setError("Could not start checkout. Please try again.");
      setBusy(null);
    }
  }

  const money = (v: string | null) =>
    v === null ? null : `${Number(v).toLocaleString()} ${plan?.currency ?? "SAR"}`;

  const options: { interval: Interval; label: string; price: string | null; sub: string }[] = plan
    ? [
        { interval: "MONTHLY", label: isAr ? "شهري" : "Monthly", price: money(plan.priceMonthly), sub: isAr ? "لكل شهر" : "per month" },
        { interval: "ANNUAL", label: isAr ? "سنوي" : "Annual", price: money(plan.priceAnnual), sub: isAr ? "لكل سنة" : "per year" },
        { interval: "LIFETIME", label: isAr ? "مدى الحياة" : "Lifetime", price: money(plan.priceLifetime), sub: isAr ? "دفعة واحدة" : "one-time" },
      ]
    : [];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <button onClick={() => navigate("/")} className="mb-4 text-sm text-slate-500 hover:text-slate-700">
          ← {isAr ? "العودة" : "Back"}
        </button>
        <h1 className="text-xl font-semibold text-slate-800">{isAr ? "الاشتراك" : "Subscription"}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {isAr ? "اختر خطة الدفع للاستمرار في استخدام النظام" : "Choose a payment plan to keep using the system"}
        </p>
      </div>

      {info && <StatusBanner info={info} isAr={isAr} />}

      {error && <p className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {plan && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800">{isAr ? plan.nameAr : plan.nameEn}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {isAr ? "وصول كامل لجميع المزايا بدون قيود" : "Full access to every feature, no limits"}
          </p>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {options.map((opt) => (
              <div key={opt.interval} className="flex flex-col rounded-lg border border-slate-200 p-4">
                <div className="mb-1 text-sm font-medium text-slate-500">{opt.label}</div>
                {opt.price ? (
                  <>
                    <div className="text-2xl font-bold text-slate-900">{opt.price}</div>
                    <div className="mb-4 text-xs text-slate-400">{opt.sub}</div>
                    <button
                      onClick={() => subscribe(opt.interval)}
                      disabled={busy !== null}
                      className="mt-auto rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                    >
                      {busy === opt.interval ? (isAr ? "جارٍ..." : "Redirecting…") : isAr ? "اشترك" : "Subscribe"}
                    </button>
                  </>
                ) : (
                  <div className="text-sm text-slate-400">{isAr ? "غير متاح" : "Not available"}</div>
                )}
              </div>
            ))}
          </div>

          <p className="mt-6 text-center text-xs text-slate-400">
            {isAr
              ? "الدفع الآمن عبر بوابة الدفع. لن تتم محاسبتك حتى تكمل الدفع."
              : "Secure payment via the payment gateway. You are not charged until you complete payment."}
          </p>
        </div>
      )}
    </div>
  );
}

function StatusBanner({ info, isAr }: { info: SubscriptionInfo; isAr: boolean }) {
  if (info.isTrial && info.hasAccess) {
    return (
      <div className="mb-6 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
        {isAr
          ? `أنت في الفترة التجريبية — ${info.trialDaysLeft} يومًا متبقية. اشترك الآن لتجنب انقطاع الخدمة.`
          : `You're on a free trial — ${info.trialDaysLeft} days left. Subscribe now to avoid interruption.`}
      </div>
    );
  }
  if (!info.hasAccess) {
    return (
      <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {isAr
          ? "انتهت صلاحية وصولك. اشترك لإعادة تفعيل حسابك."
          : "Your access has ended. Subscribe to reactivate your account."}
      </div>
    );
  }
  return (
    <div className="mb-6 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
      {isAr
        ? `اشتراكك نشط (${info.subscription?.billingInterval}).`
        : `Your subscription is active (${info.subscription?.billingInterval?.toLowerCase()}).`}
    </div>
  );
}
