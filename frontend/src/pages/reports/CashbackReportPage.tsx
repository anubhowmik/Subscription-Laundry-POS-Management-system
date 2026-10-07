import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { PageHeader } from "../../components/ui/PageHeader";
import { Alert } from "../../components/ui/Alert";
import { Badge } from "../../components/ui/Badge";
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

const STATUS = { GRANTED: { en: "Granted", ar: "ممنوح", variant: "success" as const }, REDEEMED: { en: "Redeemed", ar: "مستبدل", variant: "warning" as const } };
const TYPES = { SELL: { en: "Sell", ar: "بيع" }, COMPENSATION: { en: "Compensation", ar: "تعويض" }, MANUAL: { en: "Manual", ar: "يدوي" } };

interface Row {
  id: string;
  date: string;
  status: keyof typeof STATUS;
  customer: Named & { phone: string };
  invoiceNumber: string | null;
  location: { branchName: string; branchNameAr: string | null; branchCode: string } | null;
  transactionType: keyof typeof TYPES;
  amount: string;
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

/** Reference: Reports > Cash Back Report (report/cashBack_report.blade.php). */
export default function CashbackReportPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const appScope = useReportAppScope();
  const lang = isAr ? "ar" : "en";
  const { fiscalYearStartMonth } = useReportOrgSettings();
  const initial = (): Filters => ({ ...initialBaseFilters(fiscalYearStartMonth), customerGroupId: "", customer: null });
  const [filters, setFilters] = useState<Filters>(initial);

  const { data: options } = useReportOptions();
  const { data: report, isFetching, error } = useQuery({
    queryKey: ["reports", "cashback", params(filters), appScope],
    queryFn: async () => (await api.get<ApiSuccess<{ rows: Row[] }>>("/reports/cashback", { params: { ...params(filters), ...scopeParams(appScope) } })).data.data,
    enabled: Boolean(filters.range.from && filters.range.to),
    retry: false,
  });

  const customer = (r: Row) => `${pickName(r.customer, isAr)} / ${r.customer.phone}`;
  const columns: ReportColumn<Row>[] = [
    { key: "date", label: isAr ? "التاريخ" : "Date", render: (r) => <span className="ltr-nums whitespace-nowrap">{r.date}</span>, exportValue: (r) => r.date },
    { key: "status", label: isAr ? "الحالة" : "Status", render: (r) => <Badge variant={STATUS[r.status].variant}>{STATUS[r.status][lang]}</Badge>, exportValue: (r) => STATUS[r.status][lang] },
    { key: "customer", label: isAr ? "اسم العميل" : "Customer Name", render: customer, exportValue: customer },
    { key: "invoice", label: isAr ? "رقم الفاتورة" : "Invoice No", render: (r) => <span className="ltr-nums whitespace-nowrap font-medium text-slate-800">{r.invoiceNumber ?? "-"}</span>, exportValue: (r) => r.invoiceNumber },
    { key: "location", label: isAr ? "الفرع" : "Location", render: (r) => (r.location ? branchLabel(r.location, isAr) : "-"), exportValue: (r) => (r.location ? branchLabel(r.location, isAr) : "") },
    { key: "type", label: isAr ? "نوع المعاملة" : "Transaction Type", render: (r) => TYPES[r.transactionType][lang], exportValue: (r) => TYPES[r.transactionType][lang] },
    amountColumn("amount", isAr ? "مقدار استرداد النقود" : "Cash Back Amount", (r) => r.amount),
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={isAr ? "تقرير استرداد النقود" : "Cash Back Report"} />
      {error && <Alert variant="danger">{errorMessage(error, isAr)}</Alert>}
      <ReportDataTable
        storageKey="cashback"
        title={`${isAr ? "تقرير استرداد النقود" : "Cash Back Report"} ${filters.range.from} ~ ${filters.range.to}`}
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
