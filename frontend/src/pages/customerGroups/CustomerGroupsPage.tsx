import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import type { ApiSuccess, PaginationMeta } from "../../types/api";
import { usePriceLists } from "../../api/posApi";

interface CustomerGroupRow {
  id: string;
  nameEn: string;
  nameAr: string;
  description: string | null;
  discountPercent: string;
  creditLimit: string;
  paymentTermsDays: number;
  priceListId: string | null;
  maxAmountPerMonth: string | null;
  maxInvoicesPerMonth: number | null;
  maxQtyPerMonth: string | null;
  status: "ACTIVE" | "INACTIVE";
}

export default function CustomerGroupsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerGroupRow | null>(null);

  const { data } = useQuery({
    queryKey: ["customer-groups", search],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<CustomerGroupRow[]>>("/customer-groups", { params: { search: search || undefined, limit: 50 } });
      return { rows: res.data.data, meta: res.data.meta as PaginationMeta };
    },
  });
  const { data: priceLists } = usePriceLists();

  const deactivateMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/customer-groups/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customer-groups"] }),
  });

  function priceListName(id: string | null) {
    if (!id) return "—";
    const pl = priceLists?.find((p) => p.id === id);
    if (!pl) return "—";
    return isAr ? pl.nameAr || pl.nameEn : pl.nameEn;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">{isAr ? "مجموعات العملاء" : "Customer Groups"}</h1>
        <button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
        >
          + {isAr ? "مجموعة جديدة" : "Add Group"}
        </button>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("common.search")}
        className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm"
      />

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 text-start">{isAr ? "الاسم" : "Name"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "نسبة الخصم" : "Discount %"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "حد الائتمان" : "Credit Limit"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "شروط الدفع (يوم)" : "Payment Terms (days)"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "قائمة الأسعار" : "Price List"}</th>
              <th className="px-4 py-2 text-start">{t("common.status")}</th>
              <th className="px-4 py-2 text-end">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((g) => (
              <tr key={g.id} className="border-b border-slate-100">
                <td className="px-4 py-2 font-medium">{isAr ? g.nameAr || g.nameEn : g.nameEn}</td>
                <td className="px-4 py-2"><span className="ltr-nums">{g.discountPercent}%</span></td>
                <td className="px-4 py-2"><span className="ltr-nums">{g.creditLimit}</span></td>
                <td className="px-4 py-2"><span className="ltr-nums">{g.paymentTermsDays}</span></td>
                <td className="px-4 py-2">{priceListName(g.priceListId)}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${g.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                    {g.status === "ACTIVE" ? t("common.active") : t("common.inactive")}
                  </span>
                </td>
                <td className="px-4 py-2 text-end">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => {
                        setEditing(g);
                        setFormOpen(true);
                      }}
                      className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                    >
                      {isAr ? "تعديل" : "Edit"}
                    </button>
                    {g.status === "ACTIVE" && (
                      <button
                        onClick={() => {
                          if (window.confirm(isAr ? `تعطيل "${g.nameEn}"؟` : `Deactivate "${g.nameEn}"?`)) deactivateMutation.mutate(g.id);
                        }}
                        className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                      >
                        {isAr ? "تعطيل" : "Deactivate"}
                      </button>
                    )}
                  </div>
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

      {formOpen && (
        <GroupFormModal
          isAr={isAr}
          editing={editing}
          priceLists={priceLists ?? []}
          onClose={() => setFormOpen(false)}
          onSaved={() => setFormOpen(false)}
        />
      )}
    </div>
  );
}

