import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Boxes, Tags } from "lucide-react";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { cn } from "../../lib/cn";
import { PageHeader } from "../../components/ui/PageHeader";
import { Alert } from "../../components/ui/Alert";
import { errorMessage } from "../paymentAccounts/shared";
import {
  useReportAppScope,
  scopeParams,
  BaseFilterFields,
  ReportDataTable,
  amountColumn,
  baseActiveCount,
  baseFilterParams,
  branchLabel,
  initialBaseFilters,
  useReportOptions,
  useReportOrgSettings,
  type BaseReportFilters,
  type ReportColumn,
  type ReportLocationFilters,
} from "./reportShared";

interface Named {
  key: string;
  nameEn: string;
  nameAr: string | null;
}
type Cells = Record<string, { qty: string; amount: string }>;
interface Row {
  locationId: string;
  branchName: string;
  branchNameAr: string | null;
  branchCode: string;
  sales: string;
  customers: number;
  cells: Cells;
}
interface TabData {
  rows: Row[];
  totals: { sales: string; customers: number; cells: Cells };
}
interface ReportData {
  startDate: string;
  endDate: string;
  filters: ReportLocationFilters;
  items: Named[];
  categories: Named[];
  byProducts: TabData;
  byCategories: TabData;
}

/** Reference: Reports > Daily Products Report (report/daily_products_report.blade.php). */
export default function DailyProductsReportPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const appScope = useReportAppScope();
  const { fiscalYearStartMonth } = useReportOrgSettings();
  const [filters, setFilters] = useState<BaseReportFilters>(() => initialBaseFilters(fiscalYearStartMonth));
  const [tab, setTab] = useState<"products" | "categories">("products");

  const { data: options } = useReportOptions();
  const { data: report, isFetching, error } = useQuery({
    queryKey: ["reports", "daily-products", baseFilterParams(filters), appScope],
    queryFn: async () => (await api.get<ApiSuccess<ReportData>>("/reports/daily-products", { params: { ...baseFilterParams(filters), ...scopeParams(appScope) } })).data.data,
    enabled: Boolean(filters.range.from && filters.range.to),
    retry: false,
  });

  const data = report ? (tab === "products" ? report.byProducts : report.byCategories) : null;
  const itemColumns = report ? (tab === "products" ? report.items : report.categories) : [];
  const name = (x: Named) => (isAr ? x.nameAr || x.nameEn : x.nameEn);
  // Categories tab counts customers as whole numbers; the products tab keeps the reference's 2 decimals.
  const customers = (n: number) => (tab === "categories" ? String(n) : n.toFixed(2));

  const columns: ReportColumn<Row>[] = [
    { key: "location", label: isAr ? "موقع العمل" : "Business Location", render: (r) => <span className="font-medium text-slate-800">{branchLabel(r, isAr)}</span>, exportValue: (r) => branchLabel(r, isAr) },
    amountColumn("sales", isAr ? "المبيعات" : "Sales", (r) => r.sales, data?.totals.sales),
    {
      key: "customers",
      label: isAr ? "إجمالي العملاء" : "Total Customers",
      render: (r) => <span className="ltr-nums">{customers(r.customers)}</span>,
      exportValue: (r) => customers(r.customers),
      ...(data ? { total: { render: <span className="ltr-nums">{customers(data.totals.customers)}</span>, exportValue: customers(data.totals.customers) } } : {}),
    },
    ...itemColumns.flatMap((c) => [
      amountColumn<Row>(`${c.key}|qt`, `${name(c)} · QT`, (r) => r.cells[c.key].qty, data?.totals.cells[c.key]?.qty),
      amountColumn<Row>(`${c.key}|ta`, `${name(c)} · TA`, (r) => r.cells[c.key].amount, data?.totals.cells[c.key]?.amount),
    ]),
  ];

  const tabs = (
    <div className="flex gap-6 border-b border-slate-100 px-4 pt-3">
      {(
        [
          ["products", Boxes, isAr ? "التقرير حسب المنتجات" : "Report by products"],
          ["categories", Tags, isAr ? "التقرير حسب الفئات" : "Report by categories"],
        ] as const
      ).map(([key, Icon, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => setTab(key)}
          className={cn(
            "-mb-px flex items-center gap-2 border-b-2 pb-2.5 text-sm font-semibold transition-colors",
            tab === key ? "border-sky-600 text-sky-600" : "border-transparent text-slate-500 hover:text-slate-700",
          )}
        >
          <Icon className="h-4 w-4" strokeWidth={2} aria-hidden /> {label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader title={isAr ? "تـقرير حركه يومي" : "Daily Products Report"} />
      {error && <Alert variant="danger">{errorMessage(error, isAr)}</Alert>}
      <ReportDataTable
        storageKey="daily-products"
        title={`${isAr ? "تـقرير حركه يومي" : "Daily Products Report"} - ${tab === "products" ? (isAr ? "حسب المنتجات" : "By Products") : isAr ? "حسب الفئات" : "By Categories"} ${filters.range.from} ~ ${filters.range.to}`}
        columns={columns}
        rows={data?.rows ?? []}
        rowKey={(r) => r.locationId}
        isLoading={isFetching}
        isAr={isAr}
        activeFilterCount={baseActiveCount(filters)}
        onClearFilters={() => setFilters(initialBaseFilters(fiscalYearStartMonth))}
        filters={<BaseFilterFields value={filters} onChange={setFilters} options={options} isAr={isAr} fiscalYearStartMonth={fiscalYearStartMonth} />}
        above={tabs}
      />
    </div>
  );
}
