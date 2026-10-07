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
  type ReportColumn,
  type ReportLocationFilters,
} from "./reportShared";

type AmountKey = "totalItems" | "beforeTax" | "discount" | "tax" | "extraServices" | "total";

interface Row extends Record<AmountKey, string> {
  id: string;
  branchName: string;
  branchNameAr: string | null;
  branchCode: string;
  invoiceNumber: string | null;
  date: string;
  customerGroup: Named | null;
  customer: (Named & { customField1: string | null }) | null;
  createdBy: { fullNameEn: string; fullNameAr: string | null } | null;
  productsEn: string;
  productsAr: string;
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

/** Reference: Reports > Detailed Companies Report (report/detailed_company_report.blade.php). */
export default function DetailedCompaniesReportPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { fiscalYearStartMonth } = useReportOrgSettings();
  const initial = (): Filters => ({ ...initialBaseFilters(fiscalYearStartMonth), customerGroupId: "" });
  const [filters, setFilters] = useState<Filters>(initial);

  const { data: options } = useReportOptions();
  const { data: report, isFetching, error } = useQuery({
    queryKey: ["reports", "detailed-companies", params(filters)],
    queryFn: async () => (await api.get<ApiSuccess<ReportData>>("/reports/detailed-companies", { params: params(filters) })).data.data,
    enabled: Boolean(filters.range.from && filters.range.to),
    retry: false,
  });

  const customerText = (r: Row) => (r.customer ? `${pickName(r.customer, isAr)}${r.customer.customField1 ? ` (${r.customer.customField1})` : ""}` : "-");
  const userName = (r: Row) => (r.createdBy ? (isAr ? r.createdBy.fullNameAr || r.createdBy.fullNameEn : r.createdBy.fullNameEn) : "-");
  const t = report?.totals;
  const columns: ReportColumn<Row>[] = [
    { key: "location", label: isAr ? "موقع العمل" : "Business Location", render: (r) => <span className="font-medium text-slate-800">{branchLabel(r, isAr)}</span>, exportValue: (r) => branchLabel(r, isAr) },
    { key: "invoice", label: isAr ? "رقم الفاتورة" : "Invoice No.", render: (r) => <span className="ltr-nums whitespace-nowrap">{r.invoiceNumber ?? "-"}</span>, exportValue: (r) => r.invoiceNumber },
    { key: "date", label: isAr ? "التاريخ" : "Date", render: (r) => <span className="ltr-nums whitespace-nowrap">{r.date}</span>, exportValue: (r) => r.date },
    { key: "group", label: isAr ? "مجموعة العملاء" : "Customer Group", render: (r) => (r.customerGroup ? pickName(r.customerGroup, isAr) : "-"), exportValue: (r) => (r.customerGroup ? pickName(r.customerGroup, isAr) : "") },
    {
      key: "customer",
      label: isAr ? "العميل" : "Customer",
      render: (r) =>
        r.customer ? (
          <>
            {pickName(r.customer, isAr)}
            {r.customer.customField1 && (
              <bdi dir="ltr" className="ms-1 text-slate-500">
                ({r.customer.customField1})
              </bdi>
            )}
          </>
        ) : (
          "-"
        ),
      exportValue: customerText,
    },
    amountColumn("totalItems", isAr ? "مجموع العناصر" : "Total Items", (r) => r.totalItems, t?.totalItems),
    amountColumn("beforeTax", isAr ? "الاجمالى قبل الضريبة" : "Total Before Tax", (r) => r.beforeTax, t?.beforeTax),
    amountColumn("discount", isAr ? "الخصم" : "Discount", (r) => r.discount, t?.discount),
    amountColumn("tax", isAr ? "الضريبة" : "Tax", (r) => r.tax, t?.tax),
    amountColumn("extraServices", isAr ? "خدمات اضافيه" : "Extra Services", (r) => r.extraServices, t?.extraServices),
    amountColumn("total", isAr ? "المجموع" : "Total", (r) => r.total, t?.total),
    { key: "createdBy", label: isAr ? "انشأ من قبل" : "Created By", render: userName, exportValue: userName },
    {
      key: "products",
      label: isAr ? "المنتجات" : "Products",
      render: (r) => <span className="block min-w-[14rem]">{isAr ? r.productsAr : r.productsEn}</span>,
      exportValue: (r) => (isAr ? r.productsAr : r.productsEn),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={isAr ? "تقرير الشركات التفصيلي" : "Detailed Companies Report"} />
      {error && <Alert variant="danger">{errorMessage(error, isAr)}</Alert>}
      <ReportDataTable
        storageKey="detailed-companies"
        title={`${isAr ? "تقرير الشركات التفصيلي" : "Detailed Companies Report"} ${filters.range.from} ~ ${filters.range.to}`}
        columns={columns}
        rows={report?.rows ?? []}
        rowKey={(r) => r.id}
        isLoading={isFetching}
        isAr={isAr}
        activeFilterCount={baseActiveCount(filters) + (filters.customerGroupId ? 1 : 0)}
        onClearFilters={() => setFilters(initial())}
        filters={
          <>
            <CustomerGroupField value={filters.customerGroupId} onChange={(customerGroupId) => setFilters({ ...filters, customerGroupId })} options={options} isAr={isAr} />
            <BaseFilterFields value={filters} onChange={(v) => setFilters({ ...filters, ...v })} options={options} isAr={isAr} fiscalYearStartMonth={fiscalYearStartMonth} singleLocation />
          </>
        }
      />
    </div>
  );
}
