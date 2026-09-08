import { useState } from "react";
import { X, User } from "lucide-react";
import { usePosStore, usePosTotals, type DiscountMode } from "../../stores/posStore";
import {
  useCustomers,
  useCreateCustomer,
  useHeldSales,
  useHoldSale,
  useResumeHeldSale,
  useDiscardHeldSale,
  usePreviewCoupon,
  type PosPaymentMethod,
} from "../../api/posApi";
import { formatMoney } from "../../lib/format";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { inputClass, inputSmClass } from "../../components/ui/formClasses";
import { BnplFlowModal } from "./BnplFlowModal";

const BNPL_CODES = ["BNPL_TAMARA", "BNPL_TABBY", "BNPL_MISPAY"];

interface Props {
  currency: string;
  locale: string;
  isAr: boolean;
  businessLocationId: string;
  paymentMethods: PosPaymentMethod[];
  paymentOpen: boolean;
  setPaymentOpen: (open: boolean) => void;
  onCompleteSale: () => void;
  checkoutPending: boolean;
  onSaveAsQuote: () => void;
  saveQuotePending: boolean;
  notify: (msg: string) => void;
  onRecent: () => void;
  onPrintLast: () => void;
  /** Fixed to a single POS mode when set (e.g. from /pos/service or /pos/product); undefined on
   * the legacy combined /pos screen. Scopes the held-sale list and tags new held sales so a
   * Service-POS cashier never sees (and fails to resume) a product-only held sale, and vice versa. */
  mode?: "SERVICE" | "PRODUCT";
}

export function InvoicePanel(props: Props) {
  const { isAr, mode } = props;
  const lines = usePosStore((s) => s.lines);

  return (
    <div className="flex min-h-0 flex-col rounded-xl border-2 border-sky-400 bg-white shadow-sm">
      <CustomerBar {...props} />

      {/* Item list */}
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-4 py-3">
        {lines.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-400">
            {mode === "SERVICE"
              ? isAr
                ? "أضف خدمات للفاتورة"
                : "Add services to the invoice"
              : mode === "PRODUCT"
                ? isAr
                  ? "أضف منتجات للفاتورة"
                  : "Add products to the invoice"
                : isAr
                  ? "أضف خدمات أو منتجات للفاتورة"
                  : "Add services or products to the invoice"}
          </p>
        )}
        {lines.map((line) => (
          <ItemRow key={line.key} line={line} {...props} />
        ))}
      </div>

      <FooterSummary {...props} />
      {props.paymentOpen && <PaymentModal {...props} />}
    </div>
  );
}

