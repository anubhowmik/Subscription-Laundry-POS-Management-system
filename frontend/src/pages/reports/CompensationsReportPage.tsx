import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { cn } from "../../lib/cn";
import { PageHeader } from "../../components/ui/PageHeader";
import { Alert } from "../../components/ui/Alert";
import { Badge } from "../../components/ui/Badge";
import { selectClass } from "../../components/ui/formClasses";
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

type Status = "PENDING" | "APPROVED" | "REJECTED" | "PAID";
const STATUS: Record<Status, { en: string; ar: string; variant: "neutral" | "info" | "danger" | "success" }> = {
  PENDING: { en: "Pending", ar: "قيد الانتظار", variant: "neutral" },
  APPROVED: { en: "Approved", ar: "موافق عليه", variant: "info" },
  REJECTED: { en: "Rejected", ar: "مرفوض", variant: "danger" },
  PAID: { en: "Paid", ar: "مدفوع", variant: "success" },
};
const TYPES: Record<string, { en: string; ar: string }> = {
  CASH: { en: "Cash", ar: "نقدي" },
  POINTS: { en: "Points", ar: "نقاط" },
  COUPON: { en: "Coupon", ar: "قسيمة" },
  CASHBACK: { en: "Cashback", ar: "استرداد نقدي" },
};

interface Row {
  id: string;
  date: string;
  status: Status;
  customer: Named & { phone: string };
  invoiceNumber: string | null;
  location: { branchName: string; branchNameAr: string | null; branchCode: string };
  type: string | null;
  totalItems: number;
  amount: string;
}
interface ReportData {
  rows: Row[];
  totals: { totalItems: number; amount: string };
}
interface Filters extends BaseReportFilters {
  customerGroupId: string;
  status: "" | Status;
  customer: PickedCustomer | null;
}

const params = (f: Filters) => ({
  ...baseFilterParams(f),
  ...(f.customerGroupId ? { customerGroupId: f.customerGroupId } : {}),
  ...(f.status ? { status: f.status } : {}),
  ...(f.customer ? { customerId: f.customer.id } : {}),
});

/** Reference: Reports > Compensations Report (report/compensations_report.blade.php). */
export default function CompensationsReportPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const appScope = useReportAppScope();
  const lang = isAr ? "ar" : "en";
  const { fiscalYearStartMonth } = useReportOrgSettings();
  const initial = (): Filters => ({ ...initialBaseFilters(fiscalYearStartMonth), customerGroupId: "", status: "", customer: null });
  const [filters, setFilters] = useState<Filters>(initial);

  const { data: options } = useReportOptions();
  const { data: report, isFetching, error } = useQuery({
    queryKey: ["reports", "compensations", params(filters), appScope],
    queryFn: async () => (await api.get<ApiSuccess<ReportData>>("/reports/compensations", { params: { ...params(filters), ...scopeParams(appScope) } })).data.data,
    enabled: Boolean(filters.range.from && filters.range.to),
    retry: false,
  });

  const t = report?.totals;
  const customer = (r: Row) => `${pickName(r.customer, isAr)} / ${r.customer.phone}`;
  const columns: ReportColumn<Row>[] = [
    { key: "date", label: isAr ? "التاريخ" : "Date", render: (r) => <span className="ltr-nums whitespace-nowrap">{r.date}</span>, exportValue: (r) => r.date },
    { key: "status", label: isAr ? "الحالة" : "Status", render: (r) => <Badge variant={STATUS[r.status].variant}>{STATUS[r.status][lang]}</Badge>, exportValue: (r) => STATUS[r.status][lang] },
    { key: "customer", label: isAr ? "اسم العميل" : "Customer Name", render: customer, exportValue: customer },
    { key: "invoice", label: isAr ? "رقم الفاتورة" : "Invoice No", render: (r) => <span className="ltr-nums whitespace-nowrap font-medium text-slate-800">{r.invoiceNumber ?? "-"}</span>, exportValue: (r) => r.invoiceNumber },
    { key: "location", label: isAr ? "الفرع" : "Location", render: (r) => branchLabel(r.location, isAr), exportValue: (r) => branchLabel(r.location, isAr) },
    { key: "type", label: isAr ? "النوع" : "Type", render: (r) => (r.type ? TYPES[r.type][lang] : "-"), exportValue: (r) => (r.type ? TYPES[r.type][lang] : "") },
    {
      key: "totalItems",
      label: isAr ? "مجموع العناصر" : "Total Items",
      render: (r) => <span className="ltr-nums">{r.totalItems}</span>,
      exportValue: (r) => r.totalItems,
      ...(t ? { total: { render: <span className="ltr-nums">{t.totalItems}</span>, exportValue: t.totalItems } } : {}),
    },
    amountColumn("amount", isAr ? "مبلغ التعويض" : "Compensations Amount", (r) => r.amount, t?.amount),
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={isAr ? "تقرير التعويضات" : "Compensations Report"} />
      {error && <Alert variant="danger">{errorMessage(error, isAr)}</Alert>}
      <ReportDataTable
        storageKey="compensations"
        title={`${isAr ? "تقرير التعويضات" : "Compensations Report"} ${filters.range.from} ~ ${filters.range.to}`}
        columns={columns}
        rows={report?.rows ?? []}
        rowKey={(r) => r.id}
        isLoading={isFetching}
        isAr={isAr}
        activeFilterCount={baseActiveCount(filters) + (filters.customerGroupId ? 1 : 0) + (filters.status ? 1 : 0) + (filters.customer ? 1 : 0)}
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
            <FilterField label={isAr ? "الحالة" : "Status"}>
              <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value as Filters["status"] })} className={cn(selectClass, "w-full")}>
                <option value="">{isAr ? "الكل" : "All"}</option>
                {(Object.keys(STATUS) as Status[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS[s][lang]}
                  </option>
                ))}
              </select>
            </FilterField>
            <ContactFilterField value={filters.customer} onChange={(customer) => setFilters({ ...filters, customer })} isAr={isAr} />
          </>
        }
      />
    </div>
  );
}
