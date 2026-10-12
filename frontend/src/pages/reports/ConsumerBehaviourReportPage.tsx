import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { cn } from "../../lib/cn";
import { PageHeader } from "../../components/ui/PageHeader";
import { Alert } from "../../components/ui/Alert";
import { Badge } from "../../components/ui/Badge";
import { RequiredMark } from "../../components/ui/FormSection";
import { selectClass } from "../../components/ui/formClasses";
import { initialDateRange } from "../../components/ui/DateRangeFilter";
import { errorMessage } from "../paymentAccounts/shared";
import {
  useReportAppScope,
  scopeParams,
  BaseFilterFields,
  ContactFilterField,
  FilterField,
  ReportDataTable,
  amountColumn,
  baseFilterParams,
  branchLabel,
  initialBaseFilters,
  num,
  pickName,
  customerLabel,
  useReportOptions,
  useReportOrgSettings,
  type BaseReportFilters,
  type Named,
  type PickedCustomer,
  type ReportColumn,
} from "./reportShared";

type Slot = "MORNING" | "AFTERNOON" | "EVENING" | "NIGHT";
type DealType = "DEALS_ONLY" | "FULL_PRICE_ONLY" | "MIXED";

const SLOT_LABEL: Record<Slot, { en: string; ar: string }> = {
  MORNING: { en: "Morning (6-12)", ar: "صباحاً (6-12)" },
  AFTERNOON: { en: "Afternoon (12-18)", ar: "بعد الظهر (12-18)" },
  EVENING: { en: "Evening (18-24)", ar: "مساءً (18-24)" },
  NIGHT: { en: "Night (0-6)", ar: "ليلاً (0-6)" },
};
const DEAL_LABEL: Record<DealType, { en: string; ar: string; variant: "success" | "info" | "warning" }> = {
  DEALS_ONLY: { en: "Deals Only", ar: "العروض فقط", variant: "success" },
  FULL_PRICE_ONLY: { en: "Full Price Only", ar: "السعر الكامل فقط", variant: "info" },
  MIXED: { en: "Mixed", ar: "مختلط", variant: "warning" },
};

interface Row {
  customerId: string;
  customer: Named & { code: string; businessName: string | null; phone: string };
  region: Named | null;
  store: { branchName: string; branchNameAr: string | null; branchCode: string } | null;
  transactions: number;
  units: string;
  basketSize: string;
  sales: string;
  bestTime: Slot | null;
  dealType: DealType;
  favouriteService: Named | null;
}
interface ReportData {
  rows: Row[];
  totals: { customers: number; transactions: number; units: string; basketSize: string; sales: string };
}
interface Filters extends BaseReportFilters {
  /** "all" (All Customers), "ungrouped" (Locations Customers) or a customer group id. */
  customerGroup: string;
  customer: PickedCustomer | null;
}

const params = (f: Filters) => ({
  ...baseFilterParams(f),
  customerGroup: f.customerGroup,
  ...(f.customer ? { customerId: f.customer.id } : {}),
});

