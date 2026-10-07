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
  CustomerGroupField,
  ReportDataTable,
  amountColumn,
  baseActiveCount,
  baseFilterParams,
  branchLabel,
  initialBaseFilters,
  useReportOptions,
  useReportOrgSettings,
  type BaseReportFilters,
  type Named,
  type ReportColumn,
  type ReportLocationFilters,
} from "./reportShared";

type AmountKey = "beforeTax" | "tax" | "total" | "returnBeforeTax" | "returnTax" | "returnTotal" | "net";
interface Row extends Record<AmountKey, string> {
  locationId: string;
  branchName: string;
  branchNameAr: string | null;
  branchCode: string;
}
interface ReportData {
  startDate: string;
  endDate: string;
  filters: ReportLocationFilters & { customerGroup: Named | null };
  rows: Row[];
  totals: Record<AmountKey, string>;
}
interface Filters extends BaseReportFilters {
  customerGroupId: string;
}

const params = (f: Filters) => ({ ...baseFilterParams(f), ...(f.customerGroupId ? { customerGroupId: f.customerGroupId } : {}) });

/** Reference: Reports > Companies Report (report/company_report.blade.php). */
export default function CompaniesReportPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const appScope = useReportAppScope();
  const { fiscalYearStartMonth } = useReportOrgSettings();
  const initial = (): Filters => ({ ...initialBaseFilters(fiscalYearStartMonth), customerGroupId: "" });
  const [filters, setFilters] = useState<Filters>(initial);

  const { data: options } = useReportOptions();
  const { data: report, isFetching, error } = useQuery({
    queryKey: ["reports", "companies", params(filters), appScope],
    queryFn: async () => (await api.get<ApiSuccess<ReportData>>("/reports/companies", { params: { ...params(filters), ...scopeParams(appScope) } })).data.data,
    enabled: Boolean(filters.range.from && filters.range.to),
    retry: false,
  });

  const t = report?.totals;
  const columns: ReportColumn<Row>[] = [
    { key: "location", label: isAr ? "موقع العمل" : "Business Location", render: (r) => <span className="font-medium text-slate-800">{branchLabel(r, isAr)}</span>, exportValue: (r) => branchLabel(r, isAr) },
    amountColumn("beforeTax", isAr ? "الاجمالى قبل الضريبة" : "Total Before Tax", (r) => r.beforeTax, t?.beforeTax),
    amountColumn("tax", isAr ? "الضريبة" : "Tax", (r) => r.tax, t?.tax),
    amountColumn("total", isAr ? "المجموع" : "Total", (r) => r.total, t?.total),
    amountColumn("returnBeforeTax", isAr ? "مرتجع قبل الضريبة" : "Return before tax", (r) => r.returnBeforeTax, t?.returnBeforeTax),
    amountColumn("returnTax", isAr ? "ضريبة المرتجع" : "Return tax", (r) => r.returnTax, t?.returnTax),
    amountColumn("returnTotal", isAr ? "إجمالي المرتجع" : "Total return", (r) => r.returnTotal, t?.returnTotal),
    amountColumn("net", isAr ? "الصافي" : "Net", (r) => r.net, t?.net),
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={isAr ? "تقرير الشركات" : "Companies Report"} />
      {error && <Alert variant="danger">{errorMessage(error, isAr)}</Alert>}
      <ReportDataTable
        storageKey="companies"
        title={`${isAr ? "تقرير الشركات" : "Companies Report"} ${filters.range.from} ~ ${filters.range.to}`}
        columns={columns}
        rows={report?.rows ?? []}
        rowKey={(r) => r.locationId}
        isLoading={isFetching}
        isAr={isAr}
        activeFilterCount={baseActiveCount(filters) + (filters.customerGroupId ? 1 : 0)}
        onClearFilters={() => setFilters(initial())}
        filters={
          <BaseFilterFields
            value={filters}
            onChange={(v) => setFilters({ ...filters, ...v })}
            options={options}
            isAr={isAr}
            fiscalYearStartMonth={fiscalYearStartMonth}
            afterLocation={
              <CustomerGroupField value={filters.customerGroupId} onChange={(customerGroupId) => setFilters({ ...filters, customerGroupId })} options={options} isAr={isAr} allLabel={isAr ? "الكل" : "All"} />
            }
          />
        }
      />
    </div>
  );
}
