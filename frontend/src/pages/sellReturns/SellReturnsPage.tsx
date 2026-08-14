import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import type { ApiSuccess, PaginationMeta } from "../../types/api";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { usePaymentMethods } from "../../api/posApi";
import { formatMoney } from "../../lib/format";

type Reason = "NOT_WASHABLE" | "DAMAGED" | "NOT_FOUND" | "OTHER";

const REASON_LABEL: Record<Reason, { en: string; ar: string }> = {
  NOT_WASHABLE: { en: "Not Washable", ar: "غير قابل للغسيل" },
  DAMAGED: { en: "Damaged", ar: "تالف" },
  NOT_FOUND: { en: "Not Found", ar: "غير موجود" },
  OTHER: { en: "Other", ar: "أخرى" },
};

interface SellReturnRow {
  id: string;
  creditNoteNumber: string | null;
  returnDate: string;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  refundedAmount: string;
  sale: { invoiceNumber: string };
  customer: { nameEn: string; nameAr: string | null };
  businessLocation: { branchName: string };
  createdByUser: { fullNameEn: string };
  items: { id: string; quantity: string; reason: Reason; saleItem: { descriptionEn: string; descriptionAr: string | null } }[];
}

export default function SellReturnsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { currentLocation } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const locale = isAr ? "ar-SA" : "en-US";
  const qc = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["sell-returns"],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<SellReturnRow[]>>("/sell-returns", { params: { limit: 50 } });
      return { rows: res.data.data, meta: res.data.meta as PaginationMeta };
    },
  });

  const voidMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/sell-returns/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sell-returns"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">{isAr ? "مرتجعات المبيعات" : "Sales Returns"}</h1>
        <button onClick={() => setFormOpen(true)} className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700">
          + {isAr ? "مرتجع جديد" : "New Return"}
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 text-start">{isAr ? "التاريخ" : "Date"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "إشعار دائن" : "Credit Note"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "الفاتورة" : "Invoice"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "العميل" : "Customer"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "الأصناف" : "Items"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "الإجمالي" : "Total"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "المسترد" : "Refunded"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "بواسطة" : "By"}</th>
              <th className="px-4 py-2 text-start"></th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100">
                <td className="px-4 py-2 text-xs text-slate-500"><span className="ltr-nums">{new Date(r.returnDate).toLocaleString(isAr ? "ar-SA" : "en-US")}</span></td>
                <td className="px-4 py-2 font-medium"><span className="ltr-nums">{r.creditNoteNumber ?? "-"}</span></td>
                <td className="px-4 py-2 font-medium"><span className="ltr-nums">{r.sale.invoiceNumber}</span></td>
                <td className="px-4 py-2">{isAr ? r.customer.nameAr || r.customer.nameEn : r.customer.nameEn}</td>
                <td className="px-4 py-2">
                  {r.items.map((item) => (
                    <div key={item.id} className="text-xs text-slate-600">
                      {isAr ? item.saleItem.descriptionAr || item.saleItem.descriptionEn : item.saleItem.descriptionEn}
                      <span className="ltr-nums text-slate-400"> × {item.quantity}</span> —{" "}
                      <span className="text-slate-400">{isAr ? REASON_LABEL[item.reason].ar : REASON_LABEL[item.reason].en}</span>
                    </div>
                  ))}
                </td>
                <td className="px-4 py-2"><span className="ltr-nums">{formatMoney(r.totalAmount, currency, locale)}</span></td>
                <td className="px-4 py-2"><span className="ltr-nums">{formatMoney(r.refundedAmount, currency, locale)}</span></td>
                <td className="px-4 py-2 text-slate-500">{r.createdByUser.fullNameEn}</td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => {
                      if (window.confirm(isAr ? "هل تريد إلغاء هذا المرتجع؟ سيتم عكس المخزون والرصيد." : "Void this return? Stock and balance will be reversed.")) {
                        voidMutation.mutate(r.id);
                      }
                    }}
                    className="text-xs text-red-600 hover:underline"
                  >
                    {isAr ? "إلغاء" : "Void"}
                  </button>
                </td>
              </tr>
            ))}
            {data?.rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                  {t("common.noResults")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {formOpen && (
        <ReturnFormModal
          isAr={isAr}
          currency={currency}
          locale={locale}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["sell-returns"] });
            setFormOpen(false);
          }}
        />
      )}
    </div>
  );
}

interface SalePick {
  id: string;
  invoiceNumber: string;
}

interface ReturnableSale {
  id: string;
  invoiceNumber: string;
  customer: { nameEn: string; nameAr: string | null };
  items: {
    id: string;
    descriptionEn: string;
    descriptionAr: string | null;
    quantity: string;
    unitPrice: string;
    alreadyReturned: string;
    remaining: string;
  }[];
}

interface SelectedLine {
  saleItemId: string;
  quantity: number;
  reason: Reason;
  note?: string;
}