/** Reference: CRM Reports > Consumer Behaviour Report (report/consumer_behaviour_report.blade.php). */
export default function ConsumerBehaviourReportPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const appScope = useReportAppScope();
  const { fiscalYearStartMonth } = useReportOrgSettings();
  // Reference: opens on All Customers for the current month.
  const initial = (): Filters => ({
    ...initialBaseFilters(fiscalYearStartMonth),
    range: initialDateRange("thisMonth", fiscalYearStartMonth),
    customerGroup: "all",
    customer: null,
  });
  const [filters, setFilters] = useState<Filters>(initial);

  const { data: options } = useReportOptions();
  const { data: report, isFetching, error } = useQuery({
    queryKey: ["reports", "consumer-behaviour", params(filters), appScope],
    queryFn: async () => (await api.get<ApiSuccess<ReportData>>("/reports/consumer-behaviour", { params: { ...params(filters), ...scopeParams(appScope) } })).data.data,
    enabled: Boolean(filters.range.from && filters.range.to),
    retry: false,
  });

  const t = report?.totals;
  const rows = report?.rows ?? [];
  const index = new Map(rows.map((r, i) => [r.customerId, i + 1]));
  const customerName = (r: Row) => customerLabel(r.customer, isAr);
  const store = (r: Row) => (r.store ? branchLabel(r.store, isAr) : "");
  const slot = (r: Row) => (r.bestTime ? (isAr ? SLOT_LABEL[r.bestTime].ar : SLOT_LABEL[r.bestTime].en) : "");
  const deal = (r: Row) => (isAr ? DEAL_LABEL[r.dealType].ar : DEAL_LABEL[r.dealType].en);
  const columns: ReportColumn<Row>[] = [
    {
      key: "srNo",
      label: isAr ? "#" : "SR.No",
      render: (r) => <span className="ltr-nums">{index.get(r.customerId)}</span>,
      exportValue: (r) => index.get(r.customerId) ?? null,
      ...(t ? { total: { render: isAr ? "المجموع" : "Total", exportValue: isAr ? "المجموع" : "Total" } } : {}),
    },
    { key: "customer", label: isAr ? "العميل" : "Customer", render: (r) => <span className="font-medium text-slate-800">{customerName(r)}</span>, exportValue: customerName },
    { key: "mobile", label: isAr ? "الموبايل" : "Mobile", render: (r) => <span className="ltr-nums">{r.customer.phone}</span>, exportValue: (r) => r.customer.phone },
    { key: "region", label: isAr ? "المنطقة" : "Region", render: (r) => (r.region ? pickName(r.region, isAr) : "-"), exportValue: (r) => (r.region ? pickName(r.region, isAr) : "") },
    { key: "store", label: isAr ? "موقع العمل" : "Store", render: (r) => store(r) || "-", exportValue: store },
    {
      key: "transactions",
      label: isAr ? "المعاملات" : "Transactions",
      render: (r) => <span className="ltr-nums">{r.transactions}</span>,
      exportValue: (r) => r.transactions,
      ...(t ? { total: { render: <span className="ltr-nums">{t.transactions}</span>, exportValue: t.transactions } } : {}),
    },
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
    { key: "bestTime", label: isAr ? "أفضل وقت للتسوق" : "Best Time", render: (r) => slot(r) || "-", exportValue: slot },
    { key: "dealType", label: isAr ? "نوع الشراء" : "Deal Type", render: (r) => <Badge variant={DEAL_LABEL[r.dealType].variant}>{deal(r)}</Badge>, exportValue: deal },
    {
      key: "favouriteService",
      label: isAr ? "الخدمة المفضلة" : "Favourite Service",
      render: (r) => (r.favouriteService ? pickName(r.favouriteService, isAr) : "-"),
      exportValue: (r) => (r.favouriteService ? pickName(r.favouriteService, isAr) : ""),
    },
  ];

  const title = isAr ? "تقرير سلوك العميل" : "Consumer Behaviour Report";
  // "This Month" + All Customers is the resting state, not an active filter.
  const activeFilterCount =
    (filters.locationGroupId ? 1 : 0) +
    (filters.locationIds.length > 0 ? 1 : 0) +
    (filters.range.preset !== "thisMonth" ? 1 : 0) +
    (filters.customerGroup !== "all" ? 1 : 0) +
    (filters.customer ? 1 : 0);
  return (
    <div className="space-y-6">
      <PageHeader title={title} />
      {error && <Alert variant="danger">{errorMessage(error, isAr)}</Alert>}
      <ReportDataTable
        storageKey="consumer-behaviour"
        title={`${title} ${filters.range.from} ~ ${filters.range.to}`}
        columns={columns}
        rows={rows}
        rowKey={(r) => r.customerId}
        isLoading={isFetching}
        isAr={isAr}
        activeFilterCount={activeFilterCount}
        onClearFilters={() => setFilters(initial())}
        filters={
          <>
            <FilterField
              label={
                <>
                  {isAr ? "مجموعة العملاء" : "Customer Group"}
                  <RequiredMark />
                </>
              }
            >
              <select value={filters.customerGroup} onChange={(e) => setFilters({ ...filters, customerGroup: e.target.value })} className={cn(selectClass, "w-full")}>
                <option value="all">{isAr ? "كل العملاء" : "All Customers"}</option>
                <option value="ungrouped">{isAr ? "عملاء الفروع" : "Locations Customers"}</option>
                {(options?.customerGroups ?? []).map((g) => (
                  <option key={g.id} value={g.id}>
                    {pickName(g, isAr)}
                  </option>
                ))}
              </select>
            </FilterField>
            <BaseFilterFields value={filters} onChange={(v) => setFilters({ ...filters, ...v })} options={options} isAr={isAr} fiscalYearStartMonth={fiscalYearStartMonth} singleLocation />
            <ContactFilterField value={filters.customer} onChange={(customer) => setFilters({ ...filters, customer })} isAr={isAr} label={isAr ? "العميل" : "Customer"} />
          </>
        }
      />
    </div>
  );
}
