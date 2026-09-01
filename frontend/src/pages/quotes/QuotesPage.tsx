import { useState } from "react";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { X } from "lucide-react";
import { formatMoney, formatDate } from "../../lib/format";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { usePaymentMethods, useQuotes, useConfirmQuote, useVoidQuote, type QuoteRow, type CheckoutPaymentInput } from "../../api/posApi";
import { roundMoney } from "../../stores/posStore";
import { confirmAction } from "../../stores/confirmStore";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { Alert } from "../../components/ui/Alert";
import { StatCard } from "../../components/ui/StatCard";
import { TableContainer, Table, THead, Th } from "../../components/ui/Table";
import { inputClass } from "../../components/ui/formClasses";
import { cn } from "../../lib/cn";
import { FileText } from "lucide-react";

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
    <div className="space-y-6">
      <PageHeader title={isAr ? "عروض الأسعار" : "Quotes"} />

      <div className="grid grid-cols-1 gap-4 sm:max-w-xs">
        <StatCard
          icon={FileText}
          cardBg="bg-app-pos-500"
          iconBg="bg-white/20"
          iconColor="text-white"
          highlight
          label={isAr ? "عروض الأسعار" : "Quotes"}
          value={String(quotes?.length ?? 0)}
        />
      </div>

      <TableContainer>
        <Table>
          <THead>
            <tr>
              <Th>{isAr ? "رقم العرض" : "Quote #"}</Th>
              <Th>{t("common.name")}</Th>
              <Th>{isAr ? "التاريخ" : "Date"}</Th>
              <Th>{isAr ? "الأصناف" : "Items"}</Th>
              <Th>{t("pos.total")}</Th>
              <Th>{t("common.actions")}</Th>
            </tr>
          </THead>
          <tbody>
            {quotes?.map((q) => (
              <tr key={q.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-3 font-medium text-slate-700"><span className="ltr-nums">{q.quoteNumber}</span></td>
                <td className="px-4 py-3">{isAr ? q.customer.nameAr || q.customer.nameEn : q.customer.nameEn}</td>
                <td className="px-4 py-3 text-xs text-slate-500"><span className="ltr-nums">{formatDate(q.createdAt, locale)}</span></td>
                <td className="px-4 py-3 text-slate-500">
                  {q.items.length} {isAr ? "صنف" : "items"}
                </td>
                <td className="px-4 py-3 font-semibold"><span className="ltr-nums">{formatMoney(q.totalAmount, currency, locale)}</span></td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => setConfirmingQuote(q)}>
                      {isAr ? "تأكيد ودفع" : "Confirm & Checkout"}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={async () => {
                        if (await confirmAction({ message: isAr ? "إلغاء عرض السعر هذا؟" : "Void this quote?", danger: true })) voidQuote.mutate(q.id);
                      }}
                      disabled={voidQuote.isPending}
                    >
                      {isAr ? "إلغاء" : "Void"}
                    </Button>
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
        </Table>
      </TableContainer>

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
    <Modal
      title={
        <>
          {isAr ? "تأكيد عرض السعر" : "Confirm Quote"} <span className="ltr-nums">{quote.quoteNumber}</span>
        </>
      }
      onClose={onClose}
      size="sm"
      footer={
        <Button variant="primary" fullWidth className="!bg-emerald-600 hover:!bg-emerald-700 active:!bg-emerald-800" onClick={submit} disabled={confirmQuote.isPending}>
          {confirmQuote.isPending ? "…" : isAr ? "تأكيد البيع" : "Confirm Sale"}
        </Button>
      }
    >
      <div className="mb-3 flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
        <span className="text-slate-500">{isAr ? "الإجمالي" : "Total"}</span>
        <span className="ltr-nums font-semibold">{formatMoney(totalAmount, currency, locale)}</span>
      </div>

      <div className="mb-2 grid grid-cols-2 gap-2">
        {paymentMethods?.filter((m) => m.code !== "STORE_CREDIT").map((m) => (
          <Button
            key={m.id}
            variant="outline"
            onClick={() =>
              setPayments((prev) => [
                ...prev,
                { id: crypto.randomUUID?.() ?? String(Math.random()), paymentMethodId: m.id, label: isAr ? m.nameAr : m.nameEn, amount: due },
              ])
            }
            disabled={due <= 0}
          >
            {isAr ? m.nameAr : m.nameEn}
          </Button>
        ))}
      </div>

      {payments.map((p) => (
        <div key={p.id} className="mb-1 flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1 text-sm">
          <span>{p.label}</span>
          <span className="ltr-nums">{formatMoney(p.amount, currency, locale)}</span>
          <button onClick={() => setPayments((prev) => prev.filter((x) => x.id !== p.id))} className="text-slate-400 hover:text-red-500">
            <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
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
              className={cn(inputClass, "ltr-nums !border-emerald-200 focus:!border-emerald-500 focus:!ring-emerald-500/30")}
            />
            <Button
              size="sm"
              className="!bg-emerald-600 hover:!bg-emerald-700 active:!bg-emerald-800 shrink-0"
              onClick={() => setAppliedCreditAmount(dueBeforeCredit)}
            >
              {isAr ? "تطبيق الكل" : "Apply Max"}
            </Button>
          </div>
        </div>
      )}

      <div className="mt-2 flex justify-between text-sm">
        <span className="text-slate-500">{isAr ? "المتبقي" : "Due"}</span>
        <span className="ltr-nums font-semibold">{formatMoney(due, currency, locale)}</span>
      </div>

      {error && (
        <Alert variant="danger" className="mt-3">
          {error}
        </Alert>
      )}
    </Modal>
  );
}