function ItemRow({ line, currency, locale, isAr }: Props & { line: ReturnType<typeof usePosStore.getState>["lines"][number] }) {
  const store = usePosStore();
  const overStock = line.manageStock && line.stockOnHand !== undefined && line.quantity > line.stockOnHand;
  const gross = line.unitPrice * line.quantity - line.discountAmount;

  return (
    <div className={`flex items-center gap-3 rounded-lg px-2 py-2 transition-colors ${overStock ? "bg-red-50" : "hover:bg-slate-100"}`}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800">{isAr ? line.nameAr || line.nameEn : line.nameEn}</p>
        {overStock && (
          <p className="text-[11px] font-medium text-red-600">
            {isAr ? `المتوفر: ${line.stockOnHand}` : `Only ${line.stockOnHand} in stock`}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button onClick={() => store.decQty(line.key)} className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100">
          −
        </button>
        <input
          type="number"
          min={1}
          value={line.quantity}
          onChange={(e) => store.setQty(line.key, Number(e.target.value))}
          className="ltr-nums w-10 rounded border-0 bg-transparent text-center text-sm"
        />
        <button onClick={() => store.incQty(line.key)} className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100">
          +
        </button>
      </div>
      <span className="ltr-nums w-20 text-end text-sm font-semibold text-slate-800">{formatMoney(gross, currency, locale)}</span>
      <button onClick={() => store.removeLine(line.key)} className="text-slate-300 hover:text-red-500" aria-label="remove">
        <X className="h-4 w-4" strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}

function CustomerBar(props: Props) {
  const { isAr, businessLocationId, notify } = props;
  const customer = usePosStore((s) => s.customer);
  const setCustomer = usePosStore((s) => s.setCustomer);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const { data: customers } = useCustomers(search);

  return (
    <div className="relative rounded-t-xl border-b border-slate-100 bg-slate-50/60 p-3">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2.5 text-start text-sm hover:bg-slate-200/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
        >
          <User className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
          <span className="flex-1 truncate font-medium text-slate-700">
            {customer ? (isAr ? customer.nameAr || customer.nameEn : customer.nameEn) : isAr ? "عميل نقدي" : "Walk-in Customer"}
          </span>
          {customer && (
            <span className="ltr-nums text-xs text-slate-400">
              {isAr ? "الرصيد" : "Bal"}: {Number(customer.balance).toFixed(2)}
            </span>
          )}
        </button>
        <button
          onClick={() => setNewOpen(true)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-500 text-lg font-semibold text-white shadow-sm hover:bg-sky-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
          title={isAr ? "عميل جديد" : "New customer"}
        >
          +
        </button>
      </div>

      {open && (
        <div className="absolute inset-x-3 top-full z-20 mt-1 rounded-xl border border-slate-200 bg-white shadow-lg">
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isAr ? "ابحث بالاسم أو الهاتف" : "Search name or phone"}
            className="w-full border-b border-slate-100 px-3 py-2 text-sm focus:outline-none"
          />
          <div className="max-h-60 overflow-y-auto">
            {customers?.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setCustomer({ id: c.id, nameEn: c.nameEn, nameAr: c.nameAr, phone: c.phone, balance: c.balance, rewardPoints: c.rewardPoints, cashBack: c.cashBack });
                  setOpen(false);
                  setSearch("");
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-start text-sm transition-colors hover:bg-slate-100"
              >
                <span>{isAr ? c.nameAr || c.nameEn : c.nameEn}</span>
                <span className="text-xs text-slate-400">{c.phone}</span>
              </button>
            ))}
            {(customers?.length ?? 0) === 0 && <p className="px-3 py-3 text-center text-xs text-slate-400">{isAr ? "لا نتائج" : "No results"}</p>}
          </div>
        </div>
      )}

      {newOpen && (
        <NewCustomerModal
          isAr={isAr}
          businessLocationId={businessLocationId}
          notify={notify}
          onClose={() => setNewOpen(false)}
          onCreated={(c) => {
            setCustomer({ id: c.id, nameEn: c.nameEn, nameAr: c.nameAr, phone: c.phone, balance: c.balance });
            setNewOpen(false);
          }}
        />
      )}
    </div>
  );
}

function NewCustomerModal({
  isAr,
  businessLocationId,
  notify,
  onClose,
  onCreated,
}: {
  isAr: boolean;
  businessLocationId: string;
  notify: (m: string) => void;
  onClose: () => void;
  onCreated: (c: { id: string; nameEn: string; nameAr: string | null; phone: string; balance: string }) => void;
}) {
  const [nameEn, setNameEn] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [phone, setPhone] = useState("");
  const createCustomer = useCreateCustomer();

  async function submit() {
    try {
      const c = await createCustomer.mutateAsync({ nameEn, nameAr: nameAr || undefined, phone, businessLocationId });
      onCreated(c);
    } catch {
      notify(isAr ? "تعذّر إنشاء العميل. تحقق من الهاتف (05XXXXXXXX)." : "Could not create customer. Check phone (05XXXXXXXX).");
    }
  }

  return (
    <Modal onClose={onClose} title={isAr ? "عميل جديد" : "New Customer"} size="sm">
      <div className="space-y-3">
        <Field label={isAr ? "الاسم (إنجليزي)" : "Name (English)"}>
          <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} className={inputClass} autoFocus />
        </Field>
        <Field label={isAr ? "الاسم (عربي) — مطلوب للفاتورة" : "Name (Arabic) — required to invoice"}>
          <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" className={inputClass} />
        </Field>
        <Field label={isAr ? "الهاتف" : "Phone"}>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05XXXXXXXX" className={inputClass} />
        </Field>
        <Button onClick={submit} disabled={!nameEn || !phone || createCustomer.isPending} fullWidth>
          {createCustomer.isPending ? "…" : isAr ? "حفظ" : "Save"}
        </Button>
      </div>
    </Modal>
  );
}

