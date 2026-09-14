import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { ApiSuccess, PaginationMeta } from "../../types/api";
import type { RegisterLedgerRow, RegisterSessionRow } from "../../api/posApi";
import { useBusinessLocation } from "../../contexts/LocationContext";
import { formatMoney } from "../../lib/format";
import { cn } from "../../lib/cn";
import { PageHeader } from "../../components/ui/PageHeader";
import { Badge } from "../../components/ui/Badge";
import { Pagination } from "../../components/ui/Pagination";
import { StatCard } from "../../components/ui/StatCard";
import { TableContainer, TableToolbar, TableScroll, Table, THead, Th, SortableTh } from "../../components/ui/Table";
import { PageSizeSelect, TableExportButtons, ColumnVisibilityMenu } from "../../components/ui/TableToolbarControls";
import { fetchAllRows } from "../../lib/tableExport";
import { useColumnVisibility } from "../../hooks/useColumnVisibility";
import { Archive } from "lucide-react";
import type { ReactNode } from "react";

export default function RegisterSessionsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const locale = isAr ? "ar-SA" : "en-US";
  const { currentLocation, currentLocationId } = useBusinessLocation();
  const currency = currentLocation?.currency ?? "SAR";
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  // Backend whitelist (registerSession.service.ts's REGISTER_SESSION_SORTABLE_FIELDS) only
  // covers openedAt/closedAt/cashDifference - the other columns below stay unsortable.
  const [sortBy, setSortBy] = useState("openedAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  function handleSort(field: string) {
    if (sortBy === field) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSortBy(field);
      setSortOrder("asc");
    }
  }

  // Shared with the "export all matching rows" fetch below - keep every filter param here so
  // export always reflects exactly what's currently on screen, just without the page cap.
  const filterParams = {
    businessLocationId: currentLocationId,
    sortBy,
    sortOrder,
  };

  const { data } = useQuery({
    queryKey: ["register-sessions", page, limit, filterParams],
    queryFn: async () => {
      const res = await api.get<ApiSuccess<RegisterSessionRow[]>>("/register-sessions", {
        params: { ...filterParams, page, limit },
      });
      return { rows: res.data.data, meta: res.data.meta as PaginationMeta };
    },
    enabled: Boolean(currentLocationId),
  });

  const columns: { key: string; label: string; sortField?: string; render: (s: RegisterSessionRow) => ReactNode; exportValue: (s: RegisterSessionRow) => string | number | null }[] = [
    {
      key: "openedAt",
      label: isAr ? "الفتح" : "Opened",
      sortField: "openedAt",
      render: (s) => <span className="ltr-nums">{new Date(s.openedAt).toLocaleString(locale)}</span>,
      exportValue: (s) => new Date(s.openedAt).toLocaleString(locale),
    },
    {
      key: "closedAt",
      label: isAr ? "الإغلاق" : "Closed",
      sortField: "closedAt",
      render: (s) => <span className="ltr-nums">{s.closedAt ? new Date(s.closedAt).toLocaleString(locale) : "-"}</span>,
      exportValue: (s) => (s.closedAt ? new Date(s.closedAt).toLocaleString(locale) : null),
    },
    {
      key: "openingCashAmount",
      label: isAr ? "الافتتاحي" : "Opening",
      render: (s) => <span className="ltr-nums">{formatMoney(s.openingCashAmount, currency, locale)}</span>,
      exportValue: (s) => Number(s.openingCashAmount),
    },
    {
      key: "expectedCashAmount",
      label: isAr ? "المتوقع" : "Expected",
      render: (s) => <span className="ltr-nums">{s.expectedCashAmount !== null ? formatMoney(s.expectedCashAmount, currency, locale) : "-"}</span>,
      exportValue: (s) => (s.expectedCashAmount !== null ? Number(s.expectedCashAmount) : null),
    },
    {
      key: "countedCashAmount",
      label: isAr ? "المعدود" : "Counted",
      render: (s) => <span className="ltr-nums">{s.countedCashAmount !== null ? formatMoney(s.countedCashAmount, currency, locale) : "-"}</span>,
      exportValue: (s) => (s.countedCashAmount !== null ? Number(s.countedCashAmount) : null),
    },
    {
      key: "cashDifference",
      label: isAr ? "الفرق" : "Difference",
      sortField: "cashDifference",
      render: (s) => {
        const diff = s.cashDifference !== null ? Number(s.cashDifference) : null;
        return (
          <span className={cn("font-medium", diff === null ? "" : diff === 0 ? "text-green-600" : diff > 0 ? "text-sky-600" : "text-red-600")}>
            <span className="ltr-nums">{diff !== null ? formatMoney(diff, currency, locale) : "-"}</span>
          </span>
        );
      },
      exportValue: (s) => (s.cashDifference !== null ? Number(s.cashDifference) : null),
    },
    {
      key: "status",
      label: t("common.status"),
      render: (s) => <Badge variant={s.status === "OPEN" ? "success" : "neutral"}>{s.status === "OPEN" ? (isAr ? "مفتوح" : "Open") : isAr ? "مغلق" : "Closed"}</Badge>,
      exportValue: (s) => (s.status === "OPEN" ? (isAr ? "مفتوح" : "Open") : isAr ? "مغلق" : "Closed"),
    },
  ];
  const columnVisibility = useColumnVisibility("register-sessions", columns.map((c) => c.key));
  const visibleColumns = columns.filter((c) => columnVisibility.isVisible(c.key));

  return (
    <div className="space-y-6">
      <PageHeader title={isAr ? "جلسات الصندوق" : "Register Sessions"} />

      <div className="grid grid-cols-1 gap-4 sm:max-w-xs">
        <StatCard
          icon={Archive}
          cardBg="bg-app-pos-500"
          iconBg="bg-white/20"
          iconColor="text-white"
          highlight
          label={isAr ? "جلسات الصندوق" : "Register Sessions"}
          value={String(data?.meta.total ?? 0)}
        />
      </div>

      <TableContainer>
        <TableToolbar>
          <div className="ms-auto flex items-center gap-1.5">
            <span className="text-xs text-slate-500">{isAr ? "عرض" : "Show"}</span>
            <PageSizeSelect
              value={limit}
              onChange={(n) => {
                setLimit(n);
                setPage(1);
              }}
            />
            <ColumnVisibilityMenu
              columns={columns.map((c) => ({ key: c.key, label: c.label }))}
              isVisible={columnVisibility.isVisible}
              onToggle={columnVisibility.toggle}
              isAr={isAr}
            />
            <TableExportButtons
              title={isAr ? "جلسات الصندوق" : "Register Sessions"}
              columns={visibleColumns.map((c) => ({ key: c.key, label: c.label }))}
              getRows={async () => {
                const all = await fetchAllRows<RegisterSessionRow>(async (p, l) => {
                  const res = await api.get<ApiSuccess<RegisterSessionRow[]>>("/register-sessions", { params: { ...filterParams, page: p, limit: l } });
                  return { data: res.data.data, meta: res.data.meta as PaginationMeta };
                });
                return all.map((s) => Object.fromEntries(visibleColumns.map((c) => [c.key, c.exportValue(s)])));
              }}
              isAr={isAr}
            />
          </div>
        </TableToolbar>
        <TableScroll>
          <Table>
            <THead>
              <tr>
                {visibleColumns.map((c) =>
                  c.sortField ? (
                    <SortableTh key={c.key} field={c.sortField} sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort}>
                      {c.label}
                    </SortableTh>
                  ) : (
                    <Th key={c.key}>{c.label}</Th>
                  ),
                )}
                <Th></Th>
              </tr>
            </THead>
            <tbody>
              {data?.rows.map((s) => (
                <Fragment key={s.id}>
                  <tr
                    className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50/60"
                    onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                  >
                    {visibleColumns.map((c) => (
                      <td key={c.key} className="px-4 py-3">
                        {c.render(s)}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-xs text-sky-600">{expandedId === s.id ? (isAr ? "إخفاء" : "Hide") : isAr ? "التفاصيل" : "Details"}</td>
                  </tr>
                  {expandedId === s.id && (
                    <tr className="border-b border-slate-100 bg-slate-50/60">
                      <td colSpan={visibleColumns.length + 1} className="px-4 py-3">
                        <LedgerDrilldown sessionId={s.id} currency={currency} locale={locale} isAr={isAr} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {data?.rows.length === 0 && (
                <tr>
                  <td colSpan={visibleColumns.length + 1} className="px-4 py-8 text-center text-slate-400">
                    {t("common.noResults")}
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </TableScroll>
      </TableContainer>

      {data?.meta && data.meta.totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={data.meta.totalPages}
          onPrev={() => setPage((p) => p - 1)}
          onNext={() => setPage((p) => p + 1)}
          label={`${t("common.page")} ${page} ${t("common.of")} ${data.meta.totalPages}`}
        />
      )}
    </div>
  );
}

const REFERENCE_LABELS: Record<string, { en: string; ar: string }> = {
  INITIAL_FLOAT: { en: "Opening float", ar: "الرصيد الافتتاحي" },
  SALE_PAYMENT: { en: "Sale payment", ar: "دفعة بيع" },
  REFUND: { en: "Refund", ar: "استرجاع" },
};

function LedgerDrilldown({ sessionId, currency, locale, isAr }: { sessionId: string; currency: string; locale: string; isAr: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ["register-sessions", sessionId, "ledger"],
    queryFn: async () => (await api.get<ApiSuccess<RegisterLedgerRow[]>>(`/register-sessions/${sessionId}/ledger`)).data.data,
  });

  if (isLoading) return <p className="text-xs text-slate-400">{isAr ? "جارٍ التحميل..." : "Loading..."}</p>;
  if (!data || data.length === 0) return <p className="text-xs text-slate-400">{isAr ? "لا توجد حركات" : "No transactions"}</p>;

  return (
    <table className="w-full text-xs">
      <thead className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        <tr>
          <th className="px-2 py-1.5 text-start">{isAr ? "الوقت" : "Time"}</th>
          <th className="px-2 py-1.5 text-start">{isAr ? "النوع" : "Type"}</th>
          <th className="px-2 py-1.5 text-start">{isAr ? "المرجع" : "Reference"}</th>
          <th className="px-2 py-1.5 text-start">{isAr ? "طريقة الدفع" : "Method"}</th>
          <th className="px-2 py-1.5 text-start">{isAr ? "المبلغ" : "Amount"}</th>
        </tr>
      </thead>
      <tbody>
        {data.map((tx) => {
          const label = tx.referenceType ? REFERENCE_LABELS[tx.referenceType] : undefined;
          return (
            <tr key={tx.id} className="border-t border-slate-100">
              <td className="px-2 py-1.5 text-slate-500">
                <span className="ltr-nums">{new Date(tx.createdAt).toLocaleTimeString(locale)}</span>
              </td>
              <td className="px-2 py-1.5">
                <span className={tx.type === "CREDIT" ? "text-green-600" : "text-red-600"}>
                  {tx.type === "CREDIT" ? (isAr ? "دائن" : "Credit") : isAr ? "مدين" : "Debit"}
                </span>
              </td>
              <td className="px-2 py-1.5 text-slate-600">{label ? (isAr ? label.ar : label.en) : (tx.referenceType ?? "-")}</td>
              <td className="px-2 py-1.5 text-slate-500">{tx.paymentMethod}</td>
              <td className={cn("px-2 py-1.5 font-medium", tx.type === "CREDIT" ? "text-green-700" : "text-red-700")}>
                <span className="ltr-nums">
                  {tx.type === "DEBIT" ? "-" : ""}
                  {formatMoney(tx.amount, currency, locale)}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
