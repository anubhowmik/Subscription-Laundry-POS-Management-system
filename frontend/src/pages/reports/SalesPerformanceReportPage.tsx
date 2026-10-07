import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { cn } from "../../lib/cn";
import { useAuth } from "../../contexts/AuthContext";
import { PageHeader } from "../../components/ui/PageHeader";
import { Alert } from "../../components/ui/Alert";
import { selectClass } from "../../components/ui/formClasses";
import { errorMessage } from "../paymentAccounts/shared";
import {
  useReportAppScope,
  scopeParams,
  BaseFilterFields,
  FilterField,
  ReportDataTable,
  baseFilterParams,
  exportAmount,
  initialBaseFilters,
  num,
  pickName,
  useReportOptions,
  useReportOrgSettings,
  type BaseReportFilters,
  type Named,
  type ReportColumn,
} from "./reportShared";

interface Figures {
  target: string;
  targetMtd: string;
  actualMtd: string;
  varianceMtd: string | null;
  mtm: string | null;
  targetYtd: string;
  actualYtd: string;
  varianceYtd: string | null;
  yty: string | null;
}
type Row = Figures & Named & { key: string };
interface ReportData {
  year: number;
  compareYear: number;
  month: number;
  rows: Row[];
  totals: Figures;
}
interface Filters extends BaseReportFilters {
  year: number;
  compareYear: number;
  month: number;
}