function FooterSummary(props: Props) {
  const { currency, locale, isAr } = props;
  const totals = usePosTotals();
  const { invoiceDiscountMode, invoiceDiscountValue, shipping, redeemPoints, customer, setInvoiceDiscount, setShipping, setRedeemPoints } = usePosStore();
  const [showMore, setShowMore] = useState(false);
  const availablePoints = customer?.rewardPoints ?? 0;

  return (
    <div className="space-y-3 border-t border-slate-100 p-3">
      {/* Discount / shipping - collapsed by default to keep the panel calm like the reference */}
      <button onClick={() => setShowMore((v) => !v)} className="flex w-full items-center justify-between text-xs font-medium text-slate-400 hover:text-slate-600">
        <span>{isAr ? "خصم وشحن ونقاط" : "Discount, shipping & totals"}</span>
        <span>{showMore ? "▲" : "▼"}</span>
      </button>

      {showMore && (
        <div className="space-y-2 rounded-xl bg-slate-50 p-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="flex items-center gap-1">
              <span className="text-xs text-slate-500">{isAr ? "خصم" : "Disc"}</span>
              <input
                type="number"
                min={0}
                value={invoiceDiscountValue || ""}
                onChange={(e) => setInvoiceDiscount(invoiceDiscountMode, Number(e.target.value))}
                className="ltr-nums w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
              />
              <select
                value={invoiceDiscountMode}
                onChange={(e) => setInvoiceDiscount(e.target.value as DiscountMode, invoiceDiscountValue)}
                className="rounded-lg border border-slate-200 bg-white px-1 py-1 text-xs"
              >
                <option value="FIXED">{currency}</option>
                <option value="PERCENT">%</option>
              </select>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-slate-500">{isAr ? "شحن" : "Ship"}</span>
              <input
                type="number"
                min={0}
                value={shipping || ""}
                onChange={(e) => setShipping(Number(e.target.value))}
                className="ltr-nums w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
              />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-slate-500" title={isAr ? `متاح: ${availablePoints}` : `Available: ${availablePoints}`}>
                {isAr ? "نقاط" : "Pts"}
              </span>
              <input
                type="number"
                min={0}
                max={availablePoints}
                value={redeemPoints || ""}
                onChange={(e) => setRedeemPoints(Number(e.target.value))}
                disabled={availablePoints === 0}
                className="ltr-nums w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm disabled:opacity-50"
              />
            </div>
          </div>
          <div className="space-y-1 text-sm">
            <SummaryRow label={isAr ? "المجموع الفرعي" : "Subtotal"} value={formatMoney(totals.subtotal, currency, locale)} />
            <SummaryRow label={isAr ? "الخصم" : "Discount"} value={`− ${formatMoney(totals.discountTotal, currency, locale)}`} />
            <SummaryRow label={isAr ? "الضريبة" : "Tax (VAT)"} value={formatMoney(totals.taxAmount, currency, locale)} />
            <SummaryRow label={isAr ? "الشحن" : "Shipping"} value={formatMoney(totals.shipping, currency, locale)} />
            <SummaryRow
              label={isAr ? "نقاط المكافآت" : "Reward Points"}
              value={isAr ? `${availablePoints} متاحة${totals.redeemedPoints > 0 ? ` (−${totals.redeemedPoints} مستخدمة)` : ""}` : `${availablePoints} available${totals.redeemedPoints > 0 ? ` (−${totals.redeemedPoints} used)` : ""}`}
            />
          </div>
        </div>
      )}

      <QuickActions {...props} />

      <SubmitBar {...props} />
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-slate-500">
      <span>{label}</span>
      <span className="ltr-nums">{value}</span>
    </div>
  );
}

