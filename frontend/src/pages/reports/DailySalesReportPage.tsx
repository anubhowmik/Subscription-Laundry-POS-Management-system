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
  salesBeforeTax: string;
  sales: string;
  transactions: number;
  units: string;
  basketSize: string;
  asp: string;
  growth: string | null;
}
interface Store extends Figures {
  locationId: string;
  branchName: string;
  branchNameAr: string | null;
  branchCode: string;
}
interface ReportData {
  date: string;
  previousDate: string;
  regions: { key: string; nameEn: string; nameAr: string | null; stores: Store[]; totals: Figures }[];
  netTotal: Figures;
}
/** A branch row, or its region's TOTAL row (the reference's per-region table footer). */
type Row = Figures & { key: string; region: string; index: number | null; branch: string; isRegionTotal: boolean };

interface Filters extends BaseReportFilters {
  date: string;
}

const params = (f: Filters) => {
  const { from: _from, to: _to, ...rest } = baseFilterParams(f);
  return { ...rest, date: f.date };
};

/** Reference: Sales Reports > Daily Sales Report (report/daily_sales_report.blade.php). */
export default function DailySalesReportPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const appScope = useReportAppScope();
  const { fiscalYearStartMonth } = useReportOrgSettings();
  const today = ymd(new Date());
  const initial = (): Filters => ({ ...initialBaseFilters(fiscalYearStartMonth), date: today });
  const [filters, setFilters] = useState<Filters>(initial);

  const { data: options } = useReportOptions();
  const { data: report, isFetching, error } = useQuery({
    queryKey: ["reports", "daily-sales", params(filters), appScope],
    queryFn: async () => (await api.get<ApiSuccess<ReportData>>("/reports/daily-sales", { params: { ...params(filters), ...scopeParams(appScope) } })).data.data,
    enabled: Boolean(filters.date),
    retry: false,
  });

  const totalWord = isAr ? "المجموع" : "TOTAL";
  const rows: Row[] = (report?.regions ?? []).flatMap((r) => {
    const region = pickName(r, isAr);
    return [
      ...r.stores.map((s, i) => ({ ...s, key: s.locationId, region, index: i + 1, branch: branchLabel(s, isAr), isRegionTotal: false })),
      { ...r.totals, key: `${r.key}|total`, region, index: null, branch: totalWord, isRegionTotal: true },
    ];
  });
  const bold = (r: Row, node: React.ReactNode) => (r.isRegionTotal ? <span className="font-semibold text-slate-800">{node}</span> : node);
  const n = report?.netTotal;
  const money = (key: "salesBeforeTax" | "sales" | "basketSize" | "asp", en: string, ar: string): ReportColumn<Row> => ({
    key,
    label: isAr ? ar : en,
    render: (r) => bold(r, num(r[key])),
    exportValue: (r) => exportAmount(r[key]),
    ...(n ? { total: { render: num(n[key]), exportValue: exportAmount(n[key]) } } : {}),
  });
  const columns: ReportColumn<Row>[] = [
    {
      key: "region",
      label: isAr ? "مجموعات الفروع" : "Location Group",
      render: (r) => bold(r, r.region),
      exportValue: (r) => r.region,
      ...(n ? { total: { render: isAr ? "المجموع الصافي" : "NET TOTAL", exportValue: isAr ? "المجموع الصافي" : "NET TOTAL" } } : {}),
    },
    { key: "index", label: "#", render: (r) => <span className="ltr-nums">{r.index ?? ""}</span>, exportValue: (r) => r.index },
    { key: "branch", label: isAr ? "موقع العمل" : "Business Location", render: (r) => bold(r, <span className="font-medium text-slate-800">{r.branch}</span>), exportValue: (r) => r.branch },
    money("salesBeforeTax", "Total Before Tax", "الاجمالى قبل الضريبة"),
    money("sales", "Total", "المجموع"),
    {
      key: "transactions",
      label: isAr ? "المعاملات" : "Transactions",
      render: (r) => bold(r, <span className="ltr-nums">{r.transactions}</span>),
      exportValue: (r) => r.transactions,
      ...(n ? { total: { render: <span className="ltr-nums">{n.transactions}</span>, exportValue: n.transactions } } : {}),
    },
    {
      key: "units",
      label: isAr ? "اجمالي الوحدات" : "Total Units",
      render: (r) => bold(r, num(r.units)),
      exportValue: (r) => exportAmount(r.units),
      ...(n ? { total: { render: num(n.units), exportValue: exportAmount(n.units) } } : {}),
    },
    money("basketSize", "Basket Size", "متوسط السله"),
    money("asp", "ASP", "متوسط السعر"),
    {
      key: "growth",
      label: isAr ? "النمو" : "Growth",
      render: (r) => bold(r, r.growth === null ? "-" : <span className={cn("ltr-nums", Number(r.growth) < 0 ? "text-red-600" : "text-emerald-700")}>{r.growth}%</span>),
      exportValue: (r) => (r.growth === null ? "-" : `${r.growth}%`),
      ...(n ? { total: { render: "-", exportValue: "-" } } : {}),
    },
  ];

  const title = isAr ? "تقرير المبيعات اليومي" : "Daily Sales Report";
  return (
    <div className="space-y-6">
      <PageHeader title={`${title} - ${filters.date}`} subtitle={report ? `${isAr ? "النمو مقارنة بـ" : "Growth compared with"} ${report.previousDate}` : undefined} />
      {error && <Alert variant="danger">{errorMessage(error, isAr)}</Alert>}
      <ReportDataTable
        storageKey="daily-sales"
        title={`${title} - ${filters.date}`}
        columns={columns}
        rows={rows}
        rowKey={(r) => r.key}
        isLoading={isFetching}
        isAr={isAr}
        activeFilterCount={(filters.date !== today ? 1 : 0) + (filters.locationGroupId ? 1 : 0) + (filters.locationIds.length ? 1 : 0)}
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
            beforeGroup={
              <FilterField label={isAr ? "التاريخ" : "Date"}>
                <input type="date" value={filters.date} onChange={(e) => e.target.value && setFilters({ ...filters, date: e.target.value })} className={cn(inputClass, "w-full ltr-nums")} />
              </FilterField>
            }
          />
        }
      />
    </div>
  );
}
