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
  ReportDataTable,
  amountColumn,
  baseActiveCount,
  baseFilterParams,
  initialBaseFilters,
  pickName,
  useReportOptions,
  useReportOrgSettings,
  type BaseReportFilters,
  type Named,
  type ReportColumn,
  type ReportLocationFilters,
} from "./reportShared";

type Key = "sells" | "discounts" | "unwashable" | "tax" | "extraServices" | "total" | "returned" | "remaining" | "due" | "cash" | "card";
type Amounts = Record<Key, string> & { customers: number };
interface Row extends Amounts {
  locationId: string;
  branchName: string;
  branchNameAr: string | null;
  branchCode: string;
  locationGroup: Named | null;
}
interface ReportData {
  startDate: string;
  endDate: string;
  filters: ReportLocationFilters;
  rows: Row[];
  totals: Amounts;
}

/** Reference: Reports > Branches Sales Report (report/branch_sales_report.blade.php). */
export default function BranchSalesReportPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { fiscalYearStartMonth } = useReportOrgSettings();
  const [filters, setFilters] = useState<BaseReportFilters>(() => initialBaseFilters(fiscalYearStartMonth));

  const { data: options } = useReportOptions();
  const params = { ...baseFilterParams(filters), locationIds: undefined };
  const { data: report, isFetching, error } = useQuery({
    queryKey: ["reports", "branch-sales", params],
    queryFn: async () => (await api.get<ApiSuccess<ReportData>>("/reports/branch-sales", { params })).data.data,
    enabled: Boolean(filters.range.from && filters.range.to),
    retry: false,
  });

  const t = report?.totals;
  const branch = (r: Row) => (isAr ? r.branchNameAr || r.branchName : r.branchName);
  const amount = (k: Key, en: string, ar: string) => amountColumn<Row>(k, isAr ? ar : en, (r) => r[k], t?.[k]);
  const columns: ReportColumn<Row>[] = [
    { key: "branch", label: isAr ? "فرع" : "Branch", render: (r) => <span className="font-medium text-slate-800">{branch(r)}</span>, exportValue: branch },
    { key: "group", label: isAr ? "مجموعات الفروع" : "Location Group", render: (r) => (r.locationGroup ? pickName(r.locationGroup, isAr) : "-"), exportValue: (r) => (r.locationGroup ? pickName(r.locationGroup, isAr) : "") },
    amount("sells", "Sales", "المبيعات"),
    amount("discounts", "Discounts", "خصومات"),
    amount("unwashable", "Unwashable", "غير قابل للغسيل"),
    amount("tax", "Tax", "الضريبة"),
    amount("extraServices", "Extra Services", "خدمات اضافيه"),
    amount("total", "Total", "المجموع"),
    amount("returned", "Returned", "تم ارجاعها"),
    amount("remaining", "Total remaining (Total - Returned)", "المتبقى (المجموع - المرتجع)"),
    amount("due", "Due", "مستحق الدفع"),
    {
      key: "customers",
      label: isAr ? "إجمالي العملاء" : "Total Customers",
      render: (r) => <span className="ltr-nums">{r.customers}</span>,
      exportValue: (r) => r.customers,
      ...(t ? { total: { render: <span className="ltr-nums">{t.customers}</span>, exportValue: t.customers } } : {}),
    },
    amount("cash", "Cash Payments", "المدفوعات النقدية"),
    amount("card", "Card Payments", "المدفوعات ببطاقات الائتمانية"),
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={isAr ? "تقرير ملخص مبيعات الفروع" : "Branches Sales Report"} />
      {error && <Alert variant="danger">{errorMessage(error, isAr)}</Alert>}
      <ReportDataTable
        storageKey="branch-sales"
        title={`${isAr ? "تقرير ملخص مبيعات الفروع" : "Branches Sales Report"} ${filters.range.from} ~ ${filters.range.to}`}
        columns={columns}
        rows={report?.rows ?? []}
        rowKey={(r) => r.locationId}
        isLoading={isFetching}
        isAr={isAr}
        activeFilterCount={baseActiveCount(filters)}
        onClearFilters={() => setFilters(initialBaseFilters(fiscalYearStartMonth))}
        filters={<BaseFilterFields value={filters} onChange={setFilters} options={options} isAr={isAr} fiscalYearStartMonth={fiscalYearStartMonth} hideLocation />}
      />
    </div>
  );
}
