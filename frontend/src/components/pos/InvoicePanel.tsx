import { useState } from "react";
import { PromotionPicker } from "./PromotionPicker";
import { useActivePromotions } from "../../api/promotionsApi";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, User, UserPlus, CirclePause, Clock, Receipt, Trash2, Printer, Ticket, FileText, CreditCard, Globe, CalendarClock, Banknote, Wallet, Gift, Plus, PackageCheck } from "lucide-react";
import { usePosStore, usePosTotals, useLineCouponShare, type DiscountMode, type PosPayment } from "../../stores/posStore";
import {
  useCustomers,
  useHeldSales,
  useHoldSale,
  useResumeHeldSale,
  useDiscardHeldSale,
  BNPL_CODES,
  type PosPaymentMethod,
} from "../../api/posApi";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { formatMoney } from "../../lib/format";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { inputSmClass } from "../../components/ui/formClasses";
import { CustomerFormModal } from "../customers/CustomerFormModal";
import { BnplFlowModal } from "./BnplFlowModal";
import { LineEditModal } from "./LineEditModal";
import { TAX_EXEMPTION_REASON_CODES, TAX_EXEMPTION_REASONS } from "../../lib/taxExemptionReasons";
import { useCouponApply } from "./useCouponApply";
import { CouponOtpStep } from "./CouponOtpStep";

interface SellCustomFieldLabels {
  sellCustomField1Label: string | null;
  sellCustomField2Label: string | null;
  sellCustomField3Label: string | null;
  sellCustomField4Label: string | null;
}

function useSellCustomFieldLabels(isAr: boolean) {
  const { data } = useQuery({
    queryKey: ["sell-custom-field-labels"],
    queryFn: async () => (await api.get<ApiSuccess<SellCustomFieldLabels>>("/organizations/sell-custom-field-labels")).data.data,
  });
  return Array.from({ length: 4 }, (_, i) => {
    const key = `sellCustomField${i + 1}Label` as keyof SellCustomFieldLabels;
    return data?.[key] || (isAr ? `حقل مخصص ${i + 1}` : `Custom Field ${i + 1}`);
  });
}

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
  /** Reference's own `#pos-draft` touch-POS button (`sale_pos/partials/pos_form_actions.blade.php`,
   * labeled "Delivery" via `lang.sale.delivery`) - sits alongside `#pos-quotation` there, so this
   * app's own "Save as Quote" button here was only half the reference's actual pair; Add Sale
   * already has both (PosPage.tsx's action row) but the touch-grid screen was missing this one. */
  onSaveAsDelivery: () => void;
  saveDeliveryPending: boolean;
  notify: (msg: string) => void;
  onRecent: () => void;
  onPrintLast: () => void;
  /** Fixed to a single POS mode when set (e.g. from /pos/service or /pos/product); undefined on
   * the legacy combined /pos screen. Scopes the held-sale list and tags new held sales so a
   * Service-POS cashier never sees (and fails to resume) a product-only held sale, and vice versa. */
  mode?: "SERVICE" | "PRODUCT";
  /** Replaces the default compact item-row list with custom content - used by the table-based
   * "Add Sale" entry screen (SaleLineTable), which needs the reference's own fuller per-line
   * columns (unit price/discount/tax/price-inc-tax) that the touch-cart's compact row list never
   * exposed. Omitted everywhere else, which keeps today's ItemRow list exactly as it was. */
  itemsSlot?: ReactNode;
  /** Shows the reference's Billing/Shipping Address display directly under the customer field
   * (`sell/create.blade.php` renders it as part of the SAME form-group as the customer select,
   * not a separate block elsewhere on the page) - only meaningful on Add Sale's table layout,
   * left off everywhere else so the touch-grid POS's compact customer bar is unchanged. */
  showAddressBlock?: boolean;
  /** Set while editing an existing draft (QuotesPage.tsx's "Edit" row action, loaded via
   * PosPage.tsx) - reference's own edit screen resubmits onto the SAME quotation/delivery it
   * opened, it can't switch types or jump straight to a real checkout mid-edit. Narrows the
   * submit row to just the one matching "Update" action instead of the normal Delivery/Quote/
   * Charge trio. Undefined/null everywhere else, which keeps the normal trio unchanged. */
  editingKind?: "quote" | "delivery" | null;
}

