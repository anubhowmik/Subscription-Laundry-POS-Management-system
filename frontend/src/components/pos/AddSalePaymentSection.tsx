import { Plus, X } from "lucide-react";
import { usePosStore, usePosTotals } from "../../stores/posStore";
import type { PosPaymentMethod } from "../../api/posApi";
import { formatMoney } from "../../lib/format";
import { cn } from "../../lib/cn";
import { Button } from "../ui/Button";
import { inputClass, selectClass } from "../ui/formClasses";

export interface AddSalePaymentRow {
  id: string;
  paymentMethodId: string;
  amount: number;
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()));

/**
 * Add Sale's own Payment section (`sale_pos/partials/payment_row_form.blade.php`, included
 * directly in `sell/create.blade.php`'s form) - one or more inline Payment Method + Amount rows
 * entered right in the page, finalized by the page's own plain "Save" button. This replaces the
 * touch-grid POS's click-to-pay popup (`InvoicePanel.tsx`'s `PaymentModal`, left untouched there)
 * for Add Sale specifically, matching the reference's real form shape instead of a kiosk-style
 * payment screen. BNPL is deliberately excluded from these rows - it needs its own multi-step
 * verification flow (`BnplFlowModal`) that doesn't fit a plain inline amount field, and the
 * reference's own basic payment row form has no BNPL concept either.
 */
export function AddSalePaymentSection({
  isAr,
  currency,
  locale,
  paymentMethods,
  rows,
  setRows,
}: {
  isAr: boolean;
  currency: string;
  locale: string;
  paymentMethods: PosPaymentMethod[];
  rows: AddSalePaymentRow[];
  setRows: (rows: AddSalePaymentRow[]) => void;
}) {
  const totals = usePosTotals();
  const customer = usePosStore((s) => s.customer);
  const appliedCreditAmount = usePosStore((s) => s.appliedCreditAmount);
  const setAppliedCreditAmount = usePosStore((s) => s.setAppliedCreditAmount);

  const selectablePaymentMethods = paymentMethods.filter((m) => m.code !== "STORE_CREDIT" && !m.code.startsWith("BNPL_"));
  const paidSoFar = rows.reduce((sum, r) => sum + r.amount, 0);
  const balanceDue = Math.max(0, totals.grandTotal - appliedCreditAmount - paidSoFar);

  function addRow() {
    setRows([...rows, { id: uid(), paymentMethodId: selectablePaymentMethods[0]?.id ?? "", amount: balanceDue }]);
  }

  function updateRow(id: string, patch: Partial<AddSalePaymentRow>) {
    setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeRow(id: string) {
    setRows(rows.filter((r) => r.id !== id));
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-700">{isAr ? "الدفع" : "Payment"}</h3>

      {totals.availableCredit > 0 && (
        <div className="rounded-lg bg-emerald-50 p-3">
          <div className="flex items-center justify-between text-xs font-medium text-emerald-700">
            <span>{isAr ? "الرصيد المتاح" : "Store Credit Available"}</span>
            <span className="ltr-nums">{formatMoney(totals.availableCredit, currency, locale)}</span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={Math.min(totals.availableCredit, totals.grandTotal)}
              value={appliedCreditAmount || ""}
              onChange={(e) => setAppliedCreditAmount(Number(e.target.value))}
              placeholder="0.00"
              className={cn(inputClass, "ltr-nums w-40")}
            />
            <Button size="sm" variant="outline" onClick={() => setAppliedCreditAmount(Math.min(totals.availableCredit, totals.grandTotal))}>
              {isAr ? "تطبيق الكل" : "Apply Max"}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center gap-2">
            <select value={row.paymentMethodId} onChange={(e) => updateRow(row.id, { paymentMethodId: e.target.value })} className={cn(selectClass, "flex-1")}>
              {selectablePaymentMethods.map((m) => (
                <option key={m.id} value={m.id}>
                  {isAr ? m.nameAr : m.nameEn}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              step="0.01"
              value={row.amount || ""}
              onChange={(e) => updateRow(row.id, { amount: Number(e.target.value) })}
              className={cn(inputClass, "ltr-nums w-32")}
            />
            <button type="button" onClick={() => removeRow(row.id)} className="shrink-0 text-slate-400 hover:text-red-500" aria-label="remove">
              <X className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
          </div>
        ))}
        {rows.length === 0 && <p className="text-xs text-slate-400">{isAr ? "لم تتم إضافة أي دفعة - سيُسجَّل البيع كمستحق بالكامل" : "No payment rows added - the sale will be recorded as fully due"}</p>}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={addRow} disabled={!customer}>
        <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        {isAr ? "إضافة دفعة" : "Add Payment Row"}
      </Button>

      <div className="flex justify-between border-t border-slate-100 pt-2 text-sm">
        <span className="font-medium text-slate-500">{isAr ? "الرصيد المستحق" : "Balance Due"}</span>
        <span className="ltr-nums font-semibold text-slate-800">{formatMoney(balanceDue, currency, locale)}</span>
      </div>
    </div>
  );
}
