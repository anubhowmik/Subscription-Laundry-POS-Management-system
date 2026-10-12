import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { cn } from "../../lib/cn";
import { PageHeader } from "../../components/ui/PageHeader";
import { Alert } from "../../components/ui/Alert";
import { RequiredMark } from "../../components/ui/FormSection";
import { selectClass } from "../../components/ui/formClasses";
import { errorMessage } from "../paymentAccounts/shared";
import {
  useReportAppScope,
  scopeParams,
  BaseFilterFields,
  FilterField,
  ReportDataTable,
  amountColumn,
  baseActiveCount,
  baseFilterParams,
  branchLabel,
  initialBaseFilters,
  num,
  pickName,
  useReportOptions,
  useReportOrgSettings,
  type BaseReportFilters,
  type Named,
  type ReportColumn,
} from "./reportShared";

interface Week {
  sales: string;
  lastYear: string;
  lfl: string | null;
}
interface Figures {
  newCustomers: number;
  existingCustomers: number;
  transactions: number;
  units: string;
  basketSize: string;
  sales: string;
  companyName: string;
  weeks: Week[];
}
type Row = Figures & { locationId: string; region: Named | null; store: { branchName: string; branchNameAr: string | null; branchCode: string } };
interface ReportData {
  startDate: string;
  endDate: string;
  promotion: { id: string; name: string } | null;
  coupon: { id: string; code: string } | null;
  weeks: { index: number; startDate: string; endDate: string; label: string }[];
  rows: Row[];
  totals: Figures | null;
  needsPromotion: boolean;
  needsCoupon: boolean;
}
interface Filters extends BaseReportFilters {
  /** The promotion (campaign variant) or coupon (coupon variant). */
  sourceId: string;
}

/**
 * Reference: CRM Reports > Campaign Performance Report (report/campaign_performance_report.blade.php)
 * and Discount Coupon Report (report/discount_coupon_report.blade.php) - one layout keyed on a
 * promotion or a coupon; the coupon report adds Promocode and Company Name.
 */