export function InvoicePanel(props: Props) {
  const { isAr, mode, itemsSlot } = props;
  const lines = usePosStore((s) => s.lines);

  return (
    <div className="flex min-h-0 flex-col rounded-xl border-2 border-sky-400 bg-white shadow-sm">
      <CustomerBar {...props} />

      {itemsSlot ?? (
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
      )}

      <FooterSummary {...props} />
      {props.paymentOpen && <PaymentModal {...props} />}
    </div>
  );
}

function ItemRow({ line, currency, locale, isAr }: Props & { line: ReturnType<typeof usePosStore.getState>["lines"][number] }) {
  const store = usePosStore();
  const couponShare = useLineCouponShare(line.key);
  const couponCode = usePosStore((s) => s.coupon?.code);
  const [editOpen, setEditOpen] = useState(false);
  const overStock = line.manageStock && line.stockOnHand !== undefined && line.quantity > line.stockOnHand;
  const effectiveQty = line.widthM != null && line.heightM != null ? line.quantity * line.widthM * line.heightM : line.quantity;
  const effectivePrice = line.unitPriceOverride ?? line.unitPrice;
  const gross = effectivePrice * effectiveQty - line.discountAmount - couponShare;
  const hasOverrides = line.unitPriceOverride != null || line.taxOverrideId != null || line.note || (line.widthM && line.heightM);

  return (
    <div className={`flex items-center gap-3 rounded-lg px-2 py-2 transition-colors ${overStock ? "bg-red-50" : line.promotionId ? "bg-emerald-50/70 hover:bg-emerald-50" : "hover:bg-slate-100"}`}>
      <button
        type="button"
        onClick={() => setEditOpen(true)}
        className="min-w-0 flex-1 text-start"
        title={isAr ? "تعديل السطر" : "Edit line"}
      >
        <p className="truncate text-sm font-medium text-slate-800">
          {isAr ? line.nameAr || line.nameEn : line.nameEn}
          {hasOverrides && <span className="ms-1 text-sky-500">●</span>}
        </p>
        {overStock && (
          <p className="text-[11px] font-medium text-red-600">
            {isAr ? `المتوفر: ${line.stockOnHand}` : `Only ${line.stockOnHand} in stock`}
          </p>
        )}
        {line.autoDiscount && !line.promotionId && (
          <p className="truncate text-[11px] text-sky-600" title={`${line.autoDiscount.name} - ${new Date(line.autoDiscount.endsAt).toLocaleString()}`}>
            {isAr ? `الخصم: ${line.autoDiscount.name}` : `Discount: ${line.autoDiscount.name} applied`}
          </p>
        )}
        {line.promotionId && (
          <p className="flex items-center gap-1 text-[11px] font-medium text-emerald-600">
            <Gift className="h-3 w-3" strokeWidth={2} aria-hidden />
            {line.promoFree ? (isAr ? "بونص مجاني" : "Free bonus") : isAr ? "عرض ترويجي" : "Promotion"}
          </p>
        )}
        {couponShare > 0 && (
          <p className="flex items-center gap-1 text-[11px] font-medium text-green-700">
            <Ticket className="h-3 w-3" strokeWidth={2} aria-hidden />
            <span className="font-mono">{couponCode}</span>
            <span className="ltr-nums">−{couponShare.toFixed(2)}</span>
          </p>
        )}
      </button>
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
      {editOpen && <LineEditModal line={line} currency={currency} locale={locale} isAr={isAr} onClose={() => setEditOpen(false)} />}
    </div>
  );
}

/** Reference's own `billing_address_div`/`shipping_address_div` - computed from the picked
 * customer's structured address fields (Billing) and its genuinely separate free-text
 * `shippingAddress` field (Shipping, falling back to the computed billing address when empty,
 * matching the reference's own `shipping_address || contact_address` behavior). */
