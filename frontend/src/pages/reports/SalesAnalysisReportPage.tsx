import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { cn } from "../../lib/cn";
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
  branchLabel,
  exportAmount,
  initialBaseFilters,
  num,
  pickName,
  useReportOptions,
  useReportOrgSettings,
  type BaseReportFilters,
  type ReportColumn,
} from "./reportShared";

interface Figures {
  mtdCurr: string;
  mtdPrev: string;
  mtdLfl: string | null;
  ytdCurr: string;
  ytdPrev: string;
  ytdLfl: string | null;
}
interface Store extends Figures {
  locationId: string;
  branchName: string;
  branchNameAr: string | null;
  branchCode: string;
}
interface ReportData {
  year: number;
  compareYear: number;
  month: number;
  regions: { key: string; nameEn: string; nameAr: string | null; stores: Store[]; totals: Figures }[];
  netTotal: Figures;
}
type Row = Figures & { key: string; region: string; store: string; isRegionTotal: boolean };
interface Filters extends BaseReportFilters {
  year: number;
  compareYear: number;
  month: number;
}

/** Reference: Sales Reports > Sales Analysis Report (report/sales_analysis_report.blade.php). */
export default function SalesAnalysisReportPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const appScope = useReportAppScope();
  const { fiscalYearStartMonth } = useReportOrgSettings();
  const now = new Date();
  const thisYear = now.getFullYear();
  // Reference: this year back five years, for both year selects.
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
    queryKey: ["reports", "sales-analysis", params(filters), appScope],
    queryFn: async () => (await api.get<ApiSuccess<ReportData>>("/reports/sales-analysis", { params: { ...params(filters), ...scopeParams(appScope) } })).data.data,
    retry: false,
  });

  const totalWord = isAr ? "المجموع" : "TOTAL";
  const rows: Row[] = (report?.regions ?? []).flatMap((r) => {
    const region = pickName(r, isAr);
    return [
      ...r.stores.map((s) => ({ ...s, key: s.locationId, region, store: branchLabel(s, isAr), isRegionTotal: false })),
      { ...r.totals, key: `${r.key}|total`, region, store: totalWord, isRegionTotal: true },
    ];
  });
  const bold = (r: Row, node: React.ReactNode) => (r.isRegionTotal ? <span className="font-semibold text-slate-800">{node}</span> : node);
  const n = report?.netTotal;
  const y = report?.year ?? filters.year;
  const cy = report?.compareYear ?? filters.compareYear;
  const money = (key: "mtdCurr" | "mtdPrev" | "ytdCurr" | "ytdPrev", label: string): ReportColumn<Row> => ({
    key,
    label,
    render: (r) => bold(r, num(r[key])),
    exportValue: (r) => exportAmount(r[key]),
    ...(n ? { total: { render: num(n[key]), exportValue: exportAmount(n[key]) } } : {}),
  });
  const pctNode = (v: string | null) => (v === null ? "-" : <span className={cn("ltr-nums", Number(v) < 0 ? "text-red-600" : "text-emerald-700")}>{v}%</span>);
  const pct = (key: "mtdLfl" | "ytdLfl", label: string): ReportColumn<Row> => ({
    key,
    label,
    render: (r) => bold(r, pctNode(r[key])),
    exportValue: (r) => (r[key] === null ? "-" : `${r[key]}%`),
    ...(n ? { total: { render: pctNode(n[key]), exportValue: n[key] === null ? "-" : `${n[key]}%` } } : {}),
  });
  const columns: ReportColumn<Row>[] = [
    {
      key: "region",
      label: isAr ? "المنطقة" : "Region",
      render: (r) => bold(r, r.region),
      exportValue: (r) => r.region,
      ...(n ? { total: { render: isAr ? "المجموع الصافي" : "NET TOTAL", exportValue: isAr ? "المجموع الصافي" : "NET TOTAL" } } : {}),
    },
    { key: "store", label: isAr ? "الفرع" : "Store", render: (r) => bold(r, <span className="font-medium text-slate-800">{r.store}</span>), exportValue: (r) => r.store },
    money("mtdCurr", `MTD (${y})`),
    money("mtdPrev", `MTD (${cy})`),
    pct("mtdLfl", "MTD LFL%"),
    money("ytdCurr", `YTD (${y})`),
    money("ytdPrev", `YTD (${cy})`),
    pct("ytdLfl", "YTD LFL%"),
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
  const title = isAr ? "تقرير تحليل المبيعات" : "Sales Analysis Report";
  return (
    <div className="space-y-6">
      <PageHeader title={title} subtitle={`${monthName(filters.month)} ${y} · ${isAr ? "مقارنة بـ" : "vs"} ${cy}`} />
      {error && <Alert variant="danger">{errorMessage(error, isAr)}</Alert>}
      <ReportDataTable
        storageKey="sales-analysis"
        title={`${title} - ${monthName(filters.month)} ${y} vs ${cy}`}
        columns={columns}
        rows={rows}
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