function QuickActions(props: Props) {
  const { isAr, notify, onRecent, onPrintLast, businessLocationId, mode } = props;
  const store = usePosStore();
  const lines = usePosStore((s) => s.lines);
  const customer = usePosStore((s) => s.customer);
  const hasLines = lines.length > 0;
  const [heldOpen, setHeldOpen] = useState(false);

  const { data: heldSales } = useHeldSales(businessLocationId, mode);
  const holdSale = useHoldSale();
  const resumeHeldSale = useResumeHeldSale();
  const discardHeldSale = useDiscardHeldSale();

  const pill =
    "rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40";

  async function holdCurrent() {
    if (!hasLines) return;
    try {
      await holdSale.mutateAsync({
        businessLocationId,
        customerId: customer?.id,
        label: `Hold ${new Date().toLocaleTimeString()}`,
        mode,
        items: lines.map((l) => ({
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
      });
      store.clear();
      notify(isAr ? "تم تعليق الفاتورة" : "Sale held");
    } catch {
      notify(isAr ? "تعذّر تعليق الفاتورة" : "Could not hold the sale");
    }
  }

  async function resume(id: string) {
    try {
      const held = await resumeHeldSale.mutateAsync(id);
      store.loadCart(
        held.items.map((item) => ({
          key: `${item.productId ? "PRODUCT" : "SERVICE"}:${item.productId ?? item.serviceId}`,
          type: item.productId ? "PRODUCT" : "SERVICE",
          id: (item.productId ?? item.serviceId)!,
          nameEn: item.descriptionEn,
          nameAr: item.descriptionAr ?? item.descriptionEn,
          sku: undefined,
          barcode: null,
          unitPrice: item.unitPrice,
          taxPercent: item.taxPercent,
          taxType: item.taxType,
          quantity: item.quantity,
          discountAmount: item.discountAmount,
          manageStock: false,
          unit: "",
        })),
        held.customer ? { id: held.customerId!, nameEn: held.customer.nameEn, nameAr: held.customer.nameAr, phone: "", balance: "0" } : null,
      );
      setHeldOpen(false);
      notify(isAr ? "تم استئناف الفاتورة" : "Sale resumed");
    } catch {
      notify(isAr ? "تعذّر استئناف الفاتورة" : "Could not resume the sale");
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <div className="relative">
        <button onClick={holdCurrent} disabled={!hasLines || holdSale.isPending} className={pill}>
          {isAr ? "تعليق" : "Hold"}
        </button>
      </div>

      <div className="relative">
        <button onClick={() => setHeldOpen((v) => !v)} className={pill}>
          {isAr ? "المعلّقة" : "Held"} {(heldSales?.length ?? 0) > 0 && `(${heldSales!.length})`}
        </button>
        {heldOpen && (
          <div className="absolute bottom-full start-0 z-20 mb-1 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
            {(heldSales?.length ?? 0) === 0 && <p className="px-2 py-3 text-center text-xs text-slate-400">{isAr ? "لا توجد فواتير معلّقة" : "No held sales"}</p>}
            {heldSales?.map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-100">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-slate-700">{h.label}</p>
                  <p className="truncate text-[10px] text-slate-400">
                    {h.customer ? (isAr ? h.customer.nameAr || h.customer.nameEn : h.customer.nameEn) : isAr ? "عميل نقدي" : "Walk-in"} · {h.items.length} {isAr ? "صنف" : "items"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button onClick={() => resume(h.id)} className="rounded-full bg-sky-100 px-2 py-1 text-[10px] font-semibold text-sky-700 hover:bg-sky-200">
                    {isAr ? "استئناف" : "Resume"}
                  </button>
                  <button onClick={() => discardHeldSale.mutate(h.id)} className="rounded-full bg-red-100 px-2 py-1 text-[10px] font-semibold text-red-600 transition-colors hover:bg-red-200">
                    {isAr ? "حذف" : "Discard"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <button onClick={onRecent} className={pill}>
        {isAr ? "الفواتير الأخيرة" : "Recent"}
      </button>
      <CouponButton {...props} pill={pill} />
      <button
        onClick={() => {
          store.clear();
          notify(isAr ? "تم تفريغ السلة" : "Cart cleared");
        }}
        disabled={!hasLines}
        className={`${pill} !bg-red-50 !text-red-600 hover:!bg-red-100`}
      >
        {isAr ? "تفريغ" : "Clear"}
      </button>
      <button onClick={onPrintLast} className={pill}>
        {isAr ? "طباعة" : "Print"}
      </button>
    </div>
  );
}

function CouponButton({ isAr, notify, pill, businessLocationId }: Props & { pill: string }) {
  const store = usePosStore();
  const coupon = usePosStore((s) => s.coupon);
  const customer = usePosStore((s) => s.customer);
  const totals = usePosTotals();
  const preview = usePreviewCoupon();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");

  async function apply() {
    if (!code.trim()) return;
    try {
      // The pre-tax subtotal is the base checkout() actually applies the coupon percentage to
      // (see pos.service.ts) - sending anything else here would preview a discount that doesn't
      // match what the cashier is charged at completion. customerId/businessLocationId are sent
      // too so preview reflects the same targeting/limit checks checkout() will enforce.
      const result = await preview.mutateAsync({ code: code.trim(), subtotal: totals.subtotal, customerId: customer?.id, businessLocationId });
      store.setCoupon({ code: result.code, discountAmount: Number(result.discountAmount) });
      notify(isAr ? `تم تطبيق الكوبون: خصم ${result.discountAmount}` : `Coupon applied: ${result.discountAmount} off`);
      setOpen(false);
      setCode("");
    } catch {
      notify(isAr ? "كود الكوبون غير صالح" : "Invalid coupon code");
    }
  }

  if (coupon) {
    return (
      <button
        onClick={() => {
          store.setCoupon(null);
          notify(isAr ? "تمت إزالة الكوبون" : "Coupon removed");
        }}
        className={`${pill} !bg-green-100 !text-green-700 hover:!bg-green-200 inline-flex items-center gap-1`}
      >
        {coupon.code}
        <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      </button>
    );
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className={pill}>
        {isAr ? "كوبون" : "Coupon"}
      </button>
      {open && (
        <div className="absolute bottom-full start-0 z-20 mb-1 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && apply()}
            placeholder={isAr ? "أدخل كود الكوبون" : "Enter coupon code"}
            autoFocus
            className={`${inputSmClass} w-full`}
          />
          <Button onClick={apply} disabled={preview.isPending || !code.trim()} size="sm" fullWidth className="mt-2">
            {preview.isPending ? "…" : isAr ? "تطبيق" : "Apply"}
          </Button>
        </div>
      )}
    </div>
  );
}

function SubmitBar(props: Props) {
  const { currency, locale, isAr, setPaymentOpen, onSaveAsQuote, saveQuotePending } = props;
  const totals = usePosTotals();
  const lines = usePosStore((s) => s.lines);
  const hasLines = lines.length > 0;

  return (
    <div className="flex gap-2">
      <CardOnlineButtons {...props} />
      <button
        onClick={onSaveAsQuote}
        disabled={!hasLines || saveQuotePending}
        className="rounded-lg border border-slate-300 px-3 py-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {saveQuotePending ? "…" : isAr ? "حفظ كعرض سعر" : "Save as Quote"}
      </button>
      <button
        onClick={() => setPaymentOpen(true)}
        disabled={!hasLines}
        className="flex flex-1 items-center justify-between rounded-lg bg-emerald-500 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span>{isAr ? "الدفع" : "Submit"}</span>
        <span className="ltr-nums text-base">{formatMoney(totals.grandTotal, currency, locale)}</span>
      </button>
    </div>
  );
}

function CardOnlineButtons(props: Props) {
  const { isAr, notify, currency, locale, businessLocationId, paymentMethods } = props;
  const lines = usePosStore((s) => s.lines);
  const customer = usePosStore((s) => s.customer);
  const hasLines = lines.length > 0;
  const [bnplOpen, setBnplOpen] = useState(false);

  return (
    <div className="flex gap-2">
      <button
        onClick={() => notify(isAr ? "دفع بالبطاقة — سيُفعّل عند ربط الجهاز" : "Card payment — enable when a card terminal is connected")}
        disabled={!hasLines}
        className="rounded-lg bg-indigo-500 px-3 py-3 text-xs font-semibold text-white hover:bg-indigo-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 disabled:opacity-40"
      >
        {isAr ? "بطاقة" : "Card"}
      </button>
      <button
        onClick={() => notify(isAr ? "الدفع الإلكتروني — قريبًا عبر بوابة الدفع" : "Online payment — coming via the payment gateway")}
        disabled={!hasLines}
        className="rounded-lg bg-amber-400 px-3 py-3 text-xs font-semibold text-white hover:bg-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 disabled:opacity-40"
      >
        {isAr ? "إلكتروني" : "Online"}
      </button>
      <button
        onClick={() => (customer ? setBnplOpen(true) : notify(isAr ? "اختر عميلاً أولاً" : "Select a customer first"))}
        disabled={!hasLines}
        className="rounded-lg bg-violet-500 px-3 py-3 text-xs font-semibold text-white hover:bg-violet-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 disabled:opacity-40"
      >
        {isAr ? "دفع آجل" : "BNPL"}
      </button>
      {bnplOpen && (
        <BnplFlowModal
          isAr={isAr}
          currency={currency}
          locale={locale}
          businessLocationId={businessLocationId}
          paymentMethods={paymentMethods}
          notify={notify}
          onClose={() => setBnplOpen(false)}
        />
      )}
    </div>
  );
}

function PaymentModal(props: Props) {
  const { isAr, currency, locale, paymentMethods, setPaymentOpen, onCompleteSale, checkoutPending } = props;
  const totals = usePosTotals();
  const payments = usePosStore((s) => s.payments);
  const store = usePosStore();
  const customer = usePosStore((s) => s.customer);

  return (
    <Modal onClose={() => setPaymentOpen(false)} title={isAr ? "الدفع" : "Payment"} size="sm">
      <div className="mb-3 flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
        <span className="text-slate-500">{isAr ? "الإجمالي المستحق" : "Grand Total"}</span>
        <span className="ltr-nums font-semibold">{formatMoney(totals.grandTotal, currency, locale)}</span>
      </div>

      <div className="mb-2 grid grid-cols-2 gap-2">
        {paymentMethods
          .filter((m) => m.code !== "STORE_CREDIT" && m.code !== "CASHBACK" && !BNPL_CODES.includes(m.code))
          .map((m) => (
            <button
              key={m.id}
              onClick={() =>
                store.addPayment({
                  paymentMethodId: m.id,
                  label: isAr ? m.nameAr : m.nameEn,
                  // totals.due is already currency-rounded by selectTotals() - no further
                  // .toFixed(2) round-trip needed (that was the source of a rare off-by-a-cent
                  // auto-fill on totals that don't terminate cleanly in binary float).
                  amount: totals.due,
                })
              }
              disabled={totals.due <= 0}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 disabled:opacity-40"
            >
              {isAr ? m.nameAr : m.nameEn}
            </button>
          ))}
        {customer && Number(customer.cashBack) > 0 && (() => {
          const cashbackMethod = paymentMethods.find((m) => m.code === "CASHBACK");
          if (!cashbackMethod) return null;
          const cashbackAmount = Math.min(totals.due, Number(customer.cashBack));
          return (
            <button
              onClick={() =>
                store.addPayment({
                  paymentMethodId: cashbackMethod.id,
                  label: isAr ? cashbackMethod.nameAr : cashbackMethod.nameEn,
                  amount: cashbackAmount,
                })
              }
              disabled={totals.due <= 0}
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 transition-colors hover:border-amber-300 hover:bg-amber-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 disabled:opacity-40"
            >
              {isAr ? cashbackMethod.nameAr : cashbackMethod.nameEn}
              <span className="ltr-nums ms-1 text-xs text-amber-500">({formatMoney(customer.cashBack ?? 0, currency, locale)})</span>
            </button>
          );
        })()}
      </div>

      {payments.map((p) => (
        <div key={p.id} className="mb-1 flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1 text-sm">
          <span>{p.label}</span>
          <span className="ltr-nums">{formatMoney(p.amount, currency, locale)}</span>
          <button onClick={() => store.removePayment(p.id)} className="text-slate-400 hover:text-red-500">
            <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          </button>
        </div>
      ))}

      {totals.availableCredit > 0 && (
        <div className="mt-2 rounded-lg bg-emerald-50 p-2">
          <div className="flex items-center justify-between text-xs font-medium text-emerald-700">
            <span>{isAr ? "الرصيد المتاح" : "Store Credit Available"}</span>
            <span className="ltr-nums">{formatMoney(totals.availableCredit, currency, locale)}</span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={Math.min(totals.availableCredit, totals.due + totals.appliedCredit)}
              value={store.appliedCreditAmount || ""}
              onChange={(e) => store.setAppliedCreditAmount(Number(e.target.value))}
              placeholder="0.00"
              className="ltr-nums w-full rounded-lg border border-emerald-200 bg-white px-2 py-1 text-sm"
            />
            <button
              onClick={() => store.setAppliedCreditAmount(totals.due + totals.appliedCredit)}
              className="shrink-0 rounded-lg bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              {isAr ? "تطبيق الكل" : "Apply Max"}
            </button>
          </div>
        </div>
      )}

      <div className="mt-2 flex justify-between text-sm">
        <span className="text-slate-500">{isAr ? "المتبقي" : "Due"}</span>
        <span className="ltr-nums font-semibold">{formatMoney(totals.due, currency, locale)}</span>
      </div>

      {!customer?.nameAr && (
        <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
          {isAr
            ? "يحتاج العميل إلى اسم عربي لإصدار فاتورة ضريبية (متطلب ZATCA)."
            : "Customer needs an Arabic name to issue a ZATCA tax invoice."}
        </p>
      )}

      <button
        onClick={onCompleteSale}
        disabled={checkoutPending}
        className="mt-3 w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:opacity-50"
      >
        {checkoutPending ? "…" : isAr ? "إتمام البيع" : "Complete Sale"}
      </button>
    </Modal>
  );
}

// --- small shared bits -------------------------------------------------------------------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      {children}
    </div>
  );
}