/** Reference: Sales Reports > Sales Performance Report (report/sales_performance_report.blade.php). */
export default function SalesPerformanceReportPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const appScope = useReportAppScope();
  const { can } = useAuth();
  const { fiscalYearStartMonth } = useReportOrgSettings();
  const now = new Date();
  const thisYear = now.getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => thisYear - i);
  const monthName = (m: number) => new Intl.DateTimeFormat(isAr ? "ar" : "en", { month: "long", calendar: "gregory" }).format(new Date(2000, m - 1, 1));
  const initial = (): Filters => ({ ...initialBaseFilters(fiscalYearStartMonth), year: thisYear, compareYear: thisYear - 1, month: now.getMonth() + 1 });
  const [filters, setFilters] = useState<Filters>(initial);

  const params = (f: Filters) => {
    const { from: _from, to: _to, ...rest } = baseFilterParams(f);
    return { ...rest, year: f.year, compareYear: f.compareYear, month: f.month };
  };
  const { data: options } = useReportOptions();
  const { data: report, isFetching, error } = useQuery({
    queryKey: ["reports", "sales-performance", params(filters), appScope],
    queryFn: async () => (await api.get<ApiSuccess<ReportData>>("/reports/sales-performance", { params: { ...params(filters), ...scopeParams(appScope) } })).data.data,
    retry: false,
  });

  const n = report?.totals;
  const y = report?.year ?? filters.year;
  const cy = report?.compareYear ?? filters.compareYear;
  const money = (key: "target" | "targetMtd" | "actualMtd" | "targetYtd" | "actualYtd", label: string): ReportColumn<Row> => ({
    key,
    label,
    render: (r) => num(r[key]),
    exportValue: (r) => exportAmount(r[key]),
    ...(n ? { total: { render: num(n[key]), exportValue: exportAmount(n[key]) } } : {}),
  });
  const pctNode = (v: string | null) => (v === null ? "-" : <span className={cn("ltr-nums", Number(v) < 0 ? "text-red-600" : "text-emerald-700")}>{v}%</span>);
  const pct = (key: "varianceMtd" | "mtm" | "varianceYtd" | "yty", label: string): ReportColumn<Row> => ({
    key,
    label,
    render: (r) => pctNode(r[key]),
    exportValue: (r) => (r[key] === null ? "-" : `${r[key]}%`),
    ...(n ? { total: { render: pctNode(n[key]), exportValue: n[key] === null ? "-" : `${n[key]}%` } } : {}),
  });
  const columns: ReportColumn<Row>[] = [
    {
      key: "category",
      label: isAr ? "الفئة" : "Category",
      render: (r) => <span className="font-medium text-slate-800">{pickName(r, isAr)}</span>,
      exportValue: (r) => pickName(r, isAr),
      ...(n ? { total: { render: isAr ? "المجموع" : "TOTAL", exportValue: isAr ? "المجموع" : "TOTAL" } } : {}),
    },
    money("target", isAr ? "الهدف" : "Target"),
    money("targetMtd", isAr ? "هدف الشهر" : "Target MTD"),
    money("actualMtd", isAr ? "الفعلي للشهر" : "Actual MTD"),
    pct("varianceMtd", isAr ? "انحراف الشهر %" : "Variance MTD %"),
    pct("mtm", isAr ? `مبيعات الشهر (${y} مقابل ${cy})` : `Sales MTM (${y} vs ${cy})`),
    money("targetYtd", isAr ? "هدف السنة" : "Target YTD"),
    money("actualYtd", isAr ? "الفعلي للسنة" : "Actual YTD"),
    pct("varianceYtd", isAr ? "انحراف السنة %" : "Variance YTD %"),
    pct("yty", isAr ? `مبيعات السنة (${y} مقابل ${cy})` : `Sales YTY (${y} vs ${cy})`),
  ];

  const yearSelect = (value: number, onChange: (v: number) => void) => (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))} className={cn(selectClass, "w-full ltr-nums")}>
      {years.map((yr) => (
        <option key={yr} value={yr}>
          {yr}
        </option>
      ))}
    </select>
  );
  const title = isAr ? "تقرير أداء المبيعات" : "Sales Performance Report";
  const noTargets = report && report.rows.length === 0;
  return (
    <div className="space-y-6">
      <PageHeader title={title} subtitle={`${monthName(filters.month)} ${y} · ${isAr ? "مقارنة بـ" : "vs"} ${cy}`} />
      {error && <Alert variant="danger">{errorMessage(error, isAr)}</Alert>}
      {noTargets && (
        <Alert variant="info">
          {isAr ? "يعرض هذا التقرير الفئات الرئيسية التي لها هدف مبيعات. حدد الأهداف من صفحة " : "This report lists main categories that have a sales target. Set targets on the "}
          {can("categories.view", "services.view") ? (
            <Link to="/categories" className="font-semibold underline">
              {isAr ? "الفئات" : "Categories"}
            </Link>
          ) : (
            <span className="font-semibold">{isAr ? "الفئات" : "Categories"}</span>
          )}
          {isAr ? "." : " page."}
        </Alert>
      )}
      <ReportDataTable
        storageKey="sales-performance"
        title={`${title} - ${monthName(filters.month)} ${y} vs ${cy}`}
        columns={columns}
        rows={report?.rows ?? []}
        rowKey={(r) => r.key}
        isLoading={isFetching}
        isAr={isAr}
        activeFilterCount={
          (filters.locationGroupId ? 1 : 0) +
          (filters.locationIds.length ? 1 : 0) +
          (filters.year !== thisYear ? 1 : 0) +
          (filters.compareYear !== thisYear - 1 ? 1 : 0) +
          (filters.month !== now.getMonth() + 1 ? 1 : 0)
        }
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
              <>
                <FilterField label={isAr ? "عام" : "Year"}>{yearSelect(filters.year, (year) => setFilters({ ...filters, year }))}</FilterField>
                <FilterField label={isAr ? "سنة المقارنة" : "Comparison Year"}>{yearSelect(filters.compareYear, (compareYear) => setFilters({ ...filters, compareYear }))}</FilterField>
                <FilterField label={isAr ? "شهر" : "Month"}>
                  <select value={filters.month} onChange={(e) => setFilters({ ...filters, month: Number(e.target.value) })} className={cn(selectClass, "w-full")}>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <option key={m} value={m}>
                        {monthName(m)}
                      </option>
                    ))}
                  </select>
                </FilterField>
              </>
            }
          />
        }
      />
    </div>
  );
}
