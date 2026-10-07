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
  branchLabel,
  initialBaseFilters,
  useReportOptions,
  useReportOrgSettings,
  type BaseReportFilters,
  type ReportColumn,
  type ReportLocationFilters,
} from "./reportShared";

const KEYS = ["totalItems", "beforeTax", "promotionDiscount", "couponDiscount", "unwashable", "tax", "extraServices", "total", "returned", "remaining", "due"] as const;
type Key = (typeof KEYS)[number];
type Amounts = Record<Key, string> & { customers: number };
interface Branch {
  locationId: string;
  branchName: string;
  branchNameAr: string | null;
  branchCode: string;
  rows: (Amounts & { categoryKey: string; nameEn: string; nameAr: string | null })[];
  totals: Amounts;
}
interface ReportData {
  startDate: string;
  endDate: string;
  filters: ReportLocationFilters;
  branches: Branch[];
  totals: Amounts;
}
/** One table row: a category of a branch, or that branch's own total row (the reference's per-branch footer). */
type Row = Amounts & { key: string; branch: Branch; category: string; isSubtotal: boolean };

/** Reference: Reports > Detailed Sales Report (report/detailed_sales_report.blade.php). */
export default function DetailedSalesReportPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.resolvedLanguage === "ar";
  const { fiscalYearStartMonth } = useReportOrgSettings();
  const [filters, setFilters] = useState<BaseReportFilters>(() => initialBaseFilters(fiscalYearStartMonth));

  const { data: options } = useReportOptions();
  const { data: report, isFetching, error } = useQuery({
    queryKey: ["reports", "detailed-sales", baseFilterParams(filters)],
    queryFn: async () => (await api.get<ApiSuccess<ReportData>>("/reports/detailed-sales", { params: baseFilterParams(filters) })).data.data,
    enabled: Boolean(filters.range.from && filters.range.to),
    retry: false,
  });

  const totalLabel = isAr ? "المجموع" : "Total";
  const rows: Row[] = (report?.branches ?? []).flatMap((b) => [
    ...b.rows.map((r) => ({ ...r, key: `${b.locationId}|${r.categoryKey}`, branch: b, category: isAr ? r.nameAr || r.nameEn : r.nameEn, isSubtotal: false })),
    { ...b.totals, key: `${b.locationId}|total`, branch: b, category: totalLabel, isSubtotal: true },
  ]);
  const bold = (r: Row, node: React.ReactNode) => (r.isSubtotal ? <span className="font-semibold text-slate-800">{node}</span> : node);

  const labels: Record<Key, string> = isAr
    ? {
        totalItems: "مجموع العناصر",
        beforeTax: "الاجمالى قبل الضريبة",
        promotionDiscount: "خصومات الترويج",
        couponDiscount: "خصومات القسيمة",
        unwashable: "غير قابل للغسيل",
        tax: "الضريبة",
        extraServices: "خدمات اضافيه",
        total: "المجموع",
        returned: "تم ارجاعها",
        remaining: "المتبقى (المجموع - المرتجع)",
        due: "مستحق الدفع",
      }
    : {
        totalItems: "Total Items",
        beforeTax: "Total Before Tax",
        promotionDiscount: "Promotion Discounts",
        couponDiscount: "Coupon Discounts",
        unwashable: "Unwashable",
        tax: "Tax",
        extraServices: "Extra Services",
        total: "Total",
        returned: "Returned",
        remaining: "Total remaining (Total - Returned)",
        due: "Due",
      };
  const t = report?.totals;
  const columns: ReportColumn<Row>[] = [
    { key: "location", label: isAr ? "موقع العمل" : "Business Location", render: (r) => bold(r, branchLabel(r.branch, isAr)), exportValue: (r) => branchLabel(r.branch, isAr) },
    { key: "category", label: isAr ? "الفئة" : "Category", render: (r) => bold(r, r.category), exportValue: (r) => r.category },
    ...KEYS.map((k) => {
      const col = amountColumn<Row>(k, labels[k], (r) => r[k], t?.[k]);
      return { ...col, render: (r: Row) => bold(r, col.render(r)) };
    }),
    {
      key: "customers",
      label: isAr ? "إجمالي العملاء" : "Total Customers",
      render: (r) => bold(r, <span className="ltr-nums">{r.customers}</span>),
      exportValue: (r) => r.customers,
      ...(t ? { total: { render: <span className="ltr-nums">{t.customers}</span>, exportValue: t.customers } } : {}),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={isAr ? "تقرير المبيعات التفصيلي" : "Detailed Sales Report"} />
      {error && <Alert variant="danger">{errorMessage(error, isAr)}</Alert>}
      <ReportDataTable
        storageKey="detailed-sales"
        title={`${isAr ? "تقرير المبيعات التفصيلي" : "Detailed Sales Report"} ${filters.range.from} ~ ${filters.range.to}`}
        columns={columns}
        rows={rows}
        rowKey={(r) => r.key}
        isLoading={isFetching}
        isAr={isAr}
        activeFilterCount={baseActiveCount(filters)}
        onClearFilters={() => setFilters(initialBaseFilters(fiscalYearStartMonth))}
        filters={<BaseFilterFields value={filters} onChange={setFilters} options={options} isAr={isAr} fiscalYearStartMonth={fiscalYearStartMonth} />}
      />
    </div>
  );
}
