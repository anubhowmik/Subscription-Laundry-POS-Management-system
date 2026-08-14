import { useState } from "react";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { formatMoney, formatDate } from "../../lib/format";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { usePaymentMethods, useQuotes, useConfirmQuote, useVoidQuote, type QuoteRow, type CheckoutPaymentInput } from "../../api/posApi";
import { roundMoney } from "../../stores/posStore";

export default function QuotesPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { currentLocation, currentLocationId } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const locale = isAr ? "ar-SA" : "en-US";

  const { data: quotes } = useQuotes(currentLocationId ?? undefined);
  const voidQuote = useVoidQuote();
  const [confirmingQuote, setConfirmingQuote] = useState<QuoteRow | null>(null);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-800">{isAr ? "عروض الأسعار" : "Quotes"}</h1>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 text-start">{isAr ? "رقم العرض" : "Quote #"}</th>
              <th className="px-4 py-2 text-start">{t("common.name")}</th>
              <th className="px-4 py-2 text-start">{isAr ? "التاريخ" : "Date"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "الأصناف" : "Items"}</th>
              <th className="px-4 py-2 text-start">{t("pos.total")}</th>
              <th className="px-4 py-2 text-start">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {quotes?.map((q) => (
              <tr key={q.id} className="border-b border-slate-100">
                <td className="px-4 py-2 font-medium text-slate-700"><span className="ltr-nums">{q.quoteNumber}</span></td>
                <td className="px-4 py-2">{isAr ? q.customer.nameAr || q.customer.nameEn : q.customer.nameEn}</td>
                <td className="px-4 py-2 text-xs text-slate-500"><span className="ltr-nums">{formatDate(q.createdAt, locale)}</span></td>
                <td className="px-4 py-2 text-slate-500">
                  {q.items.length} {isAr ? "صنف" : "items"}
                </td>
                <td className="px-4 py-2 font-semibold"><span className="ltr-nums">{formatMoney(q.totalAmount, currency, locale)}</span></td>
                <td className="px-4 py-2">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmingQuote(q)}
                      className="rounded-md bg-sky-600 px-2 py-1 text-xs font-semibold text-white hover:bg-sky-700"
                    >
                      {isAr ? "تأكيد ودفع" : "Confirm & Checkout"}
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(isAr ? "إلغاء عرض السعر هذا؟" : "Void this quote?")) voidQuote.mutate(q.id);
                      }}
                      disabled={voidQuote.isPending}
                      className="rounded-md bg-red-50 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50"
                    >
                      {isAr ? "إلغاء" : "Void"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {quotes?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  {t("common.noResults")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {confirmingQuote && (
        <ConfirmQuoteModal
          isAr={isAr}
          currency={currency}
          locale={locale}
          quote={confirmingQuote}
          onClose={() => setConfirmingQuote(null)}
        />
      )}
    </div>
  );
}

function ConfirmQuoteModal({
  isAr,
  currency,
  locale,
  quote,
  onClose,
}: {
  isAr: boolean;
  currency: string;
  locale: string;
  quote: QuoteRow;
  onClose: () => void;
}) {
  const { data: paymentMethods } = usePaymentMethods();
  const confirmQuote = useConfirmQuote();
  const [payments, setPayments] = useState<(CheckoutPaymentInput & { id: string; label: string })[]>([]);
  const [appliedCreditAmount, setAppliedCreditAmount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const totalAmount = Number(quote.totalAmount);
  const availableCredit = Number(quote.customer.balance) < 0 ? -Number(quote.customer.balance) : 0;
  const paid = roundMoney(payments.reduce((sum, p) => sum + p.amount, 0));
  const dueBeforeCredit = roundMoney(Math.max(0, totalAmount - paid));
  const cappedCredit = roundMoney(Math.min(appliedCreditAmount, dueBeforeCredit, availableCredit));
  // Rounded here (not just at display) since this exact value gets submitted as a payment amount
  // by the auto-fill buttons below - see the identical fix in posStore.ts's selectTotals().
  const due = roundMoney(Math.max(0, dueBeforeCredit - cappedCredit));

  function submit() {
    setError(null);
    confirmQuote.mutate(
      {
        id: quote.id,
        payments: payments.map((p) => ({ paymentMethodId: p.paymentMethodId, amount: p.amount, referenceNumber: p.referenceNumber })),
        appliedCreditAmount: cappedCredit > 0 ? cappedCredit : undefined,
      },
      {
        onSuccess: onClose,
        onError: (err) =>
          setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
      },
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800">
            {isAr ? "تأكيد عرض السعر" : "Confirm Quote"} {quote.quoteNumber}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <div className="mb-3 flex justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
          <span className="text-slate-500">{isAr ? "الإجمالي" : "Total"}</span>
          <span className="ltr-nums font-semibold">{formatMoney(totalAmount, currency, locale)}</span>
        </div>

        <div className="mb-2 grid grid-cols-2 gap-2">
          {paymentMethods?.filter((m) => m.code !== "STORE_CREDIT").map((m) => (
            <button
              key={m.id}
              onClick={() =>
                setPayments((prev) => [
                  ...prev,
                  { id: crypto.randomUUID?.() ?? String(Math.random()), paymentMethodId: m.id, label: isAr ? m.nameAr : m.nameEn, amount: due },
                ])
              }
              disabled={due <= 0}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-40"
            >
              {isAr ? m.nameAr : m.nameEn}
            </button>
          ))}
        </div>

        {payments.map((p) => (
          <div key={p.id} className="mb-1 flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1 text-sm">
            <span>{p.label}</span>
            <span className="ltr-nums">{formatMoney(p.amount, currency, locale)}</span>
            <button onClick={() => setPayments((prev) => prev.filter((x) => x.id !== p.id))} className="text-slate-400 hover:text-red-500">
              ✕
            </button>
          </div>
        ))}

        {availableCredit > 0 && (
          <div className="mt-2 rounded-lg bg-emerald-50 p-2">
            <div className="flex items-center justify-between text-xs font-medium text-emerald-700">
              <span>{isAr ? "الرصيد المتاح" : "Store Credit Available"}</span>
              <span className="ltr-nums">{formatMoney(availableCredit, currency, locale)}</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={Math.min(availableCredit, dueBeforeCredit)}
                value={appliedCreditAmount || ""}
                onChange={(e) => setAppliedCreditAmount(Number(e.target.value))}
                placeholder="0.00"
                className="ltr-nums w-full rounded-lg border border-emerald-200 bg-white px-2 py-1 text-sm"
              />
              <button
                onClick={() => setAppliedCreditAmount(dueBeforeCredit)}
                className="shrink-0 rounded-lg bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                {isAr ? "تطبيق الكل" : "Apply Max"}
              </button>
            </div>
          </div>
        )}

        <div className="mt-2 flex justify-between text-sm">
          <span className="text-slate-500">{isAr ? "المتبقي" : "Due"}</span>
          <span className="ltr-nums font-semibold">{formatMoney(due, currency, locale)}</span>
        </div>

        {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <button
          onClick={submit}
          disabled={confirmQuote.isPending}
          className="mt-3 w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
        >
          {confirmQuote.isPending ? "…" : isAr ? "تأكيد البيع" : "Confirm Sale"}
        </button>
      </div>
    </div>
  );
}
