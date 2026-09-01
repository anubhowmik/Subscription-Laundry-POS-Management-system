import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Alert } from "../../components/ui/Alert";
import { Squiggle } from "../../components/ui/Squiggle";
import { BackButton } from "../../components/ui/BackButton";
import { Header } from "../../components/layout/Header";
import { Footer } from "../../components/layout/Footer";

type Interval = "MONTHLY" | "ANNUAL";

interface Plan {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  priceMonthly: string;
  priceAnnual: string;
  priceLifetime: string | null;
  maxBranches: number | null;
  maxUsers: number | null;
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
  plan: { id: string; code: string; nameEn: string; nameAr: string; maxBranches: number | null; maxUsers: number | null } | null;
}

export default function BillingPage() {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const isAr = i18n.resolvedLanguage === "ar";
  const [plans, setPlans] = useState<Plan[]>([]);
  const [info, setInfo] = useState<SubscriptionInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<ApiSuccess<Plan[]>>("/billing/plans"),
      api.get<ApiSuccess<SubscriptionInfo>>("/billing/subscription"),
    ])
      .then(([p, s]) => {
        setPlans(p.data.data);
        setInfo(s.data.data);
      })
      .catch(() => setError("Failed to load subscription details"));
  }, []);

  async function subscribe(planCode: string, interval: Interval) {
    const busyKey = `${planCode}:${interval}`;
    setBusy(busyKey);
    setError(null);
    try {
      const res = await api.post<ApiSuccess<{ redirectUrl: string }>>("/billing/checkout", { planCode, interval });
      // Hand off to the payment provider's hosted page.
      window.location.href = res.data.data.redirectUrl;
    } catch {
      setError("Could not start checkout. Please try again.");
      setBusy(null);
    }
  }

  const money = (v: string | null, currency: string) => (v === null ? null : `${Number(v).toLocaleString()} ${currency}`);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 pb-24 pt-10 sm:pb-32 sm:pt-14">
      <div>
        <BackButton onClick={() => navigate("/")} label={isAr ? "العودة" : "Back"} className="mb-4 -ms-1.5" />
        <h1 className="relative inline-block pb-1">
          <span style={{ fontFamily: "var(--font-script)" }} className="text-3xl font-bold text-sky-500">
            {isAr ? "الاشتراك" : "Subscription"}
          </span>
          <Squiggle className="text-sky-300" />
        </h1>
        <p style={{ fontFamily: "var(--font-script-2)" }} className="mt-1 text-lg text-slate-500">
          {isAr ? "اشتراك أساسي واحد لحساب مالك المنشأة" : "One base subscription, for the organization's own owner seat"}
        </p>
      </div>

      {info && <StatusBanner info={info} isAr={isAr} />}

      {error && <Alert variant="danger">{error}</Alert>}

      {/* Single plan now - see config/plans.ts. Additional user seats are priced and purchased
          separately (one-time, not recurring) on the Licenses page. */}
      <div className="mx-auto max-w-sm">
        {plans.map((plan) => {
          const isCurrent = info?.plan?.code === plan.code;
          const options: { interval: Interval; label: string; price: string | null; sub: string }[] = [
            { interval: "MONTHLY", label: isAr ? "شهري" : "Monthly", price: money(plan.priceMonthly, plan.currency), sub: isAr ? "لكل شهر" : "per month" },
            { interval: "ANNUAL", label: isAr ? "سنوي" : "Annual", price: money(plan.priceAnnual, plan.currency), sub: isAr ? "لكل سنة" : "per year" },
          ];

          // Honest savings badge, computed from the real prices - never a claimed percentage.
          const savingsPct =
            Number(plan.priceMonthly) > 0 && Number(plan.priceAnnual) > 0
              ? Math.round((1 - Number(plan.priceAnnual) / (Number(plan.priceMonthly) * 12)) * 100)
              : 0;

          return (
            <Card
              key={plan.id}
              className={`rounded-2xl p-6 ${isCurrent ? "border-2 border-sky-300" : "border-slate-200"}`}
            >
              <div className="mb-1 flex items-center gap-2">
                <h2 className="relative inline-block pb-1">
                  <span style={{ fontFamily: "var(--font-script)" }} className="text-3xl font-bold text-sky-500">
                    {isAr ? plan.nameAr : plan.nameEn}
                  </span>
                  <Squiggle className="text-sky-300" />
                </h2>
                {isCurrent && <Badge variant="info">{isAr ? "خطتك الحالية" : "Current plan"}</Badge>}
              </div>
              <p style={{ fontFamily: "var(--font-script-2)" }} className="mt-2 text-base text-slate-500">
                {isAr ? "يشمل مقعد المالك. الفروع والمستخدمون الإضافيون غير محدودين." : "Includes the owner's own seat. Branches are unlimited."}
              </p>

              <div className="mt-5 space-y-3">
                {options.map((opt) => {
                  const busyKey = `${plan.code}:${opt.interval}`;
                  const showSavings = opt.interval === "ANNUAL" && savingsPct > 0;
                  return (
                    <div
                      key={opt.interval}
                      className="group flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-[0_8px_20px_-10px_rgba(214,178,255,0.6)]"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{opt.label}</span>
                          {showSavings && (
                            <span className="rounded-full bg-app-zatca-50 px-2 py-0.5 text-[10px] font-semibold text-app-zatca-600">
                              {isAr ? `وفّر ${savingsPct}٪` : `Save ${savingsPct}%`}
                            </span>
                          )}
                        </div>
                        {opt.price ? (
                          <div className="ltr-nums mt-0.5 text-lg font-bold text-slate-900">
                            {opt.price} <span className="text-xs font-normal text-slate-400">{opt.sub}</span>
                          </div>
                        ) : (
                          <div className="text-xs text-slate-400">{isAr ? "غير متاح" : "Not available"}</div>
                        )}
                      </div>
                      {opt.price && (
                        <Button size="sm" onClick={() => subscribe(plan.code, opt.interval)} disabled={busy !== null}>
                          {busy === busyKey
                            ? isAr
                              ? "جارٍ..."
                              : "Redirecting…"
                            : isCurrent
                              ? isAr
                                ? "تجديد"
                                : "Renew"
                              : isAr
                                ? "اشترك"
                                : "Subscribe"}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>

      <div
        style={{ fontFamily: "var(--font-script-2)" }}
        className="mx-auto max-w-sm rounded-lg border border-slate-200 bg-white px-4 py-3 text-center text-base text-slate-600"
      >
        {isAr ? "بحاجة لإضافة مستخدمين؟ التراخيص الإضافية دفعة واحدة، وليست اشتراكًا شهريًا." : "Need to add users?"}{" "}
        <Link to="/licenses" className="font-bold text-sky-600 hover:underline">
          {isAr ? "إدارة التراخيص" : "Manage licenses"}
        </Link>
      </div>

      <p style={{ fontFamily: "var(--font-script-2)" }} className="text-center text-sm text-slate-400">
        {isAr
          ? "الدفع الآمن عبر بوابة الدفع. لن تتم محاسبتك حتى تكمل الدفع."
          : "Secure payment via the payment gateway. You are not charged until you complete payment."}
      </p>
      </main>
      <Footer />
    </div>
  );
}

function StatusBanner({ info, isAr }: { info: SubscriptionInfo; isAr: boolean }) {
  if (info.isTrial && info.hasAccess) {
    return (
      <Alert variant="info">
        {isAr
          ? `أنت في الفترة التجريبية — ${info.trialDaysLeft} يومًا متبقية. اشترك الآن لتجنب انقطاع الخدمة.`
          : `You're on a free trial — ${info.trialDaysLeft} days left. Subscribe now to avoid interruption.`}
      </Alert>
    );
  }
  if (!info.hasAccess) {
    return (
      <Alert variant="danger">
        {isAr
          ? "انتهت صلاحية وصولك. اشترك لإعادة تفعيل حسابك."
          : "Your access has ended. Subscribe to reactivate your account."}
      </Alert>
    );
  }
  return (
    <Alert variant="info">
      {isAr
        ? `اشتراكك نشط على خطة ${info.plan?.nameAr ?? ""} (${info.subscription?.billingInterval}).`
        : `Your subscription is active on the ${info.plan?.nameEn ?? ""} plan (${info.subscription?.billingInterval?.toLowerCase()}).`}
    </Alert>
  );
}
