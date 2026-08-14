import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import type { ApiSuccess, PaginationMeta } from "../../types/api";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { formatMoney } from "../../lib/format";
import { useAuth } from "../../contexts/AuthContext";

type Reason = "LOST" | "DAMAGED" | "DELAYED" | "OTHER";
type Status = "PENDING" | "APPROVED" | "REJECTED" | "PAID";

const REASON_LABEL: Record<Reason, { en: string; ar: string }> = {
  LOST: { en: "Lost", ar: "مفقود" },
  DAMAGED: { en: "Damaged", ar: "تالف" },
  DELAYED: { en: "Delayed", ar: "متأخر" },
  OTHER: { en: "Other", ar: "أخرى" },
};

const STATUS_LABEL: Record<Status, { en: string; ar: string; cls: string }> = {
  PENDING: { en: "Pending", ar: "قيد الانتظار", cls: "bg-slate-100 text-slate-600" },
  APPROVED: { en: "Approved", ar: "موافق عليه", cls: "bg-sky-100 text-sky-700" },
  REJECTED: { en: "Rejected", ar: "مرفوض", cls: "bg-red-100 text-red-700" },
  PAID: { en: "Paid", ar: "مدفوع", cls: "bg-green-100 text-green-700" },
};

type ResolutionType = "CASH" | "POINTS" | "COUPON" | "CASHBACK";

const RESOLUTION_LABEL: Record<ResolutionType, { en: string; ar: string; valueLabelEn: string; valueLabelAr: string }> = {
  CASH: { en: "Cash", ar: "نقدي", valueLabelEn: "Amount", valueLabelAr: "المبلغ" },
  POINTS: { en: "Points", ar: "نقاط", valueLabelEn: "Points to award", valueLabelAr: "النقاط الممنوحة" },
  COUPON: { en: "Coupon", ar: "كوبون", valueLabelEn: "Coupon discount amount (SAR)", valueLabelAr: "قيمة خصم الكوبون (ر.س)" },
  CASHBACK: { en: "Cashback", ar: "كاش باك", valueLabelEn: "Cashback amount (SAR)", valueLabelAr: "قيمة الكاش باك (ر.س)" },
};

interface CompensationItemRow {
  id: string;
  saleItemId: string;
  quantity: string;
  reason: Reason;
  claimedAmount: string;
  approvedAmount: string | null;
  saleItem: { descriptionEn: string; descriptionAr: string | null };
}

interface CompensationRow {
  id: string;
  description: string | null;
  claimedAmount: string;
  approvedAmount: string | null;
  status: Status;
  createdAt: string;
  resolutionType: ResolutionType | null;
  resolutionValue: string | null;
  resolutionCoupon: { code: string } | null;
  sale: { invoiceNumber: string };
  items: CompensationItemRow[];
  customer: { nameEn: string; nameAr: string | null };
  createdByUser: { fullNameEn: string };
  resolvedByUser: { fullNameEn: string } | null;
}

