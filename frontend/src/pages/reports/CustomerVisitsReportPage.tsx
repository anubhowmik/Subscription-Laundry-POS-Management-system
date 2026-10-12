import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Repeat, Users } from "lucide-react";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { PageHeader } from "../../components/ui/PageHeader";
import { Alert } from "../../components/ui/Alert";
import { StatCard } from "../../components/ui/StatCard";
import { errorMessage } from "../paymentAccounts/shared";
import {
  useReportAppScope,
  scopeParams,
  BaseFilterFields,
  ContactFilterField,
  CustomerGroupField,
  ReportDataTable,
  amountColumn,
  baseActiveCount,
  baseFilterParams,
  initialBaseFilters,
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
  customer: Named & { businessName: string | null; phone: string };
  locations: { branchName: string; branchNameAr: string | null; branchCode: string; city: string | null }[];
  productsEn: string;
  productsAr: string;
  total: string;
  visits: number;
}
interface ReportData {
  rows: Row[];
  totals: { total: string; visits: number };
  summary: { repeatedCustomers: number; visitingCustomers: number; totalCustomers: number; repeatedVsTotal: number; repeatedVsVisitors: number };
}
interface Filters extends BaseReportFilters {
  customerGroupId: string;
  customer: PickedCustomer | null;
}

const params = (f: Filters) => ({
  ...baseFilterParams(f),
  ...(f.customerGroupId ? { customerGroupId: f.customerGroupId } : {}),
  ...(f.customer ? { customerId: f.customer.id } : {}),
});

/** Reference: Reports > Customer Visits Report (report/customer_visits_report.blade.php). */
export default function CustomerVisitsReportPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const appScope = useReportAppScope();
  const { fiscalYearStartMonth } = useReportOrgSettings();
  const initial = (): Filters => ({ ...initialBaseFilters(fiscalYearStartMonth), customerGroupId: "", customer: null });
  const [filters, setFilters] = useState<Filters>(initial);

  const { data: options } = useReportOptions();
  const { data: report, isFetching, error } = useQuery({
    queryKey: ["reports", "customer-visits", params(filters), appScope],
    queryFn: async () => (await api.get<ApiSuccess<ReportData>>("/reports/customer-visits", { params: { ...params(filters), ...scopeParams(appScope) } })).data.data,
    enabled: Boolean(filters.range.from && filters.range.to),
    retry: false,
  });

  const t = report?.totals;
  const name = (r: Row) => customerLabel(r.customer, isAr);
  const branches = (r: Row) => r.locations.map((l) => `${isAr ? l.branchNameAr || l.branchName : l.branchName} (${l.branchCode})`).join(", ");
  const cities = (r: Row) => [...new Set(r.locations.map((l) => l.city).filter(Boolean))].join(", ");
  const columns: ReportColumn<Row>[] = [
    { key: "name", label: isAr ? "الاسم" : "Name", render: (r) => <span className="font-medium text-slate-800">{name(r)}</span>, exportValue: name },
    { key: "mobile", label: isAr ? "الموبايل" : "Mobile", render: (r) => <span className="ltr-nums">{r.customer.phone}</span>, exportValue: (r) => r.customer.phone },
    { key: "location", label: isAr ? "موقع العمل" : "Business Location", render: branches, exportValue: branches },
    { key: "city", label: isAr ? "المدينة" : "City", render: (r) => cities(r) || "-", exportValue: cities },
    {
      key: "products",
      label: isAr ? "المنتجات" : "Products",
      render: (r) => <span className="block min-w-[14rem]">{isAr ? r.productsAr : r.productsEn}</span>,
      exportValue: (r) => (isAr ? r.productsAr : r.productsEn),
    },
    amountColumn("total", isAr ? "المجموع" : "Total", (r) => r.total, t?.total),
    {
      key: "visits",
      label: isAr ? "عدد الزيارات" : "Visit Count",
      render: (r) => <span className="ltr-nums">{r.visits}</span>,
      exportValue: (r) => r.visits,
      ...(t ? { total: { render: <span className="ltr-nums">{t.visits}</span>, exportValue: t.visits } } : {}),
    },
  ];
  const pct = (n: number | undefined) => (n === undefined ? "…" : `${n}%`);

  return (
    <div className="space-y-6">
      <PageHeader title={isAr ? "تقرير زيارات العملاء" : "Customer Visits Report"} />
      <div className="grid grid-cols-1 gap-4 sm:max-w-xl xl:max-w-4xl xl:grid-cols-2">
        <StatCard
          icon={Users}
          cardBg="bg-app-pos-500"
          iconBg="bg-white/20"
          iconColor="text-white"
          highlight
          label={isAr ? "نسبة العملاء المتكررين من إجمالي عملاء النظام" : "Repeat customers out of all customers"}
          value={pct(report?.summary.repeatedVsTotal)}
        />
        <StatCard
          icon={Repeat}
          cardBg="bg-app-pos-500"
          iconBg="bg-white/20"
          iconColor="text-white"
          highlight
          label={isAr ? "نسبة العملاء المتكررين من الزائرين خلال الفترة" : "Repeat customers out of the period's visitors"}
          value={pct(report?.summary.repeatedVsVisitors)}
        />
      </div>
      {error && <Alert variant="danger">{errorMessage(error, isAr)}</Alert>}
      <ReportDataTable
        storageKey="customer-visits"
        title={`${isAr ? "تقرير زيارات العملاء" : "Customer Visits Report"} ${filters.range.from} ~ ${filters.range.to}`}
        columns={columns}
        rows={report?.rows ?? []}
        rowKey={(r) => r.customerId}
        isLoading={isFetching}
        isAr={isAr}
        activeFilterCount={baseActiveCount(filters) + (filters.customerGroupId ? 1 : 0) + (filters.customer ? 1 : 0)}
        onClearFilters={() => setFilters(initial())}
        filters={
          <>
            <BaseFilterFields value={filters} onChange={(v) => setFilters({ ...filters, ...v })} options={options} isAr={isAr} fiscalYearStartMonth={fiscalYearStartMonth} singleLocation />
            <CustomerGroupField value={filters.customerGroupId} onChange={(customerGroupId) => setFilters({ ...filters, customerGroupId })} options={options} isAr={isAr} allLabel={isAr ? "الكل" : "All"} />
            <ContactFilterField value={filters.customer} onChange={(customer) => setFilters({ ...filters, customer })} isAr={isAr} />
          </>
        }
      />
    </div>
  );
}
