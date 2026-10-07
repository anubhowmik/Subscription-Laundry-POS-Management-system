import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { PageHeader } from "../../components/ui/PageHeader";
import { Alert } from "../../components/ui/Alert";
import { errorMessage } from "../paymentAccounts/shared";
import {
  BaseFilterFields,
  ContactFilterField,
  CustomerGroupField,
  ReportDataTable,
  baseActiveCount,
  baseFilterParams,
  branchLabel,
  initialBaseFilters,
  pickName,
  useReportOptions,
  useReportOrgSettings,
  type BaseReportFilters,
  type Named,
  type PickedCustomer,
  type ReportColumn,
} from "./reportShared";

interface Row {
  id: string;
  invoiceNumber: string | null;
  date: string;
  earned: number;
  redeemed: number;
  customer: Named & { phone: string };
  location: { branchName: string; branchNameAr: string | null; branchCode: string };
}
interface ReportData {
  rows: Row[];
  totals: { earned: number; redeemed: number };
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

/** Reference: Reports > Loyality Points Report (report/loyalityPoints_report.blade.php). */
export default function LoyaltyPointsReportPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { fiscalYearStartMonth } = useReportOrgSettings();
  const initial = (): Filters => ({ ...initialBaseFilters(fiscalYearStartMonth), customerGroupId: "", customer: null });
  const [filters, setFilters] = useState<Filters>(initial);

  const { data: options } = useReportOptions();
  const { data: report, isFetching, error } = useQuery({
    queryKey: ["reports", "loyalty-points", params(filters)],
    queryFn: async () => (await api.get<ApiSuccess<ReportData>>("/reports/loyalty-points", { params: params(filters) })).data.data,
    enabled: Boolean(filters.range.from && filters.range.to),
    retry: false,
  });

  const t = report?.totals;
  const customer = (r: Row) => `${pickName(r.customer, isAr)} / ${r.customer.phone}`;
  const points = (key: "earned" | "redeemed", label: string): ReportColumn<Row> => ({
    key,
    label,
    render: (r) => <span className="ltr-nums">{r[key]}</span>,
    exportValue: (r) => r[key],
    ...(t ? { total: { render: <span className="ltr-nums">{t[key]}</span>, exportValue: t[key] } } : {}),
  });
  const columns: ReportColumn<Row>[] = [
    { key: "invoice", label: isAr ? "رقم الفاتورة" : "Invoice No", render: (r) => <span className="ltr-nums whitespace-nowrap font-medium text-slate-800">{r.invoiceNumber ?? "-"}</span>, exportValue: (r) => r.invoiceNumber },
    { key: "date", label: isAr ? "تاريخ العملية" : "Transaction Date", render: (r) => <span className="ltr-nums whitespace-nowrap">{r.date}</span>, exportValue: (r) => r.date },
    points("earned", isAr ? "النقاط المكتسبة" : "Reward Points Earned"),
    points("redeemed", isAr ? "النقاط المستبدلة" : "Reward Points Redeemed"),
    { key: "customer", label: isAr ? "اسم العميل" : "Customer Name", render: customer, exportValue: customer },
    { key: "location", label: isAr ? "الفرع" : "Location", render: (r) => branchLabel(r.location, isAr), exportValue: (r) => branchLabel(r.location, isAr) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={isAr ? "تقرير نقاط الولاء" : "Loyality Points Report"} />
      {error && <Alert variant="danger">{errorMessage(error, isAr)}</Alert>}
      <ReportDataTable
        storageKey="loyalty-points"
        title={`${isAr ? "تقرير نقاط الولاء" : "Loyality Points Report"} ${filters.range.from} ~ ${filters.range.to}`}
        columns={columns}
        rows={report?.rows ?? []}
        rowKey={(r) => r.id}
        isLoading={isFetching}
        isAr={isAr}
        activeFilterCount={baseActiveCount(filters) + (filters.customerGroupId ? 1 : 0) + (filters.customer ? 1 : 0)}
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
              afterLocation={
                <CustomerGroupField value={filters.customerGroupId} onChange={(customerGroupId) => setFilters({ ...filters, customerGroupId })} options={options} isAr={isAr} allLabel={isAr ? "الكل" : "All"} />
              }
            />
            <ContactFilterField value={filters.customer} onChange={(customer) => setFilters({ ...filters, customer })} isAr={isAr} />
          </>
        }
      />
    </div>
  );
}
