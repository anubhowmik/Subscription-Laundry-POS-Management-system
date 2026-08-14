import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import type { ApiSuccess, PaginationMeta } from "../../types/api";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { formatMoney } from "../../lib/format";

interface PostingRow {
  id: string;
  postingDate: string;
  status: "PENDING" | "CONFIRMED";
  cashInDrawer: string;
  inStockCount: number;
  inStockTotal: string;
  inWarehouseCount: number;
  inWarehouseTotal: string;
  outStockCount: number;
  outStockTotal: string;
  businessLocation: { branchName: string };
  createdByUser: { fullNameEn: string };
}

export default function InventoryPostingsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { currentLocation } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const locale = isAr ? "ar-SA" : "en-US";
  const qc = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["inventory-postings"],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<PostingRow[]>>("/inventory-postings", { params: { limit: 50 } });
      return { rows: res.data.data, meta: res.data.meta as PaginationMeta };
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">{isAr ? "جرد المخزون" : "Inventory Counting"}</h1>
        <button onClick={() => setFormOpen(true)} className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700">
          + {isAr ? "تسجيل جرد جديد" : "New Posting"}
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 text-start">{isAr ? "التاريخ" : "Date"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "الفرع" : "Branch"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "في المتجر" : "In Stock"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "في المستودع" : "In Warehouse"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "تم التسليم" : "Out Stock"}</th>
              <th className="px-4 py-2 text-start">{isAr ? "النقد بالدرج" : "Cash in Drawer"}</th>
              <th className="px-4 py-2 text-start">{t("common.status")}</th>
              <th className="px-4 py-2 text-start">{isAr ? "بواسطة" : "By"}</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((p) => (
              <tr key={p.id} className="border-b border-slate-100">
                <td className="px-4 py-2 text-xs text-slate-500"><span className="ltr-nums">{new Date(p.postingDate).toLocaleString(isAr ? "ar-SA" : "en-US")}</span></td>
                <td className="px-4 py-2">{p.businessLocation.branchName}</td>
                <td className="px-4 py-2">
                  <span className="ltr-nums">{p.inStockCount} <span className="text-slate-400">({formatMoney(p.inStockTotal, currency, locale)})</span></span>
                </td>
                <td className="px-4 py-2">
                  <span className="ltr-nums">{p.inWarehouseCount} <span className="text-slate-400">({formatMoney(p.inWarehouseTotal, currency, locale)})</span></span>
                </td>
                <td className="px-4 py-2">
                  <span className="ltr-nums">{p.outStockCount} <span className="text-slate-400">({formatMoney(p.outStockTotal, currency, locale)})</span></span>
                </td>
                <td className="px-4 py-2"><span className="ltr-nums">{formatMoney(p.cashInDrawer, currency, locale)}</span></td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${p.status === "CONFIRMED" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                    {p.status === "CONFIRMED" ? (isAr ? "مؤكد" : "Confirmed") : (isAr ? "معلق" : "Pending")}
                  </span>
                </td>
                <td className="px-4 py-2 text-slate-500">{p.createdByUser.fullNameEn}</td>
              </tr>
            ))}
            {data?.rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                  {t("common.noResults")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {formOpen && (
        <PostingFormModal
          isAr={isAr}
          currency={currency}
          locale={locale}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["inventory-postings"] });
            setFormOpen(false);
          }}
        />
      )}
    </div>
  );
}

interface Snapshot {
  inStockCount: number;
  inStockTotal: string;
  inWarehouseCount: number;
  inWarehouseTotal: string;
  outStockCount: number;
  outStockTotal: string;
}

function PostingFormModal({
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
  const { locations, currentLocationId } = useBusinessLocation();
  const [businessLocationId, setBusinessLocationId] = useState(currentLocationId ?? "");
  const [cashInDrawer, setCashInDrawer] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: snapshot, isFetching } = useQuery({
    queryKey: ["posting-preview", businessLocationId],
    queryFn: async () => (await api.get<ApiSuccess<Snapshot>>("/inventory-postings/preview", { params: { businessLocationId } })).data.data,
    enabled: Boolean(businessLocationId),
  });

  const mutation = useMutation({
    mutationFn: async () =>
      api.post("/inventory-postings", {
        businessLocationId,
        cashInDrawer: cashInDrawer ? Number(cashInDrawer) : undefined,
        notes: notes || undefined,
      }),
    onSuccess: onSaved,
    onError: (err) => setError(isAxiosError(err) ? err.response?.data?.message ?? (isAr ? "حدث خطأ ما" : "Something went wrong") : isAr ? "حدث خطأ ما" : "Something went wrong"),
  });

  const canSubmit = Boolean(businessLocationId) && Boolean(snapshot);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800">{isAr ? "تسجيل جرد جديد" : "New Inventory Posting"}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "الفرع" : "Branch"}</label>
            <select value={businessLocationId} onChange={(e) => setBusinessLocationId(e.target.value)} className={inp}>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.branchName}
                </option>
              ))}
            </select>
          </div>

          {isFetching && <p className="text-xs text-slate-400">{isAr ? "جارٍ الحساب..." : "Computing..."}</p>}

          {snapshot && (
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-center">
                <p className="text-xs font-semibold text-emerald-700">{isAr ? "في المتجر" : "In Stock"}</p>
                <p className="ltr-nums text-lg font-bold text-emerald-800">{snapshot.inStockCount}</p>
                <p className="ltr-nums text-xs text-emerald-600">{formatMoney(snapshot.inStockTotal, currency, locale)}</p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center">
                <p className="text-xs font-semibold text-amber-700">{isAr ? "في المستودع" : "In Warehouse"}</p>
                <p className="ltr-nums text-lg font-bold text-amber-800">{snapshot.inWarehouseCount}</p>
                <p className="ltr-nums text-xs text-amber-600">{formatMoney(snapshot.inWarehouseTotal, currency, locale)}</p>
              </div>
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center">
                <p className="text-xs font-semibold text-red-700">{isAr ? "تم التسليم" : "Out Stock"}</p>
                <p className="ltr-nums text-lg font-bold text-red-800">{snapshot.outStockCount}</p>
                <p className="ltr-nums text-xs text-red-600">{formatMoney(snapshot.outStockTotal, currency, locale)}</p>
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "النقد بالدرج" : "Cash in Drawer"}</label>
            <input type="number" min={0} value={cashInDrawer} onChange={(e) => setCashInDrawer(e.target.value)} placeholder="0" className={inp} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{isAr ? "ملاحظات" : "Notes"}</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inp} />
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
          {mutation.isPending ? "…" : isAr ? "حفظ الجرد" : "Save Posting"}
        </button>
      </div>
    </div>
  );
}

const inp = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none";
