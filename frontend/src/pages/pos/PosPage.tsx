import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { isAxiosError } from "axios";
import { FileText, CheckCircle2 } from "lucide-react";
import { api } from "../../api/client";
import type { ApiSuccess, Customer } from "../../types/api";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { ProductGrid } from "../../components/pos/ProductGrid";
import { InvoicePanel } from "../../components/pos/InvoicePanel";
import { RegisterSessionBar } from "../../components/pos/RegisterSessionBar";
import { usePosStore, selectTotals } from "../../stores/posStore";
import { usePaymentMethods, useCheckout, useCreateQuote, useHoldSale, type SaleResult } from "../../api/posApi";
import { formatMoney } from "../../lib/format";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";

export default function PosPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const navigate = useNavigate();
  const { currentLocation, currentLocationId } = useBusinessLocation();
  const locale = isAr ? "ar-SA" : "en-US";
  const currency = currentLocation?.currency ?? "SAR";

  const searchRef = useRef<HTMLInputElement>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [completedSale, setCompletedSale] = useState<SaleResult | null>(null);
  const [savedAsQuote, setSavedAsQuote] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const store = usePosStore();
  const { data: paymentMethods } = usePaymentMethods();
  const checkout = useCheckout();
  const createQuote = useCreateQuote();
  const holdSale = useHoldSale();

  function notify(msg: string) {
    setBanner(msg);
    window.clearTimeout((notify as unknown as { _t?: number })._t);
    (notify as unknown as { _t?: number })._t = window.setTimeout(() => setBanner(null), 3000);
  }

  // Default to Walk-in Customer so the cashier can start immediately.
  useEffect(() => {
    if (usePosStore.getState().customer) return;
    api
      .get<ApiSuccess<Customer[]>>("/customers", { params: { search: "WALKIN", limit: 1 } })
      .then((res) => {
        const c = res.data.data[0];
        if (c) store.setCustomer({ id: c.id, nameEn: c.nameEn, nameAr: c.nameAr, phone: c.phone, balance: c.balance, rewardPoints: c.rewardPoints });
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function completeSale() {
    const state = usePosStore.getState();
    if (state.lines.length === 0) return notify(isAr ? "السلة فارغة" : "Cart is empty");
    if (!state.customer) return notify(isAr ? "اختر عميلاً" : "Select a customer");

    const over = state.lines.find((l) => l.manageStock && l.stockOnHand !== undefined && l.quantity > l.stockOnHand);
    if (over) return notify(isAr ? `الكمية تتجاوز المخزون: ${over.nameEn}` : `Quantity exceeds stock: ${over.nameEn}`);

    checkout.mutate(
      {
        businessLocationId: currentLocationId!,
        customerId: state.customer.id,
        items: state.lines.map((l) => ({
          ...(l.type === "PRODUCT" ? { productId: l.id } : { serviceId: l.id }),
          quantity: l.quantity,
          discountAmount: l.discountAmount,
        })),
        payments: state.payments.map((p) => ({ paymentMethodId: p.paymentMethodId, amount: p.amount, referenceNumber: p.referenceNumber })),
        notes: state.note || undefined,
        couponCode: state.coupon?.code,
        invoiceDiscountMode: state.invoiceDiscountValue > 0 ? state.invoiceDiscountMode : undefined,
        invoiceDiscountValue: state.invoiceDiscountValue > 0 ? state.invoiceDiscountValue : undefined,
        shipping: state.shipping > 0 ? state.shipping : undefined,
        redeemPoints: state.redeemPoints > 0 ? state.redeemPoints : undefined,
        appliedCreditAmount: selectTotals(state).appliedCredit > 0 ? selectTotals(state).appliedCredit : undefined,
      },
      {
        onSuccess: (sale) => {
          setCompletedSale(sale);
          setPaymentOpen(false);
          store.clear();
        },
        onError: (err) => {
          const msg = isAxiosError(err) && err.response?.data?.message ? err.response.data.message : t("common.somethingWentWrong");
          notify(msg);
        },
      },
    );
  }

  function saveAsQuote() {
    const state = usePosStore.getState();
    if (state.lines.length === 0) return notify(isAr ? "السلة فارغة" : "Cart is empty");
    if (!state.customer) return notify(isAr ? "اختر عميلاً" : "Select a customer");

    createQuote.mutate(
      {
        businessLocationId: currentLocationId!,
        customerId: state.customer.id,
        items: state.lines.map((l) => ({
          ...(l.type === "PRODUCT" ? { productId: l.id } : { serviceId: l.id }),
          quantity: l.quantity,
          discountAmount: l.discountAmount,
        })),
        payments: [],
        notes: state.note || undefined,
        couponCode: state.coupon?.code,
        invoiceDiscountMode: state.invoiceDiscountValue > 0 ? state.invoiceDiscountMode : undefined,
        invoiceDiscountValue: state.invoiceDiscountValue > 0 ? state.invoiceDiscountValue : undefined,
        shipping: state.shipping > 0 ? state.shipping : undefined,
      },
      {
        onSuccess: (sale) => {
          setCompletedSale(sale);
          setSavedAsQuote(true);
          setPaymentOpen(false);
          store.clear();
        },
        onError: (err) => {
          const msg = isAxiosError(err) && err.response?.data?.message ? err.response.data.message : t("common.somethingWentWrong");
          notify(msg);
        },
      },
    );
  }

  function startNewSale() {
    setCompletedSale(null);
    setSavedAsQuote(false);
    store.clear();
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const typing = ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
      if (e.key === "F1") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "F2") {
        e.preventDefault();
        if (usePosStore.getState().lines.length > 0) setPaymentOpen(true);
      } else if (e.key === "F3") {
        e.preventDefault();
        const state = usePosStore.getState();
        if (state.lines.length > 0 && currentLocationId) {
          holdSale
            .mutateAsync({
              businessLocationId: currentLocationId,
              customerId: state.customer?.id,
              label: `Hold ${new Date().toLocaleTimeString()}`,
              items: state.lines.map((l) => ({
                productId: l.type === "PRODUCT" ? l.id : undefined,
                serviceId: l.type === "SERVICE" ? l.id : undefined,
                descriptionEn: l.nameEn,
                descriptionAr: l.nameAr,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
                taxPercent: l.taxPercent,
                taxType: l.taxType,
                discountAmount: l.discountAmount,
              })),
            })
            .then(() => {
              store.clear();
              notify(isAr ? "تم التعليق" : "Sale held");
            })
            .catch(() => notify(isAr ? "تعذّر التعليق" : "Could not hold the sale"));
        }
      } else if (e.key === "F4") {
        e.preventDefault();
        startNewSale();
      } else if (e.key === "F5") {
        e.preventDefault();
        if (completedSale && !savedAsQuote) window.open(`/invoices/${completedSale.id}`, "_blank");
      } else if (e.ctrlKey && (e.key === "b" || e.key === "B")) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "Delete" && !typing) {
        e.preventDefault();
        const lines = usePosStore.getState().lines;
        if (lines.length > 0) store.removeLine(lines[lines.length - 1].key);
      } else if (e.key === "Escape") {
        setPaymentOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedSale, savedAsQuote, isAr]);

  if (!currentLocationId) {
    return <div className="p-8 text-center text-sm text-slate-400">{isAr ? "اختر فرعًا" : "Select a business location"}</div>;
  }

  if (completedSale) {
    if (savedAsQuote) {
      return (
        <Card className="mx-auto max-w-md p-8 text-center">
          <FileText className="mx-auto mb-3 h-10 w-10 text-sky-500" strokeWidth={1.5} aria-hidden />
          <h2 className="text-lg font-semibold text-slate-800">{isAr ? "تم حفظ عرض السعر" : "Quote Saved"}</h2>
          <p className="ltr-nums mt-1 text-2xl font-bold text-sky-700">{completedSale.quoteNumber}</p>
          <div className="ltr-nums mt-4 space-y-1 text-sm text-slate-600">
            <p>{isAr ? "الإجمالي" : "Total"}: {formatMoney(completedSale.totalAmount, currency, locale)}</p>
          </div>
          <div className="mt-6 flex gap-2">
            <Link
              to="/quotes"
              className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-center text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
            >
              {isAr ? "عرض عروض الأسعار" : "View Quotes"}
            </Link>
            <Button onClick={startNewSale} className="flex-1">
              {isAr ? "بيع جديد (F4)" : "New Sale (F4)"}
            </Button>
          </div>
        </Card>
      );
    }
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-500" strokeWidth={1.5} aria-hidden />
        <h2 className="text-lg font-semibold text-slate-800">{isAr ? "تم إتمام البيع" : "Sale Completed"}</h2>
        <p className="ltr-nums mt-1 text-2xl font-bold text-sky-700">{completedSale.invoiceNumber}</p>
        <div className="ltr-nums mt-4 space-y-1 text-sm text-slate-600">
          <p>{isAr ? "الإجمالي" : "Total"}: {formatMoney(completedSale.totalAmount, currency, locale)}</p>
          <p>{isAr ? "المدفوع" : "Paid"}: {formatMoney(completedSale.paidAmount, currency, locale)}</p>
          <p>{isAr ? "المتبقي" : "Due"}: {formatMoney(completedSale.dueAmount, currency, locale)}</p>
        </div>
        {completedSale.estimatedReadyAt && (
          <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-xs font-medium text-sky-700">
            {isAr ? "الجاهزية المتوقعة" : "Estimated ready"}:{" "}
            <span className="ltr-nums">{new Date(completedSale.estimatedReadyAt).toLocaleString(isAr ? "ar-SA" : "en-US")}</span>
          </p>
        )}
        <div className="mt-6 flex gap-2">
          <Link
            to={`/invoices/${completedSale.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-center text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
          >
            {isAr ? "طباعة (F5)" : "Print (F5)"}
          </Link>
          <Button onClick={startNewSale} className="flex-1">
            {isAr ? "بيع جديد (F4)" : "New Sale (F4)"}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <RegisterSessionBar businessLocationId={currentLocationId} currency={currency} locale={locale} isAr={isAr} notify={notify} />
      {banner && (
        <div className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-white shadow">{banner}</div>
      )}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,460px)_1fr]">
        <InvoicePanel
          currency={currency}
          locale={locale}
          isAr={isAr}
          businessLocationId={currentLocationId}
          paymentMethods={paymentMethods ?? []}
          paymentOpen={paymentOpen}
          setPaymentOpen={setPaymentOpen}
          onCompleteSale={completeSale}
          checkoutPending={checkout.isPending}
          onSaveAsQuote={saveAsQuote}
          saveQuotePending={createQuote.isPending}
          notify={notify}
          onRecent={() => navigate("/sales")}
          onPrintLast={() => notify(isAr ? "أكمل بيعًا أولاً للطباعة" : "Complete a sale first to print")}
        />
        <ProductGrid
          ref={searchRef}
          businessLocationId={currentLocationId}
          currency={currency}
          locale={locale}
          isAr={isAr}
          onOutOfStock={(name) => notify(isAr ? `${name}: نفد المخزون` : `${name}: out of stock`)}
        />
      </div>
    </div>
  );
}