export default function CampaignPerformanceReportPage({ variant = "campaign" }: { variant?: "campaign" | "coupon" }) {
  const isCoupon = variant === "coupon";
  const sourceKey = isCoupon ? "couponId" : "promotionId";
  const params = (f: Filters) => ({ ...baseFilterParams(f), ...(f.sourceId ? { [sourceKey]: f.sourceId } : {}) });
  const endpoint = isCoupon ? "/reports/discount-coupon" : "/reports/campaign-performance";
  const { i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const appScope = useReportAppScope();
  const { fiscalYearStartMonth } = useReportOrgSettings();
  const initial = (): Filters => ({ ...initialBaseFilters(fiscalYearStartMonth), sourceId: "" });
  const [filters, setFilters] = useState<Filters>(initial);

  const { data: options } = useReportOptions();
  const { data: report, isFetching, error } = useQuery({
    queryKey: ["reports", endpoint, params(filters), appScope],
    queryFn: async () => (await api.get<ApiSuccess<ReportData>>(endpoint, { params: { ...params(filters), ...scopeParams(appScope) } })).data.data,
    enabled: Boolean(filters.range.from && filters.range.to),
    retry: false,
  });

  // Reference: picking a promotion / coupon sets the range to its own Starts At / Ends At (Valid From / Until).
  const sources = isCoupon
    ? (options?.coupons ?? []).map((c) => ({ id: c.id, label: c.code, startsAt: c.startsAt, endsAt: c.endsAt }))
    : (options?.promotions ?? []).map((p) => ({ id: p.id, label: p.name, startsAt: p.startsAt, endsAt: p.endsAt }));
  const pickSource = (sourceId: string) => {
    const p = sources.find((x) => x.id === sourceId);
    const day = (v: string | null) => (v ? v.slice(0, 10) : null);
    const from = day(p?.startsAt ?? null);
    const to = day(p?.endsAt ?? null);
    setFilters({ ...filters, sourceId, ...(from && to ? { range: { preset: "custom", from, to } } : {}) });
  };
  const sourceName = isCoupon ? report?.coupon?.code : report?.promotion?.name;

  const t = report?.totals ?? undefined;
  const rows = report?.rows ?? [];
  const index = new Map(rows.map((r, i) => [r.locationId, i + 1]));
  const pctNode = (v: string | null) => (v === null ? "-" : <span className={cn("ltr-nums", Number(v) < 0 ? "text-red-600" : "text-emerald-700")}>{v}%</span>);
  const count = (key: "newCustomers" | "existingCustomers" | "transactions", label: string): ReportColumn<Row> => ({
    key,
    label,
    render: (r) => <span className="ltr-nums">{r[key]}</span>,
    exportValue: (r) => r[key],
    ...(t ? { total: { render: <span className="ltr-nums">{t[key]}</span>, exportValue: t[key] } } : {}),
  });
  const weekWord = isAr ? "الأسبوع" : "Week";
  const columns: ReportColumn<Row>[] = [
    {
      key: "srNo",
      label: isAr ? "#" : "SR.No",
      render: (r) => <span className="ltr-nums">{index.get(r.locationId)}</span>,
      exportValue: (r) => index.get(r.locationId) ?? null,
      ...(t ? { total: { render: isAr ? "المجموع" : "Total", exportValue: isAr ? "المجموع" : "Total" } } : {}),
    },
    { key: "region", label: isAr ? "المنطقة" : "Region", render: (r) => (r.region ? pickName(r.region, isAr) : "-"), exportValue: (r) => (r.region ? pickName(r.region, isAr) : "") },
    {
      key: "store",
      label: isAr ? "موقع العمل" : "Store",
      render: (r) => <span className="font-medium text-slate-800">{branchLabel(r.store, isAr)}</span>,
      exportValue: (r) => branchLabel(r.store, isAr),
    },
    count("newCustomers", isAr ? "عملاء جدد" : "New Customers"),
    count("existingCustomers", isAr ? "عملاء حاليون" : "Existing Customers"),
    ...(isCoupon
      ? ([
          { key: "promocode", label: isAr ? "الرمز الترويجي" : "Promocode", render: () => <span className="font-mono">{report?.coupon?.code}</span>, exportValue: () => report?.coupon?.code ?? "" },
          { key: "companyName", label: isAr ? "اسم الشركة" : "Company Name", render: (r) => r.companyName, exportValue: (r) => r.companyName },
        ] satisfies ReportColumn<Row>[])
      : []),
    count("transactions", isAr ? "المعاملات" : "Transactions"),
    {
      key: "units",
      label: isAr ? "الوحدات" : "Units",
      render: (r) => num(r.units),
      exportValue: (r) => Number(r.units),
      ...(t ? { total: { render: num(t.units), exportValue: Number(t.units) } } : {}),
    },
    {
      key: "basketSize",
      label: isAr ? "متوسط السله" : "Basket Size",
      render: (r) => num(r.basketSize),
      exportValue: (r) => Number(r.basketSize),
      ...(t ? { total: { render: num(t.basketSize), exportValue: Number(t.basketSize) } } : {}),
    },
    amountColumn("sales", isAr ? "المبيعات" : "Sales", (r) => r.sales, t?.sales),
    ...(report?.weeks ?? []).flatMap((w, i): ReportColumn<Row>[] => [
      amountColumn<Row>(`week${w.index}`, `${weekWord} ${w.index} (${w.label})`, (r) => r.weeks[i].sales, t?.weeks[i].sales),
      {
        key: `lfl${w.index}`,
        label: `LFL ${w.index}`,
        render: (r) => pctNode(r.weeks[i].lfl),
        exportValue: (r) => (r.weeks[i].lfl === null ? "-" : `${r.weeks[i].lfl}%`),
        ...(t ? { total: { render: pctNode(t.weeks[i].lfl), exportValue: t.weeks[i].lfl === null ? "-" : `${t.weeks[i].lfl}%` } } : {}),
      },
    ]),
  ];

  const title = isCoupon ? (isAr ? "تقرير اكواد الخصم" : "Discount Coupon Report") : isAr ? "تقرير اداء الحملات التسويقيه" : "Campaign Performance Report";
  return (
    <div className="space-y-6">
      <PageHeader title={title} subtitle={sourceName ? `${sourceName} · ${report?.startDate} ~ ${report?.endDate}` : undefined} />
      {error && <Alert variant="danger">{errorMessage(error, isAr)}</Alert>}
      {report?.needsPromotion && (
        <Alert variant="info">{isAr ? "اختر عرضاً ترويجياً من الفلاتر لعرض أداء الحملة." : "Choose a promotion in Filters to see how the campaign performed."}</Alert>
      )}
      {report?.needsCoupon && <Alert variant="info">{isAr ? "اختر قسيمة خصم من الفلاتر لعرض أدائها." : "Choose a coupon in Filters to see how it performed."}</Alert>}
      <ReportDataTable
        storageKey={isCoupon ? "discount-coupon" : "campaign-performance"}
        title={`${title} - ${sourceName ?? ""} ${filters.range.from} ~ ${filters.range.to}`}
        columns={columns}
        rows={rows}
        rowKey={(r) => r.locationId}
        isLoading={isFetching}
        isAr={isAr}
        activeFilterCount={baseActiveCount(filters) + (filters.sourceId ? 1 : 0)}
        onClearFilters={() => setFilters(initial())}
        filters={
          <>
            <FilterField
              label={
                <>
                  {isCoupon ? (isAr ? "قسيمة خصم" : "Coupon") : isAr ? "العرض الترويجي" : "Promotion"}
                  <RequiredMark />
                </>
              }
            >
              <select value={filters.sourceId} onChange={(e) => pickSource(e.target.value)} className={cn(selectClass, "w-full")}>
                <option value="">{isAr ? "يرجى الاختيار" : "Please Select"}</option>
                {sources.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </FilterField>
            <BaseFilterFields value={filters} onChange={(v) => setFilters({ ...filters, ...v })} options={options} isAr={isAr} fiscalYearStartMonth={fiscalYearStartMonth} singleLocation />
          </>
        }
      />
    </div>
  );
}
