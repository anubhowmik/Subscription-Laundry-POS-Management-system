import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { ApiSuccess } from "../../types/api";
import { cn } from "../../lib/cn";
import { PageHeader } from "../../components/ui/PageHeader";
import { Alert } from "../../components/ui/Alert";
import { selectClass } from "../../components/ui/formClasses";
import { errorMessage } from "../paymentAccounts/shared";
import {
  BaseFilterFields,
  FilterField,
  ReportDataTable,
  amountColumn,
  baseActiveCount,
  baseFilterParams,
  branchLabel,
  initialBaseFilters,
  useReportOptions,
  useReportOrgSettings,
  type BaseReportFilters,
  type ReportColumn,
} from "./reportShared";

type Key = "sells" | "discounts" | "tax" | "total" | "returned" | "remaining" | "cash" | "card";
type Amounts = Record<Key, string> & { customers: number };
interface Row extends Amounts {
  id: string;
  location: { branchName: string; branchNameAr: string | null; branchCode: string };
  period: string;
}
interface Filters extends BaseReportFilters {
  status: "" | "open" | "close";
}

/** Reference: Reports > Cash Register Report (report/cashRegister_report.blade.php). */
export default function CashRegisterReportPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { fiscalYearStartMonth } = useReportOrgSettings();
  const initial = (): Filters => ({ ...initialBaseFilters(fiscalYearStartMonth), status: "" });
  const [filters, setFilters] = useState<Filters>(initial);

  const { data: options } = useReportOptions();
  const params = { ...baseFilterParams(filters), locationIds: undefined, ...(filters.status ? { status: filters.status } : {}) };
  const { data: report, isFetching, error } = useQuery({
    queryKey: ["reports", "cash-register", params],
    queryFn: async () => (await api.get<ApiSuccess<{ rows: Row[]; totals: Amounts }>>("/reports/cash-register", { params })).data.data,
    enabled: Boolean(filters.range.from && filters.range.to),
    retry: false,
  });

  const t = report?.totals;
  const amount = (k: Key, en: string, ar: string) => amountColumn<Row>(k, isAr ? ar : en, (r) => r[k], t?.[k]);
  const columns: ReportColumn<Row>[] = [
    { key: "branch", label: isAr ? "فرع" : "Branch", render: (r) => <span className="font-medium text-slate-800">{branchLabel(r.location, isAr)}</span>, exportValue: (r) => branchLabel(r.location, isAr) },
    amount("sells", "Sales", "المبيعات"),
    amount("discounts", "Discounts", "خصومات"),
    amount("tax", "Tax", "الضريبة"),
    amount("total", "Total", "المجموع"),
    amount("returned", "Returned", "تم ارجاعها"),
    amount("remaining", "Total remaining", "المتبقى"),
    {
      key: "customers",
      label: isAr ? "إجمالي العملاء" : "Total Customers",
      render: (r) => <span className="ltr-nums">{r.customers}</span>,
      exportValue: (r) => r.customers,
      ...(t ? { total: { render: <span className="ltr-nums">{t.customers}</span>, exportValue: t.customers } } : {}),
    },
    amount("cash", "Cash Payments", "المدفوعات النقدية"),
    amount("card", "Card Payments", "المدفوعات ببطاقات الائتمانية"),
    { key: "date", label: isAr ? "التاريخ" : "Date", render: (r) => <span className="ltr-nums whitespace-nowrap">{r.period}</span>, exportValue: (r) => r.period },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={isAr ? "تقرير المناوبات" : "Cash Register Report"} />
      {error && <Alert variant="danger">{errorMessage(error, isAr)}</Alert>}
      <ReportDataTable
        storageKey="cash-register"
        title={`${isAr ? "تقرير المناوبات" : "Cash Register Report"} ${filters.range.from} ~ ${filters.range.to}`}
        columns={columns}
        rows={report?.rows ?? []}
        rowKey={(r) => r.id}
        isLoading={isFetching}
        isAr={isAr}
        activeFilterCount={baseActiveCount(filters) + (filters.status ? 1 : 0)}
        onClearFilters={() => setFilters(initial())}
        filters={
          <>
            <BaseFilterFields value={filters} onChange={(v) => setFilters({ ...filters, ...v })} options={options} isAr={isAr} fiscalYearStartMonth={fiscalYearStartMonth} hideLocation />
            <FilterField label={isAr ? "الحالة" : "Status"}>
              <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value as Filters["status"] })} className={cn(selectClass, "w-full")}>
                <option value="">{isAr ? "الكل" : "All"}</option>
                <option value="open">{isAr ? "مفتوح" : "Open"}</option>
                <option value="close">{isAr ? "مغلق" : "Closed"}</option>
              </select>
            </FilterField>
          </>
        }
      />
    </div>
  );
}