function CustomerAddressBlock({ isAr, customer }: { isAr: boolean; customer: ReturnType<typeof usePosStore.getState>["customer"] }) {
  if (!customer) return null;
  const billingAddress = [customer.address, customer.addressLine2, customer.city, customer.state, customer.country].filter(Boolean).join(", ");
  const shippingAddress = customer.shippingAddress || billingAddress;

  return (
    <div className="mt-2 space-y-1 text-xs text-slate-500">
      <p>
        <span className="font-semibold text-slate-600">{isAr ? "عنوان الفوترة" : "Billing Address"}:</span> {billingAddress || "—"}
      </p>
      <p>
        <span className="font-semibold text-slate-600">{isAr ? "عنوان الشحن" : "Shipping Address"}:</span> {shippingAddress || "—"}
      </p>
    </div>
  );
}

function CustomerBar(props: Props) {
  const { isAr, showAddressBlock } = props;
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
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-500 text-white shadow-sm hover:bg-sky-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
          title={isAr ? "عميل جديد" : "New customer"}
        >
          <UserPlus className="h-5 w-5" strokeWidth={2} aria-hidden />
        </button>
      </div>

      {showAddressBlock && customer && <CustomerAddressBlock isAr={isAr} customer={customer} />}

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
                  setCustomer({
                    id: c.id,
                    nameEn: c.nameEn,
                    nameAr: c.nameAr,
                    phone: c.phone,
                    balance: c.balance,
                    rewardPoints: c.rewardPoints,
                    cashBack: c.cashBack,
                    address: c.address,
                    addressLine2: c.addressLine2,
                    city: c.city,
                    state: c.state,
                    country: c.country,
                    shippingAddress: c.shippingAddress,
                    paymentTermsDays: c.paymentTermsDays,
                    payTermType: c.payTermType,
                  });
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
        <CustomerFormModal
          isAr={isAr}
          editing={null}
          onClose={() => setNewOpen(false)}
          onSaved={(created) => {
            if (created) {
              setCustomer({
                id: created.id,
                nameEn: created.nameEn,
                nameAr: created.nameAr,
                phone: created.phone,
                balance: created.balance,
                address: created.address,
                addressLine2: created.addressLine2,
                city: created.city,
                state: created.state,
                country: created.country,
                shippingAddress: created.shippingAddress,
                paymentTermsDays: created.paymentTermsDays,
                payTermType: created.payTermType,
              });
            }
            setNewOpen(false);
          }}
        />
      )}
    </div>
  );
}

