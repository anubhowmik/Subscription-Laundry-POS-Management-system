import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { ApiSuccess, PaginationMeta } from "../../types/api";
import { formatMoney, formatDate } from "../../lib/format";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { SaleDetailModal } from "../../components/sales/SaleDetailModal";
import { PageHeader } from "../../components/ui/PageHeader";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Pagination } from "../../components/ui/Pagination";
import { StatCard } from "../../components/ui/StatCard";
import { TableContainer, TableToolbar, TableScroll, Table, THead, Th } from "../../components/ui/Table";
import { SearchInput } from "../../components/ui/SearchInput";
import { Receipt } from "lucide-react";
import { useCurrentApp } from "../../components/layout/Sidebar";

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

const STATUS_VARIANT: Record<Sale["paymentStatus"], "success" | "warning" | "danger" | "info"> = {
  PAID: "success",
  PARTIAL: "warning",
  DUE: "danger",
  OVERPAID: "info",
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
  // Est. Ready is only ever set for a sale with a service line (see pos.service.ts) - it's always
  // "-" for every row in Product POS, so hide the column there instead of showing a dash for the
  // whole table. Same pattern as ReportsPage.tsx/DashboardPage.tsx.
  const hideEstimatedReady = useCurrentApp()?.key === "posProduct";

  const { data } = useQuery({
    queryKey: ["sales", search, page],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<Sale[]>>("/sales", { params: { search, page, limit: 20 } });
      return { rows: res.data.data, meta: res.data.meta as PaginationMeta };
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader title={t("nav.sales")} />

      {data?.meta && (
        <div className="grid grid-cols-1 gap-4 sm:max-w-xs">
          <StatCard icon={Receipt} cardBg="bg-app-pos-500" iconBg="bg-white/20" iconColor="text-white" highlight label={t("nav.sales")} value={String(data.meta.total)} />
        </div>
      )}

      <TableContainer>
        <TableToolbar>
          <SearchInput
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={t("common.search")}
            className="max-w-xs"
          />
        </TableToolbar>
        <TableScroll>
        <Table>
          <THead>
            <tr>
              <Th>{t("pos.invoice")}</Th>
              <Th>{t("common.name")}</Th>
              <Th>Date</Th>
              <Th>{t("pos.total")}</Th>
              <Th>{t("pos.due")}</Th>
              {!hideEstimatedReady && <Th>{isAr ? "الجاهزية المتوقعة" : "Est. Ready"}</Th>}
              <Th>{t("common.status")}</Th>
              <Th>{t("common.actions")}</Th>
            </tr>
          </THead>
          <tbody>
            {data?.rows.map((s) => (
              <tr key={s.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-3"><span className="ltr-nums">{s.invoiceNumber}</span></td>
                <td className="px-4 py-3">{isAr ? s.customer.nameAr || s.customer.nameEn : s.customer.nameEn}</td>
                <td className="px-4 py-3"><span className="ltr-nums">{formatDate(s.saleDate, locale)}</span></td>
                <td className="px-4 py-3"><span className="ltr-nums">{formatMoney(s.totalAmount, currency, locale)}</span></td>
                <td className="px-4 py-3"><span className="ltr-nums">{formatMoney(s.dueAmount, currency, locale)}</span></td>
                {!hideEstimatedReady && (
                  <td className="px-4 py-3 text-xs text-slate-500">
                    <span className="ltr-nums">{s.estimatedReadyAt ? new Date(s.estimatedReadyAt).toLocaleString(locale) : "-"}</span>
                  </td>
                )}
                <td className="px-4 py-3">
                  <Badge variant={STATUS_VARIANT[s.paymentStatus]}>{s.paymentStatus}</Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setDetailSaleId(s.id)}>
                      {isAr ? "الحالة" : "Status"}
                    </Button>
                    <Link
                      to={`/invoices/${s.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-200"
                    >
                      {t("pos.invoice")}
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {data?.rows.length === 0 && (
              <tr>
                <td colSpan={hideEstimatedReady ? 7 : 8} className="px-4 py-8 text-center text-slate-400">
                  {t("common.noResults")}
                </td>
              </tr>
            )}
          </tbody>
        </Table>
        </TableScroll>
      </TableContainer>

      {data?.meta && (
        <Pagination
          page={page}
          totalPages={data.meta.totalPages}
          onPrev={() => setPage((p) => p - 1)}
          onNext={() => setPage((p) => p + 1)}
          label={`${t("common.page")} ${page} ${t("common.of")} ${data.meta.totalPages}`}
        />
      )}

      {detailSaleId && <SaleDetailModal saleId={detailSaleId} onClose={() => setDetailSaleId(null)} />}
    </div>
  );
}
