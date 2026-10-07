import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Percent } from "lucide-react";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { PageHeader } from "../../components/ui/PageHeader";
import { Alert } from "../../components/ui/Alert";
import { StatCard } from "../../components/ui/StatCard";
import { errorMessage } from "../paymentAccounts/shared";
import {
  BaseFilterFields,
  ReportDataTable,
  amountColumn,
  baseActiveCount,
  baseFilterParams,
  exportAmount,
  initialBaseFilters,
  num,
  pickName,
  useReportOptions,
  useReportOrgSettings,
  type BaseReportFilters,
  type Named,
  type ReportColumn,
  type ReportLocationFilters,
} from "./reportShared";

interface Row {
  id: string;
  date: string;
  invoiceNumber: string | null;
  customer: Named & { businessName: string | null };
  taxNumber: string | null;
  totalAmount: string;
  paymentMethod: Named | null;
  discount: string;
  taxes: Record<string, string>;
}
interface ReportData {
  startDate: string;
  endDate: string;
  filters: ReportLocationFilters;
  overallTax: string;
  taxColumns: (Named & { key: string; percentage: string })[];
  rows: Row[];
  totals: { totalAmount: string; taxes: Record<string, string>; paymentMethods: (Named & { count: number })[] };
}

/** Reference: Reports > Tax Report (report/laundry_tax_report.blade.php). */
export default function TaxReportPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { fiscalYearStartMonth } = useReportOrgSettings();
  const [filters, setFilters] = useState<BaseReportFilters>(() => initialBaseFilters(fiscalYearStartMonth));

  const { data: options } = useReportOptions();
  const { data: report, isFetching, error } = useQuery({
    queryKey: ["reports", "tax", baseFilterParams(filters)],
    queryFn: async () => (await api.get<ApiSuccess<ReportData>>("/reports/tax", { params: baseFilterParams(filters) })).data.data,
    enabled: Boolean(filters.range.from && filters.range.to),
    retry: false,
  });

  const t = report?.totals;
  const customer = (r: Row) => `${r.customer.businessName ? `${r.customer.businessName}, ` : ""}${pickName(r.customer, isAr)}`;
  const methodCounts = t ? t.paymentMethods.map((m) => `${pickName(m, isAr)} - ${m.count}`).join(", ") : "";
  const columns: ReportColumn<Row>[] = [
    { key: "date", label: isAr ? "التاريخ" : "Date", render: (r) => <span className="ltr-nums whitespace-nowrap">{r.date}</span>, exportValue: (r) => r.date },
    { key: "invoice", label: isAr ? "رقم الفاتورة" : "Invoice No", render: (r) => <span className="ltr-nums whitespace-nowrap font-medium text-slate-800">{r.invoiceNumber ?? "-"}</span>, exportValue: (r) => r.invoiceNumber },
    { key: "customer", label: isAr ? "العميل" : "Customer", render: customer, exportValue: customer },
    { key: "taxNumber", label: isAr ? "الرقم الضريبي" : "Tax number", render: (r) => <span className="ltr-nums">{r.taxNumber ?? ""}</span>, exportValue: (r) => r.taxNumber },
    amountColumn("totalAmount", isAr ? "اجمالي المبلغ" : "Total amount", (r) => r.totalAmount, t?.totalAmount),
    {
      key: "paymentMethod",
      label: isAr ? "طريقة الدفع" : "Payment Method",
      render: (r) => (r.paymentMethod ? pickName(r.paymentMethod, isAr) : ""),
      exportValue: (r) => (r.paymentMethod ? pickName(r.paymentMethod, isAr) : ""),
      ...(t ? { total: { render: <span className="text-xs">{methodCounts}</span>, exportValue: methodCounts } } : {}),
    },
    {
      key: "discount",
      label: isAr ? "الخصم" : "Discount",
      render: (r) => (Number(r.discount) ? num(r.discount) : ""),
      exportValue: (r) => (Number(r.discount) ? exportAmount(r.discount) : ""),
    },
    ...(report?.taxColumns ?? []).map((c) => ({
      key: `tax:${c.key}`,
      label: pickName(c, isAr),
      render: (r: Row) => (r.taxes[c.key] ? num(r.taxes[c.key]) : ""),
      exportValue: (r: Row) => (r.taxes[c.key] ? exportAmount(r.taxes[c.key]) : ""),
      ...(t ? { total: { render: num(t.taxes[c.key]), exportValue: exportAmount(t.taxes[c.key]) } } : {}),
    })),
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={isAr ? "تقرير الضرائب" : "Tax Report"} subtitle={isAr ? "تفاصيل الضريبة للفترة المحددة" : "Tax details for the selected date range"} />
      <div className="grid grid-cols-1 gap-4 sm:max-w-xs">
        <StatCard
          icon={Percent}
          cardBg="bg-app-pos-500"
          iconBg="bg-white/20"
          iconColor="text-white"
          highlight
          label={isAr ? "إجمالي" : "Overall"}
          value={report ? Number(report.overallTax).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "…"}
        />
      </div>
      {error && <Alert variant="danger">{errorMessage(error, isAr)}</Alert>}
      <ReportDataTable
        storageKey="tax"
        title={`${isAr ? "تقرير الضرائب" : "Tax Report"} ${filters.range.from} ~ ${filters.range.to}`}
        columns={columns}
        rows={report?.rows ?? []}
        rowKey={(r) => r.id}
        isLoading={isFetching}
        isAr={isAr}
        activeFilterCount={baseActiveCount(filters)}
        onClearFilters={() => setFilters(initialBaseFilters(fiscalYearStartMonth))}
        filters={<BaseFilterFields value={filters} onChange={setFilters} options={options} isAr={isAr} fiscalYearStartMonth={fiscalYearStartMonth} singleLocation locationAllLabel={isAr ? "كل المواقع" : "All locations"} />}
      />
    </div>
  );
}
