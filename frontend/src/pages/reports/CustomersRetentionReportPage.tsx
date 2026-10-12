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
  ContactFilterField,
  CustomerGroupField,
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

interface Row {
  customerId: string;
  customer: Named & { code: string; businessName: string | null; phone: string };
  region: Named | null;
  store: { branchName: string; branchNameAr: string | null; branchCode: string } | null;
  transactions: number;
  units: string;
  basketSize: string;
  sales: string;
  weeks: string[];
}
interface ReportData {
  datePoint: string;
  weeks: { index: number; startDate: string; endDate: string; label: string }[];
  rows: Row[];
  totals: { customers: number; transactions: number; units: string; basketSize: string; sales: string; weeks: string[] };
}
interface Filters extends BaseReportFilters {
  customerGroupId: string;
  customer: PickedCustomer | null;
  datePoint: string;
}

const params = (f: Filters) => {
  const { from: _from, to: _to, ...rest } = baseFilterParams(f);
  return {
    ...rest,
    datePoint: f.datePoint,
    ...(f.customerGroupId ? { customerGroupId: f.customerGroupId } : {}),
    ...(f.customer ? { customerId: f.customer.id } : {}),
  };
};

/**
 * Reference: CRM Reports > Customers Retention Report (report/customers_retention_report.blade.php)
 * and, with `variant="decline"`, Decline Customers Report (report/decline_customers_report.blade.php)
 * - the same six weeks and columns, listing only customers who bought in Weeks 2-6 but not since.
 */
export default function CustomersRetentionReportPage({ variant = "retention" }: { variant?: "retention" | "decline" }) {
  const slug = variant === "decline" ? "decline-customers" : "customers-retention";
  const { i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const appScope = useReportAppScope();
  const { fiscalYearStartMonth } = useReportOrgSettings();
  const today = ymd(new Date());
  const initial = (): Filters => ({ ...initialBaseFilters(fiscalYearStartMonth), customerGroupId: "", customer: null, datePoint: today });
  const [filters, setFilters] = useState<Filters>(initial);

  const { data: options } = useReportOptions();
  const { data: report, isFetching, error } = useQuery({
    queryKey: ["reports", slug, params(filters), appScope],
    queryFn: async () => (await api.get<ApiSuccess<ReportData>>(`/reports/${slug}`, { params: { ...params(filters), ...scopeParams(appScope) } })).data.data,
    enabled: Boolean(filters.datePoint),
    retry: false,
  });

  const t = report?.totals;
  const rows = report?.rows ?? [];
  const index = new Map(rows.map((r, i) => [r.customerId, i + 1]));
  const customerName = (r: Row) => customerLabel(r.customer, isAr);
  const store = (r: Row) => (r.store ? branchLabel(r.store, isAr) : "");
  const weekWord = isAr ? "الأسبوع" : "Week";
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
    ...(report?.weeks ?? [1, 2, 3, 4, 5, 6].map((index) => ({ index, label: "", startDate: "", endDate: "" }))).map((w, i) =>
      amountColumn<Row>(`week${w.index}`, `${weekWord} ${w.index}${w.label ? ` (${w.label})` : ""}`, (r) => r.weeks[i], t?.weeks[i]),
    ),
  ];

  const title =
    variant === "decline"
      ? isAr
        ? "تقرير معدل انخفاض العملاء"
        : "Decline Customers Report"
      : isAr
        ? "تقرير معدل الاحتفاظ بالعميل"
        : "Customers Retention Report";
  const span = report ? `${report.weeks[5].startDate} ~ ${report.weeks[0].endDate}` : "";
  return (
    <div className="space-y-6">
      <PageHeader title={title} subtitle={span ? `${isAr ? "التاريخ" : "Date Point"} ${filters.datePoint} · ${span}` : undefined} />
      {error && <Alert variant="danger">{errorMessage(error, isAr)}</Alert>}
      <ReportDataTable
        storageKey={slug}
        title={`${title} - ${filters.datePoint}`}
        columns={columns}
        rows={rows}
        rowKey={(r) => r.customerId}
        isLoading={isFetching}
        isAr={isAr}
        activeFilterCount={
          (filters.datePoint !== today ? 1 : 0) +
          (filters.locationGroupId ? 1 : 0) +
          (filters.locationIds.length ? 1 : 0) +
          (filters.customerGroupId ? 1 : 0) +
          (filters.customer ? 1 : 0)
        }
        onClearFilters={() => setFilters(initial())}
        filters={
          <>
            <BaseFilterFields
              value={filters}
              onChange={(v) => setFilters({ ...filters, ...v })}
              options={options}
              isAr={isAr}
              fiscalYearStartMonth={fiscalYearStartMonth}
              singleLocation
              hideDateRange
            />
            <CustomerGroupField value={filters.customerGroupId} onChange={(customerGroupId) => setFilters({ ...filters, customerGroupId })} options={options} isAr={isAr} allLabel={isAr ? "الكل" : "All"} />
            <ContactFilterField value={filters.customer} onChange={(customer) => setFilters({ ...filters, customer })} isAr={isAr} label={isAr ? "العميل" : "Customer"} />
            <FilterField label={isAr ? "التاريخ" : "Date Point"}>
              <input
                type="date"
                value={filters.datePoint}
                onChange={(e) => e.target.value && setFilters({ ...filters, datePoint: e.target.value })}
                className={cn(inputClass, "w-full ltr-nums")}
              />
            </FilterField>
          </>
        }
      />
    </div>
  );
}
