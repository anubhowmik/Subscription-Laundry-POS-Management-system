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
  ItemFilterFields,
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

type AmountKey = "totalItems" | "beforeTax" | "discount" | "tax" | "extraServices" | "total";

interface Row extends Record<AmountKey, string> {
  key: string;
  sku: string;
  nameEn: string;
  nameAr: string | null;
  branchName: string;
  branchNameAr: string | null;
  branchCode: string;
  invoiceCount: number;
}
interface ReportData {
  startDate: string;
  endDate: string;
  filters: ReportLocationFilters & { customerGroup: Named | null; category: Named | null; items: Named[] | null };
  rows: Row[];
  totals: Record<AmountKey, string> & { invoiceCount: number };
}
interface Filters extends BaseReportFilters {
  customerGroupId: string;
  categoryId: string;
  itemIds: string[];
}

const params = (f: Filters) => ({
  ...baseFilterParams(f),
  ...(f.customerGroupId ? { customerGroupId: f.customerGroupId } : {}),
  ...(f.categoryId ? { categoryId: f.categoryId } : {}),
  ...(f.itemIds.length > 0 ? { itemIds: f.itemIds.join(",") } : {}),
});

/** Reference: Reports > Products Report (report/products_report.blade.php). */
export default function ProductsReportPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { fiscalYearStartMonth } = useReportOrgSettings();
  const initial = (): Filters => ({ ...initialBaseFilters(fiscalYearStartMonth), customerGroupId: "", categoryId: "", itemIds: [] });
  const [filters, setFilters] = useState<Filters>(initial);

  const { data: options } = useReportOptions();
  const { data: report, isFetching, error } = useQuery({
    queryKey: ["reports", "products", params(filters)],
    queryFn: async () => (await api.get<ApiSuccess<ReportData>>("/reports/products", { params: params(filters) })).data.data,
    enabled: Boolean(filters.range.from && filters.range.to),
    retry: false,
  });

  const t = report?.totals;
  const name = (r: Row) => (isAr ? r.nameAr || r.nameEn : r.nameEn);
  const columns: ReportColumn<Row>[] = [
    { key: "sku", label: isAr ? "رمز المنتج" : "SKU", render: (r) => <span className="ltr-nums">{r.sku}</span>, exportValue: (r) => r.sku },
    { key: "product", label: isAr ? "المنتج" : "Product", render: (r) => <span className="font-medium text-slate-800">{name(r)}</span>, exportValue: name },
    { key: "location", label: isAr ? "موقع العمل" : "Business Location", render: (r) => branchLabel(r, isAr), exportValue: (r) => branchLabel(r, isAr) },
    {
      key: "invoiceCount",
      label: isAr ? "عدد الفواتير" : "Invoice Count",
      render: (r) => <span className="ltr-nums">{r.invoiceCount}</span>,
      exportValue: (r) => r.invoiceCount,
      ...(t ? { total: { render: <span className="ltr-nums">{t.invoiceCount}</span>, exportValue: t.invoiceCount } } : {}),
    },
    amountColumn("totalItems", isAr ? "مجموع العناصر" : "Total Items", (r) => r.totalItems, t?.totalItems),
    amountColumn("beforeTax", isAr ? "الاجمالى قبل الضريبة" : "Total Before Tax", (r) => r.beforeTax, t?.beforeTax),
    amountColumn("discount", isAr ? "الخصم" : "Discount", (r) => r.discount, t?.discount),
    amountColumn("tax", isAr ? "الضريبة" : "Tax", (r) => r.tax, t?.tax),
    amountColumn("extraServices", isAr ? "خدمات اضافيه" : "Extra Services", (r) => r.extraServices, t?.extraServices),
    amountColumn("total", isAr ? "المجموع" : "Total", (r) => r.total, t?.total),
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={isAr ? "تقرير المنتجات" : "Products Report"} />
      {error && <Alert variant="danger">{errorMessage(error, isAr)}</Alert>}
      <ReportDataTable
        storageKey="products"
        title={`${isAr ? "تقرير المنتجات" : "Products Report"} ${filters.range.from} ~ ${filters.range.to}`}
        columns={columns}
        rows={report?.rows ?? []}
        rowKey={(r) => r.key}
        isLoading={isFetching}
        isAr={isAr}
        activeFilterCount={baseActiveCount(filters) + (filters.customerGroupId ? 1 : 0) + (filters.categoryId ? 1 : 0) + (filters.itemIds.length > 0 ? 1 : 0)}
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
              afterLocation={<CustomerGroupField value={filters.customerGroupId} onChange={(customerGroupId) => setFilters({ ...filters, customerGroupId })} options={options} isAr={isAr} />}
            />
            <ItemFilterFields categoryId={filters.categoryId} itemIds={filters.itemIds} onChange={(v) => setFilters({ ...filters, ...v })} options={options} isAr={isAr} />
          </>
        }
      />
    </div>
  );
}
