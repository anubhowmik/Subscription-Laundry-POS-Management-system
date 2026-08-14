import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { ApiSuccess, PaginationMeta } from "../../types/api";
import { formatMoney, formatDate } from "../../lib/format";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { SaleDetailModal } from "../../components/sales/SaleDetailModal";

interface Sale {
  id: string;
  invoiceNumber: string;
  saleDate: string;
  totalAmount: string;
  paidAmount: string;
  dueAmount: string;
  estimatedReadyAt: string | null;
  paymentStatus: "PAID" | "PARTIAL" | "DUE" | "OVERPAID";
  customer: { nameEn: string; nameAr: string; phone: string };
}

const STATUS_STYLES: Record<Sale["paymentStatus"], string> = {
  PAID: "bg-green-100 text-green-700",
  PARTIAL: "bg-amber-100 text-amber-700",
  DUE: "bg-red-100 text-red-700",
  OVERPAID: "bg-blue-100 text-blue-700",
};

export default function SalesPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { currentLocation } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const locale = isAr ? "ar-SA" : "en-US";

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [detailSaleId, setDetailSaleId] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["sales", search, page],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<Sale[]>>("/sales", { params: { search, page, limit: 20 } });
      return { rows: res.data.data, meta: res.data.meta as PaginationMeta };
    },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-800">{t("nav.sales")}</h1>

      <input
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        placeholder={t("common.search")}
        className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm"
      />

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 text-start">{t("pos.invoice")}</th>
              <th className="px-4 py-2 text-start">{t("common.name")}</th>
              <th className="px-4 py-2 text-start">Date</th>
              <th className="px-4 py-2 text-start">{t("pos.total")}</th>
              <th className="px-4 py-2 text-start">{t("pos.due")}</th>
              <th className="px-4 py-2 text-start">{isAr ? "الجاهزية المتوقعة" : "Est. Ready"}</th>
              <th className="px-4 py-2 text-start">{t("common.status")}</th>
              <th className="px-4 py-2 text-start">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((s) => (
              <tr key={s.id} className="border-b border-slate-100">
                <td className="px-4 py-2"><span className="ltr-nums">{s.invoiceNumber}</span></td>
                <td className="px-4 py-2">{isAr ? s.customer.nameAr || s.customer.nameEn : s.customer.nameEn}</td>
                <td className="px-4 py-2"><span className="ltr-nums">{formatDate(s.saleDate, locale)}</span></td>
                <td className="px-4 py-2"><span className="ltr-nums">{formatMoney(s.totalAmount, currency, locale)}</span></td>
                <td className="px-4 py-2"><span className="ltr-nums">{formatMoney(s.dueAmount, currency, locale)}</span></td>
                <td className="px-4 py-2 text-xs text-slate-500">
                  <span className="ltr-nums">{s.estimatedReadyAt ? new Date(s.estimatedReadyAt).toLocaleString(locale) : "-"}</span>
                </td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[s.paymentStatus]}`}>{s.paymentStatus}</span>
                </td>
                <td className="px-4 py-2">
                  <div className="flex gap-3">
                    <button onClick={() => setDetailSaleId(s.id)} className="text-xs font-medium text-sky-700 hover:underline">
                      {isAr ? "الحالة" : "Status"}
                    </button>
                    <Link to={`/invoices/${s.id}`} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-sky-700 hover:underline">
                      {t("pos.invoice")}
                    </Link>
                  </div>
                </td>
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

      {data?.meta && data.meta.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm text-slate-600">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40">
            ‹
          </button>
          <span>
            {t("common.page")} {page} {t("common.of")} {data.meta.totalPages}
          </span>
          <button
            disabled={page >= data.meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
          >
            ›
          </button>
        </div>
      )}

      {detailSaleId && <SaleDetailModal saleId={detailSaleId} onClose={() => setDetailSaleId(null)} />}
    </div>
  );
}
