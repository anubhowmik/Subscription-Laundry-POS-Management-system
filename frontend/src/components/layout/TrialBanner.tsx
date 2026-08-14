import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";

interface SubscriptionInfo {
  isTrial: boolean;
  hasAccess: boolean;
  trialDaysLeft: number | null;
  subscription: { billingInterval: string } | null;
}

/**
 * Slim banner nudging trial users toward subscribing. Renders only during an active trial, so
 * paying customers never see it. It never blocks anything - the paywall is enforced server-side.
 */
export function TrialBanner() {
  const { i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const navigate = useNavigate();
  const [info, setInfo] = useState<SubscriptionInfo | null>(null);

  useEffect(() => {
    api
      .get<ApiSuccess<SubscriptionInfo>>("/billing/subscription")
      .then((res) => setInfo(res.data.data))
      .catch(() => setInfo(null));
  }, []);

  if (!info?.isTrial || !info.hasAccess) return null;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
      <span>
        {isAr
          ? `الفترة التجريبية — ${info.trialDaysLeft} يومًا متبقية`
          : `Free trial — ${info.trialDaysLeft} ${info.trialDaysLeft === 1 ? "day" : "days"} left`}
      </span>
      <button
        onClick={() => navigate("/billing")}
        className="shrink-0 rounded-md bg-amber-500 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-600"
      >
        {isAr ? "اشترك الآن" : "Subscribe now"}
      </button>
    </div>
  );
}
