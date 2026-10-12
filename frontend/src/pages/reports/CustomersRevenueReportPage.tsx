import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { PageHeader } from "../../components/ui/PageHeader";
import { Alert } from "../../components/ui/Alert";
import { errorMessage } from "../paymentAccounts/shared";
import {
  useReportAppScope,
  scopeParams,
  BaseFilterFields,
  ContactFilterField,
  CustomerGroupField,
  PromotionFilterField,
  ReportDataTable,
  amountColumn,
  baseActiveCount,
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
  bestSeller: Named | null;
}
interface ReportData {
  rows: Row[];
  totals: { customers: number; transactions: number; units: string; basketSize: string; sales: string };
}
interface Filters extends BaseReportFilters {
  customerGroupId: string;
  customer: PickedCustomer | null;
  promotionId: string;
}

const params = (f: Filters) => ({
  ...baseFilterParams(f),
  ...(f.customerGroupId ? { customerGroupId: f.customerGroupId } : {}),
  ...(f.customer ? { customerId: f.customer.id } : {}),
  ...(f.promotionId ? { promotionId: f.promotionId } : {}),
});

/**
 * Reference: CRM Reports > Customers Revenue Report (report/customers_revenue_report.blade.php)
 * and, with `variant="new"`, New Customers Report (report/new_customers_report.blade.php) - the
 * same filters and columns, but the Date Range picks customers by registration date and their
 * purchases are counted all time.
 */
export default function CustomersRevenueReportPage({ variant = "revenue" }: { variant?: "revenue" | "new" }) {
  const slug = variant === "new" ? "new-customers" : "customers-revenue";
  const { i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const appScope = useReportAppScope();
  const { fiscalYearStartMonth } = useReportOrgSettings();
  const initial = (): Filters => ({ ...initialBaseFilters(fiscalYearStartMonth), customerGroupId: "", customer: null, promotionId: "" });
  const [filters, setFilters] = useState<Filters>(initial);

  const { data: options } = useReportOptions();
  const { data: report, isFetching, error } = useQuery({
    queryKey: ["reports", slug, params(filters), appScope],
    queryFn: async () => (await api.get<ApiSuccess<ReportData>>(`/reports/${slug}`, { params: { ...params(filters), ...scopeParams(appScope) } })).data.data,
    enabled: Boolean(filters.range.from && filters.range.to),
    retry: false,
  });

  const t = report?.totals;
  const rows = report?.rows ?? [];
  const index = new Map(rows.map((r, i) => [r.customerId, i + 1]));
  const customerName = (r: Row) => customerLabel(r.customer, isAr);
  const store = (r: Row) => (r.store ? branchLabel(r.store, isAr) : "");
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
    {
      key: "bestSeller",
      label: isAr ? "الخدمة الأكثر مبيعاً" : "Best Seller Service",
      render: (r) => (r.bestSeller ? pickName(r.bestSeller, isAr) : "-"),
      exportValue: (r) => (r.bestSeller ? pickName(r.bestSeller, isAr) : ""),
    },
  ];

  const title = variant === "new" ? (isAr ? "تقرير العملاء الجدد" : "New Customers Report") : isAr ? "تقرير مبيعات العملاء" : "Customers Revenue Report";
  return (
    <div className="space-y-6">
      <PageHeader title={title} />
      {error && <Alert variant="danger">{errorMessage(error, isAr)}</Alert>}
      <ReportDataTable
        storageKey={slug}
        title={`${title} ${filters.range.from} ~ ${filters.range.to}`}
        columns={columns}
        rows={rows}
        rowKey={(r) => r.customerId}
        isLoading={isFetching}
        isAr={isAr}
        activeFilterCount={baseActiveCount(filters) + (filters.customerGroupId ? 1 : 0) + (filters.customer ? 1 : 0) + (filters.promotionId ? 1 : 0)}
        onClearFilters={() => setFilters(initial())}
        filters={
          <>
            <BaseFilterFields value={filters} onChange={(v) => setFilters({ ...filters, ...v })} options={options} isAr={isAr} fiscalYearStartMonth={fiscalYearStartMonth} singleLocation />
            <CustomerGroupField value={filters.customerGroupId} onChange={(customerGroupId) => setFilters({ ...filters, customerGroupId })} options={options} isAr={isAr} allLabel={isAr ? "الكل" : "All"} />
            <ContactFilterField value={filters.customer} onChange={(customer) => setFilters({ ...filters, customer })} isAr={isAr} label={isAr ? "العميل" : "Customer"} />
            <PromotionFilterField value={filters.promotionId} onChange={(promotionId) => setFilters({ ...filters, promotionId })} options={options} isAr={isAr} />
          </>
        }
      />
    </div>
  );
}