function ReturnFormModal({
  isAr,
  currency,
  locale,
  onClose,
  onSaved,
}: {
  isAr: boolean;
  currency: string;
  locale: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data: paymentMethods } = usePaymentMethods();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SalePick[]>([]);
  const [saleId, setSaleId] = useState<string | null>(null);
  const [lines, setLines] = useState<Record<string, SelectedLine>>({});
  const [refundedAmount, setRefundedAmount] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: sale } = useQuery({
    queryKey: ["returnable-sale", saleId],
    queryFn: async () => (await api.get<ApiSuccess<ReturnableSale>>(`/sell-returns/sale/${saleId}`)).data.data,
    enabled: Boolean(saleId),
  });

  async function runSearch(value: string) {
    setSearch(value);
    if (!value.trim()) return setResults([]);
    const res = await api.get<ApiSuccess<SalePick[]>>("/sales", { params: { search: value, limit: 6 } });
    setResults(res.data.data);
  }

  function toggleLine(itemId: string, remaining: number) {
    setLines((prev) => {
      const next = { ...prev };
      if (next[itemId]) delete next[itemId];
      else next[itemId] = { saleItemId: itemId, quantity: remaining, reason: "DAMAGED" };
      return next;
    });
  }

  function updateLine(itemId: string, patch: Partial<SelectedLine>) {
    setLines((prev) => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }));
  }

  const mutation = useMutation({
    mutationFn: async () =>
      api.post("/sell-returns", {
        saleId,
        items: Object.values(lines).map((l) => ({ saleItemId: l.saleItemId, quantity: l.quantity, reason: l.reason, note: l.note || undefined })),
        refundedAmount: refundedAmount ? Number(refundedAmount) : undefined,
        paymentMethodId: paymentMethodId || undefined,
        notes: notes || undefined,
      }),
    onSuccess: onSaved,
    onError: (err) => setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
  });

  const canSubmit = Boolean(saleId) && Object.keys(lines).length > 0 && Object.values(lines).every((l) => l.quantity > 0);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800">{isAr ? "مرتجع جديد" : "New Sales Return"}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        {!saleId && (
          <div className="relative">
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "رقم الفاتورة" : "Invoice"}</label>
            <input
              value={search}
              onChange={(e) => runSearch(e.target.value)}
              placeholder={isAr ? "ابحث برقم الفاتورة" : "Search by invoice number"}
              className={inp}
            />
            {results.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg">
                {results.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setSaleId(s.id);
                      setResults([]);
                    }}
                    className="block w-full px-3 py-1.5 text-start text-sm hover:bg-sky-50"
                  >
                    {s.invoiceNumber}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {sale && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              {sale.invoiceNumber} — {isAr ? sale.customer.nameAr || sale.customer.nameEn : sale.customer.nameEn}
            </p>

            <div className="space-y-2">
              {sale.items.map((item) => {
                const remaining = Number(item.remaining);
                const selected = lines[item.id];
                return (
                  <div key={item.id} className={`rounded-lg border p-2.5 ${remaining <= 0 ? "border-slate-100 bg-slate-50 opacity-50" : "border-slate-200"}`}>
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                      <input
                        type="checkbox"
                        disabled={remaining <= 0}
                        checked={Boolean(selected)}
                        onChange={() => toggleLine(item.id, remaining)}
                      />
                      {isAr ? item.descriptionAr || item.descriptionEn : item.descriptionEn}
                      <span className="ltr-nums text-xs text-slate-400">
                        ({isAr ? "المتبقي" : "remaining"}: {item.remaining} / {item.quantity})
                      </span>
                    </label>
                    {selected && (
                      <div className="mt-2 grid grid-cols-3 gap-2 ps-6">
                        <input
                          type="number"
                          min={0.01}
                          max={remaining}
                          step="0.01"
                          value={selected.quantity}
                          onChange={(e) => updateLine(item.id, { quantity: Number(e.target.value) })}
                          className={inp}
                        />
                        <select value={selected.reason} onChange={(e) => updateLine(item.id, { reason: e.target.value as Reason })} className={inp}>
                          {(Object.keys(REASON_LABEL) as Reason[]).map((r) => (
                            <option key={r} value={r}>
                              {isAr ? REASON_LABEL[r].ar : REASON_LABEL[r].en}
                            </option>
                          ))}
                        </select>
                        <input
                          value={selected.note ?? ""}
                          onChange={(e) => updateLine(item.id, { note: e.target.value })}
                          placeholder={isAr ? "ملاحظة" : "Note"}
                          className={inp}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "المبلغ المسترد نقدًا" : "Cash Refunded"}</label>
                <input type="number" min={0} value={refundedAmount} onChange={(e) => setRefundedAmount(e.target.value)} placeholder="0" className={inp} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "طريقة الدفع" : "Payment Method"}</label>
                <select value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)} className={inp}>
                  <option value="">{isAr ? "بلا (رصيد للعميل)" : "None (store credit)"}</option>
                  {paymentMethods?.map((m) => (
                    <option key={m.id} value={m.id}>
                      {isAr ? m.nameAr : m.nameEn}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "ملاحظات" : "Notes"}</label>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inp} />
            </div>
          </div>
        )}

        {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {sale && (
          <button
            onClick={() => {
              setError(null);
              mutation.mutate();
            }}
            disabled={!canSubmit || mutation.isPending}
            className="mt-4 w-full rounded-md bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {mutation.isPending ? "…" : isAr ? "تقديم المرتجع" : "Submit Return"}
          </button>
        )}
      </div>
    </div>
  );
}

const inp = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none";