export default function CompensationsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { can } = useAuth();
  const { currentLocation } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const locale = isAr ? "ar-SA" : "en-US";
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<Status | "">("");
  const [formOpen, setFormOpen] = useState(false);
  const [payingCompensation, setPayingCompensation] = useState<CompensationRow | null>(null);

  const { data } = useQuery({
    queryKey: ["compensations", statusFilter],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<CompensationRow[]>>("/compensations", { params: { status: statusFilter || undefined, limit: 50 } });
      return { rows: res.data.data, meta: res.data.meta as PaginationMeta };
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async ({
      id,
      status,
      resolutionType,
      resolutionValue,
    }: {
      id: string;
      status: "APPROVED" | "REJECTED" | "PAID";
      resolutionType?: ResolutionType;
      resolutionValue?: number;
    }) => api.put(`/compensations/${id}/resolve`, { status, resolutionType, resolutionValue }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["compensations"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/compensations/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["compensations"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">{isAr ? "التعويضات" : "Compensations"}</h1>
        {can("compensations.file") && (
          <button onClick={() => setFormOpen(true)} className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700">
            + {isAr ? "مطالبة جديدة" : "File Claim"}
          </button>
        )}
      </div>

      <div className="flex gap-2">
        {(["", "PENDING", "APPROVED", "REJECTED", "PAID"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              statusFilter === s ? "bg-sky-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {s === "" ? (isAr ? "الكل" : "All") : isAr ? STATUS_LABEL[s].ar : STATUS_LABEL[s].en}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 text-start">{isAr ? "الفاتورة" : "Invoice"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "العميل" : "Customer"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "الأصناف" : "Items"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "المطالب به" : "Claimed"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "الموافق عليه" : "Approved"}</th>
              <th className="px-4 py-2 text-start">{t("common.status")}</th>
              <th className="px-4 py-2 text-end">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((c) => (
              <tr key={c.id} className="border-b border-slate-100">
                <td className="px-4 py-2 font-medium"><span className="ltr-nums">{c.sale.invoiceNumber}</span></td>
                <td className="px-4 py-2">{isAr ? c.customer.nameAr || c.customer.nameEn : c.customer.nameEn}</td>
                <td className="px-4 py-2 text-xs text-slate-500">
                  {c.items.map((it) => (
                    <div key={it.id}>
                      {isAr ? it.saleItem.descriptionAr || it.saleItem.descriptionEn : it.saleItem.descriptionEn}{" "}
                      <span className="text-slate-400">({isAr ? REASON_LABEL[it.reason].ar : REASON_LABEL[it.reason].en})</span>
                    </div>
                  ))}
                </td>
                <td className="px-4 py-2"><span className="ltr-nums">{formatMoney(c.claimedAmount, currency, locale)}</span></td>
                <td className="px-4 py-2"><span className="ltr-nums">{c.approvedAmount !== null ? formatMoney(c.approvedAmount, currency, locale) : "—"}</span></td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_LABEL[c.status].cls}`}>
                    {isAr ? STATUS_LABEL[c.status].ar : STATUS_LABEL[c.status].en}
                  </span>
                </td>
                <td className="px-4 py-2 text-end">
                  {c.status === "PENDING" && can("compensations.approve") && (
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => resolveMutation.mutate({ id: c.id, status: "APPROVED" })}
                        className="rounded border border-sky-200 px-2 py-1 text-xs text-sky-700 hover:bg-sky-50"
                      >
                        {isAr ? "موافقة" : "Approve"}
                      </button>
                      <button
                        onClick={() => resolveMutation.mutate({ id: c.id, status: "REJECTED" })}
                        className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                      >
                        {isAr ? "رفض" : "Reject"}
                      </button>
                    </div>
                  )}
                  {c.status === "APPROVED" && can("compensations.pay") && (
                    <button
                      onClick={() => setPayingCompensation(c)}
                      className="rounded border border-green-200 px-2 py-1 text-xs text-green-700 hover:bg-green-50"
                    >
                      {isAr ? "تحديد كمدفوع" : "Mark Paid"}
                    </button>
                  )}
                  {c.status === "PAID" && c.resolutionCoupon && (
                    <span className="ltr-nums rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                      {c.resolutionCoupon.code}
                    </span>
                  )}
                  {c.status !== "PAID" && (can("compensations.file") || can("compensations.approve")) && (
                    <button
                      onClick={() => {
                        if (window.confirm(isAr ? "حذف هذه المطالبة؟" : "Delete this claim?")) deleteMutation.mutate(c.id);
                      }}
                      className="ms-1.5 rounded border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50"
                    >
                      {isAr ? "حذف" : "Delete"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {data?.rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  {t("common.noResults")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {formOpen && <ClaimFormModal isAr={isAr} onClose={() => setFormOpen(false)} onSaved={() => setFormOpen(false)} />}

      {payingCompensation && (
        <ResolvePaidModal
          isAr={isAr}
          currency={currency}
          locale={locale}
          compensation={payingCompensation}
          onClose={() => setPayingCompensation(null)}
          onSubmit={(resolutionType, resolutionValue) => {
            resolveMutation.mutate(
              { id: payingCompensation.id, status: "PAID", resolutionType, resolutionValue },
              { onSuccess: () => setPayingCompensation(null) },
            );
          }}
          pending={resolveMutation.isPending}
        />
      )}
    </div>
  );
}

function ResolvePaidModal({
  isAr,
  currency,
  locale,
  compensation,
  onClose,
  onSubmit,
  pending,
}: {
  isAr: boolean;
  currency: string;
  locale: string;
  compensation: CompensationRow;
  onClose: () => void;
  onSubmit: (resolutionType: ResolutionType, resolutionValue: number) => void;
  pending: boolean;
}) {
  const [resolutionType, setResolutionType] = useState<ResolutionType>("CASH");
  const [resolutionValue, setResolutionValue] = useState(compensation.approvedAmount ?? compensation.claimedAmount);

  const canSubmit = Number(resolutionValue) > 0;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-800">{isAr ? "تحديد كمدفوع" : "Mark Paid"}</h3>
            <p className="ltr-nums text-xs text-slate-400">{compensation.sale.invoiceNumber}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "طريقة التسوية" : "Resolution Type"}</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(RESOLUTION_LABEL) as ResolutionType[]).map((rt) => (
                <button
                  key={rt}
                  onClick={() => setResolutionType(rt)}
                  className={`rounded-md border px-2 py-1.5 text-xs font-semibold ${
                    resolutionType === rt ? "border-sky-500 bg-sky-50 text-sky-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {isAr ? RESOLUTION_LABEL[rt].ar : RESOLUTION_LABEL[rt].en}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              {isAr ? RESOLUTION_LABEL[resolutionType].valueLabelAr : RESOLUTION_LABEL[resolutionType].valueLabelEn}
            </label>
            <input
              type="number"
              min={0}
              value={resolutionValue}
              onChange={(e) => setResolutionValue(e.target.value)}
              className={inp}
            />
          </div>
        </div>
        <button
          onClick={() => onSubmit(resolutionType, Number(resolutionValue))}
          disabled={!canSubmit || pending}
          className="mt-4 w-full rounded-md bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {pending ? "…" : isAr ? "تأكيد" : "Confirm"}
        </button>
      </div>
    </div>
  );
}

interface SaleItemPick {
  id: string;
  descriptionEn: string;
  descriptionAr: string | null;
  quantity: string;
}

interface SalePick {
  id: string;
  invoiceNumber: string;
  items: SaleItemPick[];
}

interface ClaimLine {
  key: string;
  saleItemId: string;
  descriptionEn: string;
  descriptionAr: string | null;
  quantity: string;
  reason: Reason;
  claimedAmount: string;
}

function ClaimFormModal({ isAr, onClose, onSaved }: { isAr: boolean; onClose: () => void; onSaved: () => void }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SalePick[]>([]);
  const [picked, setPicked] = useState<SalePick | null>(null);
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<ClaimLine[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function runSearch(value: string) {
    setSearch(value);
    setPicked(null);
    setLines([]);
    if (!value.trim()) return setResults([]);
    const res = await api.get<ApiSuccess<SalePick[]>>("/sales", { params: { search: value, limit: 6 } });
    setResults(res.data.data);
  }

  function addLine(item: SaleItemPick) {
    if (lines.some((l) => l.saleItemId === item.id)) return;
    setLines((prev) => [
      ...prev,
      { key: item.id, saleItemId: item.id, descriptionEn: item.descriptionEn, descriptionAr: item.descriptionAr, quantity: "1", reason: "DAMAGED", claimedAmount: "" },
    ]);
  }
  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }
  function updateLine(key: string, patch: Partial<ClaimLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  const totalClaimed = lines.reduce((sum, l) => sum + (Number(l.claimedAmount) || 0), 0);

  const mutation = useMutation({
    mutationFn: async () =>
      api.post("/compensations", {
        saleId: picked!.id,
        description: description || undefined,
        items: lines.map((l) => ({
          saleItemId: l.saleItemId,
          quantity: Number(l.quantity),
          reason: l.reason,
          claimedAmount: Number(l.claimedAmount),
        })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compensations"] });
      onSaved();
    },
    onError: (err) => setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
  });

  const canSubmit = Boolean(picked) && lines.length > 0 && lines.every((l) => Number(l.quantity) > 0 && Number(l.claimedAmount) >= 0);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800">{isAr ? "مطالبة تعويض جديدة" : "New Compensation Claim"}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="space-y-3">
          <div className="relative">
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "رقم الفاتورة" : "Invoice"}</label>
            <input
              value={picked ? picked.invoiceNumber : search}
              onChange={(e) => runSearch(e.target.value)}
              placeholder={isAr ? "ابحث برقم الفاتورة" : "Search by invoice number"}
              className={inp}
            />
            {results.length > 0 && !picked && (
              <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg">
                {results.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setPicked(s);
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

          {picked && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "أضف صنفًا" : "Add an item"}</label>
              <div className="flex flex-wrap gap-1.5">
                {picked.items.map((item) => {
                  const added = lines.some((l) => l.saleItemId === item.id);
                  return (
                    <button
                      key={item.id}
                      onClick={() => addLine(item)}
                      disabled={added}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                        added ? "border-slate-100 bg-slate-50 text-slate-300" : "border-sky-200 text-sky-700 hover:bg-sky-50"
                      }`}
                    >
                      + {isAr ? item.descriptionAr || item.descriptionEn : item.descriptionEn}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {lines.length > 0 && (
            <div className="rounded-lg border border-slate-200 p-3">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-1 py-1 text-start">{isAr ? "الصنف" : "Item"}</th>
                    <th className="px-1 py-1 text-start">{isAr ? "الكمية" : "Qty"}</th>
                    <th className="px-1 py-1 text-start">{isAr ? "السبب" : "Reason"}</th>
                    <th className="px-1 py-1 text-start">{isAr ? "المبلغ" : "Amount"}</th>
                    <th className="px-1 py-1"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.key} className="border-t border-slate-100">
                      <td className="px-1 py-1">{isAr ? l.descriptionAr || l.descriptionEn : l.descriptionEn}</td>
                      <td className="px-1 py-1">
                        <input
                          type="number"
                          min={0.001}
                          step="0.001"
                          value={l.quantity}
                          onChange={(e) => updateLine(l.key, { quantity: e.target.value })}
                          className="ltr-nums w-16 rounded border border-slate-300 px-1.5 py-1 text-xs"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <select
                          value={l.reason}
                          onChange={(e) => updateLine(l.key, { reason: e.target.value as Reason })}
                          className="rounded border border-slate-300 px-1.5 py-1 text-xs"
                        >
                          {(Object.keys(REASON_LABEL) as Reason[]).map((r) => (
                            <option key={r} value={r}>
                              {isAr ? REASON_LABEL[r].ar : REASON_LABEL[r].en}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-1 py-1">
                        <input
                          type="number"
                          min={0}
                          value={l.claimedAmount}
                          onChange={(e) => updateLine(l.key, { claimedAmount: e.target.value })}
                          className="ltr-nums w-20 rounded border border-slate-300 px-1.5 py-1 text-xs"
                        />
                      </td>
                      <td className="px-1 py-1 text-end">
                        <button onClick={() => removeLine(l.key)} className="text-slate-300 hover:text-red-500" aria-label="remove">
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-2 flex justify-between border-t border-slate-100 pt-2 text-sm font-semibold text-slate-700">
                <span>{isAr ? "الإجمالي" : "Total"}</span>
                <span className="ltr-nums">{totalClaimed.toFixed(2)}</span>
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "الوصف" : "Description"}</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} className={inp} />
          </div>
        </div>
        {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button
          onClick={() => {
            setError(null);
            mutation.mutate();
          }}
          disabled={!canSubmit || mutation.isPending}
          className="mt-4 w-full rounded-md bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {mutation.isPending ? "…" : isAr ? "تقديم" : "Submit"}
        </button>
      </div>
    </div>
  );
}

const inp = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none";