function GroupFormModal({
  isAr,
  editing,
  priceLists,
  onClose,
  onSaved,
}: {
  isAr: boolean;
  editing: CustomerGroupRow | null;
  priceLists: { id: string; nameEn: string; nameAr: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [nameEn, setNameEn] = useState(editing?.nameEn ?? "");
  const [nameAr, setNameAr] = useState(editing?.nameAr ?? "");
  const [discountPercent, setDiscountPercent] = useState(editing?.discountPercent ?? "0");
  const [creditLimit, setCreditLimit] = useState(editing?.creditLimit ?? "0");
  const [paymentTermsDays, setPaymentTermsDays] = useState(String(editing?.paymentTermsDays ?? 0));
  const [priceListId, setPriceListId] = useState(editing?.priceListId ?? "");
  const [maxAmountPerMonth, setMaxAmountPerMonth] = useState(editing?.maxAmountPerMonth ?? "");
  const [maxInvoicesPerMonth, setMaxInvoicesPerMonth] = useState(editing?.maxInvoicesPerMonth != null ? String(editing.maxInvoicesPerMonth) : "");
  const [maxQtyPerMonth, setMaxQtyPerMonth] = useState(editing?.maxQtyPerMonth ?? "");
  const [error, setError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        nameEn,
        nameAr,
        discountPercent: Number(discountPercent || 0),
        creditLimit: Number(creditLimit || 0),
        paymentTermsDays: Number(paymentTermsDays || 0),
        priceListId: priceListId || null,
        maxAmountPerMonth: maxAmountPerMonth ? Number(maxAmountPerMonth) : null,
        maxInvoicesPerMonth: maxInvoicesPerMonth ? Number(maxInvoicesPerMonth) : null,
        maxQtyPerMonth: maxQtyPerMonth ? Number(maxQtyPerMonth) : null,
      };
      if (editing) return api.put(`/customer-groups/${editing.id}`, payload);
      return api.post("/customer-groups", payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer-groups"] });
      onSaved();
    },
    onError: (err) => {
      setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong");
    },
  });

  const canSubmit = nameEn.trim().length > 0 && nameAr.trim().length > 0;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800">
            {editing ? (isAr ? "تعديل المجموعة" : "Edit Group") : isAr ? "مجموعة جديدة" : "Add Group"}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "الاسم (إنجليزي)" : "Name (English)"}</label>
              <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} autoFocus className={inp} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "الاسم (عربي)" : "Name (Arabic)"}</label>
              <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" className={inp} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "خصم %" : "Discount %"}</label>
              <input type="number" min={0} max={100} value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} className={inp} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "حد الائتمان" : "Credit Limit"}</label>
              <input type="number" min={0} value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} className={inp} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "شروط الدفع" : "Terms (days)"}</label>
              <input type="number" min={0} value={paymentTermsDays} onChange={(e) => setPaymentTermsDays(e.target.value)} className={inp} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "قائمة الأسعار" : "Price List"}</label>
            <select value={priceListId} onChange={(e) => setPriceListId(e.target.value)} className={inp}>
              <option value="">{isAr ? "بلا" : "None"}</option>
              {priceLists.map((pl) => (
                <option key={pl.id} value={pl.id}>
                  {isAr ? pl.nameAr || pl.nameEn : pl.nameEn}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-slate-600">{isAr ? "الحدود الشهرية للمجموعة (اختياري)" : "Monthly group caps (optional)"}</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-[11px] text-slate-500">{isAr ? "المبلغ" : "Amount"}</label>
                <input type="number" min={0} value={maxAmountPerMonth} onChange={(e) => setMaxAmountPerMonth(e.target.value)} placeholder={isAr ? "بلا حد" : "No limit"} className={inp} />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-slate-500">{isAr ? "الفواتير" : "Invoices"}</label>
                <input type="number" min={0} value={maxInvoicesPerMonth} onChange={(e) => setMaxInvoicesPerMonth(e.target.value)} placeholder={isAr ? "بلا حد" : "No limit"} className={inp} />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-slate-500">{isAr ? "الكمية" : "Quantity"}</label>
                <input type="number" min={0} value={maxQtyPerMonth} onChange={(e) => setMaxQtyPerMonth(e.target.value)} placeholder={isAr ? "بلا حد" : "No limit"} className={inp} />
              </div>
            </div>
          </div>
        </div>
        {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button
          onClick={() => {
            setError(null);
            saveMutation.mutate();
          }}
          disabled={!canSubmit || saveMutation.isPending}
          className="mt-4 w-full rounded-md bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {saveMutation.isPending ? "…" : isAr ? "حفظ" : "Save"}
        </button>
      </div>
    </div>
  );
}

const inp = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none";
