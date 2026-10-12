import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { usePosStore, usePosTotals, type DiscountMode } from "../../stores/posStore";
import { useCouponApply } from "./useCouponApply";
import { CouponOtpStep } from "./CouponOtpStep";
import { PromotionPicker } from "./PromotionPicker";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { formatMoney } from "../../lib/format";
import { cn } from "../../lib/cn";
import { Button } from "../ui/Button";
import { inputClass, inputSmClass, labelClass, selectClass } from "../ui/formClasses";
import { TAX_EXEMPTION_REASON_CODES, TAX_EXEMPTION_REASONS } from "../../lib/taxExemptionReasons";

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

/**
 * Add Sale's discount/reward-points/order-tax/sell-note/additional-expenses section
 * (`sell/create.blade.php`, the widget right below the line-items table) - a full-width, always
 * visible form section, unlike the touch-grid POS's compact collapsible "Discount, shipping &
 * totals" popover (`InvoicePanel.tsx`'s `FooterSummary`, left untouched there).
 */
export function AddSaleTotalsSection({
  isAr,
  currency,
  locale,
  businessLocationId,
  mode,
  notify,
}: {
  isAr: boolean;
  currency: string;
  locale: string;
  businessLocationId: string;
  mode?: "SERVICE" | "PRODUCT";
  notify: (msg: string) => void;
}) {
  const totals = usePosTotals();
  const {
    invoiceDiscountMode,
    invoiceDiscountValue,
    shipping,
    redeemPoints,
    customer,
    note,
    coupon,
    customFields,
    additionalExpenses,
    taxExemptionReasonCode,
    setInvoiceDiscount,
    setShipping,
    setRedeemPoints,
    setNote,
    setCoupon,
    setCustomField,
    setAdditionalExpense,
    setTaxExemptionReasonCode,
  } = usePosStore();
  const availablePoints = customer?.rewardPoints ?? 0;
  const sellCustomFieldLabels = useSellCustomFieldLabels(isAr);
  const couponFlow = useCouponApply({ isAr, businessLocationId, mode, notify });
  const [couponCode, setCouponCode] = useState("");

  async function applyCoupon() {
    if (await couponFlow.apply(couponCode)) setCouponCode("");
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className={labelClass}>{isAr ? "نوع الخصم" : "Discount Type"}</label>
          <select value={invoiceDiscountMode} onChange={(e) => setInvoiceDiscount(e.target.value as DiscountMode, invoiceDiscountValue)} className={selectClass}>
            <option value="FIXED">{isAr ? "ثابت" : "Fixed"}</option>
            <option value="PERCENT">{isAr ? "نسبة مئوية" : "Percentage"}</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>{isAr ? "قيمة الخصم" : "Discount Amount"}</label>
          <input type="number" min={0} value={invoiceDiscountValue || ""} onChange={(e) => setInvoiceDiscount(invoiceDiscountMode, Number(e.target.value))} className={cn(inputClass, "ltr-nums")} />
        </div>
        <div>
          <label className={labelClass}>{isAr ? "الشحن" : "Shipping"}</label>
          <input type="number" min={0} value={shipping || ""} onChange={(e) => setShipping(Number(e.target.value))} className={cn(inputClass, "ltr-nums")} />
        </div>
        <div>
          <label className={labelClass} title={isAr ? `متاح: ${availablePoints}` : `Available: ${availablePoints}`}>
            {isAr ? "استرداد النقاط" : "Redeem Points"}
          </label>
          <input
            type="number"
            min={0}
            max={availablePoints}
            value={redeemPoints || ""}
            onChange={(e) => setRedeemPoints(Number(e.target.value))}
            disabled={availablePoints === 0}
            className={cn(inputClass, "ltr-nums disabled:opacity-50")}
          />
        </div>
      </div>

      {/* Reference sell/create.blade.php's promotion box (select + Apply / Cancel). */}
      <PromotionPicker isAr={isAr} businessLocationId={businessLocationId} mode={mode} notify={notify} variant="inline" />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className={labelClass}>{isAr ? "قسيمة خصم" : "Coupon"}</label>
          {coupon ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              <span className="min-w-0 truncate">
                <span className="font-mono font-semibold">{coupon.code}</span>
                <span className="ltr-nums ms-1.5 text-xs">−{coupon.discountAmount.toFixed(2)}</span>
              </span>
              <button
                onClick={() => {
                  setCoupon(null);
                  notify(isAr ? "تم إلغاء قسيمة الخصم" : "Coupon cancelled");
                }}
                className="text-emerald-600 hover:text-emerald-900"
                title={isAr ? "الغاء قسيمة الخصم" : "Cancel Coupon"}
              >
                <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              </button>
            </div>
          ) : (
            <div className="flex gap-1">
              <input
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && applyCoupon()}
                placeholder={isAr ? "قسيمة خصم" : "Coupon"}
                className={cn(inputSmClass, "flex-1 font-mono")}
              />
              <Button size="sm" variant="outline" onClick={applyCoupon} disabled={couponFlow.pending || !couponCode.trim()}>
                {isAr ? "تطبيق" : "Apply"}
              </Button>
            </div>
          )}
          {couponFlow.otpFor && !coupon && <CouponOtpStep flow={couponFlow} isAr={isAr} className="mt-2" />}
        </div>

        <div>
          <label className={labelClass}>{isAr ? "سبب الإعفاء الضريبي" : "Tax Exemption Reason"}</label>
          <select value={taxExemptionReasonCode ?? ""} onChange={(e) => setTaxExemptionReasonCode(e.target.value || null)} className={selectClass}>
            <option value="">{isAr ? "لا يوجد" : "None"}</option>
            {TAX_EXEMPTION_REASON_CODES.map((code) => (
              <option key={code} value={code}>
                {code} — {isAr ? TAX_EXEMPTION_REASONS[code].ar : TAX_EXEMPTION_REASONS[code].en}
              </option>
            ))}
          </select>
        </div>

        {sellCustomFieldLabels.map((label, i) => (
          <div key={i}>
            <label className={labelClass}>{label}</label>
            <input value={customFields[i] ?? ""} onChange={(e) => setCustomField(i, e.target.value)} className={inputClass} />
          </div>
        ))}
      </div>

      <div>
        <label className={labelClass}>{isAr ? "ملاحظة البيع" : "Sell Note"}</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder={isAr ? "اختياري" : "Optional"} className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>{isAr ? "مصاريف إضافية" : "Additional Expenses"}</label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {additionalExpenses.map((slot, i) => (
            <div key={i} className="flex gap-1">
              <input
                value={slot.key}
                onChange={(e) => setAdditionalExpense(i, { ...slot, key: e.target.value })}
                placeholder={isAr ? `اسم المصروف ${i + 1}` : `Expense name ${i + 1}`}
                className={cn(inputClass, "min-w-0 flex-1")}
              />
              <input
                type="number"
                min={0}
                value={slot.value || ""}
                onChange={(e) => setAdditionalExpense(i, { ...slot, value: Number(e.target.value) })}
                placeholder="0.00"
                className={cn(inputClass, "ltr-nums w-28")}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-1 border-t border-slate-100 pt-3 text-sm sm:w-80 sm:ms-auto">
        <SummaryRow label={isAr ? "المجموع الفرعي" : "Subtotal"} value={formatMoney(totals.subtotal, currency, locale)} />
        <SummaryRow label={isAr ? "الخصم" : "Discount"} value={`− ${formatMoney(totals.discountTotal, currency, locale)}`} />
        <SummaryRow label={isAr ? "الضريبة" : "Tax"} value={formatMoney(totals.taxAmount, currency, locale)} />
        {totals.additionalExpensesTotal > 0 && (
          <SummaryRow label={isAr ? "مصاريف إضافية" : "Additional Expenses"} value={formatMoney(totals.additionalExpensesTotal, currency, locale)} />
        )}
        <div className="col-span-2 mt-1 flex justify-between border-t border-slate-100 pt-1 text-base font-bold text-slate-800">
          <span>{isAr ? "الإجمالي" : "Total"}</span>
          <span className="ltr-nums">{formatMoney(totals.grandTotal, currency, locale)}</span>
        </div>
      </div>
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