function FooterSummary(props: Props) {
  const { currency, locale, isAr } = props;
  const totals = usePosTotals();
  const {
    invoiceDiscountMode,
    invoiceDiscountValue,
    shipping,
    redeemPoints,
    customer,
    note,
    customFields,
    additionalExpenses,
    taxExemptionReasonCode,
    setInvoiceDiscount,
    setShipping,
    setRedeemPoints,
    setNote,
    setCustomField,
    setAdditionalExpense,
    setTaxExemptionReasonCode,
  } = usePosStore();
  const [showMore, setShowMore] = useState(false);
  const availablePoints = customer?.rewardPoints ?? 0;
  const sellCustomFieldLabels = useSellCustomFieldLabels(isAr);

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
            {totals.additionalExpensesTotal > 0 && (
              <SummaryRow label={isAr ? "مصاريف إضافية" : "Additional Expenses"} value={formatMoney(totals.additionalExpensesTotal, currency, locale)} />
            )}
          </div>
          {/* Reference's own "Sell Note" field (`sell/create.blade.php`'s `sale_note` textarea) -
              already wired end to end (posStore.note -> checkout's `notes` field) since the very
              first POS build, but never actually had an input anywhere to type it - a genuine gap
              this fixes for both the touch grid and Add Sale's table layout at once, since both
              share this exact panel. */}
          <div>
            <label className="mb-1 block text-xs text-slate-500">{isAr ? "ملاحظة البيع" : "Sell Note"}</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder={isAr ? "اختياري" : "Optional"}
              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
            />
          </div>

          {/* Reference's own sell-level custom fields (`custom_labels['sell']`, 4 slots) - see
              Organization.sellCustomField1..4Label. Free text, no calculation effect. */}
          <div className="grid grid-cols-2 gap-2">
            {sellCustomFieldLabels.map((label, i) => (
              <div key={i}>
                <label className="mb-1 block text-xs text-slate-500">{label}</label>
                <input
                  value={customFields[i] ?? ""}
                  onChange={(e) => setCustomField(i, e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                />
              </div>
            ))}
          </div>

          {/* Reference's 4 fixed additional-expense name/amount slots - untaxed flat pass-through
              charges added straight onto the grand total (see posStore.ts's selectTotals). */}
          <div>
            <label className="mb-1 block text-xs text-slate-500">{isAr ? "مصاريف إضافية" : "Additional Expenses"}</label>
            <div className="space-y-1">
              {additionalExpenses.map((slot, i) => (
                <div key={i} className="flex gap-1">
                  <input
                    value={slot.key}
                    onChange={(e) => setAdditionalExpense(i, { ...slot, key: e.target.value })}
                    placeholder={isAr ? `اسم المصروف ${i + 1}` : `Expense name ${i + 1}`}
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                  />
                  <input
                    type="number"
                    min={0}
                    value={slot.value || ""}
                    onChange={(e) => setAdditionalExpense(i, { ...slot, value: Number(e.target.value) })}
                    placeholder="0.00"
                    className="ltr-nums w-24 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* ZATCA VATEX-SA-* exemption reason - only meaningful when the cart's effective tax
              rate is 0 (all lines Exempt/Zero-rated); see pos.service.ts/xmlGenerator.service.ts. */}
          <div>
            <label className="mb-1 block text-xs text-slate-500">{isAr ? "سبب الإعفاء الضريبي" : "Tax Exemption Reason"}</label>
            <select
              value={taxExemptionReasonCode ?? ""}
              onChange={(e) => setTaxExemptionReasonCode(e.target.value || null)}
              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
            >
              <option value="">{isAr ? "لا يوجد" : "None"}</option>
              {TAX_EXEMPTION_REASON_CODES.map((code) => (
                <option key={code} value={code}>
                  {code} — {isAr ? TAX_EXEMPTION_REASONS[code].ar : TAX_EXEMPTION_REASONS[code].en}
                </option>
              ))}
            </select>
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
    "inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40";

  async function holdCurrent() {
    if (!hasLines) return;
    try {
      await holdSale.mutateAsync({
        businessLocationId,
        customerId: customer?.id,
        label: `Hold ${new Date().toLocaleTimeString()}`,
        mode,
        items: (usePosStore.getState().promotion?.originalLines ?? lines).map((l) => ({
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
          <CirclePause className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          {isAr ? "تعليق" : "Hold"}
        </button>
      </div>

      <div className="relative">
        <button onClick={() => setHeldOpen((v) => !v)} className={pill}>
          <Clock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
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
        <Receipt className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        {isAr ? "الفواتير الأخيرة" : "Recent"}
      </button>
      <PromotionPicker isAr={isAr} businessLocationId={businessLocationId} mode={mode} notify={notify} variant="pill" pillClass={pill} />
      <CouponButton {...props} pill={pill} />
      <button
        onClick={() => {
          store.clear();
          notify(isAr ? "تم تفريغ السلة" : "Cart cleared");
        }}
        disabled={!hasLines}
        className={`${pill} !bg-red-50 !text-red-600 hover:!bg-red-100`}
      >
        <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        {isAr ? "تفريغ" : "Clear"}
      </button>
      <button onClick={onPrintLast} className={pill}>
        <Printer className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        {isAr ? "طباعة" : "Print"}
      </button>
    </div>
  );
}

function CouponButton({ isAr, notify, pill, businessLocationId, mode }: Props & { pill: string }) {
  const store = usePosStore();
  const coupon = usePosStore((s) => s.coupon);
  const flow = useCouponApply({ isAr, businessLocationId, mode, notify });
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");

  async function apply() {
    if (await flow.apply(code)) {
      setOpen(false);
      setCode("");
    }
  }

  if (coupon) {
    return (
      <button
        onClick={() => {
          store.setCoupon(null);
          notify(isAr ? "تم إلغاء قسيمة الخصم" : "Coupon cancelled");
        }}
        title={`${coupon.name} - ${isAr ? "الغاء قسيمة الخصم" : "Cancel Coupon"}`}
        className={`${pill} !bg-green-100 !text-green-700 hover:!bg-green-200 inline-flex items-center gap-1`}
      >
        <span className="font-mono">{coupon.code}</span>
        <span className="ltr-nums text-[11px]">−{coupon.discountAmount.toFixed(2)}</span>
        <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      </button>
    );
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className={pill}>
        <Ticket className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        {isAr ? "قسيمة خصم" : "Coupon"}
      </button>
      {open && (
        <div className="absolute bottom-full start-0 z-20 mb-1 w-64 space-y-2 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && apply()}
            placeholder={isAr ? "قسيمة خصم" : "Coupon"}
            autoFocus
            className={`${inputSmClass} w-full font-mono`}
          />
          <Button onClick={apply} disabled={flow.pending || !code.trim()} size="sm" fullWidth>
            {flow.pending ? "…" : isAr ? "تطبيق قسيمة الخصم" : "Apply Coupon"}
          </Button>
          <CouponOtpStep flow={flow} isAr={isAr} />
        </div>
      )}
    </div>
  );
}

/**
 * Redesigned checkout bar: previously a cramped row of five buttons - Card/Online (both dead
 * placeholders that only ever showed a "not connected yet" toast, never actually charged
 * anything), BNPL, Save as Quote, and Submit. Card/Online are gone - the Payment modal's own
 * method tiles (see PaymentModal below) already let a cashier add a REAL, editable Card or Online
 * row today, so the old placeholder buttons were dead weight sitting next to working
 * functionality. BNPL moved into that same modal as one more payment option instead of a
 * same-weight top-level button, so this bar keeps exactly one job: quote or charge. Submit itself
 * now surfaces the item count alongside the total (POS convention - see Square/Toast - a cashier
 * scans the item count as a sanity check before tapping through to payment).
 */
function SubmitBar(props: Props) {
  const { currency, locale, isAr, setPaymentOpen, onSaveAsQuote, saveQuotePending, onSaveAsDelivery, saveDeliveryPending, editingKind } = props;
  const totals = usePosTotals();
  const lines = usePosStore((s) => s.lines);
  const hasLines = lines.length > 0;

  if (editingKind) {
    const isDelivery = editingKind === "delivery";
    const pending = isDelivery ? saveDeliveryPending : saveQuotePending;
    return (
      <button
        onClick={isDelivery ? onSaveAsDelivery : onSaveAsQuote}
        disabled={!hasLines || pending}
        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:shadow-md hover:from-sky-600 hover:to-sky-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none"
      >
        {isDelivery ? <PackageCheck className="h-4 w-4" strokeWidth={2} aria-hidden /> : <FileText className="h-4 w-4" strokeWidth={2} aria-hidden />}
        {pending
          ? "…"
          : isDelivery
            ? isAr
              ? "تحديث التسليم"
              : "Update Delivery"
            : isAr
              ? "تحديث عرض السعر"
              : "Update Quote"}
      </button>
    );
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={onSaveAsDelivery}
        disabled={!hasLines || saveDeliveryPending}
        title={isAr ? "حفظ كتسليم" : "Save as Delivery"}
        className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <PackageCheck className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
        <span className="hidden sm:inline">{saveDeliveryPending ? "…" : isAr ? "تسليم" : "Delivery"}</span>
      </button>
      <button
        onClick={onSaveAsQuote}
        disabled={!hasLines || saveQuotePending}
        title={isAr ? "حفظ كعرض سعر" : "Save as Quote"}
        className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <FileText className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
        <span className="hidden sm:inline">{saveQuotePending ? "…" : isAr ? "عرض سعر" : "Quote"}</span>
      </button>
      <button
        onClick={() => setPaymentOpen(true)}
        disabled={!hasLines}
        className="group flex flex-1 items-center justify-between rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2.5 text-white shadow-sm transition hover:shadow-md hover:from-emerald-600 hover:to-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none"
      >
        <span className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/20 transition-transform group-hover:scale-105">
            <CreditCard className="h-5 w-5" strokeWidth={2} aria-hidden />
          </span>
          <span className="flex flex-col items-start leading-tight">
            <span className="whitespace-nowrap text-[11px] font-medium text-emerald-50/90">
              {hasLines
                ? isAr
                  ? `${totals.itemCount} صنف`
                  : `${totals.itemCount} item${totals.itemCount === 1 ? "" : "s"}`
                : isAr
                  ? "أضف أصنافًا"
                  : "Add items"}
            </span>
            <span className="text-sm font-bold">{isAr ? "الدفع" : "Charge"}</span>
          </span>
        </span>
        <span className="ltr-nums text-lg font-extrabold">{formatMoney(totals.grandTotal, currency, locale)}</span>
      </button>
    </div>
  );
}

/** Reference's own multi-row split-tender payment modal (`sale_pos/partials/payment_modal.blade.php`
 * + `payment_row_form.blade.php`): any number of payment rows, each with its own method/amount/
 * reference-no./note, a live Total Payable/Total Paying/Change Return/Balance readout, and (this
 * app's own addition, since the reference's change-return math lives in JS not present in this
 * checkout) a per-row Cash "Tendered" field that computes change WITHOUT inflating the amount
 * actually recorded as paid - only `amount` is ever summed/sent to checkout, `tendered` is a purely
 * client-side helper for the cashier's physical cash handoff. */
function PaymentModal(props: Props) {
  const { isAr, currency, locale, paymentMethods, setPaymentOpen, onCompleteSale, checkoutPending, businessLocationId, notify } = props;
  const totals = usePosTotals();
  const payments = usePosStore((s) => s.payments);
  const store = usePosStore();
  const customer = usePosStore((s) => s.customer);
  const promotion = usePosStore((s) => s.promotion);
  const { data: promoState } = useActivePromotions();
  const cashbackBlocked = promoState?.cashbackRedeemBlocked ?? false;
  const [bnplOpen, setBnplOpen] = useState(false);

  const methodById = new Map(paymentMethods.map((m) => [m.id, m]));
  const changeReturn = payments.reduce((sum, p) => {
    if (methodById.get(p.paymentMethodId)?.code !== "CASH" || !p.tendered) return sum;
    return sum + Math.max(0, p.tendered - p.amount);
  }, 0);
  const selectableMethods = paymentMethods.filter((m) => m.code !== "STORE_CREDIT" && m.code !== "CASHBACK" && !BNPL_CODES.includes(m.code));
  const MethodIcon = ({ code }: { code: string }) =>
    code === "CASH" ? (
      <Banknote className="h-4 w-4" strokeWidth={2} aria-hidden />
    ) : code === "CARD" ? (
      <CreditCard className="h-4 w-4" strokeWidth={2} aria-hidden />
    ) : code === "ONLINE" ? (
      <Globe className="h-4 w-4" strokeWidth={2} aria-hidden />
    ) : (
      <Wallet className="h-4 w-4" strokeWidth={2} aria-hidden />
    );

  return (
    <Modal
      onClose={() => setPaymentOpen(false)}
      title={isAr ? "الدفع" : "Payment"}
      size="2xl"
      footer={
        <Button onClick={onCompleteSale} disabled={checkoutPending} fullWidth size="md" className="!py-3 !text-base">
          {checkoutPending ? "…" : isAr ? "إتمام البيع" : "Complete Sale"}
        </Button>
      }
    >
      {/* Reference's own 9/3 two-column payment layout (`sale_pos/partials/payment_modal.blade.php`):
          entry controls on the left, a bold high-contrast running-totals panel on the right that
          never scrolls out of view while rows are added - the cashier should never have to hunt
          for the balance. Ours uses the app's own brand accent (sky-* = Nordic Indigo, see
          [[project_color_rebrand_nordic_indigo_laundry_pos]]) instead of the reference's literal
          orange. */}
      {promotion?.fullCash && (
        <p className="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">
          <Gift className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          {isAr ? `العرض "${promotion.name}" يتطلب دفع المبلغ نقدي بالكامل.` : `The promotion "${promotion.name}" requires the full amount paid in cash.`}
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_15rem]">
        <div className="min-w-0 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {selectableMethods.map((m) => (
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
                className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium transition-colors hover:border-sky-300 hover:bg-sky-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <MethodIcon code={m.code} />
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
                      locked: true,
                    })
                  }
                  disabled={totals.due <= 0 || cashbackBlocked}
                  title={
                    cashbackBlocked
                      ? isAr
                        ? "هناك عرض استرداد نقدي فعال حالياً. لا يمكنك استرداد النقاط حتى ينتهي العرض."
                        : "A cash back offer is running - cash back can't be redeemed until it ends."
                      : undefined
                  }
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-700 transition-colors hover:border-amber-300 hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Gift className="h-4 w-4" strokeWidth={2} aria-hidden />
                  {isAr ? cashbackMethod.nameAr : cashbackMethod.nameEn}
                  <span className="ltr-nums text-xs text-amber-500">({formatMoney(customer.cashBack ?? 0, currency, locale)})</span>
                </button>
              );
            })()}
            <button
              onClick={() => (customer ? setBnplOpen(true) : notify(isAr ? "اختر عميلاً أولاً" : "Select a customer first"))}
              disabled={totals.due <= 0}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2.5 text-sm font-medium text-violet-700 transition-colors hover:border-violet-300 hover:bg-violet-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <CalendarClock className="h-4 w-4" strokeWidth={2} aria-hidden />
              {isAr ? "دفع آجل" : "Pay Later"}
            </button>
          </div>

          {/* Reference's own generic "Add Payment Row" button - for a manual split entry rather
              than via one of the quick-tap method tiles above (e.g. starting from an unassigned
              row). Reference renders this as a solid, full-width primary button, not a muted
              dashed outline - matched here since it's a real, frequently-used action, not a
              secondary one. */}
          <button
            type="button"
            onClick={() =>
              store.addPayment({
                paymentMethodId: selectableMethods[0]?.id ?? "",
                label: selectableMethods[0] ? (isAr ? selectableMethods[0].nameAr : selectableMethods[0].nameEn) : "",
                amount: Math.max(0, totals.due),
              })
            }
            disabled={selectableMethods.length === 0}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-sky-600 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-sky-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
            {isAr ? "إضافة سطر دفع" : "Add Payment Row"}
          </button>

          <div className="space-y-2">
            {payments.map((p) => (
              <PaymentRow key={p.id} payment={p} paymentMethods={paymentMethods} selectableMethods={selectableMethods} currency={currency} locale={locale} isAr={isAr} />
            ))}
          </div>

          {totals.availableCredit > 0 && (
            <div className="rounded-lg bg-emerald-50 p-2">
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

          {!customer?.nameAr && (
            <p className="rounded-lg bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
              {isAr
                ? "يحتاج العميل إلى اسم عربي لإصدار فاتورة ضريبية (متطلب ZATCA)."
                : "Customer needs an Arabic name to issue a ZATCA tax invoice."}
            </p>
          )}
        </div>

        {/* Running-totals rail - sticky so it stays in view while the row list grows/scrolls. */}
        <div className="sm:sticky sm:top-0">
          <div className="space-y-3 rounded-xl bg-sky-600 p-4 text-white shadow-sm">
            <SummaryStat isAr={isAr} label={isAr ? "إجمالي الأصناف" : "Total Items"} value={totals.quantityTotal.toLocaleString(locale)} />
            <SummaryStat isAr={isAr} label={isAr ? "الإجمالي المستحق" : "Total Payable"} value={formatMoney(totals.grandTotal, currency, locale)} />
            <SummaryStat isAr={isAr} label={isAr ? "إجمالي المدفوع" : "Total Paying"} value={formatMoney(totals.paid, currency, locale)} />
            {totals.discountTotal > 0 && <SummaryStat isAr={isAr} label={isAr ? "الخصم" : "Discount"} value={formatMoney(totals.discountTotal, currency, locale)} />}
            {changeReturn > 0 && (
              <SummaryStat
                isAr={isAr}
                label={isAr ? "المبلغ المرتجع" : "Change Return"}
                value={formatMoney(changeReturn, currency, locale)}
                title={isAr ? "المبلغ المرتجع للعميل عند دفع زائد" : "Change return is the amount to be returned to the customer if excess payment is done."}
              />
            )}
            <div className="rounded-lg bg-white/15 p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-sky-100">{isAr ? "المتبقي" : "Balance"}</p>
              <p className="ltr-nums text-xl font-extrabold">{formatMoney(totals.due, currency, locale)}</p>
            </div>
          </div>
        </div>
      </div>

      {bnplOpen && (
        <BnplFlowModal
          isAr={isAr}
          currency={currency}
          locale={locale}
          businessLocationId={businessLocationId}
          paymentMethods={paymentMethods}
          customer={customer}
          due={totals.due}
          onAddPayment={store.addPayment}
          notify={notify}
          onClose={() => setBnplOpen(false)}
        />
      )}
    </Modal>
  );
}

function SummaryStat({ label, value, title, isAr }: { label: string; value: string; title?: string; isAr: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-white/15 pb-2 text-sm last:border-0 last:pb-0" title={title} dir={isAr ? "rtl" : "ltr"}>
      <span className="text-sky-100">{label}</span>
      <span className="ltr-nums font-semibold">{value}</span>
    </div>
  );
}

function PaymentRow({
  payment,
  paymentMethods,
  selectableMethods,
  currency,
  locale,
  isAr,
}: {
  payment: PosPayment;
  paymentMethods: PosPaymentMethod[];
  selectableMethods: PosPaymentMethod[];
  currency: string;
  locale: string;
  isAr: boolean;
}) {
  const store = usePosStore();
  const method = paymentMethods.find((m) => m.id === payment.paymentMethodId);
  const isCash = method?.code === "CASH";
  const change = isCash && payment.tendered ? Math.max(0, payment.tendered - payment.amount) : 0;

  if (payment.locked) {
    return (
      <div className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1.5 text-sm">
        <span>{payment.label}</span>
        <span className="ltr-nums">{formatMoney(payment.amount, currency, locale)}</span>
        <button onClick={() => store.removePayment(payment.id)} className="text-slate-400 hover:text-red-500" aria-label="remove">
          <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 p-2">
      <div className="flex items-center gap-2">
        <select
          value={payment.paymentMethodId}
          onChange={(e) => {
            const m = paymentMethods.find((x) => x.id === e.target.value);
            store.updatePayment(payment.id, { paymentMethodId: e.target.value, label: m ? (isAr ? m.nameAr : m.nameEn) : payment.label });
          }}
          className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
        >
          {selectableMethods.map((m) => (
            <option key={m.id} value={m.id}>
              {isAr ? m.nameAr : m.nameEn}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={0}
          step="0.01"
          value={payment.amount || ""}
          onChange={(e) => store.updatePayment(payment.id, { amount: Math.max(0, Number(e.target.value)) })}
          placeholder={isAr ? "المبلغ" : "Amount"}
          className="ltr-nums w-24 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
        />
        <button onClick={() => store.removePayment(payment.id)} className="shrink-0 text-slate-400 hover:text-red-500" aria-label="remove">
          <X className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
      </div>

      {isCash && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          <span className="shrink-0 text-slate-500">{isAr ? "المبلغ المدفوع نقدًا" : "Cash Tendered"}</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={payment.tendered ?? ""}
            onChange={(e) => store.updatePayment(payment.id, { tendered: Number(e.target.value) || undefined })}
            placeholder="0.00"
            className="ltr-nums w-24 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
          />
          {change > 0 && (
            <span className="font-semibold text-emerald-600">
              {isAr ? "الباقي" : "Change"}: {formatMoney(change, currency, locale)}
            </span>
          )}
        </div>
      )}

      <div className="mt-2 flex gap-2">
        <input
          value={payment.referenceNumber ?? ""}
          onChange={(e) => store.updatePayment(payment.id, { referenceNumber: e.target.value || undefined })}
          placeholder={isAr ? "رقم مرجعي" : "Reference No."}
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
        />
        <input
          value={payment.note ?? ""}
          onChange={(e) => store.updatePayment(payment.id, { note: e.target.value || undefined })}
          placeholder={isAr ? "ملاحظة الدفع" : "Payment note"}
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
        />
      </div>
    </div>
  );
}
