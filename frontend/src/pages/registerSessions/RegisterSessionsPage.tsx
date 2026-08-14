import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import type { RegisterLedgerRow, RegisterSessionRow } from "../../api/posApi";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { formatMoney } from "../../lib/format";

export default function RegisterSessionsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const locale = isAr ? "ar-SA" : "en-US";
  const { currentLocation, currentLocationId } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["register-sessions", currentLocationId],
    queryFn: async () =>
      (await api.get<ApiSuccess<RegisterSessionRow[]>>("/register-sessions", { params: { businessLocationId: currentLocationId, limit: 50 } })).data
        .data,
    enabled: Boolean(currentLocationId),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-800">{isAr ? "جلسات الصندوق" : "Register Sessions"}</h1>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 text-start">{isAr ? "الفتح" : "Opened"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "الإغلاق" : "Closed"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "الافتتاحي" : "Opening"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "المتوقع" : "Expected"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "المعدود" : "Counted"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "الفرق" : "Difference"}</th>
              <th className="px-4 py-2 text-start">{t("common.status")}</th>
              <th className="px-4 py-2 text-start"></th>
            </tr>
          </thead>
          <tbody>
            {data?.map((s) => {
              const diff = s.cashDifference !== null ? Number(s.cashDifference) : null;
              return (
                <Fragment key={s.id}>
                  <tr
                    className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                    onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                  >
                    <td className="px-4 py-2 text-xs text-slate-500">
                      <span className="ltr-nums">{new Date(s.openedAt).toLocaleString(locale)}</span>
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-500">
                      <span className="ltr-nums">{s.closedAt ? new Date(s.closedAt).toLocaleString(locale) : "-"}</span>
                    </td>
                    <td className="px-4 py-2">
                      <span className="ltr-nums">{formatMoney(s.openingCashAmount, currency, locale)}</span>
                    </td>
                    <td className="px-4 py-2">
                      <span className="ltr-nums">{s.expectedCashAmount !== null ? formatMoney(s.expectedCashAmount, currency, locale) : "-"}</span>
                    </td>
                    <td className="px-4 py-2">
                      <span className="ltr-nums">{s.countedCashAmount !== null ? formatMoney(s.countedCashAmount, currency, locale) : "-"}</span>
                    </td>
                    <td className={`px-4 py-2 font-medium ${diff === null ? "" : diff === 0 ? "text-green-600" : diff > 0 ? "text-sky-600" : "text-red-600"}`}>
                      <span className="ltr-nums">{diff !== null ? formatMoney(diff, currency, locale) : "-"}</span>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${s.status === "OPEN" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"}`}>
                        {s.status === "OPEN" ? (isAr ? "مفتوح" : "Open") : isAr ? "مغلق" : "Closed"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-sky-600">{expandedId === s.id ? (isAr ? "إخفاء" : "Hide") : isAr ? "التفاصيل" : "Details"}</td>
                  </tr>
                  {expandedId === s.id && (
                    <tr className="border-b border-slate-100 bg-slate-50/60">
                      <td colSpan={8} className="px-4 py-3">
                        <LedgerDrilldown sessionId={s.id} currency={currency} locale={locale} isAr={isAr} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {data?.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                  {t("common.noResults")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const REFERENCE_LABELS: Record<string, { en: string; ar: string }> = {
  INITIAL_FLOAT: { en: "Opening float", ar: "الرصيد الافتتاحي" },
  SALE_PAYMENT: { en: "Sale payment", ar: "دفعة بيع" },
  REFUND: { en: "Refund", ar: "استرجاع" },
};

function LedgerDrilldown({ sessionId, currency, locale, isAr }: { sessionId: string; currency: string; locale: string; isAr: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ["register-sessions", sessionId, "ledger"],
    queryFn: async () => (await api.get<ApiSuccess<RegisterLedgerRow[]>>(`/register-sessions/${sessionId}/ledger`)).data.data,
  });

  if (isLoading) return <p className="text-xs text-slate-400">{isAr ? "جارٍ التحميل..." : "Loading..."}</p>;
  if (!data || data.length === 0) return <p className="text-xs text-slate-400">{isAr ? "لا توجد حركات" : "No transactions"}</p>;

  return (
    <table className="w-full text-xs">
      <thead className="text-slate-500">
        <tr>
          <th className="px-2 py-1 text-start">{isAr ? "الوقت" : "Time"}</th>
          <th className="px-2 py-1 text-start">{isAr ? "النوع" : "Type"}</th>
          <th className="px-2 py-1 text-start">{isAr ? "المرجع" : "Reference"}</th>
          <th className="px-2 py-1 text-start">{isAr ? "طريقة الدفع" : "Method"}</th>
          <th className="px-2 py-1 text-start">{isAr ? "المبلغ" : "Amount"}</th>
        </tr>
      </thead>
      <tbody>
        {data.map((tx) => {
          const label = tx.referenceType ? REFERENCE_LABELS[tx.referenceType] : undefined;
          return (
            <tr key={tx.id} className="border-t border-slate-100">
              <td className="px-2 py-1 text-slate-500">
                <span className="ltr-nums">{new Date(tx.createdAt).toLocaleTimeString(locale)}</span>
              </td>
              <td className="px-2 py-1">
                <span className={tx.type === "CREDIT" ? "text-green-600" : "text-red-600"}>
                  {tx.type === "CREDIT" ? (isAr ? "دائن" : "Credit") : isAr ? "مدين" : "Debit"}
                </span>
              </td>
              <td className="px-2 py-1 text-slate-600">{label ? (isAr ? label.ar : label.en) : (tx.referenceType ?? "-")}</td>
              <td className="px-2 py-1 text-slate-500">{tx.paymentMethod}</td>
              <td className={`px-2 py-1 font-medium ${tx.type === "CREDIT" ? "text-green-700" : "text-red-700"}`}>
                <span className="ltr-nums">
                  {tx.type === "DEBIT" ? "-" : ""}
                  {formatMoney(tx.amount, currency, locale)}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
