import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { cn } from "../../lib/cn";
import { PageHeader } from "../../components/ui/PageHeader";
import { Alert } from "../../components/ui/Alert";
import { inputClass } from "../../components/ui/formClasses";
import { ymd } from "../../components/ui/DateRangeFilter";
import { errorMessage } from "../paymentAccounts/shared";
import {
  useReportAppScope,
  scopeParams,
  BaseFilterFields,
  FilterField,
  ReportDataTable,
  amountColumn,
  baseFilterParams,
  initialBaseFilters,
  pickName,
  useReportOptions,
  useReportOrgSettings,
  type BaseReportFilters,
  type Named,
  type ReportColumn,
} from "./reportShared";

type Pair = { sales: string; lfl: string };
interface Row extends Named {
  key: string;
  regions: Record<string, Pair>;
  total: Pair;
}
interface ReportData {
  startDate: string;
  endDate: string;
  previousStartDate: string;
  previousEndDate: string;
  regions: ({ key: string } & Named)[];
  rows: Row[];
  totals: { regions: Record<string, Pair>; total: Pair };
}
interface Filters extends BaseReportFilters {
  start: string;
  /** Month period only: the reference's free end date (the server widens both ends to whole months). */
  end: string;
}

const TITLES = {
  week: { en: "Weekly LFL Sales Report", ar: "تقرير مبيعات LFL الأسبوعي", path: "weekly-lfl-sales" },
  month: { en: "Monthly LFL Sales Report", ar: "تقرير مبيعات LFL الشهري", path: "monthly-lfl-sales" },
} as const;

/** Reference default: this Monday (Carbon's startOfWeek). */
function thisMonday() {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return ymd(d);
}
const addDays = (s: string, n: number) => {
  const [y, m, d] = s.split("-").map(Number);
  return ymd(new Date(y, m - 1, d + n));
};
/** Reference default: the current month (startOfMonth ~ endOfMonth). */
function thisMonth() {
  const d = new Date();
  return { start: ymd(new Date(d.getFullYear(), d.getMonth(), 1)), end: ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
}

/**
 * Reference: Sales Reports > Weekly / Monthly LFL Sales Report (report/weekly_lfl_sales_report.blade.php).
 * Rows are main categories; each region gets a "Sales" / "LFL" (same period last year) column pair.
 */
export default function LflSalesReportPage({ period }: { period: "week" | "month" }) {
  const { i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const appScope = useReportAppScope();
  const { fiscalYearStartMonth } = useReportOrgSettings();
  const defaults = period === "week" ? { start: thisMonday(), end: "" } : thisMonth();
  const defaultStart = defaults.start;
  const initial = (): Filters => ({ ...initialBaseFilters(fiscalYearStartMonth), ...defaults });
  const [filters, setFilters] = useState<Filters>(initial);
  const t = TITLES[period];

  const params = (f: Filters) => {
    const { from: _from, to: _to, ...rest } = baseFilterParams(f);
    return { ...rest, from: f.start, ...(period === "month" ? { to: f.end } : {}) };
  };
  const { data: options } = useReportOptions();
  const { data: report, isFetching, error } = useQuery({
    queryKey: ["reports", t.path, params(filters), appScope],
    queryFn: async () => (await api.get<ApiSuccess<ReportData>>(`/reports/${t.path}`, { params: { ...params(filters), ...scopeParams(appScope) } })).data.data,
    enabled: Boolean(filters.start),
    retry: false,
  });

  const totals = report?.totals;
  const regionColumns = (report?.regions ?? []).flatMap((r) => {
    const name = pickName(r, isAr);
    return [
      amountColumn<Row>(`${r.key}|sales`, isAr ? `مبيعات ${name}` : `${name} Sales`, (row) => row.regions[r.key].sales, totals?.regions[r.key]?.sales),
      amountColumn<Row>(`${r.key}|lfl`, isAr ? `LFL ${name}` : `${name} LFL`, (row) => row.regions[r.key].lfl, totals?.regions[r.key]?.lfl),
    ];
  });
  const columns: ReportColumn<Row>[] = [
    { key: "category", label: isAr ? "القسم الرئيسي" : "Main Category", render: (r) => <span className="font-medium text-slate-800">{pickName(r, isAr)}</span>, exportValue: (r) => pickName(r, isAr) },
    ...regionColumns,
    amountColumn<Row>("totalSales", isAr ? "إجمالي المبيعات" : "Total Sales", (r) => r.total.sales, totals?.total.sales),
    amountColumn<Row>("totalLfl", isAr ? "إجمالي LFL" : "Total LFL", (r) => r.total.lfl, totals?.total.lfl),
  ];
  // TOTAL row label, as the reference's.
  if (totals) columns[0] = { ...columns[0], total: { render: isAr ? "المجموع" : "TOTAL", exportValue: isAr ? "المجموع" : "TOTAL" } };

  const title = isAr ? t.ar : t.en;
  const periodText = report ? `${report.startDate} ~ ${report.endDate}` : "";
  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        subtitle={report ? `${periodText} · ${isAr ? "مقارنة بـ" : "LFL"} ${report.previousStartDate} ~ ${report.previousEndDate}` : undefined}
      />
      {error && <Alert variant="danger">{errorMessage(error, isAr)}</Alert>}
      <ReportDataTable
        storageKey={t.path}
        title={`${title} ${periodText}`}
        columns={columns}
        rows={report?.rows ?? []}
        rowKey={(r) => r.key}
        isLoading={isFetching}
        isAr={isAr}
        activeFilterCount={(filters.start !== defaultStart || filters.end !== defaults.end ? 1 : 0) + (filters.locationGroupId ? 1 : 0) + (filters.locationIds.length ? 1 : 0)}
        onClearFilters={() => setFilters(initial())}
        filters={
          <BaseFilterFields
            value={filters}
            onChange={(v) => setFilters({ ...filters, ...v })}
            options={options}
            isAr={isAr}
            fiscalYearStartMonth={fiscalYearStartMonth}
            singleLocation
            hideDateRange
            afterLocation={
              <FilterField label={isAr ? "نطاق التاريخ" : "Date Range"}>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    aria-label={isAr ? "من" : "From"}
                    value={filters.start}
                    onChange={(e) => e.target.value && setFilters({ ...filters, start: e.target.value })}
                    className={cn(inputClass, "ltr-nums")}
                  />
                  {period === "week" ? (
                    // Reference forces a 7-day week: the end follows the start.
                    <input type="date" aria-label={isAr ? "إلى" : "To"} value={addDays(filters.start, 6)} readOnly disabled className={cn(inputClass, "ltr-nums")} />
                  ) : (
                    <input
                      type="date"
                      aria-label={isAr ? "إلى" : "To"}
                      value={filters.end}
                      min={filters.start}
                      onChange={(e) => e.target.value && setFilters({ ...filters, end: e.target.value })}
                      className={cn(inputClass, "ltr-nums")}
                    />
                  )}
                </div>
                {period === "week" && <p className="mt-1 text-xs text-slate-500">{isAr ? "يجب أن يكون الأسبوع 7 أيام" : "The week must be 7 days"}</p>}
              </FilterField>
            }
          />
        }
      />
    </div>
  );
}
